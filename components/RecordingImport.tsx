import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  FileAudio,
  Headphones,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import type { AnalysisMode } from '../types';
import { useAuth } from '../src/context/AuthContext';
import { Button, Card, IconTile } from './ui';
import {
  effectiveCharacterCount,
  formatRoleTranscript,
  updateDraftRole,
  materialClient,
  validateAudioFile,
} from '../services/materialClient';
import type {
  ImportedMaterial,
  MaterialCapabilities,
  MaterialJob,
  SpeakerRole,
} from '../services/materialClient';
import {
  formatRecordingFileSize,
  getRecordingUploadPresentation,
} from './recordingUploadPresentation';

interface Props {
  mode: AnalysisMode;
  onImported: (material: ImportedMaterial) => void;
  onInvalidated: () => void;
}

const statusLabels: Record<MaterialJob['status'], string> = {
  uploading: '正在上传录音',
  queued: '已进入后台处理队列',
  transcribing: '正在生成逐字稿',
  ready: '逐字稿已就绪，请检查确认',
  failed: '处理未完成',
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '请求失败，请稍后重试。';
const canRetry = (job: MaterialJob) => job.status === 'failed'
  && !['MATERIAL_CANCELLED', 'UPLOAD_IDLE_TIMEOUT'].includes(job.error?.code || '');

const UploadSteps: React.FC<{ active: 1 | 2 | 3 }> = ({ active }) => {
  const steps = ['选择录音', '自动转写', '确认文字'];
  return (
    <ol className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2" aria-label="录音导入进度">
      {steps.map((label, index) => {
        const number = index + 1;
        const reached = number <= active;
        return (
          <React.Fragment key={label}>
            <li
              className={`flex items-center gap-2 text-xs sm:text-sm font-medium ${reached ? 'text-brand-600' : 'text-slate-400'}`}
              aria-current={number === active ? 'step' : undefined}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${reached ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-500/20' : 'bg-slate-100 text-slate-500'}`}>
                {number}
              </span>
              <span className="hidden whitespace-nowrap sm:inline">{label}</span>
            </li>
            {index < steps.length - 1 && <span className={`h-px ${number < active ? 'bg-brand-300' : 'bg-slate-200'}`} aria-hidden="true" />}
          </React.Fragment>
        );
      })}
    </ol>
  );
};

const RecordingHeader: React.FC<{ active: 1 | 2 | 3 }> = ({ active }) => (
  <div className="space-y-5">
    <div className="flex items-start gap-3">
      <IconTile className="h-10 w-10 shrink-0">
        <Headphones className="h-5 w-5" />
      </IconTile>
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-slate-900">导入面试录音</h3>
        <p className="mt-1 text-sm text-slate-500">将录音转成文字，确认后用于分析</p>
      </div>
    </div>
    <UploadSteps active={active} />
  </div>
);

const ProcessingDetails: React.FC<{ selected?: boolean }> = ({ selected = false }) => (
  <div className={`rounded-xl ${selected ? 'bg-slate-50 p-4' : 'border-t border-slate-100 pt-4'}`}>
    <div className="flex items-start gap-3 text-sm leading-6 text-slate-600">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
      <div>
        <p className="font-medium text-slate-700">录音会发送至语音转写服务</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">临时音频最多保留 24 小时；确认文字后才用于 AI 分析。</p>
        <details className="mt-1.5 text-xs">
          <summary className="cursor-pointer rounded text-brand-600 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200">
            {selected ? '查看处理详情' : '了解处理方式'}
          </summary>
          <p className="mt-2 text-slate-500">上传连续 30 分钟没有新分块完成会自动结束。当前功能只分析回答文字。</p>
        </details>
      </div>
    </div>
  </div>
);

const RecordingImportSession: React.FC<Props> = ({ mode, onImported, onInvalidated }) => {
  const [capabilities, setCapabilities] = useState<MaterialCapabilities | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [job, setJob] = useState<MaterialJob | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [draft, setDraft] = useState('');
  const [roles, setRoles] = useState<Record<string, SpeakerRole>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [restored, setRestored] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
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
        const recent = results[1].value
          .filter(item => item.source === 'audio' && item.expiresAt > Date.now() && item.error?.code !== 'MATERIAL_CANCELLED')
          .sort((a, b) => b.createdAt - a.createdAt)[0];
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
    setBusy(true);
    setError(null);
    try { await action(controller.signal); }
    catch (failure) { if (!controller.signal.aborted) setError(errorMessage(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }

  function invalidate() {
    draftDirty.current = true;
    setSaved(false);
    onInvalidated();
  }

  function chooseFile(file: File) {
    const validation = validateAudioFile(file);
    if (validation) { setError(validation); return; }
    setSelectedFile(file);
    setConsent(false);
    setError(null);
    setRestored(false);
    onInvalidated();
  }

  function upload(file: File) {
    onInvalidated();
    setRestored(false);
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
      currentJob.current = null;
      setJob(null);
      setSelectedFile(null);
      setConsent(false);
      setDraft('');
      setRoles({});
      setSaved(false);
      setRestored(false);
      draftDirty.current = false;
      onInvalidated();
    });
  }

  const speakers = [...new Set((job?.segments || []).map(segment => segment.speaker))];
  const processing = job && ['queued', 'transcribing'].includes(job.status);
  const activeStep: 1 | 2 | 3 = job?.status === 'ready' ? 3 : job && ['queued', 'transcribing'].includes(job.status) ? 2 : 1;
  const presentation = getRecordingUploadPresentation({ hasFile: Boolean(selectedFile), consent, busy });
  const maxMegabytes = capabilities ? Math.round(capabilities.audio.maxBytes / 1024 ** 2) : 500;
  const maxMinutes = capabilities ? Math.round(capabilities.audio.maxDurationSeconds / 60) : 60;
  const uploadPercent = job?.status === 'uploading' ? Math.round(uploadedBytes / Math.max(job.sizeBytes, 1) * 100) : 0;

  return (
    <div className="space-y-4">
      {initializing && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          正在检查服务和恢复任务…
        </div>
      )}

      {!initializing && !capabilities && (
        <Card compact className="space-y-5">
          <RecordingHeader active={1} />
          <p className="text-sm text-slate-600">暂时无法检查录音转写服务，请重新检查。</p>
          <Button type="button" variant="secondary" onClick={() => void run(async signal => setCapabilities(await materialClient.capabilities(signal)))} disabled={busy}>
            <RefreshCw className="h-4 w-4" /> 重新检查服务
          </Button>
        </Card>
      )}

      {!initializing && capabilities && !job && (
        <Card compact className="space-y-5">
          <RecordingHeader active={1} />
          {capabilities.audio.enabled ? (
            presentation.step === 'empty' ? (
              <>
                <div
                  onDragEnter={event => { event.preventDefault(); setDragActive(true); }}
                  onDragOver={event => { event.preventDefault(); setDragActive(true); }}
                  onDragLeave={event => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragActive(false); }}
                  onDrop={event => {
                    event.preventDefault();
                    setDragActive(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) chooseFile(file);
                  }}
                  className={`rounded-xl border-2 border-dashed px-5 py-9 text-center transition-colors ${dragActive ? 'border-brand-500 bg-brand-50' : 'border-brand-200 bg-brand-50/40 hover:border-brand-400 hover:bg-brand-50/70'}`}
                >
                  <UploadCloud className="mx-auto h-9 w-9 text-brand-500" />
                  <p className="mt-4 font-semibold text-slate-900">拖拽录音到这里</p>
                  <p className="mt-1 text-sm text-slate-500">或从设备中选择文件</p>
                  <Button type="button" className="mt-5" onClick={() => fileInput.current?.click()}>
                    选择录音
                  </Button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".mp3,.m4a,.wav,.ogg"
                    className="sr-only"
                    aria-label="选择面试录音"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) chooseFile(file);
                    }}
                  />
                  <p className="mt-5 text-xs leading-5 text-slate-500">
                    MP3 / M4A / WAV / OGG<br />最大 {maxMegabytes} MB · 最长 {maxMinutes} 分钟
                  </p>
                </div>
                <ProcessingDetails />
                <p className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500">也可以使用文字文件或粘贴文本</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <FileAudio className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{selectedFile?.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{selectedFile ? formatRecordingFileSize(selectedFile.size) : ''} · 等待上传</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-sm font-medium text-brand-600 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                    onClick={() => fileInput.current?.click()}
                  >
                    更换
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".mp3,.m4a,.wav,.ogg"
                    className="sr-only"
                    aria-label="更换面试录音"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) chooseFile(file);
                    }}
                  />
                </div>
                <ProcessingDetails selected />
                <label className="flex cursor-pointer items-start gap-3 rounded-lg text-sm leading-6 text-slate-700">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={event => setConsent(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 accent-indigo-500"
                  />
                  <span>我有权使用此材料，并同意上述处理方式。</span>
                </label>
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  disabled={!presentation.canSubmit}
                  onClick={() => selectedFile && upload(selectedFile)}
                >
                  上传并转写 <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="text-center text-xs text-slate-500">点击后开始上传，转写完成后可检查和修改文字</p>
                <p className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500">当前仅分析回答文字</p>
              </>
            )
          ) : (
            <div className="rounded-xl bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              录音转写服务尚未配置。你可以继续上传文字文件或粘贴面试记录。
            </div>
          )}
        </Card>
      )}

      {job && (
        <Card compact className="space-y-5">
          <RecordingHeader active={activeStep} />
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <FileAudio className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h4 className="break-all text-sm font-semibold text-slate-900">{job.fileName}</h4>
              <p role="status" className="mt-1 text-xs text-slate-500">{statusLabels[job.status]}</p>
            </div>
          </div>

          {restored && <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-700">已恢复最近的任务。确认文字并填入面试记录后，才会更新当前表单。</p>}

          {job.status === 'uploading' && (
            <div className="space-y-2">
              <div role="progressbar" aria-label="音频上传进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadPercent} className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width]" style={{ width: `${uploadPercent}%` }} />
              </div>
              <p className="text-sm text-slate-600">已上传 {uploadPercent}%{busy ? '，上传完成前请保持页面打开。' : '。上传尚未完成，请放弃后重新选择文件。'}</p>
            </div>
          )}

          {processing && (
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-brand-600" />
              <div>
                <p className="font-medium text-slate-700">后台正在生成逐字稿</p>
                <p className="mt-0.5 text-xs text-slate-500">你可以稍后回来查看，完成后进入文字确认。</p>
              </div>
            </div>
          )}

          {job.status === 'failed' && (
            <div className="space-y-3">
              <p className="text-sm text-red-600">{job.error?.message || '材料处理失败，请重试或使用文字输入。'}</p>
              {canRetry(job) ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(async signal => { onInvalidated(); receiveJob(await materialClient.retry(job.id, signal)); })}>
                  <RefreshCw className="h-4 w-4" /> 重试任务
                </Button>
              ) : <p className="text-sm text-slate-600">请选择录音重新上传。</p>}
            </div>
          )}

          {job.status === 'ready' && (
            <>
              {job.source === 'audio' && (
                <div>
                  <label className="mb-2 block text-sm text-slate-600">试听并核对说话人</label>
                  <audio controls preload="none" src={`/api/materials/${encodeURIComponent(job.id)}/audio`} className="w-full" onError={() => setError('音频暂时无法试听，可能已超过保存时限。你仍可检查文字，或重新上传。')} />
                </div>
              )}
              {speakers.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-slate-900">确认说话人角色</h4>
                  <p className="text-sm text-slate-600">说话人编号不代表身份。无法确认时保留“身份待确认”。</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {speakers.map(speaker => (
                      <label key={speaker} className="flex flex-col gap-2 text-sm text-slate-700">
                        <span className="break-all">{speaker}</span>
                        <select
                          aria-label={`${speaker}的角色`}
                          value={roles[speaker] || 'unknown'}
                          disabled={busy}
                          onChange={event => {
                            const role = event.target.value as SpeakerRole;
                            setDraft(previous => updateDraftRole(previous, speaker, roles[speaker] || 'unknown', role));
                            setRoles(previous => ({ ...previous, [speaker]: role }));
                            invalidate();
                          }}
                          className="rounded-lg border border-slate-300 bg-white p-3 text-base focus:ring-2 focus:ring-brand-200"
                        >
                          <option value="unknown">身份待确认</option>
                          <option value="candidate">候选人</option>
                          <option value="interviewer">面试官</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-amber-700">下面的按钮会按原始片段重新生成时间戳和角色标签，替换编辑稿中的手工修订。改变角色选择会同步对应行的身份标签，并保留手工修订的正文。若你手动删除了标签，请自行核对身份。</p>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => { setDraft(formatRoleTranscript(job.segments, roles)); invalidate(); }}>
                    按角色重新生成编辑稿
                  </Button>
                </div>
              )}
              <label className="block">
                <span className="mb-3 block font-semibold text-slate-900">检查和修订逐字稿</span>
                <textarea
                  aria-label="逐字稿编辑稿"
                  value={draft}
                  disabled={busy}
                  onChange={event => { setDraft(event.target.value); invalidate(); }}
                  rows={12}
                  maxLength={100000}
                  className="w-full resize-y rounded-lg border border-slate-300 p-4 text-base leading-7 text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </label>
              <p className="text-sm text-slate-500">共 {effectiveCharacterCount(draft)} 个有效字符。请检查错字和身份标签；分析将使用这份确认稿。</p>
              <Button type="button" disabled={busy || effectiveCharacterCount(draft) < 20} onClick={() => void run(async signal => {
                const confirmed = await materialClient.confirm(job.id, draft, roles, signal);
                if (!confirmed.confirmed || confirmed.status !== 'ready') throw new Error('确认稿尚未保存，请重试。');
                receiveJob(confirmed);
                setDraft(confirmed.transcript);
                draftDirty.current = false;
                setSaved(true);
                onImported({ name: confirmed.fileName, content: confirmed.transcript, materialId: confirmed.id });
              })}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} 确认并填入面试记录
              </Button>
              {saved && <p role="status" className="text-sm text-green-700">确认稿已保存并填入当前表单，可以继续下一步。</p>}
            </>
          )}

          <div className="border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={abandon} disabled={busy && job.status !== 'uploading'}>
              {job.status === 'ready' ? '导入另一份材料' : '放弃此任务，重新导入'}
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg bg-red-50 p-4 text-sm leading-6 text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

const RecordingImport: React.FC<Props> = props => {
  const { user } = useAuth();
  return <RecordingImportSession key={`${user?.id || 'signed-out'}:${props.mode}`} {...props} />;
};

export default RecordingImport;
