import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AiServiceError,
  createAiService,
  normalizeAiError,
} from '../services/aiService.js';

test('DeepSeek V4 Flash 使用思考模式、显式超时和零重试', async () => {
  let clientOptions;
  let requestBody;
  let requestOptions;

  class FakeOpenAI {
    constructor(options) {
      clientOptions = options;
      this.chat = {
        completions: {
          create: async (body, options) => {
            requestBody = body;
            requestOptions = options;
            return { choices: [{ message: { content: '## 分析报告\n正文' } }] };
          },
        },
      };
    }
  }

  const service = createAiService({
    env: {
      AI_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'test-key',
    },
    OpenAIClass: FakeOpenAI,
  });
  const controller = new AbortController();

  const result = await service.runAnalysis({
    systemPrompt: 'system',
    inputContent: 'input',
    signal: controller.signal,
  });

  assert.equal(service.provider, 'deepseek');
  assert.equal(service.model, 'deepseek-v4-flash');
  assert.deepEqual(clientOptions, {
    apiKey: 'test-key',
    baseURL: 'https://api.deepseek.com',
    timeout: 600000,
    maxRetries: 0,
  });
  assert.equal(requestBody.model, 'deepseek-v4-flash');
  assert.deepEqual(requestBody.thinking, { type: 'enabled' });
  assert.equal(requestBody.reasoning_effort, 'high');
  assert.equal('temperature' in requestBody, false);
  assert.equal(requestOptions.signal, controller.signal);
  assert.equal(result, '## 分析报告\n正文');
});

test('DeepSeek 缺少 API Key 时启动失败关闭', () => {
  assert.throws(
    () => createAiService({ env: { AI_PROVIDER: 'deepseek' }, OpenAIClass: class {} }),
    (error) => error instanceof AiServiceError
      && error.code === 'AI_PROVIDER_NOT_CONFIGURED'
      && error.status === 500,
  );
});

test('AI 上游错误映射为稳定且不泄漏原文的错误码', () => {
  const cases = [
    [{ name: 'APIConnectionTimeoutError', message: 'secret timeout detail' }, 'AI_UPSTREAM_TIMEOUT', 504],
    [{ status: 429, message: 'secret rate detail' }, 'AI_PROVIDER_RATE_LIMITED', 429],
    [{ status: 503, message: 'secret busy detail' }, 'AI_PROVIDER_BUSY', 503],
    [{ status: 500, message: 'secret upstream detail' }, 'AI_PROVIDER_ERROR', 502],
  ];

  for (const [source, code, status] of cases) {
    const error = normalizeAiError(source);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(error.message.includes('secret'), false);
  }
});

test('主动取消与上游超时使用不同错误语义', () => {
  const controller = new AbortController();
  controller.abort();

  const cancelled = normalizeAiError(new Error('aborted'), { signal: controller.signal });

  assert.equal(cancelled.code, 'AI_REQUEST_CANCELLED');
  assert.equal(cancelled.status, 499);
});
