import assert from 'node:assert/strict';
import test from 'node:test';

import { safeMarkdownUrl } from '../services/markdownSecurity.ts';

test('只允许安全链接协议', () => {
  assert.equal(safeMarkdownUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(safeMarkdownUrl('mailto:user@example.com'), 'mailto:user@example.com');
  assert.equal(safeMarkdownUrl('/reports/1'), '/reports/1');
  assert.equal(safeMarkdownUrl('#section'), '#section');
  assert.equal(safeMarkdownUrl('javascript:alert(1)'), null);
  assert.equal(safeMarkdownUrl('data:text/html,attack'), null);
  assert.equal(safeMarkdownUrl('//evil.example/track'), null);
});
