import assert from 'node:assert/strict';
import test from 'node:test';

import { candidateFixture, recruiterFixture } from './fixtures/pdfReportFixture.ts';

const reportDocumentModule: any = await import('../services/reportDocumentModel.ts').catch(() => ({}));

test('匿名 Recruiter 夹具保持最长报告结构', () => {
  assert.equal(recruiterFixture.result.length, 3588);
  assert.equal((recruiterFixture.result.match(/^## /gm) ?? []).length, 6);
  assert.equal((recruiterFixture.result.match(/^### /gm) ?? []).length, 7);
});

test('Recruiter 模型保留章节、维度和评分', () => {
  assert.equal(typeof reportDocumentModule.buildReportDocumentModel, 'function');
  const model = reportDocumentModule.buildReportDocumentModel(recruiterFixture);
  assert.equal(model.mode, 'recruiter');
  assert.equal(model.title, '人岗匹配评估');
  assert.equal(model.sections.length, 6);
  assert.equal(model.dimensions.length, 7);
  assert.equal(model.overallScore, 'H');
});

test('Candidate 模型不产生招聘评分并保留复盘结构', () => {
  assert.equal(typeof reportDocumentModule.buildReportDocumentModel, 'function');
  const model = reportDocumentModule.buildReportDocumentModel(candidateFixture);
  assert.equal(model.mode, 'candidate');
  assert.equal(model.title, '面试复盘与提升建议');
  assert.equal(model.overallScore, null);
  assert.equal(model.candidate?.problems.items.length, 3);
  assert.equal(model.candidate?.checklist?.items.length, 3);
});
