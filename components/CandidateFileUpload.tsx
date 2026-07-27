import React, { useCallback, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, ClipboardPaste, FileText,
  Loader2, Sparkles, Trash2,
} from 'lucide-react';

import type { CandidateAnalysisInput, ResumeParseStatus } from '../types';
import { parseFile, parseFileWithMetadata } from '../services/fileParser';
import { assessParseQuality } from '../services/parseQuality';

interface CandidateFileUploadProps {
  onStartAnalysis: (input: CandidateAnalysisInput) => void;
  isLoading: boolean;
}

interface ParsedInterviewFile {
  name: string;
  content: string;
}

const STEPS = [
  { id: 1, label: '目标岗位与简历' },
  { id: 2, label: '面试记录' },
  { id: 3, label: '确认并分析' },
];

const UPLOAD_ICON_URL = 'https://cdn-tos-cn.bytedance.net/obj/archi/ee/es-design-base/svgs/icon_file-uploadfolder-v2_outlined.64de30a2.svg';
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const parseStatusCopy: Record<ResumeParseStatus, string> = {
  usable: '解析质量可用',
  low_quality: '解析文本可能不完整，请检查并修订',
  empty: '没有识别到足够文本，请手动粘贴简历内容',
  manual: '已使用人工确认的简历文本',
  not_provided: '未提供简历',
};

const CandidateFileUpload: React.FC<CandidateFileUploadProps> = ({ onStartAnalysis, isLoading }) => {
  const [step, setStep] = useState(1);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [resumeParseStatus, setResumeParseStatus] = useState<ResumeParseStatus>('not_provided');
  const [showResumeEditor, setShowResumeEditor] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'text'>('upload');
  const [interviewFile, setInterviewFile] = useState<ParsedInterviewFile | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [isParsingInterview, setIsParsingInterview] = useState(false);
  const [dragTarget, setDragTarget] = useState<'resume' | 'interview' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processResume = async (file: File) => {
    setError(null);
    if (file.size > MAX_RESUME_BYTES) {
      setError('简历文件不能超过 10 MB。');
      return;
    }
    if (!RESUME_MIME_TYPES.has(file.type)) {
      setError('简历仅支持 PDF、DOCX 或 TXT 文件。');
      return;
    }

    setIsParsingResume(true);
    try {
      const parsed = await parseFileWithMetadata(file);
      const quality = assessParseQuality(parsed.content, parsed.pageCount);
      setResumeFile(file);
      setResumeText(parsed.content);
      setResumeParseStatus(quality.status);
      setShowResumeEditor(quality.status === 'low_quality' || quality.status === 'empty');
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : '简历解析失败，请更换文件。');
    } finally {
      setIsParsingResume(false);
    }
  };

  const processInterview = async (file: File) => {
    setError(null);
    setIsParsingInterview(true);
    try {
      const content = await parseFile(file);
      setInterviewFile({ name: file.name, content });
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : '面试记录解析失败。');
    } finally {
      setIsParsingInterview(false);
    }
  };

  const handleManualResumeText = (value: string) => {
    setResumeText(value);
    setResumeParseStatus(value.trim() ? 'manual' : 'empty');
  };

  const removeResume = () => {
    setResumeFile(null);
    setResumeText('');
    setResumeParseStatus('not_provided');
    setShowResumeEditor(false);
    setError(null);
  };

  const validateStepOne = () => {
    if (!jobTitle.trim()) {
      setError('请输入目标职位名称。');
      return false;
    }
    return true;
  };

  const validateStepTwo = () => {
    if (activeTab === 'upload') {
      if (!interviewFile) {
        setError('请先上传面试记录文件。');
        return false;
      }
      return true;
    }
    if (!textInput.trim()) {
      setError('请输入面试记录内容。');
      return false;
    }
    if (textInput.trim().split(/\s+/).length < 10) {
      setError('面试记录内容过短，无法进行有效分析。');
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validateStepOne()) return;
    if (step === 2 && !validateStepTwo()) return;
    setError(null);
    setStep((current) => Math.min(current + 1, 3));
  };

  const startAnalysis = () => {
    if (!validateStepOne() || !validateStepTwo()) return;
    onStartAnalysis({
      analysisMode: 'candidate',
      jobTitle: jobTitle.trim(),
      jobDescription: jobDescription.trim(),
      transcript: activeTab === 'upload' ? interviewFile!.content : textInput,
      fileName: activeTab === 'upload' ? interviewFile!.name : '粘贴的面试记录',
      resumeFile,
      resumeText,
      resumeParseStatus,
    });
  };

  const handleDrop = useCallback((target: 'resume' | 'interview', event: React.DragEvent) => {
    event.preventDefault();
    setDragTarget(null);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (target === 'resume') processResume(file);
    else processInterview(file);
  }, []);

  const transcript = activeTab === 'upload' ? interviewFile?.content ?? '' : textInput;
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center mb-8">
        {STEPS.map((item, index) => {
          const completed = step > item.id;
          const current = step === item.id;
          return (
            <React.Fragment key={item.id}>
              <button
                type="button"
                onClick={() => completed && setStep(item.id)}
                disabled={!completed}
                className="flex items-center gap-2.5 disabled:cursor-default"
              >
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
                  completed
                    ? 'bg-indigo-600 text-white'
                    : current
                      ? 'bg-white text-indigo-600 ring-2 ring-indigo-500'
                      : 'bg-slate-100 text-slate-400'
                }`}>
                  {completed ? <Check className="w-4 h-4" /> : item.id}
                </span>
                <span className={`hidden sm:block text-sm font-medium ${current ? 'text-slate-900' : 'text-slate-500'}`}>
                  {item.label}
                </span>
              </button>
              {index < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-3 sm:mx-4 ${completed ? 'bg-indigo-400' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {step === 1 && (
          <div className="p-6 md:p-8 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">目标岗位与简历</h3>
              <p className="mt-1 text-sm text-slate-500">面试记录是主要依据；JD 与简历用于补充岗位要求和真实经历背景。</p>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">目标职位名称 <span className="text-red-500">*</span></label>
                <input
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="例如：高级产品经理"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">JD（选填）</label>
                <textarea
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="粘贴目标岗位的职位描述"
                  className="w-full min-h-[112px] px-4 py-3 border border-slate-300 rounded-lg outline-none resize-y focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="text-sm font-medium text-slate-700">个人简历（选填）</label>
                <span className="text-xs text-slate-400">PDF / DOCX / TXT，最大 10 MB</span>
              </div>
              {!resumeFile ? (
                <div
                  onDragOver={(event) => { event.preventDefault(); setDragTarget('resume'); }}
                  onDragLeave={() => setDragTarget(null)}
                  onDrop={(event) => handleDrop('resume', event)}
                  className={`border border-dashed rounded-xl p-6 text-center transition-colors ${dragTarget === 'resume' ? 'border-violet-500 bg-violet-50' : 'border-slate-300 bg-slate-50'}`}
                >
                  <img src={UPLOAD_ICON_URL} alt="" className="w-7 h-7 mx-auto opacity-70" />
                  <p className="mt-3 text-sm text-slate-600">拖入简历，或选择本地文件</p>
                  <label className="mt-3 inline-flex cursor-pointer px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50">
                    选择简历
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      className="hidden"
                      onChange={(event) => event.target.files?.[0] && processResume(event.target.files[0])}
                    />
                  </label>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><FileText className="w-5 h-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 truncate">{resumeFile.name}</div>
                      <div className={`text-xs mt-0.5 ${resumeParseStatus === 'usable' || resumeParseStatus === 'manual' ? 'text-green-600' : 'text-amber-600'}`}>
                        {parseStatusCopy[resumeParseStatus]}
                      </div>
                    </div>
                    {resumeParseStatus === 'usable' && !showResumeEditor && (
                      <button type="button" onClick={() => setShowResumeEditor(true)} className="text-xs text-indigo-600 hover:text-indigo-700">检查文本</button>
                    )}
                    <button type="button" onClick={removeResume} className="p-2 text-slate-400 hover:text-red-500" aria-label="移除简历">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {showResumeEditor && (
                    <div className="mt-4">
                      <label className="block text-xs text-slate-500 mb-2">请检查解析内容；修改后将以人工确认文本为准</label>
                      <textarea
                        value={resumeText}
                        onChange={(event) => handleManualResumeText(event.target.value)}
                        placeholder="粘贴或修订你的真实简历内容"
                        className="w-full min-h-[180px] px-3 py-2.5 text-sm border border-slate-300 rounded-lg outline-none resize-y focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                  )}
                </div>
              )}
              {isParsingResume && <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> 正在解析简历…</div>}
            </div>

            {error && <ErrorMessage message={error} />}
            <div className="flex justify-end">
              <button type="button" onClick={goNext} disabled={isParsingResume} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50">
                下一步：面试记录 <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex border-b border-slate-200" role="tablist">
              <button type="button" onClick={() => { setActiveTab('upload'); setError(null); }} className={`flex-1 px-4 py-3 text-sm ${activeTab === 'upload' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}>上传文件</button>
              <button type="button" onClick={() => { setActiveTab('text'); setError(null); }} className={`flex-1 px-4 py-3 text-sm ${activeTab === 'text' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}>粘贴文本</button>
            </div>
            <div className="p-6 md:p-8">
              {activeTab === 'upload' ? (
                <div
                  onDragOver={(event) => { event.preventDefault(); setDragTarget('interview'); }}
                  onDragLeave={() => setDragTarget(null)}
                  onDrop={(event) => handleDrop('interview', event)}
                  className={`border border-dashed rounded-xl p-8 text-center ${dragTarget === 'interview' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50'}`}
                >
                  {interviewFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText className="w-5 h-5 text-indigo-500" />
                      <span className="text-sm text-slate-700">{interviewFile.name}</span>
                      <button type="button" onClick={() => setInterviewFile(null)} className="text-xs text-red-500">移除</button>
                    </div>
                  ) : (
                    <>
                      <img src={UPLOAD_ICON_URL} alt="" className="w-8 h-8 mx-auto opacity-70" />
                      <p className="mt-3 text-sm text-slate-600">上传面试记录文件</p>
                      <label className="mt-3 inline-flex cursor-pointer px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50">
                        选择文件
                        <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(event) => event.target.files?.[0] && processInterview(event.target.files[0])} />
                      </label>
                    </>
                  )}
                  {isParsingInterview && <div className="mt-3 flex justify-center items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> 正在解析…</div>}
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-sm text-slate-600"><ClipboardPaste className="w-4 h-4" /> 粘贴完整的面试问答记录</div>
                  <textarea
                    value={textInput}
                    onChange={(event) => setTextInput(event.target.value)}
                    placeholder="面试官：请介绍一个最有挑战的项目……"
                    className="w-full min-h-[300px] px-4 py-3 border border-slate-300 rounded-lg outline-none resize-y focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              )}
              {error && <ErrorMessage message={error} />}
              <div className="mt-6 flex items-center justify-between gap-4">
                <button type="button" onClick={() => { setError(null); setStep(1); }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"><ArrowLeft className="w-4 h-4" /> 上一步</button>
                <button type="button" onClick={goNext} disabled={isParsingInterview} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50">下一步：确认 <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-6 md:p-8">
            <h3 className="text-lg font-semibold text-slate-900">确认你的输入</h3>
            <div className="mt-6 grid md:grid-cols-2 gap-4">
              <SummaryItem label="目标职位" value={jobTitle} />
              <SummaryItem label="JD" value={jobDescription || '未提供，将按目标岗位常见要求辅助判断'} />
              <SummaryItem label="简历" value={resumeFile ? `${resumeFile.name} · ${parseStatusCopy[resumeParseStatus]}` : '未提供'} />
              <SummaryItem label="面试记录" value={`${activeTab === 'upload' ? interviewFile?.name : '粘贴文本'} · 约 ${wordCount} 词`} />
            </div>
            <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500 leading-relaxed">
              报告将主要依据面试记录，按“面试官真实追问 ＞ JD 明确要求 ＞ 目标岗位常见要求”识别重点；简历只用于补充背景和重组真实示范。
            </div>
            {error && <ErrorMessage message={error} />}
            <div className="mt-6 flex items-center justify-between gap-4">
              <button type="button" onClick={() => { setError(null); setStep(2); }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"><ArrowLeft className="w-4 h-4" /> 上一步</button>
              <button type="button" onClick={startAnalysis} disabled={isLoading} className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} 开始生成复盘报告
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {message}
  </div>
);

const SummaryItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="text-xs font-medium text-slate-500">{label}</div>
    <div className="mt-2 text-sm text-slate-800 line-clamp-3">{value}</div>
  </div>
);

export default CandidateFileUpload;
