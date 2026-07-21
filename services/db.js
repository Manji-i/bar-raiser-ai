import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'app.db');

export const db = new DatabaseSync(DB_FILE);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    job_title TEXT,
    competencies TEXT,
    file_name TEXT,
    transcript TEXT,
    result TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    report_id TEXT,
    rating INTEGER,
    comments TEXT,
    specific_issues TEXT,
    job_title TEXT,
    competencies TEXT,
    file_name TEXT,
    transcript TEXT,
    assessment_result TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS system_prompt (
    version INTEGER PRIMARY KEY,
    content TEXT,
    updated_at TEXT
  );
`);
