import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

const REPORT_SELECT = `
  SELECT
    r.*,
    a.original_name AS resume_file_name,
    a.parse_status AS resume_parse_status
  FROM reports r
  LEFT JOIN report_attachments a
    ON a.report_id = r.id AND a.kind = 'resume'
`;

const toReport = (row) => ({
  id: row.id,
  userId: row.user_id,
  createdAt: row.created_at,
  analysisMode: row.analysis_mode ?? 'recruiter',
  jobTitle: row.job_title,
  jobDescription: row.job_description,
  competencies: row.competencies,
  fileName: row.file_name,
  resumeFileName: row.resume_file_name ?? undefined,
  resumeParseStatus: row.resume_parse_status ?? undefined,
  transcript: row.transcript,
  result: row.result
});

const toAttachment = (row) => row ? ({
  id: row.id,
  reportId: row.report_id,
  userId: row.user_id,
  kind: row.kind,
  originalName: row.original_name,
  storedName: row.stored_name,
  relativePath: row.relative_path,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256,
  parseStatus: row.parse_status,
  createdAt: row.created_at
}) : null;

export const createReportService = (database, createId = uuidv4) => ({
  // 获取所有报告（管理员用）
  getAll: (analysisMode = null) => {
    const rows = analysisMode
      ? database.prepare(`${REPORT_SELECT} WHERE r.analysis_mode = ? ORDER BY r.created_at DESC`).all(analysisMode)
      : database.prepare(`${REPORT_SELECT} ORDER BY r.created_at DESC`).all();
    return rows.map(toReport);
  },

  // 获取用户自己的报告，可按分析模式隔离历史记录。
  getByUser: (userId, analysisMode = null) => {
    const rows = analysisMode
      ? database.prepare(`${REPORT_SELECT} WHERE r.user_id = ? AND r.analysis_mode = ? ORDER BY r.created_at DESC`).all(userId, analysisMode)
      : database.prepare(`${REPORT_SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC`).all(userId);
    return rows.map(toReport);
  },

  getById: (id, userId = null, isAdmin = false) => {
    const row = database.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id);

    if (!row) return null;

    // 检查权限：管理员或报告的所有者
    if (isAdmin || row.user_id === userId) {
      return toReport(row);
    }

    return null;
  },

  getResumeAttachment: (reportId) => {
    const row = database.prepare(`
      SELECT * FROM report_attachments
      WHERE report_id = ? AND kind = 'resume'
      ORDER BY created_at DESC LIMIT 1
    `).get(reportId);
    return toAttachment(row);
  },

  getAttachments: (reportId) => {
    const rows = database.prepare('SELECT * FROM report_attachments WHERE report_id = ?').all(reportId);
    return rows.map(toAttachment);
  },

  create: (data, userId, attachment = null) => {
    const analysisMode = data.analysisMode === 'candidate' ? 'candidate' : 'recruiter';
    const newReport = {
      ...data,
      id: data.id ?? createId(),
      userId,
      createdAt: data.createdAt ?? new Date().toISOString(),
      analysisMode
    };

    const insertReport = () => database.prepare(`
      INSERT INTO reports (
        id, user_id, created_at, analysis_mode, job_title, job_description,
        competencies, file_name, resume_text, transcript, result
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newReport.id,
      newReport.userId,
      newReport.createdAt,
      newReport.analysisMode,
      newReport.jobTitle ?? null,
      newReport.jobDescription ?? null,
      newReport.competencies ?? null,
      newReport.fileName ?? null,
      newReport.resumeText ?? null,
      newReport.transcript ?? null,
      newReport.result ?? null
    );

    const insertAttachment = () => {
      if (!attachment) return;
      if (attachment.reportId !== newReport.id || attachment.userId !== userId) {
        throw new Error('Attachment ownership does not match report');
      }
      database.prepare(`
        INSERT INTO report_attachments (
          id, report_id, user_id, kind, original_name, stored_name, relative_path,
          mime_type, size_bytes, sha256, parse_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attachment.id,
        attachment.reportId,
        attachment.userId,
        attachment.kind,
        attachment.originalName,
        attachment.storedName,
        attachment.relativePath,
        attachment.mimeType,
        attachment.sizeBytes,
        attachment.sha256,
        attachment.parseStatus,
        attachment.createdAt
      );
    };

    if (attachment) {
      database.exec('BEGIN IMMEDIATE');
      try {
        insertReport();
        insertAttachment();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    } else {
      insertReport();
    }

    const { resumeText: _privateResumeText, ...publicReport } = newReport;
    return publicReport;
  },

  delete: (id, userId = null, isAdmin = false) => {
    const row = database.prepare('SELECT user_id FROM reports WHERE id = ?').get(id);

    if (!row) return false;

    // 检查权限：管理员或报告的所有者
    if (!isAdmin && row.user_id !== userId) {
      return false;
    }

    const result = database.prepare('DELETE FROM reports WHERE id = ?').run(id);
    return result.changes > 0;
  }
});

export const reportService = createReportService(db);
