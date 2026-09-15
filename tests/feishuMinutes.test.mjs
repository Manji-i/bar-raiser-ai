import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFeishuMinutesService, parseMinutesUrl, parseMinutesTranscript } from '../services/feishuMinutes.js';

const token = 'Abcdefgh12345678ABCDEFGH';
const minutesUrl = `https://team.feishu.cn/minutes/${token}`;
const scope = 'minutes:minutes.transcript:export';
const env = { FEISHU_APP_ID: 'test-app', FEISHU_APP_SECRET: 'test-secret', FEISHU_REDIRECT_URI: 'https://example.test/api/feishu/callback' };
const srt = '1\n00:00:01,200 --> 00:00:03,400\n[张三] 我负责产品。\n补充一句。\n\n2\n00:00:04,000 --> 00:00:06,050\n[李四] 结果如何？';
const oauthResponse = (overrides = {}) => Response.json({ code: 0, access_token: 'test-user-access', expires_in: 60, scope, token_type: 'Bearer', ...overrides });
const errorCode = (code) => (error) => { assert.equal(error.code, code); assert.equal(typeof error.status, 'number'); assert.match(error.message, /[\u4e00-\u9fff]/); return true; };
const authorize = async (service, session = 'session-a') => { const flow = service.connect(session); await service.callback({ ...flow, code: 'one-time-code' }); return flow; };

test('只接受飞书官方妙记链接，拒绝 URL 标准化与伪域名绕过', () => {
  for (const url of [minutesUrl, `${minutesUrl}/?from=share#here`, `https://feishu.cn/minutes/${token}`]) assert.equal(parseMinutesUrl(url), token);
  for (const url of [
    `http://feishu.cn/minutes/${token}`, `https://feishu.cn.evil.test/minutes/${token}`,
    `https://evilfeishu.cn/minutes/${token}`, `https://feishu.cn:443/minutes/${token}`,
    `https://user@feishu.cn/minutes/${token}`, `https://user:pass@feishu.cn/minutes/${token}`,
    `https://feishu.cn/other/../minutes/${token}`, `https://feishu.cn/minutes/${token}/other`,
    `https://feishu.cn/minutes/%41${token.slice(1)}`, `https://feishu.cn/minutes/${token.slice(1)}`,
    `https://feishu.cn\\@evil.test/minutes/${token}`, `https://feishu.cn./minutes/${token}`,
    `https://feishu.cn/minutes/${token}\n`, `https://feishu.cn/minutes/${token}?x=\n`, '', null,
  ]) assert.throws(() => parseMinutesUrl(url), errorCode('FEISHU_INVALID_URL'), String(url));
});

test('SRT 保留发言人、时间和多行逐字内容', () => {
  const result = parseMinutesTranscript(srt);
  assert.deepEqual(result.segments, [
    { speaker: '张三', startMs: 1200, endMs: 3400, text: '我负责产品。\n补充一句。' },
    { speaker: '李四', startMs: 4000, endMs: 6050, text: '结果如何？' },
  ]);
  assert.equal(result.transcript, '[张三] 我负责产品。\n补充一句。\n\n[李四] 结果如何？');
});

test('不能可靠分割的文本原样保留，不编造发言人或时间', () => {
  for (const raw of ['一段没有标签的原始逐字稿。', `${srt}\n\n不属于字幕的原始内容`]) {
    assert.deepEqual(parseMinutesTranscript(raw), { transcript: raw, segments: [{ speaker: 'unknown', startMs: null, endMs: null, text: raw }] });
  }
  assert.equal(parseMinutesTranscript('1\n00:00:00,000 --> 00:00:01,000\n没有发言人').segments[0].speaker, 'unknown');
});

test('空转写、HTML、JSON 错误、超长转写不会成为成功结果', () => {
  for (const raw of ['', '  \n ', '<!doctype html><html>登录</html>', '<div>失败</div>', '{"code":2091005,"msg":"forbidden"}', 'x'.repeat(100001)]) {
    assert.throws(() => parseMinutesTranscript(raw));
  }
});

test('缺少应用配置时明确未开通', () => {
  const service = createFeishuMinutesService({ env: {} });
  assert.equal(service.isEnabled(), false);
  assert.equal(service.isConnected('session-a'), false);
  assert.throws(() => service.connect('session-a'), errorCode('FEISHU_NOT_CONFIGURED'));
});

test('OAuth 使用单次 state、浏览器 nonce 和 S256 PKCE，仅申请逐字稿导出权限', async () => {
  const calls = [];
  const service = createFeishuMinutesService({ env, fetchImpl: async (...args) => { calls.push(args); return oauthResponse(); } });
  const flow = service.connect('session-a');
  const auth = new URL(flow.url);
  assert.equal(auth.origin + auth.pathname, 'https://accounts.feishu.cn/open-apis/authen/v1/authorize');
  assert.equal(auth.searchParams.get('client_id'), env.FEISHU_APP_ID);
  assert.equal(auth.searchParams.get('response_type'), 'code');
  assert.equal(auth.searchParams.get('scope'), scope);
  assert.equal(auth.searchParams.get('prompt'), 'consent');
  assert.equal(auth.searchParams.get('state'), flow.state);
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(flow.nonce.length >= 32);
  await service.callback({ state: flow.state, nonce: flow.nonce, code: 'one-time-code' });
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, 'https://accounts.feishu.cn/oauth/v3/token');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  assert.match(options.headers['Content-Type'], /application\/x-www-form-urlencoded/);
  const body = new URLSearchParams(options.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('scope'), scope);
  assert.equal(body.get('client_secret'), env.FEISHU_APP_SECRET);
  assert.equal(body.get('redirect_uri'), env.FEISHU_REDIRECT_URI);
  assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), auth.searchParams.get('code_challenge'));
  assert.equal(service.isConnected('session-a'), true);
  assert.equal(service.isConnected('session-b'), false);
  await assert.rejects(service.callback({ ...flow, code: 'replay' }), errorCode('FEISHU_AUTH_EXPIRED'));
});

test('错误 nonce、缺少 Cookie 和拒绝授权都会消费 state 且不会交换令牌', async () => {
  let calls = 0;
  const service = createFeishuMinutesService({ env, fetchImpl: async () => { calls++; return oauthResponse(); } });
  for (const params of [{ nonce: undefined }, { nonce: 'wrong-session-cookie' }, { error: 'access_denied' }, { code: undefined }]) {
    const flow = service.connect('session-a');
    await assert.rejects(service.callback({ ...flow, code: 'code', ...params }));
    await assert.rejects(service.callback({ ...flow, code: 'code' }), errorCode('FEISHU_AUTH_EXPIRED'));
    assert.equal(service.isConnected('session-a'), false);
  }
  assert.equal(calls, 0);
  const a = service.connect('session-a');
  const b = service.connect('session-b');
  await assert.rejects(service.callback({ state: a.state, nonce: b.nonce, code: 'code' }));
  assert.equal(calls, 0);
});

test('过期 state 不可使用，pending 数量有限且会清理过期项', async () => {
  let time = 0;
  const service = createFeishuMinutesService({ env, now: () => time, fetchImpl: async () => oauthResponse() });
  const old = service.connect('session-a');
  time = 5 * 60 * 1000;
  await assert.rejects(service.callback({ ...old, code: 'code' }), errorCode('FEISHU_AUTH_EXPIRED'));
  for (let i = 0; i < 1000; i++) service.connect(`session-${i}`);
  assert.throws(() => service.connect('overflow'), errorCode('FEISHU_AUTH_BUSY'));
  time += 5 * 60 * 1000;
  assert.ok(service.connect('after-expiry').state);
});

test('令牌不跨会话共享，过期后必须重新连接', async () => {
  let time = 0;
  const service = createFeishuMinutesService({ env, now: () => time, fetchImpl: async () => oauthResponse() });
  await authorize(service);
  await assert.rejects(service.importTranscript(minutesUrl, 'session-b'), errorCode('FEISHU_NOT_CONNECTED'));
  time = 60000;
  assert.equal(service.isConnected('session-a'), false);
  await assert.rejects(service.importTranscript(minutesUrl, 'session-a'), errorCode('FEISHU_NOT_CONNECTED'));
});

test('断开连接会撤销令牌、待完成授权和正在交换的授权', async () => {
  let resolveExchange;
  const service = createFeishuMinutesService({ env, fetchImpl: () => new Promise((resolve) => { resolveExchange = resolve; }) });
  const flow = service.connect('session-a');
  const completion = service.callback({ ...flow, code: 'code' });
  await Promise.resolve();
  service.disconnect('session-a');
  resolveExchange(oauthResponse());
  await assert.rejects(completion, errorCode('FEISHU_AUTH_EXPIRED'));
  assert.equal(service.isConnected('session-a'), false);
  const pending = service.connect('session-a');
  service.disconnect('session-a');
  await assert.rejects(service.callback({ ...pending, code: 'code' }));
  const ready = createFeishuMinutesService({ env, fetchImpl: async () => oauthResponse() });
  await authorize(ready);
  ready.disconnect('session-a');
  assert.equal(ready.isConnected('session-a'), false);
});

test('缺少已授予 scope、无效有效期和 OAuth 错误不保存令牌，也不重试', async () => {
  for (const overrides of [{ scope: 'other:scope' }, { expires_in: 0 }, { expires_in: 'invalid' }, { code: 20001 }, { access_token: '' }]) {
    let calls = 0;
    const service = createFeishuMinutesService({ env, fetchImpl: async () => { calls++; return oauthResponse(overrides); } });
    await assert.rejects(authorize(service));
    assert.equal(service.isConnected('session-a'), false);
    assert.equal(calls, 1);
  }
});

test('导入只访问固定官方导出接口并使用该会话用户令牌', async () => {
  const calls = [];
  const service = createFeishuMinutesService({ env, fetchImpl: async (...args) => { calls.push(args); return calls.length === 1 ? oauthResponse() : new Response(srt); } });
  await authorize(service);
  const result = await service.importTranscript(`${minutesUrl}?source=share#text`, 'session-a');
  assert.equal(result.fileName, '飞书妙记');
  assert.equal(result.segments.length, 2);
  const [url, options] = calls[1];
  assert.equal(url, `https://open.feishu.cn/open-apis/minutes/v1/minutes/${token}/transcript?need_speaker=true&need_timestamp=true&file_format=srt`);
  assert.equal(options.headers.Authorization, 'Bearer test-user-access');
  assert.equal(options.redirect, 'error');
  await assert.rejects(service.importTranscript('https://localhost/private', 'session-a'), errorCode('FEISHU_INVALID_URL'));
  assert.equal(calls.length, 2);
});

test('飞书业务错误映射为稳定中文错误且不暴露原始供应商消息', async () => {
  for (const [code, expected] of [[2091002, 'FEISHU_MINUTES_NOT_FOUND'], [2091003, 'FEISHU_TRANSCRIPT_NOT_READY'], [2091004, 'FEISHU_MINUTES_DELETED'], [2091005, 'FEISHU_EXPORT_FORBIDDEN']]) {
    let calls = 0;
    const service = createFeishuMinutesService({ env, fetchImpl: async () => ++calls === 1 ? oauthResponse() : Response.json({ code, msg: 'supplier-private-debug' }) });
    await authorize(service);
    await assert.rejects(service.importTranscript(minutesUrl, 'session-a'), (error) => { errorCode(expected)(error); assert.ok(!error.message.includes('supplier-private-debug')); return true; });
  }
});

test('401 与 scope 失效清除连接并提示重新授权', async () => {
  let calls = 0;
  const service = createFeishuMinutesService({ env, fetchImpl: async () => ++calls === 1 ? oauthResponse() : Response.json({ code: 99991679 }, { status: 401 }) });
  await authorize(service);
  await assert.rejects(service.importTranscript(minutesUrl, 'session-a'), errorCode('FEISHU_RECONNECT_REQUIRED'));
  assert.equal(service.isConnected('session-a'), false);
});

test('响应大小执行流式 2 MB 限制并取消读取', async () => {
  let calls = 0;
  let canceled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { canceled = true; } });
  const service = createFeishuMinutesService({ env, fetchImpl: async () => ++calls === 1 ? oauthResponse() : new Response(stream) });
  await authorize(service);
  await assert.rejects(service.importTranscript(minutesUrl, 'session-a'), errorCode('FEISHU_RESPONSE_TOO_LARGE'));
  assert.equal(canceled, true);
});

test('伪成功 HTML、空文件、JSON 和超长文本均拒绝', async () => {
  for (const response of [new Response('<html>登录页</html>'), new Response(''), Response.json({ unexpected: true }), new Response('x'.repeat(100001)), new Response('plaintext', { headers: { 'content-type': 'text/html' } })]) {
    let calls = 0;
    const service = createFeishuMinutesService({ env, fetchImpl: async () => ++calls === 1 ? oauthResponse() : response });
    await authorize(service);
    await assert.rejects(service.importTranscript(minutesUrl, 'session-a'));
  }
});

test('调用方取消能够中止导入，网络失败使用稳定中文错误', async () => {
  let calls = 0;
  const service = createFeishuMinutesService({ env, fetchImpl: async () => { if (++calls === 1) return oauthResponse(); throw new Error('sensitive-network-detail'); } });
  await authorize(service);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(service.importTranscript(minutesUrl, 'session-a', { signal: controller.signal }), errorCode('FEISHU_REQUEST_ABORTED'));
  assert.equal(calls, 1);
  await assert.rejects(service.importTranscript(minutesUrl, 'session-a'), errorCode('FEISHU_UNAVAILABLE'));
});

test('OAuth 交换在 30 秒超时后不重试且不能保存迟到令牌', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveExchange;
  let calls = 0;
  const service = createFeishuMinutesService({ env, fetchImpl: () => { calls++; return new Promise((resolve) => { resolveExchange = resolve; }); } });
  const flow = service.connect('session-a');
  const completion = service.callback({ ...flow, code: 'code' });
  const rejection = assert.rejects(completion, errorCode('FEISHU_TIMEOUT'));
  await Promise.resolve();
  t.mock.timers.tick(30000);
  await rejection;
  resolveExchange(oauthResponse());
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(service.isConnected('session-a'), false);
  await assert.rejects(service.callback({ ...flow, code: 'code' }), errorCode('FEISHU_AUTH_EXPIRED'));
});

test('交换期间超过 state 有效期仍拒绝保存令牌', async () => {
  let time = 0;
  const service = createFeishuMinutesService({ env, now: () => time, fetchImpl: async () => { time = 300000; return oauthResponse(); } });
  await assert.rejects(authorize(service), errorCode('FEISHU_AUTH_EXPIRED'));
  assert.equal(service.isConnected('session-a'), false);
});

test('响应已开始但逐字稿流挂起时也执行 30 秒超时', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let reading;
  const readStarted = new Promise((resolve) => { reading = resolve; });
  let canceled = false;
  const service = createFeishuMinutesService({ env, fetchImpl: async () => ++calls === 1 ? oauthResponse() : new Response(new ReadableStream({ pull() { reading(); }, cancel() { canceled = true; } }, { highWaterMark: 0 })) });
  await authorize(service);
  const imported = service.importTranscript(minutesUrl, 'session-a');
  const rejection = assert.rejects(imported, errorCode('FEISHU_TIMEOUT'));
  await readStarted;
  t.mock.timers.tick(30000);
  await rejection;
  assert.equal(canceled, true);
});

test('读取逐字稿过程中取消会停止流，断开后迟到响应不可使用', async () => {
  let calls = 0;
  let reading;
  const readStarted = new Promise((resolve) => { reading = resolve; });
  let canceled = false;
  const service = createFeishuMinutesService({ env, fetchImpl: async () => ++calls === 1 ? oauthResponse() : new Response(new ReadableStream({ pull() { reading(); }, cancel() { canceled = true; } }, { highWaterMark: 0 })) });
  await authorize(service);
  const controller = new AbortController();
  const imported = service.importTranscript(minutesUrl, 'session-a', { signal: controller.signal });
  const rejection = assert.rejects(imported, errorCode('FEISHU_REQUEST_ABORTED'));
  await readStarted;
  controller.abort();
  await rejection;
  assert.equal(canceled, true);

  let finish;
  let requestStarted;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  calls = 0;
  const another = createFeishuMinutesService({ env, fetchImpl: async () => ++calls === 1 ? oauthResponse() : new Promise((resolve) => { finish = resolve; requestStarted(); }) });
  await authorize(another);
  const waiting = another.importTranscript(minutesUrl, 'session-a');
  const disconnected = assert.rejects(waiting, errorCode('FEISHU_RECONNECT_REQUIRED'));
  await started;
  another.disconnect('session-a');
  finish(new Response(srt));
  await disconnected;
});

test('HTML 和 JSON 供应商错误即便带 UTF-8 BOM 也不能作为逐字稿', () => {
  for (const raw of ['\uFEFF<html>登录</html>', '\uFEFF{"code":2091005}']) assert.throws(() => parseMinutesTranscript(raw));
});

test('正文冒号不能被猜成发言人标签', () => {
  for (const body of ['我的目标是：提高效率。', '注意：结果需要核对。', '张三：这可能是正文引用。', '[   ] 有效正文']) {
    const parsed = parseMinutesTranscript(`1\n00:00:01,000 --> 00:00:02,000\n${body}`);
    assert.equal(parsed.segments[0].speaker, 'unknown');
    assert.equal(parsed.segments[0].text, body);
  }
});

test('disconnect 立即中止该会话交换和导入，流取消卡住也不阻塞返回', async () => {
  let started;
  let signal;
  let calls = 0;
  const entered = new Promise(resolve => { started = resolve; });
  const service = createFeishuMinutesService({ env, fetchImpl: async (url, options) => {
    if (++calls === 1) return oauthResponse();
    signal = options.signal;
    return new Response(new ReadableStream({
      pull() { started(); }, cancel() { return new Promise(() => {}); },
    }, { highWaterMark: 0 }));
  }});
  await authorize(service);
  const pending = service.importTranscript(minutesUrl, 'session-a');
  const rejected = assert.rejects(pending, errorCode('FEISHU_RECONNECT_REQUIRED'));
  await entered;
  service.disconnect('session-a');
  assert.equal(signal.aborted, true);
  await rejected;

  let exchangeSignal;
  const exchangeService = createFeishuMinutesService({ env, fetchImpl: (url, options) => {
    exchangeSignal = options.signal;
    return new Promise(() => {});
  }});
  const flow = exchangeService.connect('session-b');
  const exchange = exchangeService.callback({ ...flow, code: 'code' });
  const rejectedExchange = assert.rejects(exchange, errorCode('FEISHU_AUTH_EXPIRED'));
  await Promise.resolve();
  exchangeService.disconnect('session-b');
  assert.equal(exchangeSignal.aborted, true);
  await rejectedExchange;
});
