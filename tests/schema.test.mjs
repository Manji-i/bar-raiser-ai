import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initializeSchema } from '../services/schema.js';

test('schema migration is idempotent and defaults old reports to recruiter', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'evalbar-schema-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const database = new DatabaseSync(path.join(directory, 'test.db'));
  t.after(() => database.close());

  database.exec(`CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    job_title TEXT,
    competencies TEXT,
    file_name TEXT,
    transcript TEXT,
    result TEXT,
    created_at TEXT
  )`);
  database.prepare('INSERT INTO reports (id, user_id) VALUES (?, ?)').run('legacy', 'user-1');

  initializeSchema(database);
  initializeSchema(database);

  const columns = database.prepare('PRAGMA table_info(reports)').all().map((row) => row.name);
  assert.equal(columns.includes('analysis_mode'), true);
  assert.equal(columns.includes('job_description'), true);
  assert.equal(columns.includes('resume_text'), true);
  assert.equal(database.prepare('SELECT analysis_mode FROM reports WHERE id = ?').get('legacy').analysis_mode, 'recruiter');
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='candidate_system_prompt'").get().name, 'candidate_system_prompt');
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='report_attachments'").get().name, 'report_attachments');
});
