import { isPdfWorkerResponse } from './reportPdfProtocol.ts';

export const createReportPdfWorker = () => new Worker(
  new URL('./reportPdf.worker.ts', import.meta.url),
  { type: 'module', name: 'evalbar-pdf' },
);

export const probeReportPdfWorker = (): Promise<Blob> => new Promise((resolve, reject) => {
  const worker = createReportPdfWorker();
  const requestId = crypto.randomUUID();
  const timeout = window.setTimeout(() => {
    worker.terminate();
    reject(new Error('WORKER_TIMEOUT'));
  }, 15_000);

  const finish = () => {
    window.clearTimeout(timeout);
    worker.terminate();
  };

  worker.onerror = () => {
    finish();
    reject(new Error('PDF_BUILD_FAILED'));
  };

  worker.onmessage = ({ data }) => {
    if (!isPdfWorkerResponse(data) || data.requestId !== requestId) return;
    finish();
    if (data.type === 'success') resolve(data.blob);
    else reject(new Error(data.code));
  };

  worker.postMessage({ type: 'probe', requestId });
});
