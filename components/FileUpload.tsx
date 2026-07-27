import React, { useCallback, useState, useEffect } from 'react';
import {
  Upload, AlertCircle, Loader2, Type, ArrowRight, ArrowLeft, Briefcase, ListChecks,
  Save, LayoutTemplate, X, Check, FileText, ClipboardPaste, Sparkles,
} from 'lucide-react';
import { parseFile } from '../services/fileParser';

interface FileUploadProps {
  onStartAnalysis: (data: { content: string; fileName: string; jobTitle: string; competencies: string }) => void;
  isLoading: boolean;
}

interface JobTemplate {
  id: string;
  name: string;
  jobTitle: string;
  competencies: string;
}

interface ParsedFile {
  name: string;
  content: string;
}

const STEPS = [
  { id: 1, label: '职位画像' },
  { id: 2, label: '面试材料' },
  { id: 3, label: '确认并分析' },
];

const FileUpload: React.FC<FileUploadProps> = ({ onStartAnalysis, isLoading }) => {
  const [step, setStep] = useState(1);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Form State
  const [jobTitle, setJobTitle] = useState("");
  const [competencies, setCompetencies] = useState("");
  const [textInput, setTextInput] = useState("");
  const [activeTab, setActiveTab] = useState<'upload' | 'text'>('upload');
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);

  // Template State
  const [templates, setTemplates] = useState<JobTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('barRaiserTemplates');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  // Persist templates whenever they change
  useEffect(() => {
    localStorage.setItem('barRaiserTemplates', JSON.stringify(templates));
  }, [templates]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateJobProfile = (): boolean => {
    if (!jobTitle.trim()) {
      setError("请输入职位名称。");
      return false;
    }
    if (!competencies.trim()) {
      setError("请填写胜任力要求（岗位所需的核心能力）。");
      return false;
    }
    return true;
  };

  const validateMaterial = (): boolean => {
    if (activeTab === 'upload') {
      if (!parsedFile) {
        setError("请先上传面试记录文件。");
        return false;
      }
      return true;
    }
    if (!textInput.trim()) {
      setError("请输入面试记录内容。");
      return false;
    }
    const wordCount = textInput.trim().split(/\s+/).length;
    if (wordCount < 10) {
      setError("面试记录内容过短，无法进行有效分析。");
      return false;
    }
    return true;
  };

  const processFile = async (file: File) => {
    setError(null);
    setIsParsing(true);
    try {
      const content = await parseFile(file);
      if (!content || content.trim().length === 0) {
        throw new Error("文件内容为空。");
      }
      setParsedFile({ name: file.name, content });
    } catch (err: any) {
      setError(err.message || "文件处理失败。");
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleStartAnalysis = () => {
    if (!validateJobProfile() || !validateMaterial()) return;
    const content = activeTab === 'upload' ? parsedFile!.content : textInput;
    const fileName = activeTab === 'upload' ? parsedFile!.name : "粘贴的面试记录";
    onStartAnalysis({ content, fileName, jobTitle, competencies });
  };

  const goNext = () => {
    if (step === 1 && !validateJobProfile()) return;
    if (step === 2 && !validateMaterial()) return;
    setError(null);
    setStep((s) => Math.min(s + 1, 3));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  // Template Handlers
  const handleSaveTemplate = () => {
    if (!jobTitle.trim() || !competencies.trim()) {
      setError("保存为模板前，请先填写职位名称和胜任力要求。");
      return;
    }
    setIsSavingTemplate(true);
    setError(null);
  };

  const confirmSaveTemplate = () => {
    if (!newTemplateName.trim()) return;
    const newTemplate: JobTemplate = {
      id: Date.now().toString(),
      name: newTemplateName.trim(),
      jobTitle,
      competencies
    };
    setTemplates([...templates, newTemplate]);
    setIsSavingTemplate(false);
    setNewTemplateName("");
  };

  const loadTemplate = (template: JobTemplate) => {
    setJobTitle(template.jobTitle);
    setCompetencies(template.competencies);
    setError(null);
  };

  const deleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTemplates(templates.filter(t => t.id !== id));
  };

  // Summary helpers for the review step
  const materialSource = activeTab === 'upload' ? '上传文件' : '粘贴文本';
  const materialName = activeTab === 'upload' ? parsedFile?.name : '粘贴的面试记录';
  const materialWords = (activeTab === 'upload' ? parsedFile?.content || '' : textInput)
    .trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="w-full max-w-4xl mx-auto">

      {/* Stepper */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, idx) => {
          const completed = step > s.id;
          const current = step === s.id;
          return (
            <React.Fragment key={s.id}>
              <button
                onClick={() => { if (completed) { setError(null); setStep(s.id); } }}
                disabled={!completed && !current}
                className={`flex items-center gap-2.5 ${completed ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all ${
                    completed
                      ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white'
                      : current
                        ? 'bg-white text-brand-600 ring-2 ring-brand-500 shadow-sm'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {completed ? <Check className="w-4 h-4" /> : s.id}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:block ${
                    current ? 'text-slate-900' : completed ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-3 sm:mx-4 ${step > s.id ? 'bg-gradient-to-r from-indigo-400 to-violet-400' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

        {/* Step 1: Role Profile */}
        {step === 1 && (
          <div className="p-6 md:p-8">

            {/* Template Management Bar */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <LayoutTemplate className="w-5 h-5 text-brand-600" />
                <h3>职位画像</h3>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                {templates.map(t => (
                  <div
                    key={t.id}
                    onClick={() => loadTemplate(t)}
                    className="group flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 cursor-pointer transition-all shadow-sm flex-shrink-0"
                    title={`加载「${t.name}」`}
                  >
                    <span>{t.name}</span>
                    <button
                      onClick={(e) => deleteTemplate(t.id, e)}
                      className="p-0.5 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {templates.length === 0 && (
                  <span className="text-xs text-slate-400 italic">暂无已保存的模板</span>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-brand-600" />
                  目标职位名称
                </label>
                <textarea
                  value={jobTitle}
                  onChange={(e) => { setJobTitle(e.target.value); setError(null); }}
                  placeholder="例如：高级前端工程师、销售总监"
                  className="w-full p-3 bg-white text-slate-900 rounded-lg border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none resize-none h-[80px] transition-all placeholder:text-slate-400 shadow-sm"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-brand-600" />
                  胜任力要求
                </label>
                <textarea
                  value={competencies}
                  onChange={(e) => { setCompetencies(e.target.value); setError(null); }}
                  placeholder="例如：1. 系统设计 2. 领导力 3. 冲突处理..."
                  className="w-full p-3 bg-white text-slate-900 rounded-lg border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none resize-none h-[80px] transition-all placeholder:text-slate-400 shadow-sm"
                  disabled={isLoading}
                />
              </div>
            </div>

            {error && (
              <div className="mt-6 flex items-start gap-3 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Bottom action row: save-as-template + next */}
            <div className="mt-8 flex items-center justify-between gap-4">
              {!isSavingTemplate ? (
                <button
                  onClick={handleSaveTemplate}
                  className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-brand-600 hover:border-brand-300 rounded-lg text-sm font-medium transition-colors"
                >
                  <Save className="w-4 h-4" />
                  保存为模板
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-brand-200 shadow-sm">
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="模板名称..."
                    className="text-sm border-none outline-none bg-transparent px-2 w-32 text-slate-700 placeholder:text-slate-400"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && confirmSaveTemplate()}
                  />
                  <button
                    onClick={confirmSaveTemplate}
                    disabled={!newTemplateName.trim()}
                    className="p-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsSavingTemplate(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg font-medium hover:from-indigo-600 hover:to-violet-600 transition-all shadow-sm"
              >
                下一步：面试材料
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Interview Material */}
        {step === 2 && (
          <div>
            {/* Input Method Tabs */}
            <div className="flex border-b border-slate-100">
              <button
                onClick={() => { setActiveTab('upload'); setError(null); }}
                className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2
                  ${activeTab === 'upload' ? 'bg-white text-brand-600 border-b-2 border-brand-600' : 'bg-white text-slate-500 hover:text-slate-700'}`}
              >
                <Upload className="w-4 h-4" />
                上传面试记录文件
              </button>
              <button
                onClick={() => { setActiveTab('text'); setError(null); }}
                className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2
                  ${activeTab === 'text' ? 'bg-white text-brand-600 border-b-2 border-brand-600' : 'bg-white text-slate-500 hover:text-slate-700'}`}
              >
                <Type className="w-4 h-4" />
                粘贴面试记录文本
              </button>
            </div>

            <div className="p-6 md:p-8">
              {activeTab === 'upload' ? (
                <div className="space-y-4">
                  <div
                    className={`relative group rounded-xl border-2 border-dashed transition-all duration-300 ease-in-out py-12 px-6 flex flex-col items-center justify-center text-center cursor-pointer
                    ${dragActive ? "border-brand-500 bg-brand-50/50 scale-[1.01]" : "border-slate-300 hover:border-brand-400 hover:bg-slate-50"}
                    ${isLoading || isParsing ? "pointer-events-none opacity-50" : ""}
                    `}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('file-upload-input')?.click()}
                  >
                    <input
                      id="file-upload-input"
                      type="file"
                      className="hidden"
                      accept=".txt,.md,.pdf,.docx"
                      onChange={handleChange}
                    />

                    <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:shadow-md transition-shadow">
                      {isParsing ? (
                        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                      ) : (
                        <Upload className="w-8 h-8 text-brand-600" />
                      )}
                    </div>

                    <h3 className="text-xl font-semibold text-slate-800 mb-2">
                      {isParsing ? "正在读取文件..." : "将面试记录文件拖拽到此处"}
                    </h3>

                    <p className="text-slate-500 text-sm max-w-sm mb-2">
                      支持 PDF、Word（.docx）和文本（.txt）文件
                    </p>
                  </div>

                  {parsedFile && (
                    <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-lg px-4 py-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{parsedFile.name}</p>
                        <p className="text-xs text-slate-500">
                          {parsedFile.content.trim().split(/\s+/).filter(Boolean).length} 词已解析
                        </p>
                      </div>
                      <button
                        onClick={() => setParsedFile(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="移除文件"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="请在此粘贴面试对话原文..."
                    className="w-full h-64 p-4 rounded-xl border border-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none resize-none text-slate-900 bg-white text-sm placeholder:text-slate-400"
                  />
                </div>
              )}

              {error && (
                <div className="mt-6 flex items-start gap-3 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  上一步
                </button>
                <button
                  onClick={goNext}
                  disabled={isParsing}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg font-medium hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  下一步：确认
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review & Analyze */}
        {step === 3 && (
          <div className="p-6 md:p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-6">确认你的输入</h3>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  <Briefcase className="w-3.5 h-3.5" />
                  目标职位名称
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{jobTitle}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  <ListChecks className="w-3.5 h-3.5" />
                  胜任力要求
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{competencies}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 md:col-span-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {activeTab === 'upload' ? <FileText className="w-3.5 h-3.5" /> : <ClipboardPaste className="w-3.5 h-3.5" />}
                  面试材料
                </div>
                <p className="text-sm text-slate-800">
                  <span className="font-medium">{materialSource}</span>
                  {materialName && <span className="text-slate-500"> · {materialName}</span>}
                  <span className="text-slate-500"> · {materialWords} 词</span>
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-6 flex items-start gap-3 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                onClick={goBack}
                className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto justify-center"
              >
                <ArrowLeft className="w-4 h-4" />
                上一步
              </button>
              <button
                onClick={handleStartAnalysis}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl font-semibold text-base hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25 w-full sm:w-auto"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                开始分析
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
