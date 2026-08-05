import { createHash, randomBytes } from 'node:crypto';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const createSessionToken = () => randomBytes(32).toString('hex');

export const digestSessionToken = (token) => (
  `sha256:${createHash('sha256').update(String(token)).digest('hex')}`
);

export const isSessionExpired = (createdAt, now = new Date()) => {
  const createdAtMs = Date.parse(createdAt);
  const nowMs = now.getTime();
  return (
    !Number.isFinite(createdAtMs)
    || !Number.isFinite(nowMs)
    || createdAtMs > nowMs
    || nowMs - createdAtMs >= SESSION_TTL_MS
  );
};
