#!/usr/bin/env node
/**
 * One-shot migration: import legacy JSON files (data/*.json) into SQLite (data/app.db).
 *
 * - Idempotent: skips if the users table already has rows (safe to re-run).
 * - Preserves ids, createdAt, isAdmin and active session tokens.
 * - Accounts without a passwordHash (legacy Feishu-only accounts) are migrated
 *   as-is with password_hash = NULL, so they can no longer log in.
 * - On success, legacy JSON files are renamed to *.migrated.bak (kept as backup).
 *
 * Usage: node scripts/migrate-to-sqlite.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../services/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

const readJsonIfExists = (file) => {
  const filePath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
if (userCount > 0) {
  console.log(`SKIP: users table already has ${userCount} rows. Migration already done?`);
  process.exit(0);
}

const users = readJsonIfExists('users.json') || [];
const reports = readJsonIfExists('reports.json') || [];
const feedbacks = readJsonIfExists('feedback.json') || [];
const prompt = readJsonIfExists('systemPrompt.json');

db.exec('BEGIN');
try {
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, email, password_hash, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertToken = db.prepare('INSERT OR IGNORE INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)');
  const insertReport = db.prepare(`
    INSERT INTO reports (id, user_id, created_at, job_title, competencies, file_name, transcript, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFeedback = db.prepare(`
    INSERT INTO feedback (id, report_id, rating, comments, specific_issues, job_title, competencies, file_name, transcript, assessment_result, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let tokenCount = 0;
  for (const u of users) {
    insertUser.run(
      u.id,
      u.username,
      u.email ?? null,
      u.passwordHash ?? null,
      u.isAdmin ? 1 : 0,
      u.createdAt ?? new Date().toISOString()
    );
    for (const token of u.tokens || []) {
      insertToken.run(token, u.id, new Date().toISOString());
      tokenCount++;
    }
  }

  for (const r of reports) {
    insertReport.run(
      r.id,
      r.userId ?? null,
      r.createdAt ?? new Date().toISOString(),
      r.jobTitle ?? null,
      r.competencies ?? null,
      r.fileName ?? null,
      r.transcript ?? null,
      r.result ?? null
    );
  }

  for (const f of feedbacks) {
    insertFeedback.run(
      f.id ?? Date.now().toString(),
      f.reportId ?? null,
      f.rating ?? null,
      f.comments ?? null,
      f.specificIssues ? JSON.stringify(f.specificIssues) : null,
      f.jobTitle ?? null,
      f.competencies ?? null,
      f.fileName ?? null,
      f.transcript ?? null,
      f.assessmentResult ?? null,
      f.createdAt ?? new Date().toISOString()
    );
  }

  if (prompt && prompt.content) {
    // initializePrompt() already inserted version 1; replace it with the legacy current version
    db.prepare('DELETE FROM system_prompt').run();
    db.prepare('INSERT INTO system_prompt (version, content, updated_at) VALUES (?, ?, ?)')
      .run(prompt.version ?? 1, prompt.content, new Date().toISOString());
  }

  db.exec('COMMIT');
  console.log(`Migrated: ${users.length} users (${tokenCount} tokens), ${reports.length} reports, ${feedbacks.length} feedbacks, prompt ${prompt ? 'v' + (prompt.version ?? 1) : '(default)'}`);
} catch (error) {
  db.exec('ROLLBACK');
  console.error('Migration failed, rolled back:', error);
  process.exit(1);
}

// Rename legacy files as backup
for (const file of ['users.json', 'reports.json', 'feedback.json', 'systemPrompt.json']) {
  const filePath = path.join(DATA_DIR, file);
  if (fs.existsSync(filePath)) {
    fs.renameSync(filePath, filePath + '.migrated.bak');
    console.log(`Renamed ${file} -> ${file}.migrated.bak`);
  }
}

console.log('Migration complete.');
