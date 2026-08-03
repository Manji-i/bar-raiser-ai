import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReportDocumentModel } from '../services/reportDocumentModel.ts';
import {
  candidateFixture,
  longParagraphFixture,
  recruiterFixture,
} from './fixtures/pdfReportFixture.ts';

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
  const bodyTables = doc.content.filter((node: any) => node.table && node.headlineLevel === undefined);
  assert.ok(bodyTables.length > 0);
  assert.equal(bodyTables.some((node: any) => node.unbreakable === true), false);
});

test('短标题块不可拆分且靠近页尾时提前换页', () => {
  assert.equal(typeof pdfDocumentModule.buildReportPdfDocument, 'function');
  const doc = pdfDocumentModule.buildReportPdfDocument(buildReportDocumentModel(candidateFixture));
  const sectionBand = doc.content.find((node: any) => node.headlineLevel === 1);
  assert.equal(sectionBand.unbreakable, true);
  assert.equal(sectionBand.table.dontBreakRows, true);
  assert.equal(doc.pageBreakBefore(
    { headlineLevel: 2, startPosition: { verticalRatio: 0.85 } },
    { getFollowingNodesOnPage: () => [{}] },
  ), true);
});

test('超长段落使用无边框流式正文避免跨页卡片残边', () => {
  assert.equal(typeof pdfDocumentModule.buildReportPdfDocument, 'function');
  const doc = pdfDocumentModule.buildReportPdfDocument(buildReportDocumentModel(longParagraphFixture));
  const longParagraphNode = doc.content.find((node: any) => JSON.stringify(node).includes('这是一段用于验证跨页'));
  assert.ok(longParagraphNode);
  assert.equal(Boolean(longParagraphNode.table), false);
  assert.equal(longParagraphNode.style, 'body');
});
