export type PdfWorkerErrorCode =
  | 'FONT_LOAD_FAILED'
  | 'PDF_BUILD_FAILED'
  | 'WORKER_TIMEOUT';

export type PdfWorkerRequest =
  | { type: 'probe'; requestId: string }
  | { type: 'render'; requestId: string; model: unknown };

export type PdfWorkerResponse =
  | { type: 'success'; requestId: string; blob: Blob }
  | { type: 'error'; requestId: string; code: PdfWorkerErrorCode; message: string };

const ERROR_CODES: PdfWorkerErrorCode[] = [
  'FONT_LOAD_FAILED',
  'PDF_BUILD_FAILED',
  'WORKER_TIMEOUT',
];

export const isPdfWorkerResponse = (value: unknown): value is PdfWorkerResponse => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.requestId !== 'string') return false;
  if (candidate.type === 'success') {
    return candidate.blob instanceof Blob && candidate.blob.type === 'application/pdf';
  }
  return candidate.type === 'error'
    && ERROR_CODES.includes(candidate.code as PdfWorkerErrorCode)
    && typeof candidate.message === 'string';
};
