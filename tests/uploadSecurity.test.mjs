import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import multer from 'multer';

test('特制 multipart 数组字段不会阻塞进程，后续请求仍可处理', async (t) => {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fields: 8, parts: 9, fieldArrayIndexLimit: 0 },
  });
  app.post('/upload', upload.single('resumeFile'), (req, res) => res.json({ ok: true }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(400).json({ code: error.code || 'INVALID_MULTIPART' });
  });
  app.get('/health', (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const form = new FormData();
  form.append('items[4294967294]', 'first');
  form.append('items[name]', 'second');
  const response = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(2_000),
  });
  assert.ok([200, 400, 413].includes(response.status));

  const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
});
