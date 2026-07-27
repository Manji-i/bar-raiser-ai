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
