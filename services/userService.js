import { randomUUID } from 'node:crypto';

import { db } from './db.js';
import { hashPassword, verifyPassword } from './passwordService.js';
import {
  createSessionToken,
  digestSessionToken,
  isSessionExpired,
} from './sessionToken.js';

const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  isAdmin: !!row.is_admin,
});

export const createUserService = (
  database,
  {
    now = () => new Date(),
    generateId = randomUUID,
  } = {},
) => {
  const saveToken = (rawToken, userId) => {
    database.prepare('INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)')
      .run(digestSessionToken(rawToken), userId, now().toISOString());
  };

  const verifyToken = (rawToken) => {
    if (!/^[a-f0-9]{64}$/.test(String(rawToken ?? ''))) return null;
    const row = database.prepare(`
      SELECT u.id, u.username, u.email, u.is_admin, t.created_at
      FROM tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token = ?
    `).get(digestSessionToken(rawToken));

    if (!row || isSessionExpired(row.created_at, now())) return null;
    return toPublicUser(row);
  };

  return {
    register: async (username, password, email) => {
      if (database.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
        throw new Error('Username already exists');
      }
      if (email && database.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
        throw new Error('Email already exists');
      }

      const createdAt = now().toISOString();
      const newUser = {
        id: generateId(),
        username,
        email: email || null,
        passwordHash: await hashPassword(password),
        isAdmin: false,
        createdAt,
      };
      database.prepare(`
        INSERT INTO users (id, username, email, password_hash, is_admin, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        newUser.id,
        newUser.username,
        newUser.email,
        newUser.passwordHash,
        0,
        newUser.createdAt,
      );

      const token = createSessionToken();
      saveToken(token, newUser.id);
      return { user: toPublicUser({ ...newUser, is_admin: 0 }), token };
    },

    login: async (username, password) => {
      const user = database.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user || !await verifyPassword(password, user.password_hash)) {
        throw new Error('Invalid credentials');
      }

      const token = createSessionToken();
      saveToken(token, user.id);
      return { user: toPublicUser(user), token };
    },

    verifyToken,

    logout: (rawToken) => {
      if (!/^[a-f0-9]{64}$/.test(String(rawToken ?? ''))) return false;
      database.prepare('DELETE FROM tokens WHERE token = ?').run(digestSessionToken(rawToken));
      return true;
    },

    getAllUsers: (adminToken) => {
      const admin = verifyToken(adminToken);
      if (!admin?.isAdmin) throw new Error('Not authorized');
      return database.prepare(
        'SELECT id, username, email, is_admin, created_at FROM users',
      ).all().map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: !!user.is_admin,
        createdAt: user.created_at,
      }));
    },

    setAdmin: (adminToken, userId, isAdmin) => {
      const admin = verifyToken(adminToken);
      if (!admin?.isAdmin) throw new Error('Not authorized');
      const result = database.prepare('UPDATE users SET is_admin = ? WHERE id = ?')
        .run(isAdmin ? 1 : 0, userId);
      if (result.changes === 0) throw new Error('User not found');
      return true;
    },
  };
};

export const userService = createUserService(db);
