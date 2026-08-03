import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ReportPdfClient,
  type PdfClientRuntime,
  type PdfWorkerPort,
} from '../services/pdf/reportPdfClient.ts';
import { buildReportDocumentModel } from '../services/reportDocumentModel.ts';
import { recruiterFixture } from './fixtures/pdfReportFixture.ts';

const createPdfClientHarness = () => {
  let onmessage: ((event: MessageEvent) => void) | null = null;
  let onerror: ((event: ErrorEvent) => void) | null = null;
  let postCount = 0;
  let terminateCount = 0;
  const downloads: string[] = [];
  const revokedUrls: string[] = [];
  const worker: PdfWorkerPort = {
    postMessage: () => { postCount += 1; },
    terminate: () => { terminateCount += 1; },
    get onmessage() { return onmessage; },
    set onmessage(value) { onmessage = value; },
    get onerror() { return onerror; },
    set onerror(value) { onerror = value; },
  };
  const runtime: PdfClientRuntime = {
    createWorker: () => worker,
    createObjectURL: () => 'blob:test',
    revokeObjectURL: (url) => revokedUrls.push(url),
    triggerDownload: (_url, fileName) => downloads.push(fileName),
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs ?? 15_000),
    clearTimeout: (id) => globalThis.clearTimeout(id),
    randomUUID: () => 'request-1',
  };
  return {
    runtime,
    model: buildReportDocumentModel(recruiterFixture),
    downloads,
    revokedUrls,
    get postCount() { return postCount; },
    get terminateCount() { return terminateCount; },
    succeed: (blob: Blob) => onmessage?.({ data: { type: 'success', requestId: 'request-1', blob } } as MessageEvent),
    fail: (code: string) => onmessage?.({ data: { type: 'error', requestId: 'request-1', code, message: '生成失败' } } as MessageEvent),
  };
};

test('prepare 复用任务，download 复用 Blob，dispose 释放 URL', async () => {
  const harness = createPdfClientHarness();
  const client = new ReportPdfClient(harness.runtime);
  const first = client.prepare(harness.model);
  const second = client.prepare(harness.model);
  assert.equal(first, second);
  assert.equal(harness.postCount, 1);
  harness.succeed(new Blob(['%PDF-test'], { type: 'application/pdf' }));
  const firstDownload = client.download('EvalBar_Report_2026-08-03.pdf');
  const secondDownload = client.download('EvalBar_Report_2026-08-03.pdf');
  assert.equal(firstDownload, secondDownload);
  await firstDownload;
  assert.equal(client.getStatus(), 'ready');
  assert.deepEqual(harness.downloads, ['EvalBar_Report_2026-08-03.pdf']);
  client.dispose();
  assert.deepEqual(harness.revokedUrls, ['blob:test']);
  assert.equal(harness.terminateCount, 1);
});

test('失败后允许重试且不暴露报告正文', async () => {
  const harness = createPdfClientHarness();
  const client = new ReportPdfClient(harness.runtime);
  const failed = client.prepare(harness.model);
  harness.fail('PDF_BUILD_FAILED');
  await assert.rejects(failed, /^Error: PDF_BUILD_FAILED$/);
  assert.equal(client.getStatus(), 'error');
  const retried = client.prepare(harness.model);
  assert.notEqual(retried, failed);
  assert.equal(harness.postCount, 2);
  client.dispose();
  await assert.rejects(retried, /PDF_CLIENT_DISPOSED/);
});

test('未 prepare 时 download 不会隐式启动第二个 Worker', async () => {
  const harness = createPdfClientHarness();
  const client = new ReportPdfClient(harness.runtime);
  await assert.rejects(client.download('report.pdf'), /PDF_NOT_PREPARED/);
  assert.equal(harness.postCount, 0);
  client.dispose();
});
