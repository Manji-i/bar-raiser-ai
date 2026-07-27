import assert from 'node:assert/strict';
import test from 'node:test';

import { assessParseQuality } from '../services/parseQuality.ts';

test('空文本标记 empty', () => {
  assert.equal(assessParseQuality('', 1).status, 'empty');
});

test('每页文本过少标记 low_quality', () => {
  assert.equal(assessParseQuality('产品经理'.repeat(20), 3).status, 'low_quality');
});

test('乱码比例过高标记 low_quality', () => {
  const text = `${'产品经理项目经验'.repeat(30)}${'�'.repeat(50)}`;
  assert.equal(assessParseQuality(text, 1).status, 'low_quality');
});

test('正常中文简历可用', () => {
  const text = '高级产品经理，负责增长策略、数据分析与跨团队项目交付。'.repeat(20);
  assert.equal(assessParseQuality(text, 1).status, 'usable');
});
