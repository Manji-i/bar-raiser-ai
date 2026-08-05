import type { AnalysisInput } from '../types';

type AnalysisErrorPayload = {
  code?: unknown;
  error?: unknown;
};

const ERROR_MESSAGES: Record<string, string> = {
  AI_UPSTREAM_TIMEOUT: '分析生成超时，请稍后重试。',
  AI_PROVIDER_BUSY: '模型服务繁忙，请稍后重试。',
  AI_PROVIDER_RATE_LIMITED: '模型请求过于频繁，请稍后重试。',
  AI_PROVIDER_ERROR: '模型服务暂时不可用，请稍后重试。',
  AI_PROVIDER_NOT_CONFIGURED: '模型服务暂时不可用，请联系管理员。',
  ANALYSIS_IN_PROGRESS: '已有分析正在生成，请等待完成后再试。',
};

export const getAnalysisErrorMessage = (
  payload: AnalysisErrorPayload,
  status: number,
): string => {
  const code = typeof payload?.code === 'string' ? payload.code : '';
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (status === 504) return ERROR_MESSAGES.AI_UPSTREAM_TIMEOUT;
  if (status === 503) return ERROR_MESSAGES.AI_PROVIDER_BUSY;
  if (status === 429) return ERROR_MESSAGES.AI_PROVIDER_RATE_LIMITED;
  if (status >= 500) return ERROR_MESSAGES.AI_PROVIDER_ERROR;
  if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
  return `分析请求失败（HTTP ${status}），请稍后重试。`;
};

export const buildAnalysisRequest = (
  input: AnalysisInput,
): { headers: Headers; body: BodyInit } => {
  const headers = new Headers();

  if (input.analysisMode === 'candidate' && input.resumeFile) {
    const body = new FormData();
    body.set('analysisMode', input.analysisMode);
    body.set('jobTitle', input.jobTitle);
    body.set('jobDescription', input.jobDescription);
    body.set('transcript', input.transcript);
    body.set('fileName', input.fileName);
    body.set('resumeText', input.resumeText);
    body.set('resumeParseStatus', input.resumeParseStatus);
    body.set('resumeFile', input.resumeFile);
    return { headers, body };
  }

  headers.set('Content-Type', 'application/json');
  const body = input.analysisMode === 'candidate'
    ? JSON.stringify({
      analysisMode: input.analysisMode,
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription,
      transcript: input.transcript,
      fileName: input.fileName,
      resumeText: input.resumeText,
      resumeParseStatus: input.resumeParseStatus,
    })
    : JSON.stringify(input);
  return { headers, body };
};

export const analyzeInterview = async (
  input: AnalysisInput
): Promise<{ result: string; reportId: string }> => {
  const request = buildAnalysisRequest(input);
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      credentials: 'same-origin',
      headers: request.headers,
      body: request.body,
    });

    if (!response.ok) {
      const errorData: AnalysisErrorPayload = await response.json().catch(() => ({}));
      throw new Error(getAnalysisErrorMessage(errorData, response.status));
    }

    return await response.json();
  } catch (error) {
    console.error('Analysis request failed:', error instanceof Error ? error.name : 'Error');
    throw error;
  }
};
