import React, { useCallback, useState, useEffect } from 'react';
import { Upload, AlertCircle, Loader2, Type, ArrowRight, Briefcase, ListChecks, Save, LayoutTemplate, Trash2, Plus, X, Check } from 'lucide-react';
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

const FileUpload: React.FC<FileUploadProps> = ({ onStartAnalysis, isLoading }) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  
  // Form State
  const [jobTitle, setJobTitle] = useState("");
  const [competencies, setCompetencies] = useState("");
  const [textInput, setTextInput] = useState("");
  const [activeTab, setActiveTab] = useState<'upload' | 'text'>('upload');

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

  const validateInputs = (): boolean => {
    if (!jobTitle.trim()) {
      setError("Please enter a Job Title.");
      return false;
    }
    if (!competencies.trim()) {
      setError("Please define the Competency Model (key skills required).");
      return false;
    }
    return true;
  };

  const processFile = async (file: File) => {
    if (!validateInputs()) return;
    
    setError(null);
    setIsParsing(true);
    try {
      const content = await parseFile(file);
      if (!content || content.trim().length === 0) {
        throw new Error("File appears to be empty.");
      }
      onStartAnalysis({ 
        content, 
        fileName: file.name, 
        jobTitle, 
        competencies 
      });
    } catch (err: any) {
      setError(err.message || "Failed to process file.");
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
  }, [jobTitle, competencies]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleTextSubmit = () => {
    if (!validateInputs()) return;

    if (!textInput.trim()) {
      setError("Please enter the interview transcript.");
      return;
    }
    const wordCount = textInput.trim().split(/\s+/).length;
    if (wordCount < 10) {
      setError("The transcript seems too short for a meaningful analysis.");
      return;
    }
    onStartAnalysis({ 
      content: textInput, 
      fileName: "Pasted Transcript", 
      jobTitle, 
      competencies 
    });
  };

  // Template Handlers
  const handleSaveTemplate = () => {
    if (!jobTitle.trim() || !competencies.trim()) {
      setError("Please fill in Job Title and Competencies before saving as a template.");
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

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      
      {/* Job Context Section */}
      <div className="bg-slate-50 p-6 md:p-8 border-b border-slate-100">
        
        {/* Template Management Bar */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <LayoutTemplate className="w-5 h-5 text-indigo-600" />
            <h3>Job Profile</h3>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            {templates.map(t => (
              <div 
                key={t.id}
                onClick={() => loadTemplate(t)}
                className="group flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 cursor-pointer transition-all shadow-sm flex-shrink-0"
                title={`Load "${t.name}"`}
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
              <span className="text-xs text-slate-400 italic mr-2">No templates saved</span>
            )}

            {!isSavingTemplate ? (
              <button
                onClick={handleSaveTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors flex-shrink-0"
              >
                <Save className="w-3 h-3" />
                Save as Template
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-white p-1 rounded-full border border-indigo-200 shadow-sm animate-in fade-in slide-in-from-right-4 duration-300">
                <input 
                  type="text" 
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Template Name..."
                  className="text-xs border-none outline-none bg-transparent px-2 w-32 text-slate-700 placeholder:text-slate-400"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && confirmSaveTemplate()}
                />
                <button 
                  onClick={confirmSaveTemplate}
                  disabled={!newTemplateName.trim()}
                  className="p-1 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => setIsSavingTemplate(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              Target Job Title
            </label>
            <textarea
              value={jobTitle}
              onChange={(e) => { setJobTitle(e.target.value); setError(null); }}
              placeholder="e.g. Senior Frontend Engineer, Sales Director"
              className="w-full p-3 bg-white text-slate-900 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-none h-[80px] transition-all placeholder:text-slate-400 shadow-sm"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-indigo-600" />
              Competency Model (Requirements)
            </label>
            <textarea
              value={competencies}
              onChange={(e) => { setCompetencies(e.target.value); setError(null); }}
              placeholder="e.g. 1. System Design 2. Leadership 3. Conflict Resolution..."
              className="w-full p-3 bg-white text-slate-900 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-none h-[80px] transition-all placeholder:text-slate-400 shadow-sm"
              disabled={isLoading}
            />
          </div>
        </div>
      </div>

      {/* Input Method Tabs */}
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => { setActiveTab('upload'); setError(null); }}
          className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2
            ${activeTab === 'upload' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'bg-white text-slate-500 hover:text-slate-700'}`}
        >
          <Upload className="w-4 h-4" />
          Upload Transcript File
        </button>
        <button
          onClick={() => { setActiveTab('text'); setError(null); }}
          className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2
            ${activeTab === 'text' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'bg-white text-slate-500 hover:text-slate-700'}`}
        >
          <Type className="w-4 h-4" />
          Paste Transcript Text
        </button>
      </div>

      <div className="p-8">
        {activeTab === 'upload' ? (
          <div
            className={`relative group rounded-xl border-2 border-dashed transition-all duration-300 ease-in-out py-12 px-6 flex flex-col items-center justify-center text-center cursor-pointer
            ${dragActive ? "border-indigo-500 bg-indigo-50/50 scale-[1.01]" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"}
            ${isLoading || isParsing ? "pointer-events-none opacity-50" : ""}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => {
                if (validateInputs()) {
                    document.getElementById('file-upload-input')?.click();
                }
            }}
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
                 <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              ) : (
                 <Upload className="w-8 h-8 text-indigo-600" />
              )}
            </div>

            <h3 className="text-xl font-semibold text-slate-800 mb-2">
              {isParsing ? "Reading File..." : "Drag Transcript File Here"}
            </h3>
            
            <p className="text-slate-500 text-sm max-w-sm mb-2">
              Supports PDF, Word (.docx), and Text (.txt)
            </p>
            <p className="text-xs text-indigo-500 font-medium bg-indigo-50 px-3 py-1 rounded-full">
               Ensure Job Title & Competencies are filled above
            </p>
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste the raw interview conversation here..."
              className="w-full h-64 p-4 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none text-slate-900 bg-white text-sm placeholder:text-slate-400"
            />
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleTextSubmit}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Analyze Fit
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 flex items-start gap-3 text-red-600 bg-red-50 p-4 rounded-lg text-sm animate-in slide-in-from-top-1">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;