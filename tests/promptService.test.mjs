import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  CANDIDATE_CONCLUSION_CONTRACT_ID,
  DEFAULT_CANDIDATE_PROMPT_CONTENT,
  applyCandidateConclusionContract,
} from '../services/candidatePrompt.js';
import { createPromptService } from '../services/promptService.js';
import { initializeSchema } from '../services/schema.js';

test('招聘官和候选人 Prompt 独立初始化与版本更新', () => {
  const directory = mkdtempSync(join(tmpdir(), 'evalbar-prompt-service-'));
  const database = new DatabaseSync(join(directory, 'app.db'));

  try {
    initializeSchema(database);
    const service = createPromptService(database);

    assert.equal(service.getCurrentPrompt('recruiter').version, 1);
    assert.equal(service.getCurrentPrompt('candidate').content, DEFAULT_CANDIDATE_PROMPT_CONTENT);

    const updated = service.updatePrompt('候选人新版 Prompt', 'candidate');
    assert.equal(updated.version, 2);
    assert.equal(service.getCurrentPrompt('candidate').content, '候选人新版 Prompt');
    assert.equal(service.getCurrentPrompt('recruiter').version, 1);
    assert.throws(() => service.getCurrentPrompt('employer'), /Invalid analysisMode/);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Candidate 结论契约兼容旧 Prompt 且只追加一次', () => {
  const legacy = '<role_definition>旧 Candidate Prompt</role_definition>';
  const composed = applyCandidateConclusionContract(legacy);

  assert.match(composed, /一句话总结/);
  assert.match(composed, /值得保留的做法 X 项、核心改进问题 Y 项/);
  assert.match(composed, /下次准备/);
  assert.equal(composed.split(CANDIDATE_CONCLUSION_CONTRACT_ID).length - 1, 1);
  assert.equal(
    applyCandidateConclusionContract(composed).split(CANDIDATE_CONCLUSION_CONTRACT_ID).length - 1,
    1,
  );
  assert.match(DEFAULT_CANDIDATE_PROMPT_CONTENT, new RegExp(CANDIDATE_CONCLUSION_CONTRACT_ID));
});

test('历史异常反馈读取时安全归一化且不改写数据库', () => {
  const directory = mkdtempSync(join(tmpdir(), 'evalbar-feedback-compat-'));
  const database = new DatabaseSync(join(directory, 'app.db'));

  try {
    initializeSchema(database);
    database.prepare(`
      INSERT INTO feedback (id, report_id, rating, comments, specific_issues, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('feedback-1', 'report-1', 999, '历史值', '"not-an-array"', '2026-08-05T00:00:00.000Z');
    const service = createPromptService(database);

    const [feedback] = service.getAllFeedback();
    assert.equal(feedback.rating, 0);
    assert.deepEqual(feedback.specificIssues, []);

    const raw = database.prepare(
      'SELECT rating, specific_issues FROM feedback WHERE id = ?',
    ).get('feedback-1');
    assert.equal(raw.rating, 999);
    assert.equal(raw.specific_issues, '"not-an-array"');
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
