import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// 初始化用户文件
const initializeUsers = () => {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
    console.log('Created users.json');
  }
};

initializeUsers();

// 密码加密
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// 生成会话token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// 用户服务
export const userService = {
  // 注册用户
  register: (username, password, email) => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    
    // 检查用户名是否已存在
    if (users.find(u => u.username === username)) {
      throw new Error('Username already exists');
    }
    
    // 检查邮箱是否已存在
    if (email && users.find(u => u.email === email)) {
      throw new Error('Email already exists');
    }
    
    const newUser = {
      id: Date.now().toString(),
      username,
      email: email || null,
      passwordHash: hashPassword(password),
      isAdmin: users.length === 0, // 第一个用户默认是管理员
      tokens: [],
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    // 登录用户，返回token
    const token = generateToken();
    newUser.tokens.push(token);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
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
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users.find(u => u.username === username);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    if (user.passwordHash !== hashPassword(password)) {
      throw new Error('Invalid credentials');
    }
    
    const token = generateToken();
    user.tokens.push(token);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin
      },
      token
    };
  },

  // 验证token，返回用户信息
  verifyToken: (token) => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users.find(u => u.tokens.includes(token));
    
    if (!user) {
      return null;
    }
    
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin
    };
  },

  // 登出用户
  logout: (token) => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const userIndex = users.findIndex(u => u.tokens.includes(token));
    
    if (userIndex !== -1) {
      users[userIndex].tokens = users[userIndex].tokens.filter(t => t !== token);
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
    
    return true;
  },

  // 获取所有用户（仅管理员）
  getAllUsers: (adminToken) => {
    const admin = this.verifyToken(adminToken);
    if (!admin || !admin.isAdmin) {
      throw new Error('Not authorized');
    }
    
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt
    }));
  },

  // 设置管理员（仅管理员）
  setAdmin: (adminToken, userId, isAdmin) => {
    const admin = this.verifyToken(adminToken);
    if (!admin || !admin.isAdmin) {
      throw new Error('Not authorized');
    }
    
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    users[userIndex].isAdmin = isAdmin;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    return true;
  },

  // 飞书登录/注册用户
  loginOrRegisterFeishuUser: (feishuUserId, name, email, avatar) => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    
    // 查找是否已存在飞书用户
    let user = users.find(u => u.feishuUserId === feishuUserId);
    
    if (user) {
      // 用户已存在，直接登录
      const token = generateToken();
      user.tokens.push(token);
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
      
      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: user.isAdmin,
          avatar: user.avatar
        },
        token
      };
    }
    
    // 用户不存在，创建新用户
    // 处理用户名冲突
    let username = name || `feishu_${feishuUserId}`;
    let userCount = 1;
    while (users.find(u => u.username === username)) {
      username = `${name || 'feishu'}_${feishuUserId}_${userCount}`;
      userCount++;
    }
    
    // 创建新用户
    const newUser = {
      id: Date.now().toString(),
      username,
      email: email || null,
      passwordHash: null, // 飞书用户不需要密码
      isAdmin: users.length === 0, // 第一个用户默认是管理员
      tokens: [],
      feishuUserId,
      avatar,
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    
    // 生成token并登录
    const token = generateToken();
    newUser.tokens.push(token);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    return {
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        isAdmin: newUser.isAdmin,
        avatar: newUser.avatar
      },
      token
    };
  }
};
