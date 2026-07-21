import crypto from 'crypto';
import { db } from './db.js';

// 密码加密
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// 生成会话token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const saveToken = (token, userId) => {
  db.prepare('INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, userId, new Date().toISOString());
};

const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  isAdmin: !!row.is_admin
});

const verifyToken = (token) => {
  const row = db.prepare(`
    SELECT u.id, u.username, u.email, u.is_admin
    FROM tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token = ?
  `).get(token);

  if (!row) {
    return null;
  }

  return toPublicUser(row);
};

// 用户服务
export const userService = {
  // 注册用户
  register: (username, password, email) => {
    // 检查用户名是否已存在
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      throw new Error('Username already exists');
    }

    // 检查邮箱是否已存在
    if (email && db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      throw new Error('Email already exists');
    }

    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    const newUser = {
      id: Date.now().toString(),
      username,
      email: email || null,
      passwordHash: hashPassword(password),
      isAdmin: userCount === 0, // 第一个用户默认是管理员
      createdAt: new Date().toISOString()
    };

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, is_admin, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newUser.id, newUser.username, newUser.email, newUser.passwordHash, newUser.isAdmin ? 1 : 0, newUser.createdAt);

    // 登录用户，返回token
    const token = generateToken();
    saveToken(token, newUser.id);

    return {
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        isAdmin: newUser.isAdmin
      },
      token
    };
  },

  // 登录用户
  login: (username, password) => {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.password_hash || user.password_hash !== hashPassword(password)) {
      throw new Error('Invalid credentials');
    }

    const token = generateToken();
    saveToken(token, user.id);

    return {
      user: toPublicUser(user),
      token
    };
  },

  // 验证token，返回用户信息
  verifyToken,

  // 登出用户
  logout: (token) => {
    db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
    return true;
  },

  // 获取所有用户（仅管理员）
  getAllUsers: (adminToken) => {
    const admin = verifyToken(adminToken);
    if (!admin || !admin.isAdmin) {
      throw new Error('Not authorized');
    }

    const users = db.prepare('SELECT id, username, email, is_admin, created_at FROM users').all();
    return users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      isAdmin: !!u.is_admin,
      createdAt: u.created_at
    }));
  },

  // 设置管理员（仅管理员）
  setAdmin: (adminToken, userId, isAdmin) => {
    const admin = verifyToken(adminToken);
    if (!admin || !admin.isAdmin) {
      throw new Error('Not authorized');
    }

    const result = db.prepare('UPDATE users SET is_admin = ? WHERE id = ?')
      .run(isAdmin ? 1 : 0, userId);

    if (result.changes === 0) {
      throw new Error('User not found');
    }

    return true;
  }
};
