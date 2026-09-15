import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createMaterialStore } from '../services/materialJobs.js';
import { initializeSchema } from '../services/schema.js';
import { createReportService } from '../services/reportService.js';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  let time = 100000;
  return { store: createMaterialStore(db, { now: () => time }), advance: n => { time += n; } };
}
test('材料只能由所属用户和相同模式确认与分析', t => {
  const { store } = fixture(t);
  const job = store.create('u1', { analysisMode: 'candidate', source: 'feishu', fileName: '测试妙记' });
  assert.throws(() => store.get(job.id, 'u2'), e => e.status === 404);
  store.update(job.id, { status: 'ready', transcript: '原始逐字内容', segments: [] });
  assert.throws(() => store.forAnalysis(job.id, 'u1', 'candidate'), /确认/);
  store.confirm(job.id, 'u1', { transcript: '修订后的内容', speakerRoles: {}, confirmed: true });
  assert.throws(() => store.forAnalysis(job.id, 'u1', 'recruiter'), /模式/);
  assert.equal(store.forAnalysis(job.id, 'u1', 'candidate').transcript, '修订后的内容');
  assert.equal(store.internal(job.id).originalTranscript, '原始逐字内容');
});
test('拒绝过期任务、空稿、超长稿和伪造状态', t => {
  const { store, advance } = fixture(t);
  const job = store.create('u', { analysisMode: 'recruiter', source: 'audio', fileName: 'x.mp3', sizeBytes: 20 });
  assert.throws(() => store.confirm(job.id, 'u', { transcript: 'abc', confirmed: true }), /完成/);
  store.update(job.id, { status: 'ready', transcript: '原文' });
  for (const transcript of ['', 'a'.repeat(100001)]) {
    assert.throws(() => store.confirm(job.id, 'u', { transcript, confirmed: true }), /文字/);
  }
  advance(86400001);
  assert.throws(() => store.get(job.id, 'u'), e => e.status === 410);
});
test('配额持久化并限制在途任务，公开输出不泄露供应商凭证', t => {
  const { store } = fixture(t);
  const job = store.create('u', { analysisMode: 'candidate', source: 'audio', fileName: 'x.mp3', sizeBytes: 10 });
  assert.throws(() => store.create('u', { analysisMode: 'candidate', source: 'audio', fileName: 'y.mp3', sizeBytes: 10 }), e => e.status === 429);
  store.update(job.id, { mediaTokenHash: 'secret-digest', providerId: 'provider-private', localPath: '/private/file', status: 'ready', transcript: '文本' });
  const publicJob = store.get(job.id, 'u');
  assert.equal(JSON.stringify(publicJob).includes('secret-digest'), false);
  assert.equal(JSON.stringify(publicJob).includes('/private'), false);
  assert.equal(store.list('other', 'candidate').length, 0);
});
test('报告和材料关联在同一事务中提交，关联失败不会留下孤立报告', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  initializeSchema(db);
  const store = createMaterialStore(db);
  const reports = createReportService(db);
  const material = store.create('user', { source: 'feishu', analysisMode: 'candidate', fileName: '合成事务测试' });
  store.update(material.id, { status: 'ready', transcript: '合成确认稿' });
  store.confirm(material.id, 'user', { confirmed: true, transcript: '合成确认稿', speakerRoles: {} });
  const data = { analysisMode: 'candidate', jobTitle: '合成岗位', transcript: '合成确认稿', result: '合成报告' };
  assert.throws(() => reports.create(data, 'user', null, id => store.linkReport(material.id, 'user', 'candidate', '过期的确认稿', id)), error => error.code === 'MATERIAL_CHANGED');
  assert.equal(reports.getByUser('user').length, 0);
  const report = reports.create(data, 'user', null, id => store.linkReport(material.id, 'user', 'candidate', data.transcript, id));
  assert.equal(reports.getByUser('user').length, 1);
  assert.equal(store.forReport(report.id)[0].id, material.id);
});
