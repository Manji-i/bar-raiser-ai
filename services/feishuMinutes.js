import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const SCOPE = 'minutes:minutes.transcript:export';
const AUTH_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const TOKEN_URL = 'https://accounts.feishu.cn/oauth/v3/token';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 100000;
const AUTH_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 1000;
const TIMEOUT_MS = 30000;

class FeishuMinutesError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'FeishuMinutesError';
    this.code = code;
    this.status = status;
  }
}

const fail = (code, message, status) => new FeishuMinutesError(code, message, status);
const expiredAuth = () => fail('FEISHU_AUTH_EXPIRED', '飞书授权已失效，请重新连接。');
const reconnect = () => fail('FEISHU_RECONNECT_REQUIRED', '飞书授权已过期或权限不足，请重新连接。', 401);
const invalidTranscript = () => fail('FEISHU_INVALID_TRANSCRIPT', '飞书未返回有效逐字稿，请检查妙记转写状态。', 422);

export function parseMinutesUrl(value) {
  const invalid = () => fail('FEISHU_INVALID_URL', '请使用有效的飞书妙记链接。');
  // Validate the original spelling before URL normalization can remove ports or dot segments.
  if (typeof value !== 'string' || /[\s\\\u0000-\u001f\u007f]/u.test(value)) throw invalid();
  const match = /^https:\/\/([^/?#]+)(\/[^?#]*)(?:[?#].*)?$/.exec(value);
  if (!match || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*feishu\.cn$/i.test(match[1])) throw invalid();
  const path = /^\/minutes\/([A-Za-z0-9]{24})\/?$/.exec(match[2]);
  if (!path) throw invalid();
  return path[1];
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return undefined; }
}

function timestamp(value) {
  const parts = /^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(value);
  if (!parts) return null;
  const result = Number(parts[1]) * 3600000 + Number(parts[2]) * 60000 + Number(parts[3]) * 1000 + Number(parts[4]);
  return Number.isSafeInteger(result) ? result : null;
}

export function parseMinutesTranscript(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw invalidTranscript();
  if (raw.length > MAX_TRANSCRIPT_CHARS) throw fail('FEISHU_TRANSCRIPT_TOO_LONG', '逐字稿超过 100000 字符，请缩短材料后重试。', 413);
  const cleaned = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (/^\s*<(?:!doctype|\/?[a-z][a-z0-9]*\b)/i.test(cleaned) || parseJson(cleaned) !== undefined || cleaned.includes('\u0000')) throw invalidTranscript();
  const blocks = cleaned.split(/\n[ \t]*\n/);
  const segments = [];
  const utterances = [];
  for (const block of blocks) {
    const match = /^(?:\d+\n)?(\d{2,}:[0-5]\d:[0-5]\d[,.]\d{3})[ \t]+-->[ \t]+(\d{2,}:[0-5]\d:[0-5]\d[,.]\d{3})[ \t]*\n([\s\S]+)$/.exec(block);
    if (!match) return { transcript: raw, segments: [{ speaker: 'unknown', startMs: null, endMs: null, text: raw }] };
    const startMs = timestamp(match[1]);
    const endMs = timestamp(match[2]);
    if (startMs === null || endMs === null || endMs < startMs || !match[3].trim()) {
      return { transcript: raw, segments: [{ speaker: 'unknown', startMs: null, endMs: null, text: raw }] };
    }
    const utterance = match[3];
    // Only explicit labels count as speakers. Unlabelled text remains unknown.
    const label = /^\[([^\]\n]{1,80})\][ \t]*([\s\S]+)$/.exec(utterance);
    const speaker = label?.[1].trim();
    segments.push({ speaker: speaker || 'unknown', startMs, endMs, text: speaker ? label[2] : utterance });
    utterances.push(utterance);
  }
  return { transcript: utterances.join('\n\n'), segments };
}

function secureEqual(value, expected) {
  if (typeof value !== 'string' || value.length !== expected.length) return false;
  const actual = Buffer.from(value);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function abortable(signal, operation) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function readLimited(response, signal) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw fail('FEISHU_RESPONSE_TOO_LARGE', '飞书响应超过 2 MB，请缩短材料后重试。', 413);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await abortable(signal, () => reader.read());
      if (done) { complete = true; break; }
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw fail('FEISHU_RESPONSE_TOO_LARGE', '飞书响应超过 2 MB，请缩短材料后重试。', 413);
      chunks.push(value);
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length)); } catch { throw invalidTranscript(); }
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function hasScope(value) {
  return typeof value === 'string' && value.split(/[\s,]+/).includes(SCOPE);
}

export function createFeishuMinutesService({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const { FEISHU_APP_ID: clientId, FEISHU_APP_SECRET: clientSecret, FEISHU_REDIRECT_URI: redirectUri } = env;
  const pending = new Map();
  const exchanging = new Map();
  const connections = new Map();
  const requests = new Map();
  const isEnabled = () => [clientId, clientSecret, redirectUri].every((value) => typeof value === 'string' && value.trim().length > 0);

  function cleanup() {
    const time = now();
    for (const [state, flow] of pending) if (flow.expiresAt <= time) pending.delete(state);
    for (const [sessionKey, connection] of connections) if (connection.expiresAt <= time) connections.delete(sessionKey);
  }

  function requireEnabled() {
    if (!isEnabled()) throw fail('FEISHU_NOT_CONFIGURED', '飞书妙记导入暂未开通，请联系管理员配置。', 503);
  }

  function isConnected(sessionKey) {
    cleanup();
    return isEnabled() && connections.has(sessionKey);
  }

  function cancelFlows(sessionKey) {
    for (const [state, flow] of pending) if (flow.sessionKey === sessionKey) pending.delete(state);
    for (const [state, flow] of exchanging) {
      if (flow.sessionKey === sessionKey) { flow.canceled = true; exchanging.delete(state); }
    }
    for (const controller of requests.get(sessionKey) || []) controller.abort();
    requests.delete(sessionKey);
  }

  function connect(sessionKey) {
    requireEnabled();
    if (typeof sessionKey !== 'string' || !sessionKey) throw fail('FEISHU_SESSION_REQUIRED', '请先登录后再连接飞书。', 401);
    cleanup();
    cancelFlows(sessionKey);
    if (pending.size >= MAX_PENDING) throw fail('FEISHU_AUTH_BUSY', '当前连接请求较多，请稍后重试。', 429);
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    pending.set(state, { sessionKey, nonce, verifier, expiresAt: now() + AUTH_TTL_MS, canceled: false });
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: SCOPE, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'consent' }).toString();
    return { url: url.href, state, nonce };
  }

  async function request(url, options, signal, sessionKey) {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (signal?.aborted) throw fail('FEISHU_REQUEST_ABORTED', '飞书请求已取消。', 499);
    const active = requests.get(sessionKey) || new Set();
    active.add(controller);
    requests.set(sessionKey, active);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    timer.unref?.();
    try {
      const response = await abortable(controller.signal, () => fetchImpl(url, { ...options, redirect: 'error', signal: controller.signal }));
      const raw = await readLimited(response, controller.signal);
      return { response, raw };
    } catch (error) {
      if (error instanceof FeishuMinutesError) throw error;
      if (timedOut) throw fail('FEISHU_TIMEOUT', '飞书请求超时，请稍后重试。', 504);
      if (controller.signal.aborted) throw fail('FEISHU_REQUEST_ABORTED', '飞书请求已取消。', 499);
      throw fail('FEISHU_UNAVAILABLE', '暂时无法连接飞书，请稍后重试。', 502);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      active.delete(controller);
      if (!active.size && requests.get(sessionKey) === active) requests.delete(sessionKey);
    }
  }

  async function callback({ state, nonce, code, error } = {}) {
    requireEnabled();
    cleanup();
    const flow = pending.get(state);
    pending.delete(state);
    if (!flow || !secureEqual(nonce, flow.nonce)) throw expiredAuth();
    if (error) throw fail('FEISHU_AUTH_DENIED', '飞书授权未完成，请重新连接。');
    if (typeof code !== 'string' || !code.trim()) throw expiredAuth();
    exchanging.set(state, flow);
    try {
      const { response, raw } = await request(TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, code_verifier: flow.verifier, scope: SCOPE }).toString(),
      }, undefined, flow.sessionKey);
      if (flow.canceled || flow.expiresAt <= now()) throw expiredAuth();
      const result = parseJson(raw);
      if (!response.ok || !result || result.code !== 0 || typeof result.access_token !== 'string' || !result.access_token.trim() || /[\r\n]/.test(result.access_token) || String(result.token_type).toLowerCase() !== 'bearer') {
        throw fail('FEISHU_AUTH_FAILED', '飞书授权失败，请重新连接。', 502);
      }
      if (!hasScope(result.scope)) throw reconnect();
      const ttl = Number(result.expires_in) * 1000;
      if (!Number.isFinite(ttl) || ttl <= 0 || !Number.isSafeInteger(now() + ttl)) throw fail('FEISHU_AUTH_FAILED', '飞书授权失败，请重新连接。', 502);
      connections.set(flow.sessionKey, { accessToken: result.access_token, expiresAt: now() + ttl });
    } catch (error) {
      if (flow.canceled) throw expiredAuth();
      throw error;
    } finally {
      exchanging.delete(state);
    }
  }

  function disconnect(sessionKey) {
    connections.delete(sessionKey);
    cancelFlows(sessionKey);
    cleanup();
  }

  async function importTranscript(url, sessionKey, { signal } = {}) {
    requireEnabled();
    const token = parseMinutesUrl(url);
    if (!isConnected(sessionKey)) throw fail('FEISHU_NOT_CONNECTED', '请先连接本人的飞书账号；授权过期后需重新连接。', 401);
    const connection = connections.get(sessionKey);
    const endpoint = `https://open.feishu.cn/open-apis/minutes/v1/minutes/${token}/transcript?need_speaker=true&need_timestamp=true&file_format=srt`;
    let response, raw;
    try {
      ({ response, raw } = await request(endpoint, { method: 'GET', headers: { Authorization: `Bearer ${connection.accessToken}` } }, signal, sessionKey));
    } catch (error) {
      if (connections.get(sessionKey) !== connection) throw reconnect();
      throw error;
    }
    const json = parseJson(raw);
    const providerCode = Number(json?.code);
    if (response.status === 401 || [99991663, 99991668, 99991671, 99991672, 99991677, 99991679, 99991680].includes(providerCode)) {
      if (connections.get(sessionKey) === connection) connections.delete(sessionKey);
      throw reconnect();
    }
    const businessErrors = {
      2091002: ['FEISHU_MINUTES_NOT_FOUND', '未找到这份飞书妙记，请检查链接。', 404],
      2091003: ['FEISHU_TRANSCRIPT_NOT_READY', '这份妙记尚未完成转写，请稍后重试。', 409],
      2091004: ['FEISHU_MINUTES_DELETED', '这份飞书妙记已被删除。', 404],
      2091005: ['FEISHU_EXPORT_FORBIDDEN', '当前飞书账号没有这份妙记的逐字稿导出权限。', 403],
    };
    if (businessErrors[providerCode]) throw fail(...businessErrors[providerCode]);
    if (!response.ok) throw fail('FEISHU_EXPORT_FAILED', '飞书逐字稿导出失败，请检查权限后重试。', 502);
    if (json !== undefined || /(?:html|json)/i.test(response.headers.get('content-type') || '')) throw invalidTranscript();
    if (connections.get(sessionKey) !== connection || connection.expiresAt <= now()) throw reconnect();
    return { fileName: '飞书妙记', ...parseMinutesTranscript(raw) };
  }

  return { isEnabled, isConnected, connect, callback, disconnect, importTranscript };
}
