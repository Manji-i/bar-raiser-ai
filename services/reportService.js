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

  create: (data, userId) => {
    const analysisMode = data.analysisMode === 'candidate' ? 'candidate' : 'recruiter';
    const newReport = {
      id: createId(),
      userId,
      createdAt: new Date().toISOString(),
      ...data,
      analysisMode
    };

    database.prepare(`
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
