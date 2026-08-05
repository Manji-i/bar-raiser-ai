import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { initializeSchema } from '../services/schema.js';
import { createUserService } from '../services/userService.js';

const createFixture = () => {
  const database = new DatabaseSync(':memory:');
  initializeSchema(database);
  let now = new Date('2026-08-05T00:00:00.000Z');
  let id = 0;
  const service = createUserService(database, {
    now: () => now,
    generateId: () => `user-${++id}`,
  });
  return {
    database,
    service,
    setNow: (value) => { now = new Date(value); },
  };
};

test('新注册使用 scrypt 且首用户永远不是管理员', async (t) => {
  const { database, service } = createFixture();
  t.after(() => database.close());

  await assert.rejects(() => service.register('short-user', 'short'), /10 to 128/);
  const created = await service.register('new-user', 'secure-pass-1', 'new@example.com');
  assert.equal(created.user.isAdmin, false);

  const row = database.prepare(
    'SELECT password_hash, is_admin FROM users WHERE username = ?',
  ).get('new-user');
  assert.match(row.password_hash, /^scrypt\$/);
  assert.equal(row.is_admin, 0);
});

test('旧 SHA-256 用户仍可登录且哈希不会被自动改写', async (t) => {
  const { database, service } = createFixture();
  t.after(() => database.close());

  const legacyHash = createHash('sha256').update('legacy-pass').digest('hex');
  database.prepare(`
    INSERT INTO users (id, username, email, password_hash, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('legacy-id', 'legacy-user', null, legacyHash, 1, '2026-08-01T00:00:00.000Z');

  const login = await service.login('legacy-user', 'legacy-pass');
  assert.equal(login.user.isAdmin, true);
  assert.equal(
    database.prepare('SELECT password_hash FROM users WHERE id = ?').get('legacy-id').password_hash,
    legacyHash,
  );
  await assert.rejects(() => service.login('legacy-user', 'wrong-pass'), /Invalid credentials/);
});

test('新 Token 只存摘要，旧明文和过期 Token 均被拒绝', async (t) => {
  const { database, service, setNow } = createFixture();
  t.after(() => database.close());

  await service.register('new-user', 'secure-pass-1');
  const login = await service.login('new-user', 'secure-pass-1');
  const stored = database.prepare(
    'SELECT token FROM tokens ORDER BY created_at DESC LIMIT 1',
  ).get().token;
  assert.match(stored, /^sha256:/);
  assert.notEqual(stored, login.token);
  assert.equal(service.verifyToken(login.token).username, 'new-user');

  database.prepare('INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)')
    .run('legacy-raw-token', 'user-1', '2026-08-05T00:00:00.000Z');
  assert.equal(service.verifyToken('legacy-raw-token'), null);

  setNow('2026-08-05T12:00:01.000Z');
  assert.equal(service.verifyToken(login.token), null);
});

test('登出只删除当前新会话摘要', async (t) => {
  const { database, service } = createFixture();
  t.after(() => database.close());

  const registration = await service.register('new-user', 'secure-pass-1');
  assert.equal(service.logout(registration.token), true);
  assert.equal(service.verifyToken(registration.token), null);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM tokens').get().count, 0);
});
