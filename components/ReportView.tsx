import React, { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Download, RefreshCw, CheckCircle2, FileDown, Share2, Trash2, ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnalysisState, Report } from '../types';

// 辅助函数：获取带认证的请求头
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// Declare html2pdf for TypeScript since it's loaded via CDN
declare var html2pdf: any;

interface ReportViewProps {
  analysis?: AnalysisState;
  onReset?: () => void;
}

const ReportView: React.FC<ReportViewProps> = ({ analysis: initialAnalysis, onReset }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [analysis, setAnalysis] = useState<AnalysisState | null>(initialAnalysis || null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialAnalysis);
  const [copyingLink, setCopyingLink] = useState(false);
  const [feedback, setFeedback] = useState({
    rating: 0,
    comments: '',
    specificIssues: []
  });
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  useEffect(() => {
    // If accessing via URL ID and no initial analysis provided, fetch it
    if (id && !initialAnalysis) {
      const fetchReport = async () => {
        try {
          const res = await fetch(`/api/reports/${id}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const report: Report = await res.json();
            setAnalysis({
              status: 'COMPLETE' as any,
              result: report.result,
              error: null,
              fileName: report.fileName,
              reportId: report.id
            });
          } else {
            setAnalysis({
              status: 'ERROR' as any,
              result: null,
              error: "Report not found",
              fileName: null
            });
          }
        } catch (e) {
          console.error(e);
          setAnalysis({
            status: 'ERROR' as any,
            result: null,
            error: "Failed to load report",
            fileName: null
          });
        } finally {
          setIsLoading(false);
        }
      };
      fetchReport();
    }
  }, [id, initialAnalysis]);

  const handleDownloadMd = () => {
    if (!analysis?.result) return;
    const blob = new Blob([analysis.result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-analysis-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (!contentRef.current) return;
    setIsGeneratingPdf(true);
    
    const element = contentRef.current;
    const opt = {
      margin: [10, 10, 10, 10], // top, left, bottom, right
      filename: `BarRaiser_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } catch (e) {
      console.error("PDF Generation failed", e);
      alert("Failed to generate PDF. You can try printing the page.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleShare = async () => {
    const reportId = analysis?.reportId || id;
    if (!reportId) return;
    
    const url = `${window.location.origin}/report/${reportId}`;
    await navigator.clipboard.writeText(url);
    setCopyingLink(true);
    setTimeout(() => setCopyingLink(false), 2000);
  };

  const handleDelete = async () => {
    const reportId = analysis?.reportId || id;
    if (!reportId) return;
    
    if (!window.confirm("Are you sure you want to delete this report?")) return;

    try {
      const res = await fetch(`/api/reports/${reportId}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        if (onReset) onReset();
        else navigate('/');
      }
    } catch (e) {
      console.error("Failed to delete", e);
    }
  };

  const handleFeedbackSubmit = async () => {
    const reportId = analysis?.reportId || id;
    if (!reportId || feedback.rating === 0) return;

    setIsSubmittingFeedback(true);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          reportId,
          rating: feedback.rating,
          comments: feedback.comments,
          specificIssues: feedback.specificIssues
        })
      });

      if (res.ok) {
        setFeedbackSubmitted(true);
      } else {
        console.error('Failed to submit feedback');
      }
    } catch (e) {
      console.error("Failed to submit feedback", e);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleRatingChange = (rating: number) => {
    setFeedback(prev => ({ ...prev, rating }));
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFeedback(prev => ({ ...prev, comments: e.target.value }));
  };

  const handleIssueToggle = (issue: string) => {
    setFeedback(prev => {
      const currentIssues = prev.specificIssues;
      if (currentIssues.includes(issue)) {
        return { ...prev, specificIssues: currentIssues.filter(i => i !== issue) };
      } else {
        return { ...prev, specificIssues: [...currentIssues, issue] };
      }
    });
  };

  // Extract score from the text if possible
  const getOverallScore = (text: string) => {
    const match = text.match(/(?:综合建议|匹配结论)[：:]\s*\*\*?([A-Za-z+-]+)\*\*?/i);
    return match ? match[1] : 'N/A';
  };

  if (isLoading) {
    return <div className="text-center py-20 text-slate-500">Loading report...</div>;
  }

  if (!analysis || analysis.error) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <h3 className="text-xl font-bold text-slate-900">Report Not Found</h3>
        <p className="text-slate-500 mt-2 mb-6">{analysis?.error || "This report does not exist or has been deleted."}</p>
        <button onClick={() => navigate('/')} className="text-indigo-600 font-medium hover:underline">
          Go Home
        </button>
      </div>
    );
  }

  const score = analysis.result ? getOverallScore(analysis.result) : null;

  return (
    <div className="w-full max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            {id ? 'Assessment Report' : 'Assessment Complete'}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Analysis for <span className="font-medium text-slate-700">{analysis.fileName}</span>
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
            {onReset && (
              <button 
                  onClick={onReset}
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                  <RefreshCw className="w-4 h-4" />
                  New Analysis
              </button>
            )}
            
            {!onReset && (
              <button 
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                  <RefreshCw className="w-4 h-4" />
                  New Analysis
              </button>
            )}

            <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>

            <button 
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm relative"
            >
                <Share2 className="w-4 h-4" />
                {copyingLink ? 'Copied!' : 'Share'}
            </button>

            <button 
                onClick={handleDownloadMd}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
                <FileDown className="w-4 h-4" />
                Markdown
            </button>
            <button 
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-70 disabled:cursor-wait"
            >
                <Download className="w-4 h-4" />
                {isGeneratingPdf ? 'Generating...' : 'PDF'}
            </button>

            {(analysis.reportId || id) && (
              <button 
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors shadow-sm ml-1"
                  title="Delete Report"
              >
                  <Trash2 className="w-4 h-4" />
              </button>
            )}
        </div>
      </div>

      {/* Main Content Area to be captured for PDF */}
      <div ref={contentRef} className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 md:p-12">
        
        {/* Report Header (Visible in PDF) */}
        <div className="border-b border-slate-200 pb-6 mb-8 flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900">Job Fit Assessment</h1>
                <p className="text-slate-500 mt-2">Generated by Bar Raiser AI Protocol</p>
            </div>
            {score && score !== 'N/A' && (
                <div className={`px-5 py-3 rounded-lg border text-center min-w-[120px]
                    ${score.includes('H+') || score === 'MH' ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 
                      score.includes('H') ? 'bg-green-50 border-green-200 text-green-900' :
                      'bg-amber-50 border-amber-200 text-amber-900'
                    }
                `}>
                     <div className="text-xs uppercase tracking-wider font-bold opacity-70 mb-1">Fit Level</div>
                     <div className="text-3xl font-black">{score}</div>
                </div>
            )}
        </div>

        {/* Custom Markdown Rendering with 4-Level Hierarchy */}
        <article className="prose prose-slate max-w-none">
          <ReactMarkdown
            components={{
                // Level 1: Main Sections (like "面试综述", "能力维度评估")
                h2: ({node, ...props}) => (
                    <h2 className="text-xl font-bold text-white bg-slate-800 px-4 py-2 rounded-lg mt-10 mb-6 flex items-center shadow-sm break-after-avoid" {...props} />
                ),
                // Level 2: Dimensions (like "维度一：坚韧抗压")
                h3: ({node, ...props}) => (
                    <h3 className="text-lg font-bold text-indigo-700 border-b-2 border-indigo-100 pb-2 mt-8 mb-4 break-after-avoid" {...props} />
                ),
                // Level 3: Sub-sections (STAR elements like "S (情境)")
                h4: ({node, ...props}) => (
                    <h4 className="text-base font-bold text-slate-800 uppercase tracking-wide bg-slate-50 border-l-4 border-indigo-500 pl-3 py-1 mt-6 mb-2 break-after-avoid" {...props} />
                ),
                // Body Text
                p: ({node, ...props}) => (
                    <p className="text-slate-600 leading-relaxed mb-4 text-base" {...props} />
                ),
                ul: ({node, ...props}) => (
                    <ul className="list-disc pl-5 space-y-2 mb-4 text-slate-600" {...props} />
                ),
                li: ({node, ...props}) => (
                    <li className="pl-1" {...props} />
                ),
                strong: ({node, ...props}) => (
                    <strong className="font-bold text-slate-900" {...props} />
                ),
                blockquote: ({node, ...props}) => (
                    <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-500 my-4" {...props} />
                )
            }}
          >
            {analysis.result || ''}
          </ReactMarkdown>
        </article>
      </div>
      
      {/* Feedback Section */}
      <div className="mt-12 bg-white rounded-xl shadow-lg border border-slate-100 p-8">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Help Improve Our AI Assessment</h3>
        
        {feedbackSubmitted ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-semibold text-slate-900 mb-2">Thank you for your feedback!</h4>
            <p className="text-slate-500">Your input helps us improve our AI assessment accuracy.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">How accurate was this assessment?</label>
              <div className="flex items-center gap-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRatingChange(star)}
                    className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${feedback.rating >= star ? 'bg-yellow-400 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    <Star className="w-5 h-5" fill={feedback.rating >= star ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Specific issues (select all that apply):</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  '评分标准不准确',
                  'STAR法则应用不当',
                  '人岗匹配分析错误',
                  '维度评估不全面',
                  '风险提示不清晰',
                  '其他问题'
                ].map((issue) => (
                  <div key={issue} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`issue-${issue}`}
                      checked={feedback.specificIssues.includes(issue)}
                      onChange={() => handleIssueToggle(issue)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor={`issue-${issue}`} className="ml-2 block text-sm text-slate-700">
                      {issue}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <label htmlFor="comments" className="block text-sm font-medium text-slate-700 mb-2">
                Additional comments
              </label>
              <textarea
                id="comments"
                rows={4}
                value={feedback.comments}
                onChange={handleCommentChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-3"
                placeholder="Please share any specific feedback to help us improve..."
              />
            </div>
            
            <button
              onClick={handleFeedbackSubmit}
              disabled={isSubmittingFeedback || feedback.rating === 0}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-wait flex items-center justify-center gap-2"
            >
              {isSubmittingFeedback ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting...
                </>
              ) : (
                'Submit Feedback'
              )}
            </button>
          </div>
        )}
      </div>

      <div className="text-center mt-8 text-slate-400 text-xs">
          Confidential • Bar Raiser AI Assessment
      </div>
    </div>
  );
};

export default ReportView;
