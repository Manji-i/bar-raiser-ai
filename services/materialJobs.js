import { randomUUID } from 'node:crypto';

export const MATERIAL_TTL = 24 * 60 * 60 * 1000;
export const NORMALIZED_AUDIO_RESERVATION = 116 * 1024 * 1024;
export const materialError = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
export const initializeMaterialSchema = database => database.exec(`
  CREATE TABLE IF NOT EXISTS material_jobs (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, analysis_mode TEXT NOT NULL,
    status TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    report_id TEXT, payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS material_jobs_user_date ON material_jobs(user_id, created_at);
`);

export const publicMaterial = job => ({
  id: job.id, analysisMode: job.analysisMode, source: job.source, status: job.status,
  fileName: job.fileName, transcript: job.confirmed ? job.confirmedTranscript : job.originalTranscript || '',
  segments: job.segments || [], speakerRoles: job.speakerRoles || {}, confirmed: !!job.confirmed,
  error: job.error || null, createdAt: job.createdAt, expiresAt: job.expiresAt,
  uploadedBytes: job.uploadedBytes || 0, sizeBytes: job.sizeBytes || 0, durationSeconds: job.durationSeconds || null,
});

export const createMaterialStore = (database, { now = Date.now } = {}) => {
  initializeMaterialSchema(database);
  const decode = row => row ? JSON.parse(row.payload) : null;
  const internal = id => decode(database.prepare('SELECT payload FROM material_jobs WHERE id = ?').get(id));
  const save = job => {
    database.prepare(`INSERT INTO material_jobs (id,user_id,analysis_mode,status,created_at,expires_at,report_id,payload)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,expires_at=excluded.expires_at,
      report_id=excluded.report_id,payload=excluded.payload`).run(job.id, job.userId, job.analysisMode, job.status, job.createdAt, job.expiresAt, job.reportId || null, JSON.stringify(job));
    return job;
  };
  const owned = (id, userId) => {
    const job = internal(id);
    if (!job || job.userId !== userId) throw materialError('MATERIAL_NOT_FOUND', '未找到这份材料。', 404);
    if (job.expiresAt <= now()) throw materialError('MATERIAL_EXPIRED', '材料已过期，请重新导入。', 410);
    return job;
  };
  const assertQueueCapacity = () => {
    const { count } = database.prepare("SELECT COUNT(*) AS count FROM material_jobs WHERE status IN ('uploading','queued','transcribing') AND expires_at>?").get(now());
    if (count >= 20) throw materialError('MATERIAL_CAPACITY', '任务队列暂满，请稍后重试。', 503);
  };
  return {
    internal, owned, save, assertQueueCapacity,
    hasActive(userId) { return !!database.prepare("SELECT 1 FROM material_jobs WHERE user_id=? AND expires_at>? AND status IN ('uploading','queued','transcribing') LIMIT 1").get(userId, now()); },
    create(userId, data) {
      if (!['candidate', 'recruiter'].includes(data.analysisMode) || !['audio', 'feishu'].includes(data.source)) throw materialError('INVALID_MATERIAL', '材料类型或分析模式无效。');
      const recent = database.prepare('SELECT status, expires_at FROM material_jobs WHERE user_id = ? AND created_at > ?').all(userId, now() - MATERIAL_TTL);
      if (recent.length >= 10 || recent.some(j => j.expires_at > now() && ['uploading', 'queued', 'transcribing'].includes(j.status))) throw materialError('MATERIAL_QUOTA', '已有材料正在处理，或已达到今日 10 次导入额度。', 429);
      const active = database.prepare('SELECT payload FROM material_jobs').all().map(decode).filter(j => !j.cleanedAt);
      const reservation = j => j.source === 'audio' ? (j.sizeBytes || 0) + NORMALIZED_AUDIO_RESERVATION : 0;
      const reserved = active.reduce((sum, j) => sum + reservation(j), 0);
      if (reserved + reservation(data) > 2 * 1024 ** 3) throw materialError('MATERIAL_CAPACITY', '录音处理空间暂满，请稍后重试。', 503);
      assertQueueCapacity();
      const job = save({ ...data, id: randomUUID(), userId, status: data.source === 'audio' ? 'uploading' : 'queued', createdAt: now(), expiresAt: now() + MATERIAL_TTL, uploadedBytes: 0, chunks: [], attempts: 0 });
      return publicMaterial(job);
    },
    get: (id, userId) => publicMaterial(owned(id, userId)),
    list(userId, mode) { return database.prepare('SELECT payload FROM material_jobs WHERE user_id=? AND analysis_mode=? AND expires_at>? ORDER BY created_at DESC LIMIT 10').all(userId, mode, now()).map(decode).map(publicMaterial); },
    update(id, changes) {
      const job = internal(id);
      if (!job) throw materialError('MATERIAL_NOT_FOUND', '未找到这份材料。', 404);
      const { transcript, ...rest } = changes;
      if (transcript !== undefined) rest.originalTranscript = transcript;
      return save({ ...job, ...rest });
    },
    confirm(id, userId, data) {
      const job = owned(id, userId);
      if (job.status !== 'ready') throw materialError('MATERIAL_NOT_READY', '请等待转写完成。', 409);
      if (data.confirmed !== true || typeof data.transcript !== 'string' || !data.transcript.trim() || data.transcript.length > 100000) throw materialError('INVALID_TRANSCRIPT', '确认文字须为 1–100000 个字符。');
      const roles = data.speakerRoles || {};
      if (!roles || typeof roles !== 'object' || Array.isArray(roles) || Object.keys(roles).length > 100 || Object.entries(roles).some(([k,v]) => k.length > 100 || !['candidate','interviewer','unknown'].includes(v))) throw materialError('INVALID_SPEAKERS', '说话人角色无效。');
      return publicMaterial(save({ ...job, confirmed: true, confirmedTranscript: data.transcript.trim(), speakerRoles: roles, confirmedVersion: (job.confirmedVersion || 0) + 1 }));
    },
    forAnalysis(id, userId, mode) {
      const job = owned(id, userId);
      if (job.analysisMode !== mode) throw materialError('MATERIAL_MODE_MISMATCH', '材料与当前分析模式不一致。', 403);
      if (job.status !== 'ready' || !job.confirmed) throw materialError('MATERIAL_NOT_CONFIRMED', '请先确认转写文字。', 409);
      return { ...publicMaterial(job), transcript: job.confirmedTranscript };
    },
    pending: () => database.prepare("SELECT payload FROM material_jobs WHERE status IN ('queued','transcribing') AND expires_at>? ORDER BY created_at ASC").all(now()).map(decode),
    expired: () => database.prepare('SELECT payload FROM material_jobs WHERE expires_at<=?').all(now()).map(decode).filter(j => !j.cleanedAt),
    remove: id => database.prepare('DELETE FROM material_jobs WHERE id=?').run(id),
    forReport: reportId => database.prepare(`SELECT payload FROM material_jobs WHERE report_id=? OR EXISTS
      (SELECT 1 FROM json_each(material_jobs.payload, '$.reportIds') WHERE value=?)`).all(reportId, reportId).map(decode),
    linkReport(id, userId, mode, transcript, reportId) {
      const job = owned(id, userId);
      if (job.analysisMode !== mode || !job.confirmed || job.confirmedTranscript !== transcript) throw materialError('MATERIAL_CHANGED', '分析期间文字已更新，请重新确认材料。', 409);
      const reportIds = [...new Set([...(job.reportIds || (job.reportId ? [job.reportId] : [])), reportId])];
      save({ ...job, reportId, reportIds });
    },
    detachReport(job, reportId) {
      const reportIds = (job.reportIds || [job.reportId]).filter(id => id && id !== reportId);
      if (reportIds.length) return save({ ...job, reportIds, reportId: reportIds.at(-1) });
      // Keep only an opaque cleanup tombstone until the private directory is removed.
      return save({ id: job.id, userId: job.userId, analysisMode: job.analysisMode, source: job.source,
        fileName: '', sizeBytes: job.sizeBytes, status: 'deleted', createdAt: job.createdAt, expiresAt: now() });
    },
  };
};
