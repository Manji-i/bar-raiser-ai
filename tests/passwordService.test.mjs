import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from '../services/passwordService.js';

test('新密码使用带随机盐的 scrypt，旧 SHA-256 只读兼容', async () => {
  const first = await hashPassword('secure-pass-1');
  const second = await hashPassword('secure-pass-1');

  assert.match(first, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('secure-pass-1', first), true);
  assert.equal(await verifyPassword('wrong-pass', first), false);

  const legacy = createHash('sha256').update('legacy-pass').digest('hex');
  assert.equal(await verifyPassword('legacy-pass', legacy), true);
  assert.equal(await verifyPassword('wrong-pass', legacy), false);
  assert.equal(validateNewPassword('short'), false);
  assert.equal(validateNewPassword('secure-pass-1'), true);
});

test('拒绝损坏或参数异常的密码编码', async () => {
  assert.equal(await verifyPassword('password', 'not-a-password-hash'), false);
  assert.equal(await verifyPassword('password', 'scrypt$999999999$8$1$aa$bb'), false);
});
