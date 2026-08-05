import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applySecurityHeaders,
  isAllowedOrigin,
} from '../services/httpSecurity.js';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('安全响应头关闭技术指纹并限制脚本、框架和 MIME', () => {
  const headers = new Map();
  const res = { setHeader: (key, value) => headers.set(key, value) };

  applySecurityHeaders(res);

  assert.match(headers.get('Content-Security-Policy'), /default-src 'self'/);
  assert.match(headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
});

test('只允许规范生产域名和本地开发 Origin', () => {
  assert.equal(isAllowedOrigin('https://evalbar.cn'), true);
  assert.equal(isAllowedOrigin('https://www.evalbar.cn'), true);
  assert.equal(isAllowedOrigin('http://localhost:5173'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173'), true);
  assert.equal(isAllowedOrigin('https://evil.example'), false);
  assert.equal(isAllowedOrigin('https://evalbar.cn.evil.example'), false);
});

test('Express 关闭宽松 CORS、技术指纹和 API HTML 回退', () => {
  assert.equal(packageJson.dependencies.cors, undefined);
  assert.doesNotMatch(serverSource, /app\.use\(cors\(\)\)/);
  assert.match(serverSource, /app\.disable\(['"]x-powered-by['"]\)/);
  assert.match(serverSource, /ORIGIN_NOT_ALLOWED/);
  assert.match(serverSource, /API_NOT_FOUND/);
  assert.match(serverSource, /Registration failed/);
});
