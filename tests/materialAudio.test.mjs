import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { prepareAudio } from '../services/materialAudio.js';
import { validateAudioName, sniffAudio, normalizeAsrResult, createAsrProvider } from '../services/materialAudio.js';

test('音频扩展名和文件头独立校验', () => {
  assert.equal(validateAudioName('面试.M4A'), '.m4a');
  assert.throws(() => validateAudioName('../x.mp3'), /文件名/);
  assert.throws(() => validateAudioName('x.html'), /格式/);
  assert.equal(sniffAudio(Buffer.from('RIFF0000WAVE'), '.wav'), 'wav');
  assert.throws(() => sniffAudio(Buffer.from('<html>fake audio'), '.mp3'), /格式/);
  assert.throws(() => sniffAudio(Buffer.from('ID3xx'), '.m4a'), /格式/);
});

test('ASR 响应停滞和不结束的取消操作不会卡住处理队列', async () => {
  const env = { ASR_API_KEY: 'test', AUDIO_PUBLIC_BASE_URL: 'https://evalbar.cn' };
  const hanging = () => new Response(new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => new Promise(() => {}) }), { headers: { 'X-Api-Status-Code': '20000000' } });
  const provider = createAsrProvider({ env, timeoutMs: 20, fetchImpl: async () => hanging() });
  await assert.rejects(provider.query('id'), error => error.code === 'ASR_NETWORK');
  assert.equal(await provider.submit({ id: 'id', url: 'https://evalbar.cn/test', format: 'wav' }), true);
  assert.equal(createAsrProvider({ env: { ...env, AUDIO_PUBLIC_BASE_URL: 'http://localhost/' } }).isEnabled(), false);
});

test('四种真实音频格式转换为单声道 PCM WAV，损坏音频拒绝', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'evalbar-audio-fixture-'));
  try {
    for (const ext of ['wav', 'mp3', 'm4a', 'ogg']) {
      const source = path.join(directory, `synthetic.${ext}`);
      execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', source]);
      const result = await prepareAudio(source, `synthetic.${ext}`);
      assert.equal(result.format, 'wav');
      assert.ok(result.durationSeconds > 0 && result.durationSeconds < 2);
    }
    const invalid = path.join(directory, 'invalid.wav');
    await writeFile(invalid, 'RIFF0000WAVEbroken');
    await assert.rejects(prepareAudio(invalid, 'invalid.wav'), error => ['AUDIO_INVALID', 'AUDIO_DURATION'].includes(error.code));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('ASR 保留时间戳和说话人，未知身份不推断，拒绝空和超长文字', () => {
  const result = normalizeAsrResult({ audio_info: { duration: 12000 }, result: { text: '你好', utterances: [{ text: '你好', start_time: 1, end_time: 100, additions: { speaker: '2' } }] } });
  assert.equal(result.segments[0].speaker, '2');
  assert.equal(result.segments[0].startMs, 1);
  assert.throws(() => normalizeAsrResult({ result: { text: '' } }), /有效/);
  assert.throws(() => normalizeAsrResult({ result: { text: 'a'.repeat(100001) } }), /上限/);
});
test('submit 空 body 按响应头成功，query 区分处理中和静音，不回传供应商内容', async () => {
  const calls = [];
  let response = new Response(null, { headers: { 'X-Api-Status-Code': '20000000' } });
  const provider = createAsrProvider({ env: { ASR_API_KEY: 'test-key', AUDIO_PUBLIC_BASE_URL: 'https://evalbar.cn' }, fetchImpl: async (url, init) => { calls.push({ url, init }); return response; } });
  await provider.submit({ id: 'test-id', url: 'https://evalbar.cn/api/audio-source/opaque', format: 'mp3' });
  assert.equal(calls[0].init.headers['X-Api-Key'], 'test-key');
  assert.equal(JSON.parse(calls[0].init.body).request.enable_ddc, false);
  response = new Response(null, { headers: { 'X-Api-Status-Code': '20000001' } });
  assert.equal(await provider.query('test-id'), null);
  response = new Response('sensitive provider detail', { headers: { 'X-Api-Status-Code': '20000003' } });
  await assert.rejects(provider.query('test-id'), e => e.code === 'AUDIO_NO_SPEECH' && !e.message.includes('sensitive'));
});
