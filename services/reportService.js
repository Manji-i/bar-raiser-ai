import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

const toReport = (row) => ({
  id: row.id,
  userId: row.user_id,
  createdAt: row.created_at,
  jobTitle: row.job_title,
  competencies: row.competencies,
  fileName: row.file_name,
  transcript: row.transcript,
  result: row.result
});

export const reportService = {
  // 获取所有报告（管理员用）
  getAll: () => {
    const rows = db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all();
    return rows.map(toReport);
  },

  // 获取用户自己的报告
  getByUser: (userId) => {
    const rows = db.prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    return rows.map(toReport);
  },

  getById: (id, userId = null, isAdmin = false) => {
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);

    if (!row) return null;

    // 检查权限：管理员或报告的所有者
    if (isAdmin || row.user_id === userId) {
      return toReport(row);
    }

    return null;
  },

  create: (data, userId) => {
    const newReport = {
      id: uuidv4(),
      userId,
      createdAt: new Date().toISOString(),
      ...data
    };

    db.prepare(`
      INSERT INTO reports (id, user_id, created_at, job_title, competencies, file_name, transcript, result)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newReport.id,
      newReport.userId,
      newReport.createdAt,
      newReport.jobTitle ?? null,
      newReport.competencies ?? null,
      newReport.fileName ?? null,
      newReport.transcript ?? null,
      newReport.result ?? null
    );

    return newReport;
  },

  delete: (id, userId = null, isAdmin = false) => {
    const row = db.prepare('SELECT user_id FROM reports WHERE id = ?').get(id);

    if (!row) return false;

    // 检查权限：管理员或报告的所有者
    if (!isAdmin && row.user_id !== userId) {
      return false;
    }

    const result = db.prepare('DELETE FROM reports WHERE id = ?').run(id);
    return result.changes > 0;
  }
};
