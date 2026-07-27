import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  deleteAttachmentFile,
  resolveStoredPath,
  saveResumeFile,
  validateResumeFile
} from '../services/reportAttachmentService.js';

const pdfFile = (overrides = {}) => ({
  originalname: 'resume.pdf',
  mimetype: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 sample resume'),
  size: 22,
  ...overrides
});

test('拒绝伪造 PDF 和扩展名不匹配的文件', () => {
  assert.throws(() => validateResumeFile(pdfFile({ buffer: Buffer.from('not-pdf'), size: 7 })), /Invalid PDF signature/);
  assert.throws(() => validateResumeFile(pdfFile({ originalname: 'resume.txt' })), /extension/);
});

test('拒绝超过 10 MB 和含 NUL 字节的文本', () => {
  assert.throws(() => validateResumeFile(pdfFile({ size: 10 * 1024 * 1024 + 1 })), /exceeds 10 MB/);
  assert.throws(() => validateResumeFile({
    originalname: 'resume.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from([65, 0, 66]),
    size: 3
  }), /Invalid text file/);
});

test('源文件使用随机安全路径保存、计算 SHA256 并可删除', async (t) => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'evalbar-resume-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));

  const file = pdfFile({ originalname: '../resume.pdf' });
  const saved = await saveResumeFile({
    rootDir,
    userId: 'user-1',
    reportId: 'report-1',
    file,
    parseStatus: 'usable'
  });

  assert.equal(saved.relativePath.includes('..'), false);
  assert.notEqual(saved.storedName, 'resume.pdf');
  assert.match(saved.storedName, /^[a-f0-9-]+\.pdf$/);
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  assert.equal(saved.originalName, 'resume.pdf');

  const absolutePath = resolveStoredPath(rootDir, saved.relativePath);
  assert.deepEqual(await readFile(absolutePath), file.buffer);
  assert.throws(() => resolveStoredPath(rootDir, '../outside.pdf'), /Unsafe attachment path/);

  assert.equal(await deleteAttachmentFile(rootDir, saved.relativePath), true);
  await assert.rejects(access(absolutePath));
});
