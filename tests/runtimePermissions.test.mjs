import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('运行时在创建敏感文件前把默认权限收紧为 0077', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'evalbar-permissions-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, 'private.txt');
  const moduleUrl = new URL('../services/runtimePermissions.js', import.meta.url).href;
  const script = `
    import ${JSON.stringify(moduleUrl)};
    const { writeFile, stat } = await import('node:fs/promises');
    await writeFile(${JSON.stringify(target)}, 'synthetic');
    const info = await stat(${JSON.stringify(target)});
    process.stdout.write(JSON.stringify({ umask: process.umask(), mode: info.mode & 0o777 }));
  `;

  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script]);
  assert.deepEqual(JSON.parse(stdout), { umask: 0o077, mode: 0o600 });
  assert.equal(await readFile(target, 'utf8'), 'synthetic');
});
