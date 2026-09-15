import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMaterialStore } from '../services/materialJobs.js';
import { createMaterialManager } from '../services/materialManager.js';
import { AUDIO_CHUNK_BYTES } from '../services/materialAudio.js';

async function fixture(t, overrides={}) {
  const db=new DatabaseSync(':memory:');
  const root=await mkdtemp(path.join(tmpdir(),'evalbar-material-test-'));
  t.after(async()=>{db.close();await rm(root,{recursive:true,force:true});});
  let time=100000;
  const store=createMaterialStore(db,{now:()=>time});
  let submits=0; let queries=0;
  const asr={isEnabled:()=>true,submit:async()=>{submits++;},query:async()=>{queries++;return {transcript:'合成测试面试文本',segments:[]};},...overrides.asr};
  const feishu={isConnected:()=>true,importTranscript:async()=>({transcript:'飞书合成内容',segments:[]})};
  const args={store,root,asr,feishu,now:()=>time,env:{AUDIO_PUBLIC_BASE_URL:'https://evalbar.cn'},prepare:async(file)=>({filePath:file,format:'wav',durationSeconds:5})};
  return {store,root,manager:createMaterialManager(args),restart:()=>createMaterialManager(args),advance:n=>{time+=n;},counts:()=>({submits,queries})};
}
test('集中重试同样受全局二十个在途任务上限限制', async t => {
  const f = await fixture(t);
  const jobs = [];
  for (let i = 0; i < 21; i++) {
    const job = f.manager.importFeishu(`user-${i}`, 'session', { analysisMode: 'candidate', url: 'https://example.feishu.cn/minutes/abcdefghijklmnopqrstuvwx' });
    f.store.update(job.id, { status: 'failed' });
    jobs.push(job);
  }
  for (let i = 0; i < 20; i++) f.manager.retry(jobs[i].id, `user-${i}`, 'session');
  assert.throws(() => f.manager.retry(jobs[20].id, 'user-20', 'session'), error => error.code === 'MATERIAL_CAPACITY');
  assert.equal(f.store.pending().length, 20);
  assert.equal(f.store.get(jobs[20].id, 'user-20').status, 'failed');
});
test('提交检查文件期间取消任务，不会重新排队或产生转写请求', async t => {
  const f = await fixture(t);
  const job = await f.manager.createAudio('u', { analysisMode: 'candidate', fileName: 'a.wav', sizeBytes: 3 });
  await f.manager.chunk(job.id, 'u', 0, Buffer.from('abc'));
  const submitting = f.manager.submit(job.id, 'u');
  const canceled = f.manager.cancel(job.id, 'u');
  assert.equal(canceled.status, 'failed');
  await assert.rejects(submitting, error => error.code === 'UPLOAD_STATE');
  assert.equal(f.store.get(job.id, 'u').status, 'failed');
  assert.equal(f.store.get(job.id, 'u').error.code, 'MATERIAL_CANCELLED');
  await f.manager.tick();
  assert.equal(f.counts().submits, 0);
});
test('分块顺序、跨用户、幂等重传与重复submit不重复付费',async t=>{
  const f=await fixture(t);
  const job=await f.manager.createAudio('u',{analysisMode:'candidate',fileName:'audio.mp3',sizeBytes:AUDIO_CHUNK_BYTES+3});
  const chunk=Buffer.alloc(AUDIO_CHUNK_BYTES,1);
  await assert.rejects(f.manager.chunk(job.id,'other',0,chunk),e=>e.status===404);
  await assert.rejects(f.manager.chunk(job.id,'u',1,Buffer.from('end')),e=>e.code==='CHUNK_ORDER');
  await f.manager.chunk(job.id,'u',0,chunk);
  await f.manager.chunk(job.id,'u',0,chunk);
  await assert.rejects(f.manager.chunk(job.id,'u',0,Buffer.alloc(AUDIO_CHUNK_BYTES,2)),e=>e.code==='CHUNK_MISMATCH');
  await assert.rejects(f.manager.submit(job.id,'u'),e=>e.code==='UPLOAD_INCOMPLETE');
  await f.manager.chunk(job.id,'u',1,Buffer.from('end'));
  await f.manager.submit(job.id,'u');
  await f.manager.submit(job.id,'u');
  await f.manager.tick();
  const submitted=f.store.internal(job.id);
  assert.equal(submitted.status,'transcribing');
  assert.equal(f.counts().submits,1);
  f.advance(6000);
  await f.restart().tick();
  assert.equal(f.counts().submits,1);
  assert.equal(f.store.get(job.id,'u').status,'ready');
  assert.equal(f.store.internal(job.id).mediaTokenHash,null);
  const data=await readFile(path.join(f.root,job.id,'source.mp3'));
  assert.equal(data.length,AUDIO_CHUNK_BYTES+3);
});
test('重启不重复提交不确定任务，显式重试有限额',async t=>{
  const f=await fixture(t);
  const job=await f.manager.createAudio('u',{analysisMode:'candidate',fileName:'a.wav',sizeBytes:3});
  await f.manager.chunk(job.id,'u',0,Buffer.from('abc'));
  await f.manager.submit(job.id,'u');
  f.store.update(job.id,{submitting:true,status:'transcribing',providerId:'provider'});
  await f.restart().tick();
  assert.equal(f.store.get(job.id,'u').error.code,'ASR_SUBMIT_UNCERTAIN');
  assert.equal(f.counts().submits,0);
  f.manager.retry(job.id,'u','session');
  await f.manager.tick();
  assert.equal(f.counts().submits,0);
  assert.equal(f.counts().queries,1);
  assert.equal(f.store.get(job.id,'u').status,'ready');
});
test('取消可停止在途任务且迟到结果不复活材料',async t=>{
  let finish;
  const f=await fixture(t,{asr:{submit:()=>new Promise(resolve=>{finish=resolve;})}});
  const job=await f.manager.createAudio('u',{analysisMode:'candidate',fileName:'a.wav',sizeBytes:3});
  await f.manager.chunk(job.id,'u',0,Buffer.from('abc'));
  await f.manager.submit(job.id,'u');
  const pending=f.manager.tick();
  while(!finish) await new Promise(resolve=>setImmediate(resolve));
  f.manager.cancel(job.id,'u');
  finish();await pending;
  assert.equal(f.store.get(job.id,'u').error.code,'MATERIAL_CANCELLED');
});
test('过期清理仅作用于材料随机目录，链接导入重启需重新授权',async t=>{
  const f=await fixture(t);
  const outside=path.join(f.root,'keep.txt'); await writeFile(outside,'keep');
  const job=f.manager.importFeishu('u','session',{analysisMode:'candidate',url:'https://x.feishu.cn/minutes/abcdefghijklmnopqrstuvwx'});
  await f.restart().tick();
  assert.equal(f.store.get(job.id,'u').error.code,'FEISHU_CONNECT_REQUIRED');
  f.advance(86400001);await f.manager.cleanup();
  assert.equal(f.store.internal(job.id),null);
  assert.equal(await readFile(outside,'utf8'),'keep');
});

test('查询网络错误后重试沿用任务编号，不重复提交', async t => {
  let count=0;
  const f=await fixture(t,{asr:{query:async()=>{ if(!count++) throw new Error('network'); return {transcript:'成功恢复',segments:[]}; }}});
  const job=await f.manager.createAudio('u',{analysisMode:'candidate',fileName:'a.wav',sizeBytes:3});
  await f.manager.chunk(job.id,'u',0,Buffer.from('abc'));
  await f.manager.submit(job.id,'u'); await f.manager.tick();
  const providerId=f.store.internal(job.id).providerId;
  const mediaHash=f.store.internal(job.id).mediaTokenHash;
  f.advance(6000);await f.manager.tick();
  assert.equal(f.store.get(job.id,'u').status,'failed');
  assert.equal(f.store.internal(job.id).mediaTokenHash,mediaHash);
  f.manager.retry(job.id,'u','session');await f.manager.tick();
  assert.equal(f.store.internal(job.id).providerId,providerId);
  assert.equal(f.store.get(job.id,'u').transcript,'成功恢复');
  assert.equal(f.counts().submits,1);
});

test('前一个任务运行时取消后续排队任务不会被旧快照复活', async t => {
  let finish;
  const f=await fixture(t,{asr:{submit:()=>new Promise(resolve=>{finish=resolve;})}});
  const first=await f.manager.createAudio('u',{analysisMode:'candidate',fileName:'a.wav',sizeBytes:3});
  await f.manager.chunk(first.id,'u',0,Buffer.from('abc'));
  await f.manager.submit(first.id,'u');
  const second=f.manager.importFeishu('v','session-v',{analysisMode:'candidate',url:'https://x.feishu.cn/minutes/abcdefghijklmnopqrstuvwx'});
  const ticking=f.manager.tick();
  while(!finish) await new Promise(resolve=>setImmediate(resolve));
  f.manager.cancel(second.id,'v');finish();await ticking;
  assert.equal(f.store.get(second.id,'v').status,'failed');
});

test('共享材料最后一份报告删除后才清理录音和转写，保留其他报告来源', async t => {
  const f=await fixture(t);
  const job=await f.manager.createAudio('u',{analysisMode:'candidate',fileName:'a.wav',sizeBytes:3});
  await f.manager.chunk(job.id,'u',0,Buffer.from('abc'));
  f.store.update(job.id,{status:'ready',transcript:'原始面试文本'});
  f.store.confirm(job.id,'u',{confirmed:true,transcript:'确认的面试文本'});
  f.store.linkReport(job.id,'u','candidate','确认的面试文本','report-1');
  f.store.linkReport(job.id,'u','candidate','确认的面试文本','report-2');
  await f.manager.deleteReportSources('report-1');
  assert.equal(f.store.forReport('report-1').length,0);
  assert.equal(f.store.forReport('report-2').length,1);
  await f.manager.deleteReportSources('report-2');
  assert.equal(f.store.internal(job.id),null);
  await assert.rejects(readFile(path.join(f.root,job.id,'source.wav')),e=>e.code==='ENOENT');
});
