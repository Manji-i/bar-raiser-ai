import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getListenHost } from '../services/serverConfig.js';

test('Node 默认只监听回环地址，显式 HOST 可以覆盖', () => {
  assert.equal(getListenHost({}), '127.0.0.1');
  assert.equal(getListenHost({ HOST: '0.0.0.0' }), '0.0.0.0');
});

test('生产文档不再把公网 HTTP 3000 作为入口', () => {
  for (const path of [
    '../AGENTS.md',
    '../DEPLOYMENT.md',
    '../docs/operator-runbook.md',
    '../docs/handoff.md',
  ]) {
    const content = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(content, /http:\/\/(?:14\.103\.45\.4|evalbar\.cn)(?::3000)?/);
    assert.match(content, /https:\/\/evalbar\.cn/);
  }
});
