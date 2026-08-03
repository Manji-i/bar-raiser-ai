import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportDocumentModel } from '../reportDocumentModel';
import { ReportPdfClient, type PdfClientStatus } from './reportPdfClient';

export interface PreparedReportPdf {
  status: PdfClientStatus;
  isDownloading: boolean;
  error: string | null;
  download: (fileName: string) => Promise<void>;
}

interface IdleWindow extends Window {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
}

export const usePreparedReportPdf = (model: ReportDocumentModel): PreparedReportPdf => {
  const clientRef = useRef<ReportPdfClient | null>(null);
  const [status, setStatus] = useState<PdfClientStatus>('idle');
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new ReportPdfClient();
    clientRef.current = client;
    setStatus('idle');
    setError(null);
    const unsubscribe = client.subscribe(setStatus);
    const prepare = () => {
      client.prepare(model).catch((cause) => {
        if (clientRef.current === client) {
          setError(cause instanceof Error ? cause.message : 'PDF_BUILD_FAILED');
        }
      });
    };

    const idleWindow = window as IdleWindow;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    if (idleWindow.requestIdleCallback) {
      idleId = idleWindow.requestIdleCallback(prepare, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(prepare, 50);
    }

    return () => {
      if (idleId !== null) idleWindow.cancelIdleCallback?.(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      unsubscribe();
      client.dispose();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [model]);

  const download = useCallback(async (fileName: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('PDF_CLIENT_DISPOSED');
    setIsDownloading(true);
    setError(null);
    try {
      if (client.getStatus() === 'idle' || client.getStatus() === 'error') {
        await client.prepare(model);
      }
      await client.download(fileName);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'PDF_BUILD_FAILED';
      setError(message);
      throw cause;
    } finally {
      setIsDownloading(false);
    }
  }, [model]);

  return { status, isDownloading, error, download };
};
