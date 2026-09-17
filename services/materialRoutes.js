import express from 'express';
import { AUDIO_CHUNK_BYTES, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, AUDIO_EXTENSIONS } from './materialAudio.js';
import { digest } from './materialManager.js';
import { parseMinutesUrl } from './feishuMinutes.js';
import { materialError } from './materialJobs.js';

export const createMaterialRouter = ({ authenticate, store, manager, feishu, asr, enableFeishu = false }) => {
  const router = express.Router();
  const sessionKey = req => digest(req.sessionToken);
  router.use((req, res, next) => { res.set('Cache-Control','no-store'); res.set('Referrer-Policy','no-referrer'); next(); });
  router.get('/audio-source/:id/:key', (req, res) => {
    const file = manager.providerFile(req.params.id, req.params.key);
    res.type('audio/wav').sendFile(file);
  });
  if (enableFeishu) router.get('/integrations/feishu/callback', async (req, res) => {
      res.clearCookie('evalbar_feishu_nonce', { path: '/api/integrations/feishu/callback' });
      try {
        await feishu.callback({ state: req.query.state, nonce: req.cookies?.evalbar_feishu_nonce, code: req.query.code, error: req.query.error });
        res.type('html').send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>飞书已连接</title><body><h1>飞书已连接</h1><p>请关闭此页面，返回 Eval Bar AI 导入妙记。</p></body></html>');
      } catch {
        res.status(400).type('html').send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>连接未完成</title><body><h1>飞书连接未完成</h1><p>请关闭此页，返回 Eval Bar AI 重新连接，并确认应用使用权限。</p></body></html>');
      }
    });
  router.use((req, res, next) => /^\/materials(\/|$)/.test(req.path) || (enableFeishu && /^\/integrations\/feishu(\/|$)/.test(req.path)) ? next() : next('router'));
  router.use(authenticate);
  router.use((req, res, next) => {
    const jsonPostPaths = enableFeishu ? ['/materials/audio', '/materials/feishu'] : ['/materials/audio'];
    if ((req.method === 'PATCH' || (req.method === 'POST' && jsonPostPaths.includes(req.path))) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return next(materialError('INVALID_REQUEST', '请提交有效的材料信息。'));
    next();
  });
  router.get('/materials/capabilities', (req, res) => res.json({
    audio: { enabled: asr.isEnabled(), maxBytes: MAX_AUDIO_BYTES, maxDurationSeconds: MAX_AUDIO_SECONDS, extensions: AUDIO_EXTENSIONS },
    ...(enableFeishu ? { feishu: { enabled: feishu.isEnabled(), connected: feishu.isConnected(sessionKey(req)) } } : {}),
  }));
  if (enableFeishu) {
    router.post('/integrations/feishu/connect', (req, res) => {
      const result = feishu.connect(sessionKey(req));
      res.cookie('evalbar_feishu_nonce', result.nonce, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/api/integrations/feishu/callback', maxAge: 300000 });
      res.json({ url: result.url });
    });
    router.delete('/integrations/feishu', (req, res) => { feishu.disconnect(sessionKey(req)); res.json({ success: true }); });
  }
  router.get('/materials', (req, res) => {
    if (!['candidate','recruiter'].includes(req.query.analysisMode)) throw materialError('INVALID_MODE','分析模式无效。');
    res.json(store.list(req.user.id, req.query.analysisMode));
  });
  router.post('/materials/audio', async (req, res) => res.status(201).json(await manager.createAudio(req.user.id, req.body)));
  router.put('/materials/:id/chunks/:index', (req, res, next) => { store.owned(req.params.id, req.user.id); next(); }, express.raw({ type: 'application/octet-stream', limit: AUDIO_CHUNK_BYTES }), async (req, res) => {
    if (!/^\d{1,3}$/.test(req.params.index)) throw materialError('INVALID_CHUNK','上传分块无效。');
    res.json(await manager.chunk(req.params.id, req.user.id, Number(req.params.index), req.body));
  });
  router.post('/materials/:id/submit', async (req, res) => res.json(await manager.submit(req.params.id, req.user.id)));
  if (enableFeishu) router.post('/materials/feishu', (req, res) => {
      parseMinutesUrl(req.body.url);
      res.status(202).json(manager.importFeishu(req.user.id, sessionKey(req), req.body));
    });
  router.get('/materials/:id', (req, res) => res.json(store.get(req.params.id, req.user.id)));
  router.patch('/materials/:id', (req, res) => res.json(store.confirm(req.params.id, req.user.id, req.body)));
  router.post('/materials/:id/retry', (req, res) => res.json(manager.retry(req.params.id, req.user.id, sessionKey(req))));
  router.post('/materials/:id/cancel', (req, res) => res.json(manager.cancel(req.params.id, req.user.id)));
  router.get('/materials/:id/audio', (req, res) => res.sendFile(manager.audioFile(req.params.id, req.user.id)));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.status || 500;
    res.status(status).json({ error: error.status ? error.message : status === 413 ? '上传分块超过大小限制。' : '材料服务暂时不可用，请稍后重试。', code: error.code || 'MATERIAL_ERROR' });
  });
  return router;
};
