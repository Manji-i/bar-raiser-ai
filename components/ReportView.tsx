import React, { useRef, useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Download, RefreshCw, CheckCircle2, FileDown, Share2, Trash2, Star,
  ChevronDown, ChevronsUpDown, ChevronsDownUp, Calendar, FileText,
} from 'lucide-react';
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

interface ReportSection {
  id: string;
  title: string;
  body: string;
}

interface DimensionScore {
  name: string;
  score: string;
}

// Rating scale, low to high
const RATING_ORDER = ['NH', 'H-', 'H', 'H+', 'MH'];

// Extract overall fit score from the report text
const getOverallScore = (text: string) => {
  // Expected format: "**匹配结论**: H+" (bold markers may wrap label and/or value)
  const match = text.match(/(?:综合建议|匹配结论)\**\s*[：:]\s*\**\s*(MH|NH|H\+|H-|H)(?![+\-A-Za-z])/);
  return match ? match[1] : 'N/A';
};

// Badge styling per rating (H+/MH -> brand gradient, H -> green, H- -> amber, NH -> red)
const getScoreBadgeClass = (score: string) => {
  if (score === 'MH' || score === 'H+') {
    return 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white border-transparent';
  }
  if (score === 'H') return 'bg-green-50 border-green-200 text-green-800';
  if (score === 'H-') return 'bg-amber-50 border-amber-200 text-amber-800';
  if (score === 'NH') return 'bg-red-50 border-red-200 text-red-800';
  return 'bg-slate-50 border-slate-200 text-slate-600';
};

// Split report markdown into sections by "## " headings; tolerant of missing structure
const splitSections = (markdown: string): ReportSection[] => {
  if (!markdown) return [];
  const parts = markdown.split(/^## /m);
  // parts[0] is the preamble before the first h2 (usually empty)
  const sections: ReportSection[] = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const newlineIdx = chunk.indexOf('\n');
    const title = (newlineIdx === -1 ? chunk : chunk.slice(0, newlineIdx)).trim();
    const body = newlineIdx === -1 ? '' : chunk.slice(newlineIdx + 1);
    if (title) {
      sections.push({ id: `report-section-${i}`, title, body });
    }
  }
  return sections;
};

// Extract per-dimension scores from section 3 of the report
const parseDimensions = (markdown: string): DimensionScore[] => {
  if (!markdown) return [];
  const parts = markdown.split(/^## /m);
  const section3 = parts.find((p) => /^3[.、\s]/.test(p.trim()));
  if (!section3) return [];

  const dims: DimensionScore[] = [];
  const blocks = section3.split(/^### /m);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const newlineIdx = block.indexOf('\n');
    const name = (newlineIdx === -1 ? block : block.slice(0, newlineIdx)).trim();
    // Note: H+ / H- must be matched before H; the trailing lookahead (not \b) keeps
    // "H+" / "H-" from degrading to "H" (\b fails after non-word chars like "+")
    const scoreMatch = block.match(/\*\*评分\*\*\s*[:：]\s*\**\s*(NH|MH|H\+|H-|H)(?![+\-A-Za-z])/);
    if (name && scoreMatch) {
      dims.push({ name, score: scoreMatch[1] });
    }
  }
  return dims;
};

// Shared custom markdown renderers (kept from the previous design language)
const markdownComponents = {
  h2: ({ node, ...props }: any) => (
    <h2 className="text-xl font-bold text-white bg-slate-800 px-4 py-2 rounded-lg mt-10 mb-6 flex items-center shadow-sm break-after-avoid" {...props} />
  ),
  h3: ({ node, ...props }: any) => (
    <h3 className="text-lg font-bold text-brand-700 border-b-2 border-brand-100 pb-2 mt-8 mb-4 break-after-avoid" {...props} />
  ),
  h4: ({ node, ...props }: any) => (
    <h4 className="text-base font-bold text-slate-800 uppercase tracking-wide bg-slate-50 border-l-4 border-brand-500 pl-3 py-1 mt-6 mb-2 break-after-avoid" {...props} />
  ),
  p: ({ node, ...props }: any) => (
    <p className="text-slate-600 leading-relaxed mb-4 text-base" {...props} />
  ),
  ul: ({ node, ...props }: any) => (
    <ul className="list-disc pl-5 space-y-2 mb-4 text-slate-600" {...props} />
  ),
  li: ({ node, ...props }: any) => (
    <li className="pl-1" {...props} />
  ),
  strong: ({ node, ...props }: any) => (
    <strong className="font-bold text-slate-900" {...props} />
  ),
  blockquote: ({ node, ...props }: any) => (
    <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-500 my-4" {...props} />
  ),
};

const ReportView: React.FC<ReportViewProps> = ({ analysis: initialAnalysis, onReset }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);

  const [analysis, setAnalysis] = useState<AnalysisState | null>(initialAnalysis || null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialAnalysis);
  const [copyingLink, setCopyingLink] = useState(false);
  const [feedback, setFeedback] = useState({
    rating: 0,
    comments: '',
    specificIssues: [] as string[]
  });
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Collapsible sections: map of sectionId -> collapsed
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState<string | null>(null);

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
            setCreatedAt(report.createdAt || null);
          } else {
            setAnalysis({
              status: 'ERROR' as any,
              result: null,
              error: "报告未找到",
              fileName: null
            });
          }
        } catch (e) {
          console.error(e);
          setAnalysis({
            status: 'ERROR' as any,
            result: null,
            error: "报告加载失败",
            fileName: null
          });
        } finally {
          setIsLoading(false);
        }
      };
      fetchReport();
    }
  }, [id, initialAnalysis]);

  const sections = useMemo(() => splitSections(analysis?.result || ''), [analysis?.result]);
  const dimensions = useMemo(() => parseDimensions(analysis?.result || ''), [analysis?.result]);

  // Track the currently visible section for TOC highlighting
  useEffect(() => {
    if (sections.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = (sectionId: string) => {
    // Ensure the target section is expanded before scrolling
    setCollapsed((prev) => ({ ...prev, [sectionId]: false }));
    requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    sections.forEach((s) => { next[s.id] = true; });
    setCollapsed(next);
  };

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

    // Expand all sections so the PDF captures the full report, then restore
    const prevCollapsed = collapsed;
    setCollapsed({});
    // Wait two frames so React commits the expanded layout before capture
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const element = contentRef.current;
    const opt = {
      margin: [10, 10, 10, 10], // top, left, bottom, right
      filename: `EvalBar_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } catch (e) {
      console.error("PDF Generation failed", e);
      alert("PDF 生成失败，您可以尝试打印本页面。");
    } finally {
      setCollapsed(prevCollapsed);
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

    if (!window.confirm("确定要删除这份报告吗？")) return;

    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        if (onReset) onReset();
        else navigate('/app');
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

  if (isLoading) {
    return <div className="text-center py-20 text-slate-500">报告加载中…</div>;
  }

  if (!analysis || analysis.error) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <h3 className="text-xl font-bold text-slate-900">报告未找到</h3>
        <p className="text-slate-500 mt-2 mb-6">{analysis?.error || "该报告不存在或已被删除。"}</p>
        <button onClick={() => navigate('/app')} className="text-brand-600 font-medium hover:underline">
          返回新建分析
        </button>
      </div>
    );
  }

  const score = analysis.result ? getOverallScore(analysis.result) : null;

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

      <div className="xl:flex xl:items-start xl:gap-6">
        {/* Main column, captured for PDF. Toolbar/chips are ignored via data-html2canvas-ignore. */}
        <div ref={contentRef} className="flex-1 min-w-0">

          {/* Score Hero */}
          <div className="bg-gradient-to-r from-indigo-500 to-violet-500 rounded-2xl shadow-lg shadow-indigo-500/20 p-6 md:p-8 text-white mb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-white/90" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                    {id ? '评估报告' : '评估完成'}
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">人岗匹配评估</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
                  {analysis.fileName && (
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      {analysis.fileName}
                    </span>
                  )}
                  {createdAt && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {new Date(createdAt).toLocaleString('zh-CN')}
                    </span>
                  )}
                  <span className="text-white/60">由 Eval Bar AI 生成</span>
                </div>
              </div>

              {score && (
                <div className="bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl px-6 py-4 text-center min-w-[130px] flex-shrink-0">
                  <div className="text-[11px] uppercase tracking-widest font-bold text-white/70 mb-1">匹配等级</div>
                  <div className="text-4xl font-black">{score}</div>
                </div>
              )}
            </div>
          </div>

          {/* Action toolbar (excluded from PDF) */}
          <div className="flex flex-wrap items-center gap-3 mb-6" data-html2canvas-ignore="true">
            <button
              onClick={onReset ? onReset : () => navigate('/app')}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              新建分析
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>

            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm relative"
            >
              <Share2 className="w-4 h-4" />
              {copyingLink ? '已复制！' : '分享'}
            </button>

            <button
              onClick={handleDownloadMd}
              className="flex items-center gap-2 px-4 py-2 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <FileDown className="w-4 h-4" />
              导出 Markdown
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-2 px-4 py-2 text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-70 disabled:cursor-wait"
            >
              <Download className="w-4 h-4" />
              {isGeneratingPdf ? '生成中…' : '导出 PDF'}
            </button>

            {(analysis.reportId || id) && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors shadow-sm ml-1"
                title="删除报告"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Dimension score overview (only rendered when dimensions parse successfully) */}
          {dimensions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 mb-6">
              <h3 className="text-base font-bold text-slate-900 mb-5">胜任力维度评分</h3>
              <div className="space-y-4">
                {dimensions.map((dim) => {
                  const activeIdx = RATING_ORDER.indexOf(dim.score);
                  return (
                    <div key={dim.name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <span className="text-sm font-medium text-slate-700 sm:w-48 sm:flex-shrink-0 truncate" title={dim.name}>
                        {dim.name}
                      </span>
                      <div className="flex-1 grid grid-cols-5 gap-1.5">
                        {RATING_ORDER.map((rating, idx) => {
                          const isActive = rating === dim.score;
                          const isFilled = activeIdx !== -1 && idx <= activeIdx;
                          return (
                            <div
                              key={rating}
                              className={`h-7 rounded-md flex items-center justify-center text-[11px] font-bold transition-all ${
                                isActive
                                  ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm'
                                  : isFilled
                                    ? 'bg-brand-100 text-brand-400'
                                    : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {rating}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section chips below xl (excluded from PDF) */}
          {sections.length > 0 && (
            <div className="xl:hidden mb-4 -mx-1 px-1 flex gap-2 overflow-x-auto pb-2" data-html2canvas-ignore="true">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activeSection === s.id
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white border-transparent'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-600'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}

          {/* Report body */}
          {sections.length > 0 ? (
            <div className="space-y-4">
              {/* Expand / collapse controls (excluded from PDF) */}
              <div className="flex justify-end gap-2" data-html2canvas-ignore="true">
                <button
                  onClick={expandAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                  全部展开
                </button>
                <button
                  onClick={collapseAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <ChevronsDownUp className="w-3.5 h-3.5" />
                  全部收起
                </button>
              </div>

              {sections.map((section) => {
                const isCollapsed = !!collapsed[section.id];
                return (
                  <section
                    key={section.id}
                    id={section.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-6"
                  >
                    <button
                      onClick={() => setCollapsed((prev) => ({ ...prev, [section.id]: !prev[section.id] }))}
                      className="w-full flex items-center justify-between gap-3 bg-slate-800 px-4 py-2.5 text-left hover:bg-slate-700 transition-colors"
                    >
                      <span className="text-base md:text-lg font-bold text-white break-after-avoid">{section.title}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-white/70 flex-shrink-0 transition-transform duration-300 ${isCollapsed ? '-rotate-90' : ''}`}
                      />
                    </button>
                    {!isCollapsed && (
                      <div className="p-6 md:p-8">
                        <article className="prose prose-slate max-w-none">
                          <ReactMarkdown components={markdownComponents}>
                            {section.body}
                          </ReactMarkdown>
                        </article>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            // Fallback: structure not recognized, render the whole report in one card
            <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 md:p-12">
              <article className="prose prose-slate max-w-none">
                <ReactMarkdown components={markdownComponents}>
                  {analysis.result || ''}
                </ReactMarkdown>
              </article>
            </div>
          )}
        </div>

        {/* Sticky TOC on xl */}
        {sections.length > 0 && (
          <aside className="hidden xl:block w-56 flex-shrink-0 sticky top-6 max-h-[80vh] overflow-y-auto report-scroll">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">报告目录</p>
            <nav className="space-y-1 border-l border-slate-200">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`block w-full text-left pl-3 py-1.5 text-xs leading-snug transition-colors border-l-2 -ml-px ${
                    activeSection === s.id
                      ? 'border-brand-500 text-brand-700 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </nav>
          </aside>
        )}
      </div>

      {/* Feedback Section */}
      <div className="mt-12 bg-white rounded-xl shadow-lg border border-slate-100 p-8">
        <h3 className="text-xl font-bold text-slate-900 mb-6">帮助我们改进 AI 评估</h3>

        {feedbackSubmitted ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-semibold text-slate-900 mb-2">感谢您的反馈！</h4>
            <p className="text-slate-500">您的反馈有助于我们提升 AI 评估的准确性。</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">本次评估的准确度如何？</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-2">具体问题（可多选）：</label>
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
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
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
                补充意见
              </label>
              <textarea
                id="comments"
                rows={4}
                value={feedback.comments}
                onChange={handleCommentChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring focus:ring-brand-200 focus:ring-opacity-50 p-3"
                placeholder="请分享任何具体意见，帮助我们改进……"
              />
            </div>

            <button
              onClick={handleFeedbackSubmit}
              disabled={isSubmittingFeedback || feedback.rating === 0}
              className="w-full px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg font-medium hover:from-indigo-600 hover:to-violet-600 transition-all shadow-sm disabled:opacity-70 disabled:cursor-wait flex items-center justify-center gap-2"
            >
              {isSubmittingFeedback ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  提交中…
                </>
              ) : (
                '提交反馈'
              )}
            </button>
          </div>
        )}
      </div>

      <div className="text-center mt-8 text-slate-400 text-xs">
          机密 • Eval Bar AI 评估
      </div>
    </div>
  );
};

export default ReportView;
