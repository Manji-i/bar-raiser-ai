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

test('GLM 5.2 使用最高思考强度、流式正文、显式超时和零重试', async () => {
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
            return (async function* chunks() {
              yield { choices: [{ delta: { reasoning_content: '内部思考' } }] };
              yield { choices: [{ delta: { content: '## 分析' } }] };
              yield { choices: [{ delta: { content: '报告\n正文' } }] };
            })();
          },
        },
      };
    }
  }

  const service = createAiService({
    env: {
      AI_PROVIDER: 'glm',
      GLM_API_KEY: 'test-key',
    },
    OpenAIClass: FakeOpenAI,
  });
  const controller = new AbortController();

  const result = await service.runAnalysis({
    systemPrompt: 'system',
    inputContent: 'input',
    signal: controller.signal,
  });

  assert.equal(service.provider, 'glm');
  assert.equal(service.model, 'glm-5.2');
  assert.deepEqual(clientOptions, {
    apiKey: 'test-key',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    timeout: 600000,
    maxRetries: 0,
  });
  assert.equal(requestBody.model, 'glm-5.2');
  assert.deepEqual(requestBody.thinking, { type: 'enabled' });
  assert.equal(requestBody.reasoning_effort, 'max');
  assert.equal(requestBody.stream, true);
  assert.equal(requestOptions.signal, controller.signal);
  assert.equal(result, '## 分析报告\n正文');
});

test('Kimi K3 固定思考模式只配置最高推理强度并流式聚合正文', async () => {
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
            return (async function* chunks() {
              yield { choices: [{ delta: { reasoning_content: '内部思考' } }] };
              yield { choices: [{ delta: { content: '## 分析' } }] };
              yield { choices: [{ delta: { content: '报告\n正文' } }] };
            })();
          },
        },
      };
    }
  }

  const service = createAiService({
    env: {
      AI_PROVIDER: 'kimi',
      KIMI_API_KEY: 'test-key',
    },
    OpenAIClass: FakeOpenAI,
  });
  const controller = new AbortController();

  const result = await service.runAnalysis({
    systemPrompt: 'system',
    inputContent: 'input',
    signal: controller.signal,
  });

  assert.equal(service.provider, 'kimi');
  assert.equal(service.model, 'kimi-k3');
  assert.deepEqual(clientOptions, {
    apiKey: 'test-key',
    baseURL: 'https://api.moonshot.cn/v1',
    timeout: 600000,
    maxRetries: 0,
  });
  assert.equal(requestBody.model, 'kimi-k3');
  assert.equal(requestBody.reasoning_effort, 'max');
  assert.equal(requestBody.stream, true);
  assert.equal('thinking' in requestBody, false);
  assert.equal('temperature' in requestBody, false);
  assert.equal(requestOptions.signal, controller.signal);
  assert.equal(result, '## 分析报告\n正文');
});

test('GLM 和 Kimi 缺少各自 API Key 时按 Provider 失败关闭', () => {
  for (const [provider, expectedMessage] of [
    ['glm', 'GLM is not configured'],
    ['kimi', 'Kimi is not configured'],
  ]) {
    assert.throws(
      () => createAiService({ env: { AI_PROVIDER: provider }, OpenAIClass: class {} }),
      (error) => error instanceof AiServiceError
        && error.code === 'AI_PROVIDER_NOT_CONFIGURED'
        && error.status === 500
        && error.message === expectedMessage,
    );
  }
});

test('豆包使用流式响应并拼接正文，避免等待完整报告才收到响应头', async () => {
  let requestBody;
  let requestOptions;

  class FakeOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (body, options) => {
            requestBody = body;
            requestOptions = options;
            return (async function* chunks() {
              yield { choices: [{ delta: { reasoning_content: '内部思考' } }] };
              yield { choices: [{ delta: { content: '## 分析' } }] };
              yield { choices: [{ delta: { content: '报告\n正文' } }] };
            })();
          },
        },
      };
    }
  }

  const service = createAiService({
    env: {
      AI_PROVIDER: 'doubao',
      DOUBAO_API_KEY: 'test-key',
    },
    OpenAIClass: FakeOpenAI,
  });
  const controller = new AbortController();

  const result = await service.runAnalysis({
    systemPrompt: 'system',
    inputContent: 'input',
    signal: controller.signal,
  });

  assert.equal(requestBody.stream, true);
  assert.equal(requestOptions.signal, controller.signal);
  assert.equal(result, '## 分析报告\n正文');
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

test('300 秒响应头超时和上游 504 统一识别为模型超时', () => {
  const headersTimeout = normalizeAiError({
    name: 'APIConnectionError',
    cause: {
      cause: {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      },
    },
  });
  const gatewayTimeout = normalizeAiError({ status: 504 });

  assert.equal(headersTimeout.code, 'AI_UPSTREAM_TIMEOUT');
  assert.equal(headersTimeout.status, 504);
  assert.equal(gatewayTimeout.code, 'AI_UPSTREAM_TIMEOUT');
  assert.equal(gatewayTimeout.status, 504);
});
