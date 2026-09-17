import { open, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { materialError } from './materialJobs.js';

export const MAX_AUDIO_MB = 500;
export const MAX_AUDIO_BYTES = MAX_AUDIO_MB * 1024 * 1024;
export const AUDIO_CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 3600;
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg'];
export const validateAudioName = name => {
  if (typeof name !== 'string' || !name || name.length > 200 || /[\/\\\x00-\x1f]/.test(name)) throw materialError('INVALID_AUDIO_NAME', '录音文件名无效。');
  const ext = path.extname(name).toLowerCase();
  if (!AUDIO_EXTENSIONS.includes(ext)) throw materialError('AUDIO_FORMAT', '支持 MP3、M4A、WAV、OGG 音频格式。');
  return ext;
};
export const sniffAudio = (head, ext) => {
  const match = ext === '.wav' ? head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE'
    : ext === '.mp3' ? head.toString('ascii', 0, 3) === 'ID3' || (head[0] === 255 && (head[1] & 0xe0) === 0xe0)
    : ext === '.m4a' ? head.toString('ascii', 4, 8) === 'ftyp'
    : ext === '.ogg' ? head.toString('ascii', 0, 4) === 'OggS' : false;
  if (!match) throw materialError('AUDIO_FORMAT', '文件实际内容与音频格式不匹配。');
  return ext.slice(1);
};

export async function prepareAudio(filePath, fileName, { signal } = {}) {
  signal?.throwIfAborted();
  const ext = validateAudioName(fileName);
  const info = await stat(filePath);
  if (!info.size || info.size > MAX_AUDIO_BYTES) throw materialError('AUDIO_SIZE', `录音须在 ${MAX_AUDIO_MB} MB 以内且不能为空。`, 413);
  const file = await open(filePath, 'r');
  const head = Buffer.alloc(32);
  try { await file.read(head, 0, 32, 0); } finally { await file.close(); }
  sniffAudio(head, ext);
  const durationSeconds = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./materialMetadata.worker.js', import.meta.url), { workerData: filePath, resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } });
    let finished = false;
    const finish = (error, duration) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      void worker.terminate();
      error ? reject(materialError('AUDIO_INVALID', '无法读取音频或处理超时，请重新导出为 MP3 或 WAV。')) : resolve(duration);
    };
    const abort = () => finish(true);
    const timer = setTimeout(abort, 15000);
    worker.once('message', result => finish(result.error, result.duration));
    worker.once('error', abort);
    worker.once('exit', () => { if (!finished) finish(true); });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_AUDIO_SECONDS) throw materialError('AUDIO_DURATION', '录音时长须大于 0 且不超过 60 分钟。');
  // Normalize every container/codec to PCM WAV rather than relying on its suffix.
  const { default: ffmpeg } = await import('ffmpeg-static');
  const output = path.join(path.dirname(filePath), 'normalized.wav');
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', filePath, '-map', '0:a:0', '-vn', '-t', '3601', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-fs', '115300000', output], { stdio: ['ignore', 'ignore', 'ignore'], signal, timeout: 120000, killSignal: 'SIGKILL' });
    child.once('error', () => reject(materialError('AUDIO_CONVERSION', '音频转换失败，请重新上传。')));
    child.once('close', code => code === 0 ? resolve() : reject(materialError('AUDIO_CONVERSION', '音频转换失败或超时，请重新上传。')));
  });
  const size = (await stat(output)).size;
  if (size < 45 || size > 115200100) throw materialError('AUDIO_DURATION', '音频转换后的时长超出限制。');
  return { filePath: output, format: 'wav', durationSeconds };
}

export const normalizeAsrResult = data => {
  const results = Array.isArray(data?.result) ? data.result : [data?.result];
  const transcript = results.map(r => r?.text || '').join('\n').trim();
  if (!transcript) throw materialError('AUDIO_NO_SPEECH', '没有识别到有效语音，请检查录音内容。', 422);
  if (transcript.length > 100000) throw materialError('TRANSCRIPT_TOO_LONG', '转写文字超过 100000 字符上限，请拆分录音。', 413);
  const utterances = results.flatMap(r => r?.utterances || []);
  const segments = utterances.slice(0, 10000).map(u => ({
    speaker: String(u.additions?.speaker ?? u.speaker_id ?? 'unknown').slice(0, 100),
    startMs: Number.isFinite(u.start_time) ? Math.max(0, u.start_time) : null,
    endMs: Number.isFinite(u.end_time) ? Math.max(0, u.end_time) : null,
    text: String(u.text || ''),
  }));
  if (utterances.length > 10000 || segments.reduce((n,s) => n+s.text.length,0) > 100000) throw materialError('TRANSCRIPT_TOO_LONG', '转写片段超过上限，请拆分录音。', 413);
  // Partial utterances must never replace and silently truncate the full transcript.
  const compact = text => text.replace(/\s/g, '');
  return { transcript, segments: segments.length && compact(segments.map(s => s.text).join('')) === compact(transcript)
    ? segments : [{ speaker: 'unknown', startMs: null, endMs: null, text: transcript }] };
};

export const createAsrProvider = ({ env = process.env, fetchImpl = fetch, timeoutMs = 30000 } = {}) => {
  const resource = env.ASR_RESOURCE_ID || 'volc.seedasr.auc';
  const configured = !!(env.ASR_API_KEY || (env.ASR_APP_ID && env.ASR_ACCESS_KEY));
  const headers = id => ({
    'Content-Type': 'application/json', 'X-Api-Resource-Id': resource, 'X-Api-Request-Id': id,
    ...(env.ASR_API_KEY ? { 'X-Api-Key': env.ASR_API_KEY } : { 'X-Api-App-Key': env.ASR_APP_ID, 'X-Api-Access-Key': env.ASR_ACCESS_KEY }),
  });
  const request = async (operation, id, body, signal) => {
    if (!configured) throw materialError('ASR_NOT_CONFIGURED', '录音转写服务尚未开通，请联系管理员。', 503);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const bounded = promise => new Promise((resolve, reject) => {
      const failed = () => reject(materialError('ASR_NETWORK', '语音服务连接中断或超时，请稍后重试。', 502));
      Promise.resolve(promise).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', failed));
      if (controller.signal.aborted) failed();
      else controller.signal.addEventListener('abort', failed, { once: true });
    });
    let response, reader;
    const cancel = () => { try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch {} };
    try {
    try { response = await bounded(fetchImpl(`https://openspeech.bytedance.com/api/v3/auc/bigmodel/${operation}`, {
      method: 'POST', headers: { ...headers(id), ...(operation === 'submit' ? { 'X-Api-Sequence': '-1' } : {}) },
      body: JSON.stringify(body), redirect: 'error', signal: controller.signal,
    })); } catch { throw materialError('ASR_NETWORK', '语音服务连接中断或超时，请稍后重试。', 502); }
    const code = response.headers.get('X-Api-Status-Code');
    if (response.ok && operation === 'query' && ['20000001', '20000002'].includes(code)) return null;
    if (!response.ok || code !== '20000000') {
      if (code === '20000003') throw materialError('AUDIO_NO_SPEECH', '没有识别到有效语音。', 422);
      throw materialError('ASR_FAILED', '语音服务未能完成转写，请检查服务配置或稍后重试。', 502);
    }
    if (operation === 'submit') return true;
    let size = 0; const chunks = [];
    if (!response.body) throw materialError('ASR_RESPONSE', '语音服务返回了空结果。', 502);
    reader = response.body.getReader();
    while (true) {
      const { value: chunk, done } = await bounded(reader.read());
      if (done) break;
      size += chunk.length;
      if (size > 8 * 1024 * 1024) throw materialError('ASR_RESPONSE_TOO_LARGE', '转写结果过大，请拆分录音。', 413);
      chunks.push(chunk);
    }
    try { return normalizeAsrResult(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch (e) { if (e.status) throw e; throw materialError('ASR_RESPONSE', '语音服务返回了无法读取的结果。', 502); }
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); cancel(); }
  };
  return {
    isEnabled: () => { try { const url = new URL(env.AUDIO_PUBLIC_BASE_URL); return configured && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'; } catch { return false; } },
    submit: ({ id, url, format, signal }) => request('submit', id, { user: { uid: id }, audio: { url, format }, request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: false, enable_speaker_info: true, show_utterances: true } }, signal),
    query: (id, signal) => request('query', id, {}, signal),
  };
};
