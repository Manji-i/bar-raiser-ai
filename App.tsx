import React, { useState } from 'react';
import { AnalysisState, AnalysisStatus } from './types';
import { analyzeInterview } from './services/geminiService';
import FileUpload from './components/FileUpload';
import ReportView from './components/ReportView';
import { Sparkles, BrainCircuit } from 'lucide-react';

const App: React.FC = () => {
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: AnalysisStatus.IDLE,
    result: null,
    error: null,
    fileName: null,
  });

  const handleStartAnalysis = async (data: { 
    content: string; 
    fileName: string; 
    jobTitle: string; 
    competencies: string 
  }) => {
    setAnalysisState((prev) => ({
      ...prev,
      status: AnalysisStatus.ANALYZING,
      fileName: data.fileName,
      error: null,
    }));

    try {
      // Pass all context data to the service
      const result = await analyzeInterview(
        data.content, 
        data.jobTitle, 
        data.competencies
      );
      
      setAnalysisState((prev) => ({
        ...prev,
        status: AnalysisStatus.COMPLETE,
        result,
      }));
    } catch (error: any) {
      setAnalysisState((prev) => ({
        ...prev,
        status: AnalysisStatus.ERROR,
        error: error.message || "An error occurred during analysis.",
      }));
    }
  };

  const handleReset = () => {
    setAnalysisState({
      status: AnalysisStatus.IDLE,
      result: null,
      error: null,
      fileName: null,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Bar Raiser <span className="text-indigo-600">AI</span>
            </h1>
          </div>
          <div className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            Gemini 3 Powered
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {analysisState.status === AnalysisStatus.IDLE && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
                Evaluate Candidates with <span className="text-indigo-600">Precision</span>
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Upload your interview transcript and let our AI analyze behavioral evidence using the STAR method to generate professional hiring recommendations based on person-job fit.
              </p>
            </div>
            
            <FileUpload 
              onStartAnalysis={handleStartAnalysis} 
              isLoading={false}
            />
          </div>
        )}

        {analysisState.status === AnalysisStatus.ANALYZING && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-200 blur-xl rounded-full opacity-50 animate-pulse"></div>
              <Sparkles className="w-16 h-16 text-indigo-600 relative z-10 animate-bounce" />
            </div>
            <h3 className="mt-8 text-2xl font-bold text-slate-800">Analyzing Interview...</h3>
            <p className="mt-2 text-slate-500 text-center max-w-md">
              Extracting STAR examples, assessing job fit for <span className="font-semibold text-indigo-600">target role</span>, and identifying risks. This may take a moment.
            </p>
          </div>
        )}

        {analysisState.status === AnalysisStatus.COMPLETE && (
          <ReportView 
            analysis={analysisState} 
            onReset={handleReset} 
          />
        )}

        {analysisState.status === AnalysisStatus.ERROR && (
          <div className="max-w-xl mx-auto mt-12 text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-200 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Analysis Failed</h3>
            <p className="text-slate-500 mb-8">{analysisState.error}</p>
            <button 
              onClick={handleReset}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Try Again
            </button>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;