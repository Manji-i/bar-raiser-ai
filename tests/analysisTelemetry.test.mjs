import assert from 'node:assert/strict';
import test from 'node:test';

import { createAnalysisTelemetry } from '../services/analysisTelemetry.js';

test('分析成功时只写一条不含敏感正文的结构化耗时日志', () => {
  const entries = [];
  const telemetry = createAnalysisTelemetry({
    analysisMode: 'recruiter',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    inputChars: 4321,
    now: (() => {
      const values = [1_000, 8_654];
      return () => values.shift();
    })(),
    createId: () => 'analysis-safe-id',
    write: (entry) => entries.push(entry),
  });

  telemetry.succeed(987);
  telemetry.fail('SHOULD_NOT_WRITE_TWICE');

  assert.deepEqual(entries, [{
    event: 'analysis_completed',
    analysisId: 'analysis-safe-id',
    analysisMode: 'recruiter',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    status: 'success',
    durationMs: 7654,
    inputChars: 4321,
    outputChars: 987,
    errorCode: null,
  }]);
  assert.equal(JSON.stringify(entries).includes('面试'), false);
});

test('分析失败和取消使用稳定状态与错误码', () => {
  const entries = [];
  let current = 50;
  const common = {
    analysisMode: 'candidate',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    inputChars: 20,
    now: () => current,
    write: (entry) => entries.push(entry),
  };

  const failed = createAnalysisTelemetry({ ...common, createId: () => 'failed-id' });
  current = 150;
  failed.fail('AI_UPSTREAM_TIMEOUT');

  current = 200;
  const cancelled = createAnalysisTelemetry({ ...common, createId: () => 'cancel-id' });
  current = 260;
  cancelled.cancel();

  assert.equal(entries[0].status, 'failure');
  assert.equal(entries[0].durationMs, 100);
  assert.equal(entries[0].outputChars, 0);
  assert.equal(entries[0].errorCode, 'AI_UPSTREAM_TIMEOUT');
  assert.equal(entries[1].status, 'cancelled');
  assert.equal(entries[1].durationMs, 60);
  assert.equal(entries[1].errorCode, 'AI_REQUEST_CANCELLED');
});
