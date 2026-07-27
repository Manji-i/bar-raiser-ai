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
  resumeParseStatus?: ResumeParseStatus | null;
}

export interface FileData {
  name: string;
  content: string;
  type: string;
}

export type ResumeParseStatus = 'usable' | 'low_quality' | 'empty' | 'manual' | 'not_provided';

export interface CandidateAnalysisInput {
  analysisMode: 'candidate';
  jobTitle: string;
  jobDescription: string;
  transcript: string;
  fileName: string;
  resumeFile: File | null;
  resumeText: string;
  resumeParseStatus: ResumeParseStatus;
}

export interface RecruiterAnalysisInput {
  analysisMode: 'recruiter';
  jobTitle: string;
  competencies: string;
  transcript: string;
  fileName: string;
}

export type AnalysisInput = CandidateAnalysisInput | RecruiterAnalysisInput;

export interface Report {
  id: string;
  jobTitle: string;
  competencies: string | null;
  fileName: string;
  result: string;
  createdAt: string;
  analysisMode?: AnalysisMode;
  jobDescription?: string | null;
  resumeFileName?: string | null;
  resumeParseStatus?: ResumeParseStatus | null;
}
