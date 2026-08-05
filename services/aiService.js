import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const DEFAULT_AI_TIMEOUT_MS = 600_000;
const DEFAULT_AI_MAX_RETRIES = 0;

export class AiServiceError extends Error {
  constructor(message, { code, status, cause } = {}) {
    super(message, { cause });
    this.name = 'AiServiceError';
    this.code = code;
    this.status = status;
  }
}

export const normalizeAiError = (error, { signal } = {}) => {
  if (error instanceof AiServiceError) return error;
  if (signal?.aborted || error?.name === 'AbortError' || error?.name === 'APIUserAbortError') {
    return new AiServiceError('Analysis request was cancelled', {
      code: 'AI_REQUEST_CANCELLED',
      status: 499,
      cause: error,
    });
  }
  if (error?.name === 'APIConnectionTimeoutError' || error?.code === 'ETIMEDOUT') {
    return new AiServiceError('AI provider timed out', {
      code: 'AI_UPSTREAM_TIMEOUT',
      status: 504,
      cause: error,
    });
  }
  if (error?.status === 429) {
    return new AiServiceError('AI provider rate limit reached', {
      code: 'AI_PROVIDER_RATE_LIMITED',
      status: 429,
      cause: error,
    });
  }
  if (error?.status === 503) {
    return new AiServiceError('AI provider is busy', {
      code: 'AI_PROVIDER_BUSY',
      status: 503,
      cause: error,
    });
  }
  return new AiServiceError('AI provider request failed', {
    code: 'AI_PROVIDER_ERROR',
    status: 502,
    cause: error,
  });
};

const requireApiKey = (value, provider) => {
  if (typeof value === 'string' && value.trim()) return value;
  throw new AiServiceError(`${provider} is not configured`, {
    code: 'AI_PROVIDER_NOT_CONFIGURED',
    status: 500,
  });
};

const runSafely = async (operation, signal) => {
  try {
    return await operation();
  } catch (error) {
    throw normalizeAiError(error, { signal });
  }
};

const integerSetting = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

export const createAiService = ({
  env = process.env,
  OpenAIClass = OpenAI,
  GoogleGenAIClass = GoogleGenAI,
} = {}) => {
  const provider = env.AI_PROVIDER || 'gemini';
  const timeout = integerSetting(env.AI_REQUEST_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS);
  const maxRetries = integerSetting(env.AI_MAX_RETRIES, DEFAULT_AI_MAX_RETRIES);

  if (provider === 'deepseek') {
    const model = env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
    const client = new OpenAIClass({
      apiKey: requireApiKey(env.DEEPSEEK_API_KEY, 'DeepSeek'),
      baseURL: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout,
      maxRetries,
    });
    const thinking = env.DEEPSEEK_THINKING === 'disabled' ? 'disabled' : 'enabled';
    const reasoningEffort = env.DEEPSEEK_REASONING_EFFORT || 'high';

    return {
      provider,
      model,
      async runAnalysis({ systemPrompt, inputContent, signal }) {
        const completion = await runSafely(() => client.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: inputContent },
          ],
          model,
          thinking: { type: thinking },
          ...(thinking === 'enabled' ? { reasoning_effort: reasoningEffort } : { temperature: 0.4 }),
        }, { signal }), signal);
        return completion.choices[0]?.message?.content;
      },
    };
  }

  if (provider === 'doubao') {
    const model = env.DOUBAO_MODEL || env.DOUBAO_ENDPOINT_ID || 'doubao-seed-2-1-pro-260628';
    const client = new OpenAIClass({
      apiKey: requireApiKey(env.DOUBAO_API_KEY, 'Doubao'),
      baseURL: env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      timeout,
      maxRetries,
    });
    return {
      provider,
      model,
      async runAnalysis({ systemPrompt, inputContent, signal }) {
        const completion = await runSafely(() => client.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: inputContent },
          ],
          model,
          temperature: 0.4,
        }, { signal }), signal);
        return completion.choices[0]?.message?.content;
      },
    };
  }

  if (provider === 'gemini') {
    const model = env.GEMINI_MODEL || 'gemini-3-pro-preview';
    const client = new GoogleGenAIClass({ apiKey: requireApiKey(env.GEMINI_API_KEY, 'Gemini') });
    return {
      provider,
      model,
      async runAnalysis({ systemPrompt, inputContent, signal }) {
        const response = await runSafely(() => client.models.generateContent({
          model,
          contents: inputContent,
          config: { systemInstruction: systemPrompt, temperature: 0.4 },
        }), signal);
        return typeof response.text === 'function' ? response.text() : response.text;
      },
    };
  }

  throw new AiServiceError(`Unsupported AI Provider: ${provider}`, {
    code: 'AI_PROVIDER_NOT_CONFIGURED',
    status: 500,
  });
};
