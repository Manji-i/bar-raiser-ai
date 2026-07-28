export const ensureColumn = (database, table, column, definition) => {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

export const initializeSchema = (database) => {
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT, password_hash TEXT, is_admin INTEGER DEFAULT 0, created_at TEXT);
      CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT);
      CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, user_id TEXT, job_title TEXT, competencies TEXT, file_name TEXT, transcript TEXT, result TEXT, created_at TEXT);
      CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, report_id TEXT, rating INTEGER, comments TEXT, specific_issues TEXT, job_title TEXT, competencies TEXT, file_name TEXT, transcript TEXT, assessment_result TEXT, created_at TEXT);
      CREATE TABLE IF NOT EXISTS system_prompt (version INTEGER PRIMARY KEY, content TEXT, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS candidate_system_prompt (version INTEGER PRIMARY KEY, content TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS report_attachments (
        id TEXT PRIMARY KEY, report_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL,
        original_name TEXT NOT NULL, stored_name TEXT NOT NULL, relative_path TEXT NOT NULL,
        mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
        parse_status TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
      );
    `);
    ensureColumn(database, 'reports', 'analysis_mode', "TEXT NOT NULL DEFAULT 'recruiter'");
    ensureColumn(database, 'reports', 'job_description', 'TEXT');
    ensureColumn(database, 'reports', 'resume_text', 'TEXT');
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};
