const validateOptions = ({ windowMs, max }) => {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new TypeError('windowMs must be a positive number');
  }
  if (!Number.isInteger(max) || max <= 0) {
    throw new TypeError('max must be a positive integer');
  }
};

const validateKey = (key) => {
  if (typeof key !== 'string' || key.length === 0 || key.length > 256) {
    throw new TypeError('guard key must contain 1 to 256 characters');
  }
  return key;
};

export const createWindowGuard = ({ windowMs, max, now = Date.now }) => {
  validateOptions({ windowMs, max });
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const entries = new Map();

  return {
    consume: (rawKey) => {
      const key = validateKey(rawKey);
      const currentTime = Number(now());
      if (!Number.isFinite(currentTime)) throw new TypeError('now must return a number');

      let entry = entries.get(key);
      if (!entry || currentTime >= entry.resetAt) {
        entry = { count: 0, resetAt: currentTime + windowMs };
        entries.set(key, entry);
      }

      if (entry.count >= max) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: entry.resetAt,
          retryAfterMs: Math.max(0, entry.resetAt - currentTime),
        };
      }

      entry.count += 1;
      return {
        allowed: true,
        remaining: max - entry.count,
        resetAt: entry.resetAt,
        retryAfterMs: 0,
      };
    },
  };
};

export const createConcurrencyGuard = ({ max }) => {
  validateOptions({ windowMs: 1, max });
  const active = new Map();

  return {
    acquire: (rawKey) => {
      const key = validateKey(rawKey);
      const count = active.get(key) ?? 0;
      if (count >= max) return null;

      active.set(key, count + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const current = active.get(key) ?? 0;
        if (current <= 1) active.delete(key);
        else active.set(key, current - 1);
      };
    },
  };
};
