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
