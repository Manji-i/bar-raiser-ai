import type { AnalysisMode } from './services/analysisMode';

export type { AnalysisMode } from './services/analysisMode';

export enum AnalysisStatus {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export interface AnalysisState {
  status: AnalysisStatus;
  result: string | null;
  error: string | null;
  fileName: string | null;
  reportId?: string | null;
  analysisMode?: AnalysisMode;
  jobDescription?: string | null;
  resumeFileName?: string | null;
  resumeParseStatus?: string | null;
}

export interface FileData {
  name: string;
  content: string;
  type: string;
}

export interface Report {
  id: string;
  jobTitle: string;
  competencies: string;
  fileName: string;
  result: string;
  createdAt: string;
  analysisMode?: AnalysisMode;
  jobDescription?: string | null;
  resumeFileName?: string | null;
  resumeParseStatus?: string | null;
}
