import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SESSION_TTL_MS,
  createSessionToken,
  digestSessionToken,
  isSessionExpired,
} from '../services/sessionToken.js';

test('原始 Token 与数据库摘要分离，绝对有效期为 12 小时', () => {
  const raw = createSessionToken();
  const digest = digestSessionToken(raw);

  assert.match(raw, /^[a-f0-9]{64}$/);
  assert.match(digest, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(raw, digest);
  assert.equal(SESSION_TTL_MS, 12 * 60 * 60 * 1000);
  assert.equal(
    isSessionExpired('2026-08-05T00:00:00.000Z', new Date('2026-08-05T11:59:59.000Z')),
    false,
  );
  assert.equal(
    isSessionExpired('2026-08-05T00:00:00.000Z', new Date('2026-08-05T12:00:01.000Z')),
    true,
  );
  assert.equal(isSessionExpired('invalid', new Date()), true);
  assert.equal(
    isSessionExpired('2026-08-06T00:00:00.000Z', new Date('2026-08-05T00:00:00.000Z')),
    true,
  );
});
