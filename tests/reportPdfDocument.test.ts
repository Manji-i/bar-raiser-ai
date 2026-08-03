import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReportDocumentModel } from '../services/reportDocumentModel.ts';
import { candidateFixture, recruiterFixture } from './fixtures/pdfReportFixture.ts';

const pdfDocumentModule: any = await import('../services/pdf/reportPdfDocument.ts').catch(() => ({}));

test('A 版 Recruiter PDF 使用 A4、页脚、章节条和孤立标题规则', () => {
  assert.equal(typeof pdfDocumentModule.buildReportPdfDocument, 'function');
  const doc = pdfDocumentModule.buildReportPdfDocument(buildReportDocumentModel(recruiterFixture));
  assert.equal(doc.pageSize, 'A4');
  assert.deepEqual(doc.pageMargins, [30, 34, 30, 38]);
  assert.equal(typeof doc.footer, 'function');
  assert.equal(typeof doc.pageBreakBefore, 'function');
  assert.match(JSON.stringify(doc.content), /指定维度详细评估/);
  assert.match(JSON.stringify(doc.content), /H/);
});

test('Candidate PDF 不包含招聘评分', () => {
  assert.equal(typeof pdfDocumentModule.buildReportPdfDocument, 'function');
  const doc = pdfDocumentModule.buildReportPdfDocument(buildReportDocumentModel(candidateFixture));
  const serialized = JSON.stringify(doc.content);
  assert.doesNotMatch(serialized, /匹配等级/);
  assert.match(serialized, /下一次面试准备清单/);
});

test('长正文卡片允许跨页流动', () => {
  assert.equal(typeof pdfDocumentModule.buildReportPdfDocument, 'function');
  const doc = pdfDocumentModule.buildReportPdfDocument(buildReportDocumentModel(recruiterFixture));
  const serialized = JSON.stringify(doc.content);
  assert.doesNotMatch(serialized, /"unbreakable":true/);
});
