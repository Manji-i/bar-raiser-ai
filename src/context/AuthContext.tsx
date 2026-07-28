import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  ANALYSIS_MODE_KEY,
  AUTH_MODE_KEY,
  POST_LOGIN_PATH_KEY,
  clearAuthMode,
  clearPostLoginMode,
  getAuthMode,
  setAuthMode,
  type AnalysisMode,
} from '../../services/analysisMode';

interface User {
  id: string;
  username: string;
  email: string | null;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  analysisMode: AnalysisMode | null;
  login: (username: string, password: string, analysisMode: AnalysisMode) => Promise<void>;
  register: (
    username: string,
    password: string,
    analysisMode: AnalysisMode,
    email?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_STORAGE_KEYS = new Set(['auth_token', 'auth_user', AUTH_MODE_KEY]);

const clearStoredAuth = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  localStorage.removeItem('admin');
  localStorage.removeItem(ANALYSIS_MODE_KEY);
  sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  clearAuthMode();
  clearPostLoginMode();
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    const savedMode = getAuthMode();

    if (savedToken && savedUser && savedMode) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setAnalysisMode(savedMode);
      } catch {
        clearStoredAuth();
      }
    } else {
      clearStoredAuth();
    }

    setLoading(false);

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (!event.key || AUTH_STORAGE_KEYS.has(event.key))) {
        setUser(null);
        setToken(null);
        setAnalysisMode(null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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

  const setAuthData = (newToken: string, newUser: User, newAnalysisMode: AnalysisMode) => {
    setUser(newUser);
    setToken(newToken);
    setAnalysisMode(newAnalysisMode);
    
    // 保存到localStorage
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
    setAuthMode(newAnalysisMode);
    
    // 设置admin标识
    if (newUser.isAdmin) {
      localStorage.setItem('admin', 'true');
    } else {
      localStorage.removeItem('admin');
    }
  };

  const login = async (username: string, password: string, analysisMode: AnalysisMode) => {
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
    setAuthData(data.token, data.user, analysisMode);
  };

  const register = async (
    username: string,
    password: string,
    analysisMode: AnalysisMode,
    email?: string,
  ) => {
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
    setAuthData(data.token, data.user, analysisMode);
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
    setAnalysisMode(null);
    clearStoredAuth();
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      analysisMode,
      login, 
      register, 
      logout, 
      loading 
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
