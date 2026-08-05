import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAnalysisRequest,
  getAnalysisErrorMessage,
} from '../services/geminiService.ts';

test('招聘官分析继续使用 JSON 并显式发送 recruiter 模式', () => {
  const request = buildAnalysisRequest({
    analysisMode: 'recruiter',
    jobTitle: '产品经理',
    competencies: '业务判断',
    transcript: '面试记录',
    fileName: 'record.txt',
  });

  assert.equal(request.headers.get('Content-Type'), 'application/json');
  assert.equal(request.headers.get('Authorization'), null);
  assert.equal(JSON.parse(request.body as string).analysisMode, 'recruiter');
});

test('候选人上传简历时使用 multipart 且不手动设置 Content-Type', () => {
  const resumeFile = new File(['resume'], 'resume.txt', { type: 'text/plain' });
  const request = buildAnalysisRequest({
    analysisMode: 'candidate',
    jobTitle: '产品经理',
    jobDescription: '',
    transcript: '面试记录',
    fileName: 'record.txt',
    resumeFile,
    resumeText: 'resume',
    resumeParseStatus: 'usable',
  });

  assert.equal(request.headers.get('Content-Type'), null);
  assert.equal(request.body instanceof FormData, true);
  assert.equal((request.body as FormData).get('analysisMode'), 'candidate');
  assert.equal((request.body as FormData).get('resumeFile'), resumeFile);
});

test('模型超时和繁忙错误转换为用户可操作的中文提示', () => {
  assert.equal(
    getAnalysisErrorMessage({ code: 'AI_UPSTREAM_TIMEOUT' }, 504),
    '分析生成超时，请稍后重试。',
  );
  assert.equal(
    getAnalysisErrorMessage({ code: 'AI_PROVIDER_BUSY' }, 503),
    '模型服务繁忙，请稍后重试。',
  );
  assert.equal(
    getAnalysisErrorMessage({ code: 'AI_PROVIDER_RATE_LIMITED' }, 429),
    '模型请求过于频繁，请稍后重试。',
  );
  assert.equal(
    getAnalysisErrorMessage({ error: 'secret provider detail' }, 502),
    '模型服务暂时不可用，请稍后重试。',
  );
});

test('并发冲突和业务校验保留明确提示', () => {
  assert.equal(
    getAnalysisErrorMessage({ code: 'ANALYSIS_IN_PROGRESS' }, 429),
    '已有分析正在生成，请等待完成后再试。',
  );
  assert.equal(
    getAnalysisErrorMessage({ error: 'Missing transcript' }, 400),
    'Missing transcript',
  );
});
