/// <reference lib="webworker" />

import pdfMake from 'pdfmake/build/pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { PdfWorkerRequest, PdfWorkerResponse } from './reportPdfProtocol.ts';

const FONT_URLS = {
  normal: new URL('/fonts/NotoSansSC-Regular-v1.otf', self.location.origin).href,
  bold: new URL('/fonts/NotoSansSC-Bold-v1.otf', self.location.origin).href,
};

let fontsReady: Promise<void> | null = null;

const ensureFonts = () => {
  if (!fontsReady) {
    fontsReady = Promise.all(Object.values(FONT_URLS).map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('FONT_LOAD_FAILED');
      await response.arrayBuffer();
    })).then(() => {
      pdfMake.addFonts({
        NotoSansSC: {
          normal: FONT_URLS.normal,
          bold: FONT_URLS.bold,
          italics: FONT_URLS.normal,
          bolditalics: FONT_URLS.bold,
        },
      });
    });
  }
  return fontsReady;
};

const probeDocument = (): TDocumentDefinitions => ({
  pageSize: 'A4',
  pageMargins: [36, 36, 36, 36],
  defaultStyle: { font: 'NotoSansSC', fontSize: 12 },
  content: [
    { text: '中文分页验证', bold: true, fontSize: 18 },
    { text: 'Eval Bar AI PDF Worker', margin: [0, 10, 0, 0] },
  ],
});

const send = (message: PdfWorkerResponse) => self.postMessage(message);

self.onmessage = async ({ data }: MessageEvent<PdfWorkerRequest>) => {
  if (!data || data.type !== 'probe') return;
  try {
    await ensureFonts();
  } catch {
    send({
      type: 'error',
      requestId: data.requestId,
      code: 'FONT_LOAD_FAILED',
      message: 'PDF 中文字体加载失败',
    });
    return;
  }

  try {
    const blob = await pdfMake.createPdf(probeDocument()).getBlob();
    send({ type: 'success', requestId: data.requestId, blob });
  } catch {
    send({
      type: 'error',
      requestId: data.requestId,
      code: 'PDF_BUILD_FAILED',
      message: 'PDF 生成失败',
    });
  }
};
