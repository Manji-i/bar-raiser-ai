import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;

const deriveKey = (password, salt, length = KEY_LENGTH) => new Promise((resolve, reject) => {
  scrypt(password, salt, length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY_BYTES,
  }, (error, derivedKey) => {
    if (error) reject(error);
    else resolve(derivedKey);
  });
});

export const validateNewPassword = (password) => (
  typeof password === 'string'
  && password.length >= MIN_PASSWORD_LENGTH
  && password.length <= MAX_PASSWORD_LENGTH
);

export const hashPassword = async (password) => {
  if (!validateNewPassword(password)) {
    throw new Error('Password must be 10 to 128 characters');
  }

  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
};

export const verifyPassword = async (password, storedHash) => {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;

  if (/^[a-f0-9]{64}$/.test(storedHash)) {
    const actual = createHash('sha256').update(password).digest();
    const expected = Buffer.from(storedHash, 'hex');
    return timingSafeEqual(actual, expected);
  }

  const match = storedHash.match(
    /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([a-f0-9]{32})\$([a-f0-9]{128})$/,
  );
  if (!match) return false;

  const [, n, r, p, saltHex, hashHex] = match;
  if (Number(n) !== SCRYPT_N || Number(r) !== SCRYPT_R || Number(p) !== SCRYPT_P) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await deriveKey(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
};
