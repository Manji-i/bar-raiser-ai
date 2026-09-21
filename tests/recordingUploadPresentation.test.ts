import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatRecordingFileSize,
  getRecordingUploadPresentation,
  shouldOpenRecordingPicker,
} from '../components/recordingUploadPresentation.ts';

test('选择文件后仍需授权才允许主动上传', () => {
  assert.deepEqual(
    getRecordingUploadPresentation({ hasFile: true, consent: false, busy: false }),
    { canReplace: true, canSubmit: false, step: 'selected' },
  );
  assert.deepEqual(
    getRecordingUploadPresentation({ hasFile: true, consent: true, busy: false }),
    { canReplace: true, canSubmit: true, step: 'selected' },
  );
});

test('无文件或正在处理时不能提交', () => {
  assert.deepEqual(
    getRecordingUploadPresentation({ hasFile: false, consent: true, busy: false }),
    { canReplace: false, canSubmit: false, step: 'empty' },
  );
  assert.deepEqual(
    getRecordingUploadPresentation({ hasFile: true, consent: true, busy: true }),
    { canReplace: false, canSubmit: false, step: 'selected' },
  );
});

test('文件选择区支持标准键盘触发键', () => {
  assert.equal(shouldOpenRecordingPicker('Enter'), true);
  assert.equal(shouldOpenRecordingPicker(' '), true);
  assert.equal(shouldOpenRecordingPicker('Escape'), false);
});

test('文件大小使用易读单位且不夸大精度', () => {
  assert.equal(formatRecordingFileSize(512), '512 B');
  assert.equal(formatRecordingFileSize(1.5 * 1024 ** 2), '1.5 MB');
  assert.equal(formatRecordingFileSize(86.4 * 1024 ** 2), '86.4 MB');
});
