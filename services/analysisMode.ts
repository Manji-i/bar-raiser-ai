export type AnalysisMode = 'candidate' | 'recruiter';
export type ModeArea = 'app' | 'history';

export const ANALYSIS_MODE_KEY = 'evalbar_analysis_mode';
export const POST_LOGIN_PATH_KEY = 'evalbar_post_login_path';

export const isAnalysisMode = (value: unknown): value is AnalysisMode =>
  value === 'candidate' || value === 'recruiter';

export const resolveStoredMode = (value: string | null): AnalysisMode =>
  isAnalysisMode(value) ? value : 'recruiter';

export const modePath = (mode: AnalysisMode, area: ModeArea): string =>
  `/${area}/${mode}`;

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
