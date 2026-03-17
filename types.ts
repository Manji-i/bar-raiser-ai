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
}
