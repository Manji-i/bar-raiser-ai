import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { materialError, publicMaterial } from './materialJobs.js';
import { AUDIO_CHUNK_BYTES, MAX_AUDIO_BYTES, MAX_AUDIO_MB, prepareAudio, validateAudioName } from './materialAudio.js';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const createMaterialManager = ({ store, root, asr, feishu, env = process.env, prepare = prepareAudio, now = Date.now }) => {
  const locks = new Set();
  const sessions = new Map();
  const controllers = new Map();
  let ticking = false;
  const directory = id => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw materialError('MATERIAL_NOT_FOUND', '材料不存在。', 404);
    return path.join(root, id);
  };
  const withLock = async (id, action) => {
    if (locks.has(id)) throw materialError('MATERIAL_BUSY', '材料正在处理，请稍后重试。', 409);
    locks.add(id);
    try { return await action(); } finally { locks.delete(id); }
  };
  const fail = (id, error, revoke = false, changes = {}) => store.update(id, { status: 'failed', error: { code: error.code || 'MATERIAL_FAILED', message: error.status ? error.message : '材料处理失败，请稍后重试。' }, ...(revoke ? { mediaTokenHash: null } : {}), ...changes });
  const manager = {
    async createAudio(userId, data) {
      if (!asr.isEnabled()) throw materialError('ASR_NOT_CONFIGURED', '录音转写尚未开通，请联系管理员。', 503);
      validateAudioName(data.fileName);
      if (!Number.isInteger(data.sizeBytes) || data.sizeBytes <= 0 || data.sizeBytes > MAX_AUDIO_BYTES) throw materialError('AUDIO_SIZE', `录音须在 ${MAX_AUDIO_MB} MB 以内且不能为空。`, 413);
      const job = store.create(userId, { analysisMode: data.analysisMode, source: 'audio', fileName: data.fileName, sizeBytes: data.sizeBytes });
      try { await mkdir(directory(job.id), { recursive: true, mode: 0o700 }); }
      catch (e) { fail(job.id, e); throw materialError('AUDIO_STORAGE', '暂时无法保存录音，请稍后重试。', 503); }
      return job;
    },
    async chunk(id, userId, index, bytes) {
      return withLock(id, async () => {
        const job = store.owned(id, userId);
        if (job.status !== 'uploading' || job.source !== 'audio') throw materialError('UPLOAD_STATE', '当前任务不接受上传。', 409);
        if (!Number.isInteger(index) || index < 0 || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > AUDIO_CHUNK_BYTES) throw materialError('INVALID_CHUNK', '上传分块无效。');
        const hash = digest(bytes);
        if (index < job.chunks.length) {
          if (job.chunks[index] !== hash) throw materialError('CHUNK_MISMATCH', '重传内容不一致，请重新上传。', 409);
          return publicMaterial(job);
        }
        if (index !== job.chunks.length || bytes.length !== Math.min(AUDIO_CHUNK_BYTES, job.sizeBytes - job.uploadedBytes)) throw materialError('CHUNK_ORDER', '上传顺序或文件大小不正确。', 409);
        const target = path.join(directory(id), `source${validateAudioName(job.fileName)}`);
        const file = await open(target, index === 0 ? 'w' : 'r+', 0o600);
        try {
          // A crash before metadata commit may leave an uncommitted tail; overwrite it.
          await file.truncate(job.uploadedBytes);
          let offset = 0;
          while (offset < bytes.length) {
            const { bytesWritten } = await file.write(bytes, offset, bytes.length - offset, job.uploadedBytes + offset);
            if (!bytesWritten) throw materialError('AUDIO_STORAGE', '录音保存中断，请重试上传。', 503);
            offset += bytesWritten;
          }
          await file.sync();
        } finally { await file.close(); }
        return publicMaterial(store.update(id, { uploadedBytes: job.uploadedBytes + bytes.length, chunks: [...job.chunks, hash], lastUploadAt: now() }));
      });
    },
    async submit(id, userId) {
      return withLock(id, async () => {
        const job = store.owned(id, userId);
        if (['queued', 'transcribing', 'ready'].includes(job.status)) return publicMaterial(job);
        if (job.source !== 'audio' || job.status !== 'uploading' || job.uploadedBytes !== job.sizeBytes) throw materialError('UPLOAD_INCOMPLETE', '请等待音频上传完成。', 409);
        const source = path.join(directory(id), `source${validateAudioName(job.fileName)}`);
        if ((await stat(source)).size !== job.sizeBytes) throw materialError('UPLOAD_INCOMPLETE', '上传文件不完整，请重新上传。', 409);
        // Cancellation is allowed while filesystem I/O is pending. Never revive it.
        const current = store.owned(id, userId);
        if (current.status !== 'uploading' || current.source !== 'audio' || current.uploadedBytes !== current.sizeBytes) throw materialError('UPLOAD_STATE', '当前上传已结束或被取消，请重新导入。', 409);
        return publicMaterial(store.update(id, { status: 'queued', localPath: source }));
      });
    },
    importFeishu(userId, sessionKey, data) {
      if (!feishu.isConnected(sessionKey)) throw materialError('FEISHU_CONNECT_REQUIRED', '请先连接飞书账号。', 401);
      const job = store.create(userId, { analysisMode: data.analysisMode, source: 'feishu', fileName: '飞书妙记', sourceUrl: data.url });
      sessions.set(job.id, sessionKey);
      return job;
    },
    retry(id, userId, sessionKey) {
      const job = store.owned(id, userId);
      if (controllers.has(id) || locks.has(id)) throw materialError('MATERIAL_BUSY', '上次请求正在结束，请稍后重试。', 409);
      if (job.status !== 'failed') throw materialError('RETRY_STATE', '只有失败的任务可以重试。', 409);
      if (job.cleanedAt || ['MATERIAL_CANCELLED', 'UPLOAD_IDLE_TIMEOUT'].includes(job.error?.code)) throw materialError('RETRY_STATE', '这次导入已经结束，请重新选择录音。', 409);
      if (job.attempts >= 3) throw materialError('RETRY_LIMIT', '已达到本次材料的重试次数，请重新导入。', 429);
      if (store.hasActive(userId)) throw materialError('MATERIAL_BUSY', '已有材料正在处理。', 409);
      store.assertQueueCapacity();
      if (job.source === 'feishu') {
        if (!feishu.isConnected(sessionKey)) throw materialError('FEISHU_CONNECT_REQUIRED', '请重新连接飞书账号。', 401);
        sessions.set(id, sessionKey);
      } else if (!job.localPath || job.uploadedBytes !== job.sizeBytes) throw materialError('UPLOAD_INCOMPLETE', '上传未完成，请重新选择文件导入。', 409);
      if (job.source === 'audio' && !asr.isEnabled()) throw materialError('ASR_NOT_CONFIGURED', '录音转写服务尚未开通。', 503);
      // A known provider task is queried again, never silently submitted and billed twice.
      return publicMaterial(store.update(id, { status: job.providerId ? 'transcribing' : 'queued', submitting: false,
        error: null, nextPollAt: null, startedAt: null, attempts: job.attempts + 1 }));
    },
    cancel(id, userId) {
      const job = store.owned(id, userId);
      if (job.status === 'ready') throw materialError('MATERIAL_READY', '材料已经完成。', 409);
      controllers.get(id)?.abort();
      sessions.delete(id);
      return publicMaterial(fail(id, materialError('MATERIAL_CANCELLED', '已放弃这次导入。已提交的语音任务可能仍产生费用。'), true, { cleanupRequestedAt: now() }));
    },
    async tick() {
      if (ticking) return;
      ticking = true;
      try {
        // One conversion/submission at a time. Queries are also bounded by this worker.
        for (const pending of store.pending()) {
          const job = store.internal(pending.id);
          if (!job || !['queued','transcribing'].includes(job.status) || job.expiresAt <= now()) continue;
          if (job.nextPollAt && job.nextPollAt > now()) continue;
          if (job.startedAt && now() - job.startedAt > 45 * 60 * 1000) { fail(job.id, materialError('MATERIAL_TIMEOUT', '处理超时，请稍后重试。', 504), true); continue; }
          if (!job.startedAt) store.update(job.id, { startedAt: now() });
          const controller = new AbortController();
          controllers.set(job.id, controller);
          try {
            if (job.source === 'feishu') {
              const session = sessions.get(job.id);
              if (!session) throw materialError('FEISHU_CONNECT_REQUIRED', '服务已重启，请重新连接飞书并重试导入。', 401);
              store.update(job.id, { status: 'transcribing' });
              const result = await feishu.importTranscript(job.sourceUrl, session, { signal: controller.signal });
              if (store.internal(job.id)?.status === 'failed') continue;
              store.update(job.id, { ...result, status: 'ready', error: null });
              sessions.delete(job.id);
            } else if (job.providerId && !job.submitting) {
              const result = await asr.query(job.providerId, controller.signal);
              if (store.internal(job.id)?.status === 'failed') continue;
              if (result) store.update(job.id, { ...result, status: 'ready', error: null, mediaTokenHash: null });
              else store.update(job.id, { nextPollAt: now() + 5000 });
            } else if (job.submitting) {
              throw materialError('ASR_SUBMIT_UNCERTAIN', '服务重启时提交结果未确认。请稍后重试，避免重复转写费用。', 409);
            } else {
              store.update(job.id, { status: 'transcribing', startedAt: now() });
              const prepared = await prepare(job.localPath, job.fileName, { signal: controller.signal });
              if (controller.signal.aborted) continue;
              const key = randomBytes(32).toString('hex');
              const providerId = randomUUID();
              const base = new URL(env.AUDIO_PUBLIC_BASE_URL);
              if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw materialError('ASR_CONFIGURATION', '语音文件访问域名配置无效。', 503);
              const url = new URL(`/api/audio-source/${job.id}/${key}`, base).href;
              store.update(job.id, { providerId, submitting: true, preparedPath: prepared.filePath, mediaTokenHash: digest(key), mediaExpiresAt: now() + 60 * 60 * 1000, durationSeconds: prepared.durationSeconds });
              await asr.submit({ id: providerId, url, format: prepared.format, signal: controller.signal });
              if (store.internal(job.id)?.status === 'failed') continue;
              store.update(job.id, { submitting: false, nextPollAt: now() + 5000 });
            }
          } catch (error) {
            const current = store.internal(job.id);
            if (current && current.status !== 'failed') {
              if (current.providerId && !current.submitting) store.update(job.id, { status: 'failed', error: { code: error.code || 'ASR_QUERY_FAILED', message: error.status ? error.message : '转写查询失败，请重试查询。' } });
              else fail(job.id, error);
            }
          }
          finally { controllers.delete(job.id); }
        }
      } finally { ticking = false; }
    },
    async cleanup() {
      for (const job of store.staleUploads()) {
        fail(job.id, materialError('UPLOAD_IDLE_TIMEOUT', '上传已超过 30 分钟没有进展，请重新选择录音。'), true, { cleanupRequestedAt: now() });
      }
      for (const job of store.cleanupCandidates()) {
        if (controllers.has(job.id) || locks.has(job.id)) continue;
        await withLock(job.id, async () => {
          const current = store.internal(job.id);
          if (!current || current.cleanedAt || (!current.cleanupRequestedAt && current.expiresAt > now())) return;
          await rm(directory(job.id), { recursive: true, force: true });
          sessions.delete(job.id);
          if (current.expiresAt <= now() && !current.reportId) store.remove(job.id);
          else store.update(job.id, { localPath: null, preparedPath: null, mediaTokenHash: null, cleanedAt: now() });
        });
      }
      for (const job of store.expiredRecords()) {
        if (!job.reportId && job.cleanedAt) store.remove(job.id);
      }
    },
    providerFile(id, key) {
      const job = store.internal(id);
      if (!job || !/^[a-f0-9]{64}$/.test(key) || !job.mediaTokenHash || digest(key) !== job.mediaTokenHash || job.mediaExpiresAt <= now() || job.expiresAt <= now()) throw materialError('MATERIAL_NOT_FOUND', '文件不存在或链接已过期。', 404);
      return job.preparedPath;
    },
    audioFile(id, userId) { const job = store.owned(id, userId); if (!job.localPath) throw materialError('MATERIAL_NOT_FOUND', '音频暂不可用。', 404); return job.localPath; },
    async deleteReportSources(reportId) {
      for (const job of store.forReport(reportId)) store.detachReport(job, reportId);
      await manager.cleanup();
    },
  };
  return manager;
};
