import { randomUUID } from 'node:crypto';

import { hashPassword } from './passwordService.js';

export const bootstrapAdmin = async (
  database,
  {
    username,
    password,
    email = null,
    now = () => new Date(),
    generateId = randomUUID,
  },
) => {
  if (typeof username !== 'string' || !username.trim()) {
    throw new Error('Admin username is required');
  }
  const passwordHash = await hashPassword(password);
  const id = generateId();
  const createdAt = now().toISOString();

  database.exec('BEGIN IMMEDIATE');
  try {
    const userCount = database.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    if (userCount !== 0) {
      throw new Error('Admin bootstrap requires an empty users table');
    }
    database.prepare(`
      INSERT INTO users (id, username, email, password_hash, is_admin, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(id, username.trim(), email || null, passwordHash, createdAt);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return {
    id,
    username: username.trim(),
    email: email || null,
    isAdmin: true,
  };
};
