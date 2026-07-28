import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const initializeInChild = (databasePath, startAt) => new Promise((resolve, reject) => {
  const script = `
    import { DatabaseSync } from 'node:sqlite';
    import { initializeSchema } from './services/schema.js';
    const databasePath = process.argv[1];
    const startAt = Number(process.argv[2]);
    while (Date.now() < startAt) {}
    const database = new DatabaseSync(databasePath);
    try {
      initializeSchema(database);
    } finally {
      database.close();
    }
  `;
  const child = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    script,
    databasePath,
    String(startAt),
  ], { cwd: projectRoot });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(stderr || `schema initializer exited with ${code}`));
  });
});

test('schema initialization is safe across concurrent processes', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'evalbar-schema-concurrency-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'app.db');
  const startAt = Date.now() + 300;

  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () => initializeInChild(databasePath, startAt)),
  );
  const failures = results.filter((result) => result.status === 'rejected');

  assert.equal(
    failures.length,
    0,
    failures.map((result) => result.reason.message).join('\n'),
  );
});
