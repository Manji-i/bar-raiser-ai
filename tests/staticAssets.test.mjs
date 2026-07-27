import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const recruiterUpload = readFileSync(
  new URL('../components/FileUpload.tsx', import.meta.url),
  'utf8',
);

test('页面入口不引用不存在的 index.css', () => {
  assert.doesNotMatch(indexHtml, /href=["']\/index\.css["']/);
});

test('招聘方上传页不使用未安装的 Tailwind 动画或未定义工具类', () => {
  assert.doesNotMatch(
    recruiterUpload,
    /\b(?:animate-in|fade-in|slide-in-from-[^\s"'`]+|hide-scrollbar)\b/,
  );
});
