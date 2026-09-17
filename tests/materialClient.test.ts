import assert from 'node:assert/strict';
import test from 'node:test';
import { createMaterialClient, formatRoleTranscript, updateDraftRole, effectiveCharacterCount, validateAudioFile, AUDIO_CHUNK_BYTES } from '../services/materialClient.ts';
import { buildAnalysisRequest } from '../services/geminiService.ts';

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('材料请求使用同源 Cookie、模式过滤和 AbortSignal', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createMaterialClient(async (url, init) => { calls.push({ url: String(url), init: init! }); return response([]); });
  const signal = new AbortController().signal;
  await client.list('candidate', signal);
  assert.equal(calls[0].url, '/api/materials?analysisMode=candidate');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.signal, signal);
});

test('音频依序分块，网络失败仅重试同块，全部成功后提交', async () => {
  const calls: string[] = [];
  const sizes: number[] = [];
  let failed = false;
  const client = createMaterialClient(async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('/chunks/')) {
      sizes.push((init!.body as Blob).size);
      if (!failed) { failed = true; throw new TypeError('network'); }
    }
    return response({ id: 'job', uploadedBytes: String(url).endsWith('/1') ? AUDIO_CHUNK_BYTES + 3 : AUDIO_CHUNK_BYTES });
  });
  const progress: number[] = [];
  await client.uploadAudio(new File([new Uint8Array(AUDIO_CHUNK_BYTES + 3)], 'sample.mp3'), 'candidate', { onProgress: n => progress.push(n) });
  assert.deepEqual(calls, ['/api/materials/audio', '/api/materials/job/chunks/0', '/api/materials/job/chunks/0', '/api/materials/job/chunks/1', '/api/materials/job/submit']);
  assert.deepEqual(sizes, [AUDIO_CHUNK_BYTES, AUDIO_CHUNK_BYTES, 3]);
  assert.deepEqual(progress, [AUDIO_CHUNK_BYTES, AUDIO_CHUNK_BYTES + 3]);
});

test('上传失败保留已创建任务供界面放弃，业务错误不重试或提交', async () => {
  let created = '';
  const calls: string[] = [];
  const client = createMaterialClient(async url => { calls.push(String(url)); return String(url).endsWith('/audio') ? response({ id: 'partial' }) : response({ code: 'INVALID_CHUNK', error: '上传内容无效。' }, 400); });
  await assert.rejects(client.uploadAudio(new File(['abc'], 'sample.wav'), 'recruiter', { onJob: job => { created = job.id; } }), /上传内容无效/);
  assert.equal(created, 'partial');
  assert.equal(calls.length, 2);
});

test('已取消上传不再发起任何请求', async () => {
  const controller = new AbortController(); controller.abort();
  let requests = 0;
  const client = createMaterialClient(async () => { requests++; return response({}); });
  await assert.rejects(client.uploadAudio(new File(['abc'], 'sample.mp3'), 'candidate', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(requests, 0);
});

test('确认稿逐字保存，重试与放弃使用明确接口且客户端不暴露飞书操作', async () => {
  const calls: {url: string; init: RequestInit}[] = [];
  const client = createMaterialClient(async (url, init) => { calls.push({url: String(url), init: init!}); return response({}); });
  await client.confirm('a', '  人工修订\n文本  ', { A: 'candidate' });
  await client.retry('a'); await client.cancel('a');
  assert.equal(calls[0].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { transcript: '  人工修订\n文本  ', speakerRoles: { A: 'candidate' }, confirmed: true });
  assert.deepEqual(calls.slice(1).map(c => [c.url, c.init.method]), [['/api/materials/a/retry', 'POST'], ['/api/materials/a/cancel', 'POST']]);
  assert.equal('importFeishu' in client, false);
  assert.equal('connect' in client, false);
  assert.equal('disconnect' in client, false);
});

test('角色文本保留时间戳，未指定角色不会猜为候选人', () => {
  const segments = [{ speaker: 'A', startMs: 61500, endMs: 63000, text: '回答' }, { speaker: 'B', startMs: null, endMs: null, text: '追问' }];
  assert.equal(formatRoleTranscript(segments, { A: 'candidate' }), '[01:01] 候选人（A）：回答\n身份待确认（B）：追问');
});
test('角色选择立即更新编辑稿标签，保留手工修订的正文及其他说话人', () => {
  const draft = '[01:01] 身份待确认（A）：人工修订后的回答\n身份待确认（B）：追问';
  const updated = updateDraftRole(draft, 'A', 'unknown', 'candidate');
  assert.equal(updated, '[01:01] 候选人（A）：人工修订后的回答\n身份待确认（B）：追问');
  assert.equal(updateDraftRole(updated, 'A', 'candidate', 'interviewer'), '[01:01] 面试官（A）：人工修订后的回答\n身份待确认（B）：追问');
});

test('中文无空格的材料可按有效字符判断，空白不计数', () => {
  assert.equal(effectiveCharacterCount('  中文\n测试\t '), 4);
  assert.equal(effectiveCharacterCount('这是没有空格但包含完整问答内容的中文面试记录。') >= 20, true);
});

test('音频校验拒绝空文件、超限和非支持后缀', () => {
  assert.match(validateAudioFile({ name: 'a.mp3', size: 0 })!, /空/);
  assert.equal(validateAudioFile({ name: 'a.mp3', size: 100 * 1024 * 1024 + 1 }), null);
  assert.match(validateAudioFile({ name: 'a.mp3', size: 500 * 1024 * 1024 + 1 })!, /500/);
  assert.match(validateAudioFile({ name: 'a.mp4', size: 3 })!, /MP3/);
  assert.equal(validateAudioFile({ name: 'a.M4A', size: 3 }), null);
});

test('候选人 JSON 和 multipart 均传材料 ID，招聘 JSON 同样保留', () => {
  const base = { analysisMode: 'candidate' as const, jobTitle: '岗位', jobDescription: '', transcript: '确认稿', fileName: '录音', resumeText: '', resumeParseStatus: 'not_provided' as const, materialId: 'confirmed-material' };
  assert.equal(JSON.parse(buildAnalysisRequest({ ...base, resumeFile: null }).body as string).materialId, 'confirmed-material');
  assert.equal((buildAnalysisRequest({ ...base, resumeFile: new File(['resume'], 'resume.txt') }).body as FormData).get('materialId'), 'confirmed-material');
  assert.equal(JSON.parse(buildAnalysisRequest({ analysisMode: 'recruiter', jobTitle: '岗位', competencies: '判断', transcript: '确认稿', fileName: '录音', materialId: 'confirmed-material' }).body as string).materialId, 'confirmed-material');
});

test('上传中断后不继续下一个分块或提交', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const client = createMaterialClient(async url => {
    calls.push(String(url));
    if (String(url).includes('/chunks/')) controller.abort();
    return response({ id: 'job' });
  });
  await assert.rejects(client.uploadAudio(new File([new Uint8Array(AUDIO_CHUNK_BYTES + 1)], 'a.mp3'), 'candidate', { signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(calls, ['/api/materials/audio', '/api/materials/job/chunks/0']);
});

test('服务持续失败时分块最多尝试三次，不自动重复创建收费任务', async () => {
  const calls: string[] = [];
  const client = createMaterialClient(async url => {
    calls.push(String(url));
    return String(url).endsWith('/audio') ? response({ id: 'job' }) : response({ error: '服务暂不可用', code: 'TEMPORARY' }, 503);
  });
  await assert.rejects(client.uploadAudio(new File(['abc'], 'a.mp3'), 'candidate'), /服务暂不可用/);
  assert.deepEqual(calls, ['/api/materials/audio', ...Array(3).fill('/api/materials/job/chunks/0')]);
});

test('能力发现和材料详情准确传递请求路径', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createMaterialClient(async (url, init) => { calls.push({url: String(url), init: init!}); return response({}); });
  await client.capabilities(); await client.get('id/value');
  assert.deepEqual(calls.map(c => c.url), ['/api/materials/capabilities', '/api/materials/id%2Fvalue']);
});
