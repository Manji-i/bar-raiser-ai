import type { ReportDocumentModel } from '../reportDocumentModel.ts';
import { isPdfWorkerResponse } from './reportPdfProtocol.ts';

export type PdfClientStatus = 'idle' | 'preparing' | 'ready' | 'error';

export interface PdfWorkerPort {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface PdfClientRuntime {
  createWorker(): PdfWorkerPort;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  triggerDownload(url: string, fileName: string): void;
  setTimeout(callback: () => void): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
  randomUUID(): string;
}

export const createReportPdfWorker = (): PdfWorkerPort => new Worker(
  new URL('./reportPdf.worker.ts', import.meta.url),
  { type: 'module', name: 'evalbar-pdf' },
);

const browserPdfRuntime: PdfClientRuntime = {
  createWorker: createReportPdfWorker,
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  triggerDownload: (url, fileName) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  },
  setTimeout: (callback) => window.setTimeout(callback, 15_000),
  clearTimeout: (id) => window.clearTimeout(id),
  randomUUID: () => crypto.randomUUID(),
};

export class ReportPdfClient {
  private readonly runtime: PdfClientRuntime;
  private status: PdfClientStatus = 'idle';
  private listeners = new Set<(status: PdfClientStatus) => void>();
  private worker: PdfWorkerPort | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private preparePromise: Promise<Blob> | null = null;
  private rejectPrepare: ((error: Error) => void) | null = null;
  private blob: Blob | null = null;
  private objectUrl: string | null = null;
  private disposed = false;

  constructor(runtime: PdfClientRuntime = browserPdfRuntime) {
    this.runtime = runtime;
  }

  getStatus(): PdfClientStatus {
    return this.status;
  }

  subscribe(listener: (status: PdfClientStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  prepare(model: ReportDocumentModel): Promise<Blob> {
    if (this.disposed) return Promise.reject(new Error('PDF_CLIENT_DISPOSED'));
    if (this.blob) return Promise.resolve(this.blob);
    if (this.preparePromise) return this.preparePromise;

    this.setStatus('preparing');
    const worker = this.runtime.createWorker();
    const requestId = this.runtime.randomUUID();
    this.worker = worker;

    this.preparePromise = new Promise<Blob>((resolve, reject) => {
      this.rejectPrepare = reject;
      const fail = (code: string) => {
        this.finishWorker();
        this.preparePromise = null;
        this.rejectPrepare = null;
        this.setStatus('error');
        reject(new Error(code));
      };

      this.timeout = this.runtime.setTimeout(() => fail('WORKER_TIMEOUT'));
      worker.onerror = () => fail('PDF_BUILD_FAILED');
      worker.onmessage = ({ data }) => {
        if (!isPdfWorkerResponse(data) || data.requestId !== requestId) return;
        if (data.type === 'error') {
          fail(data.code);
          return;
        }
        this.finishWorker();
        this.rejectPrepare = null;
        this.blob = data.blob;
        this.setStatus('ready');
        resolve(data.blob);
      };
      worker.postMessage({ type: 'render', requestId, model });
    });

    return this.preparePromise;
  }

  async download(fileName: string): Promise<void> {
    if (!this.preparePromise && !this.blob) throw new Error('PDF_NOT_PREPARED');
    const blob = this.blob ?? await this.preparePromise;
    if (!blob) throw new Error('PDF_NOT_PREPARED');
    if (!this.objectUrl) this.objectUrl = this.runtime.createObjectURL(blob);
    this.runtime.triggerDownload(this.objectUrl, fileName);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const reject = this.rejectPrepare;
    this.finishWorker();
    this.rejectPrepare = null;
    if (reject) reject(new Error('PDF_CLIENT_DISPOSED'));
    if (this.objectUrl) this.runtime.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.blob = null;
    this.preparePromise = null;
    this.listeners.clear();
  }

  private setStatus(status: PdfClientStatus): void {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  private finishWorker(): void {
    if (this.timeout !== null) this.runtime.clearTimeout(this.timeout);
    this.timeout = null;
    if (this.worker) this.worker.terminate();
    this.worker = null;
  }
}

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
