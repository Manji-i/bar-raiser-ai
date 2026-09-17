import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AnalysisMode } from '../types';
import { useAuth } from '../src/context/AuthContext';
import { Button, Card, Input } from './ui';
import { effectiveCharacterCount, formatRoleTranscript, updateDraftRole, materialClient, validateAudioFile } from '../services/materialClient';
import type { ImportedMaterial, MaterialCapabilities, MaterialJob, SpeakerRole } from '../services/materialClient';

interface Props {
  mode: AnalysisMode;
  onImported: (material: ImportedMaterial) => void;
  onInvalidated: () => void;
}
const statusLabels: Record<MaterialJob['status'], string> = {
  uploading: '正在上传', queued: '已进入后台处理队列', transcribing: '正在生成逐字稿', ready: '逐字稿已就绪，请检查确认', failed: '处理未完成',
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '请求失败，请稍后重试。';

const RecordingImportSession: React.FC<Props> = ({ mode, onImported, onInvalidated }) => {
  const [capabilities, setCapabilities] = useState<MaterialCapabilities | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [job, setJob] = useState<MaterialJob | null>(null);
  const [draft, setDraft] = useState('');
  const [roles, setRoles] = useState<Record<string, SpeakerRole>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [restored, setRestored] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const draftDirty = useRef(false);
  const currentJob = useRef<MaterialJob | null>(null);

  function receiveJob(next: MaterialJob) {
    const previous = currentJob.current;
    if (previous?.id !== next.id || (previous.status !== 'ready' && next.status === 'ready' && !draftDirty.current)) {
      setDraft(!next.confirmed && next.segments?.length ? formatRoleTranscript(next.segments, next.speakerRoles || {}) : next.transcript || '');
      setRoles(next.speakerRoles || {});
      draftDirty.current = false;
      setSaved(false);
    }
    currentJob.current = next;
    setJob(next);
    setUploadedBytes(next.uploadedBytes || 0);
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([materialClient.capabilities(controller.signal), materialClient.list(mode, controller.signal)]).then(results => {
      if (controller.signal.aborted) return;
      if (results[0].status === 'fulfilled') setCapabilities(results[0].value);
      else setError(errorMessage(results[0].reason));
      if (results[1].status === 'fulfilled') {
        const recent = results[1].value.filter(item => item.source === 'audio' && item.expiresAt > Date.now() && item.error?.code !== 'MATERIAL_CANCELLED').sort((a, b) => b.createdAt - a.createdAt)[0];
        if (recent) { receiveJob(recent); setRestored(true); }
      } else setError(errorMessage(results[1].reason));
      setInitializing(false);
    });
    return () => { controller.abort(); operation.current?.abort(); };
  }, [mode]);

  useEffect(() => {
    if (!job || !['queued', 'transcribing'].includes(job.status)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await materialClient.get(job!.id, controller.signal);
        if (!controller.signal.aborted) { receiveJob(next); setError(null); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    }
    timer = setTimeout(poll, 2000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [job?.id, job?.status]);

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setError(null);
    try { await action(controller.signal); }
    catch (failure) { if (!controller.signal.aborted) setError(errorMessage(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function invalidate() { draftDirty.current = true; setSaved(false); onInvalidated(); }
  function upload(file: File) {
    const validation = validateAudioFile(file);
    if (validation) { setError(validation); return; }
    onInvalidated(); setRestored(false);
    void run(async signal => {
      await materialClient.uploadAudio(file, mode, { signal, onJob: receiveJob, onProgress: setUploadedBytes });
    });
  }
  function abandon() {
    if (!job) return;
    operation.current?.abort();
    const id = job.id;
    void run(async signal => {
      if (job.status !== 'ready') await materialClient.cancel(id, signal);
      currentJob.current = null; setJob(null); setDraft(''); setRoles({}); setSaved(false); setRestored(false); draftDirty.current = false; onInvalidated();
    });
  }
  const speakers = [...new Set((job?.segments || []).map(segment => segment.speaker))];
  const processing = job && ['queued', 'transcribing'].includes(job.status);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-brand-600" />
        <p>请确认你有权处理这段面试材料。录音会送至语音转写服务，逐字稿在确认后用于 AI 分析；临时音频最多保留 24 小时。当前功能只分析回答文字。</p>
      </div>
      {initializing && <p className="flex items-center gap-2 text-slate-600"><Loader2 className="w-5 h-5 animate-spin" /> 正在检查服务和恢复任务…</p>}
      {!initializing && !capabilities && <Button type="button" variant="secondary" onClick={() => void run(async signal => setCapabilities(await materialClient.capabilities(signal)))} disabled={busy}>重新检查服务</Button>}
      {!initializing && capabilities && !job && (
        <Card compact className="space-y-4">
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">上传面试录音</h3>
          {capabilities.audio.enabled ? <>
            <p className="text-base text-slate-600">支持 MP3、M4A、WAV、OGG，最大 100 MB、最长 60 分钟。</p>
            <label className="flex items-start gap-3 text-sm leading-6 text-slate-700"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1.5 accent-indigo-500" />我有权使用此材料，并同意上述处理方式。</label>
            <Input aria-label="选择面试录音" type="file" accept=".mp3,.m4a,.wav,.ogg" disabled={!consent || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload(file); }} />
          </> : <p className="text-base text-slate-600">录音转写服务尚未配置。你可以继续上传文字文件或粘贴面试记录。</p>}
        </Card>
      )}
      {job && (
        <Card compact className="space-y-5">
          <div><h3 className="text-lg font-semibold tracking-tight text-slate-900 break-all">{job.fileName}</h3><p role="status" className="mt-2 text-base text-slate-600">{statusLabels[job.status]}</p></div>
          {restored && <p className="text-sm text-slate-500">已恢复最近的任务。检查并点击“保存确认稿并用于分析”后，才会更新当前表单。</p>}
          {job.status === 'uploading' && <div className="space-y-2"><progress className="w-full accent-indigo-500" value={uploadedBytes} max={job.sizeBytes} aria-label="音频上传进度" /><p className="text-sm text-slate-600">已上传 {Math.round(uploadedBytes / Math.max(job.sizeBytes, 1) * 100)}%{!busy && '。上传尚未完成，请放弃后重新选择文件。'}</p></div>}
          {processing && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="w-4 h-4 animate-spin" /> 后台会继续处理，你可以稍后回来查看。</p>}
          {job.status === 'failed' && <div className="space-y-3"><p className="text-sm text-red-600">{job.error?.message || '材料处理失败，请重试或使用文字输入。'}</p><Button type="button" variant="secondary" disabled={busy} onClick={() => void run(async signal => { onInvalidated(); receiveJob(await materialClient.retry(job.id, signal)); })}><RefreshCw className="w-4 h-4" /> 重试任务</Button></div>}
          {job.status === 'ready' && <>
            {job.source === 'audio' && <div><label className="block text-sm text-slate-600 mb-2">试听并核对说话人</label><audio controls preload="none" src={`/api/materials/${encodeURIComponent(job.id)}/audio`} className="w-full" onError={() => setError('音频暂时无法试听，可能已超过保存时限。你仍可检查文字，或重新上传。')} /></div>}
            {speakers.length > 0 && <div className="space-y-3"><h4 className="font-semibold text-slate-900">确认说话人角色</h4><p className="text-sm text-slate-600">说话人编号不代表身份。无法确认时保留“身份待确认”。</p><div className="grid sm:grid-cols-2 gap-3">{speakers.map(speaker => <label key={speaker} className="flex flex-col gap-2 text-sm text-slate-700"><span className="break-all">{speaker}</span><select aria-label={`${speaker}的角色`} value={roles[speaker] || 'unknown'} disabled={busy} onChange={event => { const role = event.target.value as SpeakerRole; setDraft(previous => updateDraftRole(previous, speaker, roles[speaker] || 'unknown', role)); setRoles(previous => ({ ...previous, [speaker]: role })); invalidate(); }} className="rounded-lg border border-slate-300 bg-white p-3 text-base focus:ring-2 focus:ring-brand-200"> <option value="unknown">身份待确认</option><option value="candidate">候选人</option><option value="interviewer">面试官</option></select></label>)}</div><p className="text-sm text-amber-700">下面的按钮会按原始片段重新生成时间戳和角色标签，替换编辑稿中的手工修订。改变角色选择会同步对应行的身份标签，并保留手工修订的正文。若你手动删除了标签，请自行核对身份。</p><Button type="button" variant="secondary" disabled={busy} onClick={() => { setDraft(formatRoleTranscript(job.segments, roles)); invalidate(); }}>按角色重新生成编辑稿</Button></div>}
            <label className="block"><span className="block font-semibold text-slate-900 mb-3">检查和修订逐字稿</span><textarea aria-label="逐字稿编辑稿" value={draft} disabled={busy} onChange={event => { setDraft(event.target.value); invalidate(); }} rows={12} maxLength={100000} className="w-full rounded-lg border border-slate-300 p-4 text-base leading-7 text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 resize-y" /></label>
            <p className="text-sm text-slate-500">共 {effectiveCharacterCount(draft)} 个有效字符。请检查错字和身份标签；分析将使用这份确认稿。</p>
            <Button type="button" disabled={busy || effectiveCharacterCount(draft) < 20} onClick={() => void run(async signal => {
              const confirmed = await materialClient.confirm(job.id, draft, roles, signal);
              if (!confirmed.confirmed || confirmed.status !== 'ready') throw new Error('确认稿尚未保存，请重试。');
              receiveJob(confirmed); setDraft(confirmed.transcript); draftDirty.current = false; setSaved(true);
              onImported({ name: confirmed.fileName, content: confirmed.transcript, materialId: confirmed.id });
            })}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} 保存确认稿并用于分析</Button>
            {saved && <p role="status" className="text-sm text-green-700">确认稿已保存并填入当前表单，可以继续下一步。</p>}
          </>}
          <div className="border-t border-slate-100 pt-4"><Button type="button" variant="secondary" onClick={abandon} disabled={busy && job.status !== 'uploading'}>{job.status === 'ready' ? '导入另一份材料' : '放弃此任务，重新导入'}</Button></div>
        </Card>
      )}
      {error && <div role="alert" className="flex items-start gap-3 rounded-lg bg-red-50 p-4 text-sm leading-6 text-red-700"><AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /><span>{error}</span></div>}
      <p className="text-sm text-slate-500">导入不成功也可以切换到文件或粘贴文本继续。</p>
    </div>
  );
};

const RecordingImport: React.FC<Props> = props => {
  const { user } = useAuth();
  return <RecordingImportSession key={`${user?.id || 'signed-out'}:${props.mode}`} {...props} />;
};
export default RecordingImport;
