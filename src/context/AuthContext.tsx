import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  email: string | null;
  isAdmin: boolean;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<void>;
  loginWithFeishu: () => Promise<void>;
  handleFeishuCallback: (token: string, user: User) => void;
  logout: () => Promise<void>;
  loading: boolean;
  isFeishuConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFeishuConfigured, setIsFeishuConfigured] = useState(false);

  useEffect(() => {
    console.log('AuthContext: 初始化中...');
    // 从localStorage恢复登录状态
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    
    console.log('AuthContext: 从localStorage读取 - token:', !!savedToken, 'user:', !!savedUser);
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    
    // 检查飞书配置
    checkFeishuConfig();
    console.log('AuthContext: 设置loading为false');
    setLoading(false);
  }, []);

  // 检查飞书配置
  const checkFeishuConfig = async () => {
    try {
      const response = await fetch('/api/auth/feishu/config');
      if (response.ok) {
        const data = await response.json();
        setIsFeishuConfigured(data.configured);
      }
    } catch (error) {
      console.error('检查飞书配置失败:', error);
    }
  };

  // 辅助函数：带认证的请求
  const apiRequest = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    return response;
  };

  const setAuthData = (newToken: string, newUser: User) => {
    setUser(newUser);
    setToken(newToken);
    
    // 保存到localStorage
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
    
    // 设置admin标识
    if (newUser.isAdmin) {
      localStorage.setItem('admin', 'true');
    } else {
      localStorage.removeItem('admin');
    }
  };

  const login = async (username: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Login failed');
    }

    const data = await response.json();
    setAuthData(data.token, data.user);
  };

  const register = async (username: string, password: string, email?: string) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Registration failed');
    }

    const data = await response.json();
    setAuthData(data.token, data.user);
  };

  // 飞书登录
  const loginWithFeishu = async () => {
    try {
      const response = await fetch('/api/auth/feishu/url');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '获取飞书登录URL失败');
      }
      
      const data = await response.json();
      
      // 跳转到飞书授权页面
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('飞书登录错误:', error);
      throw error;
    }
  };

  // 处理飞书回调
  const handleFeishuCallback = (callbackToken: string, callbackUser: User) => {
    console.log('AuthContext: 处理飞书回调 - token:', !!callbackToken, 'user:', callbackUser);
    setAuthData(callbackToken, callbackUser);
    setLoading(false); // 确保loading设置为false
  };

  const logout = async () => {
    if (token) {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    
    setUser(null);
    setToken(null);
    
    // 清除localStorage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('admin');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      login, 
      register, 
      loginWithFeishu, 
      handleFeishuCallback, 
      logout, 
      loading, 
      isFeishuConfigured 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
