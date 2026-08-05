import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SESSION_COOKIE_NAME,
  cookieOptions,
  extractSessionToken,
} from '../services/authSession.js';

test('生产 Cookie 为 HttpOnly Secure SameSite Strict', () => {
  assert.equal(SESSION_COOKIE_NAME, 'evalbar_session');
  assert.deepEqual(cookieOptions(true), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
});

test('认证优先 Cookie，并只接受格式正确的新 Bearer Token', () => {
  const cookieToken = 'a'.repeat(64);
  const bearerToken = 'b'.repeat(64);
  assert.equal(extractSessionToken({
    cookies: { evalbar_session: cookieToken },
    headers: { authorization: `Bearer ${bearerToken}` },
  }), cookieToken);
  assert.equal(extractSessionToken({
    cookies: {},
    headers: { authorization: `Bearer ${bearerToken}` },
  }), bearerToken);
  assert.equal(extractSessionToken({
    cookies: {},
    headers: { authorization: 'Bearer old-token' },
  }), null);
});
