import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createMaterialRouter } from '../services/materialRoutes.js';
import { createMaterialStore } from '../services/materialJobs.js';
import { createMaterialManager } from '../services/materialManager.js';
import { createFeishuMinutesService } from '../services/feishuMinutes.js';
import { AUDIO_CHUNK_BYTES } from '../services/materialAudio.js';

const minutesUrl = 'https://team.feishu.cn/minutes/abcdefghijklmnopqrstuvwx';
const scope = 'minutes:minutes.transcript:export';
const syntheticAudio = Buffer.from('synthetic audio fixture');
const syntheticTranscript = '[Speaker A] 合成面试测试内容';

async function fixture(t, { enableFeishu = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'evalbar-material-http-'));
  const db = new DatabaseSync(':memory:');
  let server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    db.close();
    await rm(root, { recursive: true, force: true });
  });
  let time = 100000;
  const now = () => time;
  const store = createMaterialStore(db, { now });
  const submissions = [];
  const queries = [];
  const feishuCalls = [];
  const asr = {
    isEnabled: () => true,
    submit: async request => { submissions.push(request); },
    query: async id => {
      queries.push(id);
      return { transcript: syntheticTranscript, segments: [{ speaker: 'Speaker A', startMs: 0, endMs: 1000, text: '合成面试测试内容' }] };
    },
  };
  const feishu = createFeishuMinutesService({
    now,
    env: {
      FEISHU_APP_ID: 'synthetic-app', FEISHU_APP_SECRET: 'synthetic-secret',
      FEISHU_REDIRECT_URI: 'https://example.test/api/integrations/feishu/callback',
    },
    fetchImpl: async (url, options) => {
      feishuCalls.push({ url, options });
      if (url === 'https://accounts.feishu.cn/oauth/v3/token') {
        return Response.json({ code: 0, access_token: 'synthetic-user-access', expires_in: 3600, scope, token_type: 'Bearer' });
      }
      assert.equal(url, 'https://open.feishu.cn/open-apis/minutes/v1/minutes/abcdefghijklmnopqrstuvwx/transcript?need_speaker=true&need_timestamp=true&file_format=srt');
      return new Response('1\n00:00:00,000 --> 00:00:01,000\n[Speaker A] 合成妙记内容', { headers: { 'Content-Type': 'text/plain' } });
    },
  });
  const manager = createMaterialManager({
    store, root, asr, feishu, now, env: { AUDIO_PUBLIC_BASE_URL: 'https://example.test' },
    // HTTP tests use synthetic bytes; codec validation is covered by materialAudio tests.
    prepare: async filePath => ({ filePath, format: 'wav', durationSeconds: 1 }),
  });
  const app = express();
  app.set('env', 'test');
  app.use(express.json({ limit: '512kb' }));
  app.use(cookieParser());
  const authenticate = (req, res, next) => {
    const id = req.get('test-user');
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id };
    req.sessionToken = id === 'owner' ? 'test-session' : `test-session-${id}`;
    next();
  };
  app.use('/api', createMaterialRouter({ authenticate, store, manager, feishu, asr, enableFeishu }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, { user = 'owner', json, headers = {}, ...options } = {}) => fetch(`${base}/api${route}`, {
    ...options,
    headers: { ...(user ? { 'test-user': user } : {}), ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });
  const createAudio = async (user = 'owner', analysisMode = 'candidate', sizeBytes = syntheticAudio.length) => {
    const response = await request('/materials/audio', { user, method: 'POST', json: { analysisMode, fileName: 'synthetic.wav', sizeBytes } });
    assert.equal(response.status, 201);
    return response.json();
  };
  const upload = (id, bytes = syntheticAudio, user = 'owner', index = 0) => request(`/materials/${id}/chunks/${index}`, {
    method: 'PUT', user, headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
  });
  const authorize = async (user = 'owner') => {
    const response = await request('/integrations/feishu/connect', { method: 'POST', user });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    const { url } = await response.json();
    return { cookie, cookiePair: cookie.split(';')[0], url: new URL(url) };
  };
  const callback = (flow, extra = {}) => request(`/integrations/feishu/callback?${new URLSearchParams({ state: flow.url.searchParams.get('state'), code: 'synthetic-code', ...extra })}`, {
    user: null, headers: { Cookie: flow.cookiePair },
  });
  return { store, manager, request, createAudio, upload, authorize, callback, submissions, queries, feishuCalls, advance: ms => { time += ms; } };
}

test('首版默认不公开飞书能力和授权导入路由', async t => {
  const f = await fixture(t);
  const capabilities = await (await f.request('/materials/capabilities')).json();
  assert.deepEqual(Object.keys(capabilities), ['audio']);
  for (const [route, method, json] of [
    ['/integrations/feishu/connect', 'POST'],
    ['/integrations/feishu', 'DELETE'],
    ['/materials/feishu', 'POST', { analysisMode: 'candidate', url: minutesUrl }],
  ]) await expectError(await f.request(route, { method, json }), 404);
  await expectError(await f.request('/materials/feishu', { method: 'POST' }), 404);
  const callback = await f.request('/integrations/feishu/callback?state=fake&code=fake', { user: null });
  assert.equal(callback.status, 404);
  assert.equal(f.feishuCalls.length, 0);
});

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  if (code) assert.equal((await response.json()).code, code);
  else await response.arrayBuffer();
}

test('材料和飞书连接路由未登录均返回 401', async t => {
  const f = await fixture(t, { enableFeishu: true });
  const job = await f.createAudio();
  for (const [route, method, json] of [
    ['/materials/capabilities', 'GET'], ['/materials?analysisMode=candidate', 'GET'],
    ['/materials/audio', 'POST', {}], ['/materials/feishu', 'POST', { url: minutesUrl }],
    [`/materials/${job.id}`, 'GET'], [`/materials/${job.id}`, 'PATCH', {}],
    [`/materials/${job.id}/chunks/0`, 'PUT'], [`/materials/${job.id}/submit`, 'POST'],
    [`/materials/${job.id}/audio`, 'GET'], [`/materials/${job.id}/retry`, 'POST'],
    [`/materials/${job.id}/cancel`, 'POST'], ['/integrations/feishu/connect', 'POST'],
    ['/integrations/feishu', 'DELETE'],
  ]) {
    await expectError(await f.request(route, { method, json, user: null }), 401);
  }
  assert.equal(f.store.get(job.id, 'owner').uploadedBytes, 0);
  assert.equal(f.feishuCalls.length, 0);
});

test('跨用户详情、分块和音频访问返回 404，列表按用户与模式过滤', async t => {
  const f = await fixture(t);
  const candidate = await f.createAudio();
  assert.equal((await f.upload(candidate.id)).status, 200);
  assert.equal((await f.request(`/materials/${candidate.id}/submit`, { method: 'POST' })).status, 200);
  for (const suffix of ['', '/audio']) await expectError(await f.request(`/materials/${candidate.id}${suffix}`, { user: 'other' }), 404, 'MATERIAL_NOT_FOUND');
  await expectError(await f.upload(candidate.id, syntheticAudio, 'other'), 404, 'MATERIAL_NOT_FOUND');
  await expectError(await f.upload(candidate.id, Buffer.alloc(AUDIO_CHUNK_BYTES + 1), 'other'), 404, 'MATERIAL_NOT_FOUND');
  await f.manager.tick();
  f.advance(6000);
  await f.manager.tick();
  const recruiter = await f.createAudio('owner', 'recruiter');
  const other = await f.createAudio('other');
  for (const [user, analysisMode, expected] of [['owner', 'candidate', candidate.id], ['owner', 'recruiter', recruiter.id], ['other', 'candidate', other.id]]) {
    const response = await f.request(`/materials?analysisMode=${analysisMode}`, { user });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).map(job => job.id), [expected]);
  }
  for (const route of ['/materials', '/materials?analysisMode=admin']) await expectError(await f.request(route), 400, 'INVALID_MODE');
});

test('HTTP 上传至确认的全流程保留修订稿并阻止未确认、跨模式和跨用户分析', async t => {
  const f = await fixture(t);
  const job = await f.createAudio();
  assert.equal(job.status, 'uploading');
  await expectError(await f.request(`/materials/${job.id}/submit`, { method: 'POST' }), 409, 'UPLOAD_INCOMPLETE');
  await expectError(await f.request(`/materials/${job.id}`, { method: 'PATCH', json: { confirmed: true, transcript: '尚未转写' } }), 409, 'MATERIAL_NOT_READY');
  for (let i = 0; i < 2; i++) {
    const response = await f.upload(job.id);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).uploadedBytes, syntheticAudio.length);
  }
  for (let i = 0; i < 2; i++) assert.equal((await f.request(`/materials/${job.id}/submit`, { method: 'POST' })).status, 200);
  await f.manager.tick();
  assert.equal((await (await f.request(`/materials/${job.id}`)).json()).status, 'transcribing');
  f.advance(6000);
  await f.manager.tick();
  const readyResponse = await f.request(`/materials/${job.id}`);
  assert.equal(readyResponse.headers.get('cache-control'), 'no-store');
  assert.equal(readyResponse.headers.get('referrer-policy'), 'no-referrer');
  const ready = await readyResponse.json();
  assert.equal(ready.status, 'ready');
  assert.equal(ready.transcript, syntheticTranscript);
  assert.equal(ready.segments[0].speaker, 'Speaker A');
  assert.deepEqual(ready.speakerRoles, {});
  for (const internalField of ['localPath', 'preparedPath', 'mediaTokenHash', 'providerId', 'userId']) assert.equal(internalField in ready, false);
  assert.throws(() => f.store.forAnalysis(job.id, 'owner', 'candidate'), { code: 'MATERIAL_NOT_CONFIRMED' });
  await expectError(await f.request(`/materials/${job.id}`, { method: 'PATCH', json: { confirmed: true, transcript: '  ' } }), 400, 'INVALID_TRANSCRIPT');
  const corrected = '人工修订后的合成面试内容';
  const confirmation = await f.request(`/materials/${job.id}`, { method: 'PATCH', json: { confirmed: true, transcript: corrected, speakerRoles: { 'Speaker A': 'candidate' } } });
  assert.equal(confirmation.status, 200);
  assert.equal((await confirmation.json()).confirmed, true);
  const confirmed = f.store.forAnalysis(job.id, 'owner', 'candidate');
  assert.equal(confirmed.transcript, corrected);
  assert.equal(confirmed.speakerRoles['Speaker A'], 'candidate');
  assert.equal(f.store.internal(job.id).originalTranscript, syntheticTranscript);
  assert.throws(() => f.store.forAnalysis(job.id, 'owner', 'recruiter'), { code: 'MATERIAL_MODE_MISMATCH' });
  assert.throws(() => f.store.forAnalysis(job.id, 'other', 'candidate'), { code: 'MATERIAL_NOT_FOUND' });
  const audio = await f.request(`/materials/${job.id}/audio`);
  assert.equal(audio.status, 200);
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), syntheticAudio);
  assert.equal(f.submissions.length, 1);
  assert.equal(f.queries.length, 1);
  assert.equal(f.feishuCalls.length, 0);
});

test('错误 JSON、非对象请求和超大分块被拒绝且不改变上传进度', async t => {
  const f = await fixture(t, { enableFeishu: true });
  const malformed = await f.request('/materials/audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  await expectError(malformed, 400);
  await expectError(await f.request('/materials/audio', { method: 'POST', json: [] }), 400, 'INVALID_REQUEST');
  await expectError(await f.request('/materials/feishu', { method: 'POST' }), 400, 'INVALID_REQUEST');
  const job = await f.createAudio('owner', 'candidate', AUDIO_CHUNK_BYTES + 1);
  await expectError(await f.upload(job.id, Buffer.alloc(AUDIO_CHUNK_BYTES + 1)), 413);
  await expectError(await f.upload(job.id, syntheticAudio, 'owner', '-1'), 400, 'INVALID_CHUNK');
  await expectError(await f.request(`/materials/${job.id}`, { method: 'PATCH', json: [] }), 400, 'INVALID_REQUEST');
  assert.equal(f.store.get(job.id, 'owner').uploadedBytes, 0);
  assert.equal(f.submissions.length, 0);
});

test('供应商仅凭有效 opaque URL 读取音频，错误 token 与完成后链接均为 404', async t => {
  const f = await fixture(t);
  const job = await f.createAudio();
  await f.upload(job.id);
  await f.request(`/materials/${job.id}/submit`, { method: 'POST' });
  await f.manager.tick();
  const providerPath = new URL(f.submissions[0].url).pathname.replace(/^\/api/, '');
  assert.match(providerPath, new RegExp(`^/audio-source/${job.id}/[a-f0-9]{64}$`));
  const response = await f.request(providerPath, { user: null });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), syntheticAudio);
  await expectError(await f.request(`/audio-source/${job.id}/${'0'.repeat(64)}`, { user: null }), 404, 'MATERIAL_NOT_FOUND');
  await expectError(await f.request(`/audio-source/${job.id}/invalid`, { user: null }), 404, 'MATERIAL_NOT_FOUND');
  f.advance(6000);
  await f.manager.tick();
  await expectError(await f.request(providerPath, { user: null }), 404, 'MATERIAL_NOT_FOUND');
});

test('飞书连接设置受限 nonce Cookie，回调校验 state、nonce、单次性及原始用户会话', async t => {
  const f = await fixture(t, { enableFeishu: true });
  const flow = await f.authorize();
  assert.match(flow.cookie, /HttpOnly/);
  assert.match(flow.cookie, /SameSite=Lax/i);
  assert.match(flow.cookie, /Path=\/api\/integrations\/feishu\/callback/);
  assert.match(flow.cookie, /Max-Age=300/);
  assert.equal(flow.url.searchParams.get('scope'), scope);
  assert.equal(flow.url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(flow.url.searchParams.has('client_secret'), false);
  const callback = await f.callback(flow);
  assert.equal(callback.status, 200);
  assert.match(await callback.text(), /飞书已连接/);
  assert.match(callback.headers.get('set-cookie'), /evalbar_feishu_nonce=;/);
  const ownCapabilities = await (await f.request('/materials/capabilities')).json();
  const otherCapabilities = await (await f.request('/materials/capabilities', { user: 'other' })).json();
  assert.equal(ownCapabilities.feishu.connected, true);
  assert.equal(otherCapabilities.feishu.connected, false);
  await expectError(await f.callback(flow), 400);
  assert.equal(f.feishuCalls.length, 1);
  assert.equal(new URLSearchParams(f.feishuCalls[0].options.body).get('grant_type'), 'authorization_code');
  assert.ok(new URLSearchParams(f.feishuCalls[0].options.body).get('code_verifier'));
  const disconnect = await f.request('/integrations/feishu', { method: 'DELETE' });
  assert.equal(disconnect.status, 200);
  assert.equal((await (await f.request('/materials/capabilities')).json()).feishu.connected, false);
});

test('飞书回调拒绝缺少或伪造 nonce、未知 state、取消和过期授权', async t => {
  const f = await fixture(t, { enableFeishu: true });
  for (const variant of ['missing', 'wrong', 'state', 'denied', 'expired']) {
    const flow = await f.authorize();
    if (variant === 'missing') flow.cookiePair = '';
    if (variant === 'wrong') flow.cookiePair = 'evalbar_feishu_nonce=wrong';
    if (variant === 'expired') f.advance(300001);
    const extra = variant === 'state' ? { state: 'unknown-state' } : variant === 'denied' ? { error: 'access_denied' } : {};
    const response = await f.callback(flow, extra);
    assert.equal(response.status, 400, variant);
    assert.match(await response.text(), /飞书连接未完成/);
    assert.match(response.headers.get('set-cookie'), /evalbar_feishu_nonce=;/);
    assert.equal((await (await f.request('/materials/capabilities')).json()).feishu.connected, false);
  }
  assert.equal(f.feishuCalls.length, 0);
});

test('飞书链接校验先于导入，只有已连接的本人会话能拉取并确认逐字稿', async t => {
  const f = await fixture(t, { enableFeishu: true });
  for (const url of ['http://team.feishu.cn/minutes/abcdefghijklmnopqrstuvwx', 'https://feishu.cn.evil.test/minutes/abcdefghijklmnopqrstuvwx', 'https://team.feishu.cn/docx/abcdefghijklmnopqrstuvwx', 'https://team.feishu.cn/other/../minutes/abcdefghijklmnopqrstuvwx']) {
    await expectError(await f.request('/materials/feishu', { method: 'POST', json: { analysisMode: 'candidate', url } }), 400, 'FEISHU_INVALID_URL');
  }
  await expectError(await f.request('/materials/feishu', { method: 'POST', json: { analysisMode: 'candidate', url: minutesUrl } }), 401, 'FEISHU_CONNECT_REQUIRED');
  const flow = await f.authorize();
  assert.equal((await f.callback(flow)).status, 200);
  await expectError(await f.request('/materials/feishu', { user: 'other', method: 'POST', json: { analysisMode: 'candidate', url: minutesUrl } }), 401, 'FEISHU_CONNECT_REQUIRED');
  const imported = await f.request('/materials/feishu', { method: 'POST', json: { analysisMode: 'recruiter', url: minutesUrl } });
  assert.equal(imported.status, 202);
  const job = await imported.json();
  assert.equal(job.status, 'queued');
  await f.manager.tick();
  const ready = await (await f.request(`/materials/${job.id}`)).json();
  assert.equal(ready.status, 'ready');
  assert.equal(ready.transcript, '[Speaker A] 合成妙记内容');
  assert.equal(ready.segments[0].startMs, 0);
  assert.deepEqual(ready.speakerRoles, {});
  assert.equal(f.feishuCalls.length, 2);
  assert.equal(f.feishuCalls[1].options.headers.Authorization, 'Bearer synthetic-user-access');
  const confirmation = await f.request(`/materials/${job.id}`, { method: 'PATCH', json: { confirmed: true, transcript: ready.transcript, speakerRoles: { 'Speaker A': 'interviewer' } } });
  assert.equal(confirmation.status, 200);
  assert.equal(f.store.forAnalysis(job.id, 'owner', 'recruiter').source, 'feishu');
  assert.equal(f.submissions.length, 0);
});
