import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalysisRequest } from '../services/geminiService.ts';

test('招聘官分析继续使用 JSON 并显式发送 recruiter 模式', () => {
  const request = buildAnalysisRequest({
    analysisMode: 'recruiter',
    jobTitle: '产品经理',
    competencies: '业务判断',
    transcript: '面试记录',
    fileName: 'record.txt',
  }, 'token-1');

  assert.equal(request.headers.get('Content-Type'), 'application/json');
  assert.equal(request.headers.get('Authorization'), 'Bearer token-1');
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
  }, 'token-1');

  assert.equal(request.headers.get('Content-Type'), null);
  assert.equal(request.body instanceof FormData, true);
  assert.equal((request.body as FormData).get('analysisMode'), 'candidate');
  assert.equal((request.body as FormData).get('resumeFile'), resumeFile);
});
