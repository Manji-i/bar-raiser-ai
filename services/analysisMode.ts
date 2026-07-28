export type AnalysisMode = 'candidate' | 'recruiter';
export type ModeArea = 'app' | 'history';

export const ANALYSIS_MODE_KEY = 'evalbar_analysis_mode';
export const AUTH_MODE_KEY = 'evalbar_auth_mode';
export const POST_LOGIN_MODE_KEY = 'evalbar_post_login_mode';
export const POST_LOGIN_PATH_KEY = 'evalbar_post_login_path';

export const isAnalysisMode = (value: unknown): value is AnalysisMode =>
  value === 'candidate' || value === 'recruiter';

export const resolveStoredMode = (value: string | null): AnalysisMode =>
  isAnalysisMode(value) ? value : 'recruiter';

export const modePath = (mode: AnalysisMode, area: ModeArea): string =>
  `/${area}/${mode}`;

export const resolveModeAccess = (
  routeMode: AnalysisMode | null,
  authMode: AnalysisMode,
  area: ModeArea,
): string => modePath(routeMode === authMode ? routeMode : authMode, area);

export const reportMatchesAuthMode = (
  reportMode: AnalysisMode | undefined,
  authMode: AnalysisMode,
): boolean => (reportMode ?? 'recruiter') === authMode;

export const modeFromPath = (pathname: string): AnalysisMode | null => {
  const segment = pathname.split('/').filter(Boolean)[1];
  return isAnalysisMode(segment) ? segment : null;
};

export const getRecentMode = (): AnalysisMode =>
  typeof window === 'undefined'
    ? 'recruiter'
    : resolveStoredMode(window.localStorage.getItem(ANALYSIS_MODE_KEY));

export const rememberMode = (mode: AnalysisMode): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ANALYSIS_MODE_KEY, mode);
  }
};

export const getAuthMode = (): AnalysisMode | null => {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(AUTH_MODE_KEY);
  return isAnalysisMode(value) ? value : null;
};

export const setAuthMode = (mode: AnalysisMode): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUTH_MODE_KEY, mode);
  }
};

export const clearAuthMode = (): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_MODE_KEY);
  }
};

export const setPostLoginMode = (mode: AnalysisMode): void => {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(POST_LOGIN_MODE_KEY, mode);
  }
};

export const consumePostLoginMode = (): AnalysisMode | null => {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(POST_LOGIN_MODE_KEY);
  window.sessionStorage.removeItem(POST_LOGIN_MODE_KEY);
  return isAnalysisMode(value) ? value : null;
};

export const clearPostLoginMode = (): void => {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(POST_LOGIN_MODE_KEY);
  }
};

export const setPostLoginPath = (mode: AnalysisMode): void => {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(POST_LOGIN_PATH_KEY, modePath(mode, 'app'));
  }
};

export const consumePostLoginPath = (): string | null => {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(POST_LOGIN_PATH_KEY);
  window.sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  return value === '/app/candidate' || value === '/app/recruiter' ? value : null;
};
