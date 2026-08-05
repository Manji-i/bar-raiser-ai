import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildComparisonFileName,
  parseComparisonArgs,
  runProviderComparison,
} from '../scripts/generate-provider-comparison.mjs';

test('对比脚本要求显式执行且只允许 GLM 与 Kimi', () => {
  assert.deepEqual(
    parseComparisonArgs(['--execute', '--providers=glm,kimi']),
    { execute: true, providers: ['glm', 'kimi'] },
  );
  assert.deepEqual(
    parseComparisonArgs([]),
    { execute: false, providers: ['glm', 'kimi'] },
  );
  assert.throws(
    () => parseComparisonArgs(['--providers=deepseek']),
    /Unsupported comparison provider: deepseek/,
  );
});

test('管理后台文件名标签可区分 GLM 5.2 与 Kimi K3', () => {
  assert.equal(
    buildComparisonFileName('面试记录.txt', 'glm', 'glm-5.2'),
    '面试记录.txt · GLM 5.2',
  );
  assert.equal(
    buildComparisonFileName('面试记录.txt', 'kimi', 'kimi-k3'),
    '面试记录.txt · Kimi K3',
  );
});

test('缺少 --execute 时在载入生产依赖前失败关闭', async () => {
  let loaded = false;

  await assert.rejects(
    () => runProviderComparison({
      args: ['--providers=glm'],
      loadRuntime: async () => {
        loaded = true;
        throw new Error('must not load');
      },
    }),
    /--execute is required/,
  );

  assert.equal(loaded, false);
});

test('结构化结果只记录耗时元数据，不泄漏源材料、Prompt 或报告正文', async () => {
  const writes = [];
  const source = {
    id: 'source-report',
    userId: 'user-1',
    jobTitle: 'SECRET_JOB',
    competencies: 'SECRET_COMPETENCIES',
    transcript: 'SECRET_TRANSCRIPT',
    fileName: '面试记录.txt',
  };
  const services = {
    glm: {
      provider: 'glm',
      model: 'glm-5.2',
      runAnalysis: async () => '## GLM\nSECRET_GLM_RESULT',
    },
    kimi: {
      provider: 'kimi',
      model: 'kimi-k3',
      runAnalysis: async () => '## Kimi\nSECRET_KIMI_RESULT',
    },
  };
  let reportSequence = 0;

  const result = await runProviderComparison({
    args: ['--execute', '--providers=glm,kimi'],
    write: (entry) => writes.push(entry),
    now: (() => {
      let current = 1000;
      return () => {
        current += 25;
        return current;
      };
    })(),
    loadRuntime: async () => ({
      getLatestRecruiterReport: () => source,
      getSystemPrompt: () => 'SECRET_PROMPT',
      buildInput: () => 'SECRET_INPUT',
      applySecurityContract: (prompt) => prompt,
      createService: (provider) => services[provider],
      validateOutput: (value) => value,
      saveReport: ({ provider, model }) => ({
        id: `report-${provider}-${++reportSequence}`,
        fileName: buildComparisonFileName(source.fileName, provider, model),
      }),
    }),
  });

  assert.equal(result.failures, 0);
  assert.deepEqual(result.reportIds, ['report-glm-1', 'report-kimi-2']);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes.map((entry) => entry.provider), ['glm', 'kimi']);
  assert.deepEqual(writes.map((entry) => entry.status), ['success', 'success']);

  const serialized = JSON.stringify(writes);
  for (const secret of [
    'SECRET_JOB',
    'SECRET_COMPETENCIES',
    'SECRET_TRANSCRIPT',
    'SECRET_PROMPT',
    'SECRET_INPUT',
    'SECRET_GLM_RESULT',
    'SECRET_KIMI_RESULT',
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});
