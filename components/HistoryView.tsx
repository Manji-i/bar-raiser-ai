import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Calendar, FileText, Share2, PlusCircle, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Report } from '../types';

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

// Extract overall fit score from the report text (same rule as the report page)
const getOverallScore = (text: string) => {
  const match = text.match(/(?:综合建议|匹配结论)[：:]\s*\*\*?([A-Za-z+-]+)\*\*?/i);
  return match ? match[1] : null;
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

const RATING_ORDER = ['MH', 'H+', 'H', 'H-', 'NH'];

const HistoryView: React.FC = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (error) {
      console.error("Failed to fetch reports", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("确定要删除这份报告吗？")) return;

    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        setReports(reports.filter(r => r.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete report", error);
    }
  };

  const handleShare = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}/report/${id}`;
    await navigator.clipboard.writeText(url);
    setCopyingId(id);
    setTimeout(() => setCopyingId(null), 2000);
  };

  // Pre-compute fit scores; the list endpoint includes `result`
  const scores = useMemo(() => {
    const map: Record<string, string | null> = {};
    reports.forEach((r) => {
      map[r.id] = r.result ? getOverallScore(r.result) : null;
    });
    return map;
  }, [reports]);

  const ratingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(scores).forEach((s) => {
      if (s) counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [scores]);

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">评估历史记录</h1>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg text-sm font-medium hover:from-indigo-600 hover:to-violet-600 transition-all shadow-sm"
        >
          <PlusCircle className="w-4 h-4" />
          新建分析
        </button>
      </div>

      {/* Lightweight stats row */}
      {!isLoading && reports.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600 shadow-sm">
            <BarChart3 className="w-3.5 h-3.5 text-brand-600" />
            共 {reports.length} 份报告
          </span>
          {RATING_ORDER.filter((r) => ratingCounts[r]).map((rating) => (
            <span
              key={rating}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${getScoreBadgeClass(rating)}`}
            >
              {rating} · {ratingCounts[rating]}
            </span>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-slate-500">加载中…</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">暂无报告</h3>
          <p className="text-slate-500 mt-2 mb-6">新建分析后，历史记录将显示在这里。</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg font-medium hover:from-indigo-600 hover:to-violet-600 transition-all"
          >
            新建分析
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => {
            const score = scores[report.id];
            return (
              <div
                key={report.id}
                onClick={() => navigate(`/report/${report.id}`)}
                className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-brand-200 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="text-lg font-semibold text-slate-900 group-hover:text-brand-600 transition-colors">
                        {report.jobTitle}
                      </h3>
                      {score && (
                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${getScoreBadgeClass(score)}`}>
                          {score}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-2">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        {report.fileName}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(report.createdAt), 'PPP p', { locale: zhCN })}
                      </div>
                    </div>
                  </div>

                  {/* Secondary icon actions, always visible */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => handleShare(e, report.id)}
                      className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors relative"
                      title="复制分享链接"
                    >
                      <Share2 className="w-4 h-4" />
                      {copyingId === report.id && (
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded shadow-lg whitespace-nowrap">
                          已复制！
                        </span>
                      )}
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, report.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除报告"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HistoryView;
