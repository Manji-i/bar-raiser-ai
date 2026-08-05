import { SESSION_TTL_MS } from './sessionToken.js';

export const SESSION_COOKIE_NAME = 'evalbar_session';

export const cookieOptions = (secure) => ({
  httpOnly: true,
  secure: !!secure,
  sameSite: 'strict',
  path: '/',
  maxAge: SESSION_TTL_MS,
});

export const clearCookieOptions = (secure) => ({
  httpOnly: true,
  secure: !!secure,
  sameSite: 'strict',
  path: '/',
});

export const extractSessionToken = (req) => {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (/^[a-f0-9]{64}$/.test(String(cookieToken ?? ''))) return cookieToken;

  const match = String(req.headers?.authorization ?? '').match(/^Bearer ([a-f0-9]{64})$/);
  return match?.[1] ?? null;
};
