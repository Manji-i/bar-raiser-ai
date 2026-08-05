import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createConcurrencyGuard,
  createWindowGuard,
} from '../services/requestGuards.js';

test('窗口额度在阈值后拒绝，窗口结束后恢复', () => {
  let now = 0;
  const guard = createWindowGuard({ windowMs: 1000, max: 2, now: () => now });

  assert.equal(guard.consume('user-1').allowed, true);
  assert.equal(guard.consume('user-1').allowed, true);
  const rejected = guard.consume('user-1');
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.retryAfterMs, 1000);

  now = 1001;
  assert.equal(guard.consume('user-1').allowed, true);
});

test('窗口守卫拒绝空键和超长键', () => {
  const guard = createWindowGuard({ windowMs: 1000, max: 1 });

  assert.throws(() => guard.consume(''), /key/);
  assert.throws(() => guard.consume('x'.repeat(257)), /key/);
});

test('单用户分析只允许一个并发并在释放后恢复', () => {
  const guard = createConcurrencyGuard({ max: 1 });
  const release = guard.acquire('user-1');

  assert.equal(typeof release, 'function');
  assert.equal(guard.acquire('user-1'), null);
  release();
  release();
  assert.equal(typeof guard.acquire('user-1'), 'function');
});
