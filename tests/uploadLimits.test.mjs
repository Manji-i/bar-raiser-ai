import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('JSON 和 multipart 请求具有固定资源上限', () => {
  assert.match(serverSource, /express\.json\(\{ limit: ['"]512kb['"] \}\)/);
  assert.match(serverSource, /files:\s*1/);
  assert.match(serverSource, /fields:\s*7/);
  assert.match(serverSource, /parts:\s*8/);
  assert.match(serverSource, /fieldSize:\s*200 \* 1024/);
  assert.match(serverSource, /fileSize:\s*10 \* 1024 \* 1024/);
});

test('资源超限映射为稳定的 413 错误码', () => {
  assert.match(serverSource, /RESUME_TOO_LARGE/);
  assert.match(serverSource, /MULTIPART_LIMIT_EXCEEDED/);
  assert.match(serverSource, /REQUEST_TOO_LARGE/);
  assert.match(serverSource, /status\(413\)/);
});
