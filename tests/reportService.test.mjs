import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createReportService } from '../services/reportService.js';
import { initializeSchema } from '../services/schema.js';

test('report service stores candidate context and filters history by mode', () => {
  const directory = mkdtempSync(join(tmpdir(), 'evalbar-report-service-'));
  const database = new DatabaseSync(join(directory, 'app.db'));

  try {
    initializeSchema(database);
    const ids = ['candidate-report', 'recruiter-report'];
    const service = createReportService(database, () => ids.shift());

    const candidate = service.create({
      analysisMode: 'candidate',
      jobTitle: '产品经理',
      jobDescription: '负责 AI 产品从 0 到 1',
      resumeText: '5 年产品经验',
      transcript: '面试官：请介绍一个项目。',
      result: '{"summary":"需要补充业务结果"}'
    }, 'user-1');

    service.create({
      analysisMode: 'recruiter',
      jobTitle: '数据分析师',
      transcript: '候选人回答',
      result: '{}'
    }, 'user-1');

    assert.equal(candidate.analysisMode, 'candidate');
    assert.equal(candidate.jobDescription, '负责 AI 产品从 0 到 1');
    assert.equal(service.getByUser('user-1', 'candidate').length, 1);
    assert.equal(service.getByUser('user-1', 'recruiter').length, 1);

    const detail = service.getById('candidate-report', 'user-1');
    assert.equal(detail.analysisMode, 'candidate');
    assert.equal(detail.jobDescription, '负责 AI 产品从 0 到 1');
    assert.equal(detail.resumeText, undefined);

    const stored = database.prepare('SELECT analysis_mode, job_description, resume_text FROM reports WHERE id = ?').get('candidate-report');
    assert.deepEqual({ ...stored }, {
      analysis_mode: 'candidate',
      job_description: '负责 AI 产品从 0 到 1',
      resume_text: '5 年产品经验'
    });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('报告与简历附件在同一事务写入并可读取下载元数据', () => {
  const directory = mkdtempSync(join(tmpdir(), 'evalbar-report-attachment-'));
  const database = new DatabaseSync(join(directory, 'app.db'));

  try {
    initializeSchema(database);
    const service = createReportService(database, () => 'generated-report');
    const attachment = {
      id: 'attachment-1',
      reportId: 'candidate-report',
      userId: 'user-1',
      kind: 'resume',
      originalName: 'resume.pdf',
      storedName: 'random.pdf',
      relativePath: 'user-1/random.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128,
      sha256: 'a'.repeat(64),
      parseStatus: 'usable',
      createdAt: '2026-07-27T00:00:00.000Z'
    };

    service.create({
      id: 'candidate-report',
      analysisMode: 'candidate',
      jobTitle: '产品经理',
      transcript: '面试记录',
      result: '报告'
    }, 'user-1', attachment);

    assert.equal(service.getById('candidate-report', 'user-1').resumeFileName, 'resume.pdf');
    assert.deepEqual({ ...service.getResumeAttachment('candidate-report') }, attachment);

    const invalidAttachment = { ...attachment, originalName: null, reportId: 'rolled-back-report' };
    assert.throws(() => service.create({
      id: 'rolled-back-report',
      analysisMode: 'candidate',
      jobTitle: '产品经理',
      transcript: '面试记录',
      result: '报告'
    }, 'user-1', invalidAttachment));
    assert.equal(database.prepare('SELECT id FROM reports WHERE id = ?').get('rolled-back-report'), undefined);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
