import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  bindClientDisconnect,
  executeAnalysis,
} from '../services/analysisExecution.js';

test('客户端提前断开时取消上游，但只在上游结束后释放并发锁', async () => {
  const response = new EventEmitter();
  response.writableEnded = false;
  const controller = bindClientDisconnect(response);
  const events = [];
  let settleUpstream;
  const upstream = new Promise((resolve, reject) => {
    settleUpstream = () => reject(Object.assign(new Error('aborted'), {
      code: 'AI_REQUEST_CANCELLED',
      status: 499,
    }));
  });

  const execution = executeAnalysis({
    run: () => upstream,
    validate: (value) => value,
    persist: async (value) => value,
    signal: controller.signal,
    telemetry: {
      succeed: () => events.push('success'),
      fail: () => events.push('failure'),
      cancel: () => events.push('cancelled'),
    },
    release: () => events.push('released'),
  });

  response.emit('close');
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(events, []);

  settleUpstream();
  await assert.rejects(execution, (error) => error.code === 'AI_REQUEST_CANCELLED');
  assert.deepEqual(events, ['cancelled', 'released']);
});

test('成功日志在报告持久化后记录，并始终释放并发锁', async () => {
  const events = [];
  const result = await executeAnalysis({
    run: async () => 'raw report',
    validate: (value) => {
      events.push('validated');
      return value.toUpperCase();
    },
    persist: async (value) => {
      events.push('persisted');
      return { value };
    },
    telemetry: {
      succeed: (length) => events.push(`success:${length}`),
      fail: () => events.push('failure'),
      cancel: () => events.push('cancelled'),
    },
    release: () => events.push('released'),
  });

  assert.deepEqual(result, { value: 'RAW REPORT' });
  assert.deepEqual(events, ['validated', 'persisted', 'success:10', 'released']);
});

test('普通失败记录稳定错误码，不伪装成取消', async () => {
  const events = [];
  const error = Object.assign(new Error('provider detail'), {
    code: 'AI_UPSTREAM_TIMEOUT',
    status: 504,
  });

  await assert.rejects(executeAnalysis({
    run: async () => { throw error; },
    validate: (value) => value,
    persist: async (value) => value,
    telemetry: {
      succeed: () => events.push('success'),
      fail: (code) => events.push(`failure:${code}`),
      cancel: () => events.push('cancelled'),
    },
    release: () => events.push('released'),
  }), error);

  assert.deepEqual(events, ['failure:AI_UPSTREAM_TIMEOUT', 'released']);
});

test('正常响应关闭不会触发取消，dispose 会移除监听器', () => {
  const response = new EventEmitter();
  response.writableEnded = true;
  const controller = bindClientDisconnect(response);

  response.emit('close');
  assert.equal(controller.signal.aborted, false);

  controller.dispose();
  response.writableEnded = false;
  response.emit('close');
  assert.equal(controller.signal.aborted, false);
});
