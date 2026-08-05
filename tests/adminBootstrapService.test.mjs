import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { bootstrapAdmin } from '../services/adminBootstrapService.js';
import { initializeSchema } from '../services/schema.js';

test('管理员初始化只允许空 users 表且不签发 Token', async (t) => {
  const database = new DatabaseSync(':memory:');
  initializeSchema(database);
  t.after(() => database.close());

  const admin = await bootstrapAdmin(database, {
    username: 'bootstrap-admin',
    password: 'secure-admin-pass',
    email: 'admin@example.com',
    now: () => new Date('2026-08-05T00:00:00.000Z'),
    generateId: () => 'admin-1',
  });

  assert.equal(admin.isAdmin, true);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM tokens').get().count, 0);
  await assert.rejects(() => bootstrapAdmin(database, {
    username: 'second-admin',
    password: 'secure-admin-pass',
  }), /requires an empty users table/);
});

test('已有普通用户时管理员初始化失败关闭', async (t) => {
  const database = new DatabaseSync(':memory:');
  initializeSchema(database);
  t.after(() => database.close());
  database.prepare(`
    INSERT INTO users (id, username, password_hash, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('user-1', 'existing-user', 'legacy', 0, '2026-08-05T00:00:00.000Z');

  await assert.rejects(() => bootstrapAdmin(database, {
    username: 'bootstrap-admin',
    password: 'secure-admin-pass',
  }), /requires an empty users table/);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
});
