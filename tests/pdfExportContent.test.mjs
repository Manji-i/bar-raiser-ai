import assert from 'node:assert/strict';
import test from 'node:test';

const verificationModule = await import('../scripts/verify-pdf-export.mjs').catch(() => ({}));

test('PDF 提取文字覆盖每个章节且不是整页图片', async () => {
  assert.equal(typeof verificationModule.generateAndInspectFixture, 'function');
  const result = await verificationModule.generateAndInspectFixture('recruiter');
  assert.equal(result.missingMarkers.length, 0);
  assert.equal(result.duplicateMarkers.length, 0);
  assert.ok(result.pageCount >= 3 && result.pageCount <= 12);
  assert.ok(result.extractedChars >= 3500);
  assert.equal(result.fullPageImageCount, 0);
});

test('Candidate 和超长段落 PDF 文字可提取且无整页截图', async () => {
  assert.equal(typeof verificationModule.generateAndInspectFixture, 'function');
  for (const fixtureName of ['candidate', 'long-paragraph']) {
    const result = await verificationModule.generateAndInspectFixture(fixtureName);
    assert.equal(result.missingMarkers.length, 0);
    assert.equal(result.duplicateMarkers.length, 0);
    assert.ok(result.pageCount >= 1);
    assert.equal(result.fullPageImageCount, 0);
  }
});
