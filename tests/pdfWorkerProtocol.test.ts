import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pdfWorkerProtocol: any = await import('../services/pdf/reportPdfProtocol.ts').catch(() => ({}));
const pdfWorkerClient: any = await import('../services/pdf/reportPdfClient.ts').catch(() => ({}));

test('PDF Worker 协议区分 probe、成功和安全错误', () => {
  assert.equal(typeof pdfWorkerProtocol.isPdfWorkerResponse, 'function');

  assert.equal(pdfWorkerProtocol.isPdfWorkerResponse({
    type: 'success',
    requestId: 'probe-1',
    blob: new Blob(['pdf'], { type: 'application/pdf' }),
  }), true);
  assert.equal(pdfWorkerProtocol.isPdfWorkerResponse({
    type: 'error',
    requestId: 'probe-1',
    code: 'FONT_LOAD_FAILED',
    message: '字体加载失败',
  }), true);
  assert.equal(pdfWorkerProtocol.isPdfWorkerResponse({
    requestId: 'probe-1',
    reportText: '敏感正文',
  }), false);
});

test('PDF Worker 客户端提供可复用的探针入口', () => {
  assert.equal(typeof pdfWorkerClient.createReportPdfWorker, 'function');
  assert.equal(typeof pdfWorkerClient.probeReportPdfWorker, 'function');
});

test('PDF Worker 将首次下载的字体直接写入内存文件系统', () => {
  const workerSource = readFileSync(
    new URL('../services/pdf/reportPdf.worker.ts', import.meta.url),
    'utf8',
  );
  assert.match(workerSource, /addVirtualFileSystem/);
  assert.match(workerSource, /new Uint8Array\(normal\)/);
  assert.match(workerSource, /normal:\s*FONT_FILES\.normal/);
  assert.doesNotMatch(workerSource, /normal:\s*FONT_URLS\.normal/);
});
