import type { AnalysisMode } from '../types';

export type SpeakerRole = 'candidate' | 'interviewer' | 'unknown';
export interface MaterialSegment { speaker: string; startMs: number | null; endMs: number | null; text: string }
export interface MaterialJob {
  id: string;
  analysisMode: AnalysisMode;
  source: 'audio' | 'feishu';
  status: 'uploading' | 'queued' | 'transcribing' | 'ready' | 'failed';
  fileName: string;
  transcript: string;
  segments: MaterialSegment[];
  speakerRoles: Record<string, SpeakerRole>;
  confirmed: boolean;
  error: null | { code: string; message: string };
  createdAt: number;
  expiresAt: number;
  uploadedBytes: number;
  sizeBytes: number;
  durationSeconds: number | null;
}
export interface MaterialCapabilities {
  audio: { enabled: boolean; maxBytes: number; maxDurationSeconds: number; extensions: string[] };
}
export interface ImportedMaterial { name: string; content: string; materialId: string }
export const AUDIO_CHUNK_BYTES = 4 * 1024 * 1024;
export const effectiveCharacterCount = (value: string) => Array.from(value.replace(/\s/g, '')).length;
export function validateAudioFile(file: { name: string; size: number }): string | null {
  if (!/\.(mp3|wav|m4a|ogg)$/i.test(file.name)) return '仅支持 MP3、M4A、WAV 或 OGG 音频文件。';
  if (!file.size) return '音频文件为空，请重新选择。';
  if (file.size > 100 * 1024 * 1024) return '音频文件不能超过 100 MB。';
  return null;
}
const roleLabels: Record<SpeakerRole, string> = { candidate: '候选人', interviewer: '面试官', unknown: '身份待确认' };
export function formatRoleTranscript(segments: MaterialSegment[], roles: Record<string, SpeakerRole>): string {
  return segments.map(segment => {
    const seconds = segment.startMs === null ? null : Math.floor(segment.startMs / 1000);
    const timestamp = seconds === null ? '' : `[${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}] `;
    return `${timestamp}${roleLabels[roles[segment.speaker] || 'unknown']}（${segment.speaker}）：${segment.text}`;
  }).join('\n');
}
export function updateDraftRole(draft: string, speaker: string, previousRole: SpeakerRole, nextRole: SpeakerRole): string {
  const previous = `${roleLabels[previousRole]}（${speaker}）：`;
  const next = `${roleLabels[nextRole]}（${speaker}）：`;
  return draft.split('\n').map(line => {
    const prefix = line.match(/^\[\d+:\d{2}\] /)?.[0] || '';
    const content = line.slice(prefix.length);
    return content.startsWith(previous) ? prefix + next + content.slice(previous.length) : line;
  }).join('\n');
}
export class MaterialRequestError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message); this.name = 'MaterialRequestError'; this.status = status; this.code = code;
  }
}
export function createMaterialClient(fetcher: typeof fetch = (input, init) => fetch(input, init)) {
  async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const binary = body instanceof Blob;
    const response = await fetcher(`/api${path}`, {
      method, credentials: 'same-origin', signal,
      ...(body === undefined ? {} : { headers: { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }, body: binary ? body : JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    signal?.throwIfAborted();
    if (!response.ok) throw new MaterialRequestError(typeof data.error === 'string' ? data.error : '材料请求失败，请稍后重试。', response.status, data.code || 'MATERIAL_ERROR');
    return data;
  }
  const jobPath = (id: string) => `/materials/${encodeURIComponent(id)}`;
  return {
    capabilities: (signal?: AbortSignal) => request<MaterialCapabilities>('/materials/capabilities', 'GET', undefined, signal),
    list: (mode: AnalysisMode, signal?: AbortSignal) => request<MaterialJob[]>(`/materials?analysisMode=${mode}`, 'GET', undefined, signal),
    get: (id: string, signal?: AbortSignal) => request<MaterialJob>(jobPath(id), 'GET', undefined, signal),
    confirm: (id: string, transcript: string, speakerRoles: Record<string, SpeakerRole>, signal?: AbortSignal) => request<MaterialJob>(jobPath(id), 'PATCH', { transcript, speakerRoles, confirmed: true }, signal),
    retry: (id: string, signal?: AbortSignal) => request<MaterialJob>(`${jobPath(id)}/retry`, 'POST', undefined, signal),
    cancel: (id: string, signal?: AbortSignal) => request<MaterialJob>(`${jobPath(id)}/cancel`, 'POST', undefined, signal),
    async uploadAudio(file: File, analysisMode: AnalysisMode, options: { signal?: AbortSignal; onJob?: (job: MaterialJob) => void; onProgress?: (bytes: number) => void } = {}) {
      const validation = validateAudioFile(file);
      if (validation) throw new Error(validation);
      const { signal, onJob, onProgress } = options;
      const job = await request<MaterialJob>('/materials/audio', 'POST', { analysisMode, fileName: file.name, sizeBytes: file.size }, signal);
      onJob?.(job);
      for (let offset = 0, index = 0; offset < file.size; offset += AUDIO_CHUNK_BYTES, index++) {
        const chunk = file.slice(offset, Math.min(file.size, offset + AUDIO_CHUNK_BYTES));
        for (let attempt = 0; ; attempt++) {
          try {
            await request<MaterialJob>(`${jobPath(job.id)}/chunks/${index}`, 'PUT', chunk, signal);
            break;
          } catch (error) {
            signal?.throwIfAborted();
            if (attempt >= 2 || (error instanceof MaterialRequestError && error.status < 500)) throw error;
          }
        }
        onProgress?.(Math.min(file.size, offset + AUDIO_CHUNK_BYTES));
      }
      const submitted = await request<MaterialJob>(`${jobPath(job.id)}/submit`, 'POST', undefined, signal);
      onJob?.(submitted);
      return submitted;
    },
  };
}
export const materialClient = createMaterialClient();
