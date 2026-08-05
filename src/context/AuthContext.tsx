import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
const AUTH_STORAGE_KEYS = new Set([AUTH_MODE_KEY]);

const clearLegacyAuthKeys = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  localStorage.removeItem('admin');
};

const clearStoredAuth = () => {
  clearLegacyAuthKeys();
  localStorage.removeItem(ANALYSIS_MODE_KEY);
  sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  clearAuthMode();
  clearPostLoginMode();
};

const readError = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : fallback;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    clearLegacyAuthKeys();
    const savedMode = getAuthMode();

    const restore = async () => {
      if (!savedMode) {
        clearStoredAuth();
        if (active) setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Session unavailable');
        const data = await response.json();
        if (active) {
          setUser(data.user);
          setAnalysisMode(savedMode);
        }
      } catch {
        clearStoredAuth();
      } finally {
        if (active) setLoading(false);
      }
    };

    void restore();

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (!event.key || AUTH_STORAGE_KEYS.has(event.key))) {
        setUser(null);
        setAnalysisMode(null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      active = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setAuthData = (newUser: User, newAnalysisMode: AnalysisMode) => {
    setUser(newUser);
    setAnalysisMode(newAnalysisMode);
    setAuthMode(newAnalysisMode);
  };

  const login = async (username: string, password: string, mode: AnalysisMode) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Login failed'));
    const data = await response.json();
    setAuthData(data.user, mode);
  };

  const register = async (
    username: string,
    password: string,
    mode: AnalysisMode,
    email?: string,
  ) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Registration failed'));
    const data = await response.json();
    setAuthData(data.user, mode);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (error) {
      console.error('Logout error:', error instanceof Error ? error.name : 'Error');
    }
    setUser(null);
    setAnalysisMode(null);
    clearStoredAuth();
  };

  return (
    <AuthContext.Provider value={{
      user,
      analysisMode,
      login,
      register,
      logout,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
