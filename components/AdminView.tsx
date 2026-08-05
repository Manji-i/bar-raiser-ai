import React, { useState, useEffect } from 'react';
import { Settings, Star, MessageSquare, RefreshCw, Eye, FileText, Calendar, Briefcase, TrendingUp, Bot, Lightbulb } from 'lucide-react';
import { format } from 'date-fns';
import type { AnalysisMode } from '../types';
import { useAuth } from '../src/context/AuthContext';

interface Report {
  id: string;
  jobTitle: string;
  competencies: string;
  fileName: string;
  transcript: string;
  result: string;
  createdAt: string;
  userId?: string;
  analysisMode?: AnalysisMode;
}

interface Feedback {
  id: string;
  reportId: string;
  rating: number;
  comments?: string;
  specificIssues?: string[];
  jobTitle?: string;
  competencies?: string;
  fileName?: string;
  transcript?: string;
  assessmentResult?: string;
  createdAt: string;
}

const AdminView: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'feedback' | 'reports' | 'prompt'>('feedback');
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [feedbackDetailTab, setFeedbackDetailTab] = useState<'transcript' | 'assessment'>('transcript');
  const [reportDetailTab, setReportDetailTab] = useState<'transcript' | 'assessment'>('transcript');
  const [promptMode, setPromptMode] = useState<AnalysisMode>('recruiter');
  const [promptContent, setPromptContent] = useState('');
  const [promptVersion, setPromptVersion] = useState<number | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');
  const authenticated = !!user?.isAdmin;

  useEffect(() => {
    if (authenticated) {
      fetchData();
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated && activeTab === 'prompt') {
      fetchPrompt(promptMode);
    }
  }, [authenticated, activeTab, promptMode]);

  // Fetch both datasets so the stat cards and tab counts are always accurate
  const fetchData = async () => {
    setLoading(true);
    try {
      const [feedbackRes, reportsRes] = await Promise.all([
        fetch('/api/feedback', { credentials: 'same-origin' }),
        fetch('/api/admin/reports', { credentials: 'same-origin' }),
      ]);
      if (feedbackRes.ok) {
        setFeedbacks(await feedbackRes.json());
      }
      if (reportsRes.ok) {
        setReports(await reportsRes.json());
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrompt = async (mode: AnalysisMode) => {
    setPromptLoading(true);
    setPromptMessage('');
    try {
      const response = await fetch(`/api/prompt/current?analysisMode=${mode}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Prompt 加载失败');
      const data = await response.json();
      setPromptContent(data.content || '');
      setPromptVersion(data.version ?? null);
    } catch (error) {
      setPromptMessage(error instanceof Error ? error.message : 'Prompt 加载失败');
    } finally {
      setPromptLoading(false);
    }
  };

  const savePrompt = async () => {
    if (!promptContent.trim()) {
      setPromptMessage('Prompt 内容不能为空');
      return;
    }
    setPromptSaving(true);
    setPromptMessage('');
    try {
      const response = await fetch('/api/prompt/current', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisMode: promptMode, content: promptContent }),
      });
      if (!response.ok) throw new Error('Prompt 保存失败');
      const data = await response.json();
      setPromptVersion(data.prompt?.version ?? null);
      setPromptMessage('已保存为新版本');
    } catch (error) {
      setPromptMessage(error instanceof Error ? error.message : 'Prompt 保存失败');
    } finally {
      setPromptSaving(false);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`}
          />
        ))}
      </div>
    );
  };

  const getAverageRating = () => {
    if (feedbacks.length === 0) return '0.0';
    const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
    return (sum / feedbacks.length).toFixed(1);
  };

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Settings className="w-8 h-8 text-brand-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">管理员登录</h1>
            <p className="text-slate-600">请输入管理员密码以访问此页面</p>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-slate-600 text-center">
              请使用您的账号密码登录（需要是管理员账号）
            </p>
            <button
              onClick={() => window.location.href = '/login'}
              className="w-full px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg font-medium hover:from-indigo-600 hover:to-violet-600 transition-all shadow-sm"
            >
              前往登录页面
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    { label: '反馈总数', value: feedbacks.length, icon: MessageSquare },
    { label: '平均星级', value: getAverageRating(), icon: TrendingUp },
    { label: '报告总数', value: reports.length, icon: FileText },
  ];

  return (
    <div className="w-full">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-gradient-to-br from-indigo-500 to-violet-500 p-2 rounded-lg text-white shadow-lg shadow-indigo-500/20">
            <Settings className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">管理员面板</h1>
        </div>
        <p className="text-slate-600">查看用户反馈和所有评估报告</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Segmented tab control */}
      <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1 mb-6">
        <button
          onClick={() => {
            setActiveTab('feedback');
            setSelectedFeedback(null);
            setSelectedReport(null);
          }}
          className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'feedback'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className={`w-4 h-4 ${activeTab === 'feedback' ? 'text-brand-600' : ''}`} />
          用户反馈 ({feedbacks.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('reports');
            setSelectedFeedback(null);
            setSelectedReport(null);
          }}
          className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'reports'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className={`w-4 h-4 ${activeTab === 'reports' ? 'text-brand-600' : ''}`} />
          所有报告 ({reports.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('prompt');
            setSelectedFeedback(null);
            setSelectedReport(null);
          }}
          className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'prompt'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Bot className={`w-4 h-4 ${activeTab === 'prompt' ? 'text-brand-600' : ''}`} />
          Prompt 管理
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
          <p className="mt-4 text-slate-500">加载中...</p>
        </div>
      ) : (
        activeTab === 'feedback' ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">用户反馈</h2>
              <button
                onClick={fetchData}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-brand-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>

            {feedbacks.length === 0 ? (
              <div className="p-12 text-center text-slate-500">暂无用户反馈</div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto">
                <div className="divide-y divide-slate-200">
                  {feedbacks.map((feedback) => (
                    <div key={feedback.id} className="p-6 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            {renderStars(feedback.rating)}
                            <span className="text-sm text-slate-500">
                              {new Date(feedback.createdAt).toLocaleString('zh-CN')}
                            </span>
                          </div>

                          {/* 基础信息卡片 */}
                          <div className="bg-brand-50/60 rounded-lg p-3 mb-3">
                            {feedback.jobTitle && (
                              <p className="text-sm text-slate-700 mb-1">
                                <span className="font-semibold text-brand-700">岗位：</span>{feedback.jobTitle}
                              </p>
                            )}
                            {feedback.fileName && (
                              <p className="text-sm text-slate-600 mb-1">
                                <span className="font-semibold text-brand-700">文件：</span>{feedback.fileName}
                              </p>
                            )}
                            {feedback.competencies && (
                              <div>
                                <p className="text-sm font-semibold text-brand-700 mb-1">能力维度：</p>
                                <p className="text-xs text-slate-600 whitespace-pre-wrap">{feedback.competencies}</p>
                              </div>
                            )}
                          </div>

                          {/* 问题标签 */}
                          {feedback.specificIssues && feedback.specificIssues.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {feedback.specificIssues.map((issue, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-full font-medium"
                                >
                                  {issue}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* 用户评论 */}
                          {feedback.comments && (
                            <div className="bg-yellow-50 rounded-lg p-3">
                              <p className="text-xs font-semibold text-yellow-700 mb-1">用户评论：</p>
                              <p className="text-sm text-slate-700">{feedback.comments}</p>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setSelectedFeedback(selectedFeedback?.id === feedback.id ? null : feedback)}
                          className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                            selectedFeedback?.id === feedback.id
                              ? 'bg-brand-100 text-brand-600'
                              : 'text-slate-400 hover:text-brand-600 hover:bg-slate-100'
                          }`}
                          title={selectedFeedback?.id === feedback.id ? "收起详情" : "查看完整评估"}
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </div>

                      {/* 展开的详细内容 */}
                      {selectedFeedback?.id === feedback.id && (
                        <div className="mt-4 border-2 border-brand-200 rounded-lg overflow-hidden">
                          {/* 标签页切换 */}
                          <div className="bg-brand-50 border-b border-brand-200">
                            <div className="flex">
                              <button
                                onClick={() => setFeedbackDetailTab('transcript')}
                                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                                  feedbackDetailTab === 'transcript'
                                    ? 'bg-brand-100 text-brand-700'
                                    : 'text-brand-600 hover:bg-brand-100 hover:text-brand-800'
                                }`}
                              >
                                <FileText className="w-4 h-4" /> 面试原文
                              </button>
                              <button
                                onClick={() => setFeedbackDetailTab('assessment')}
                                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                                  feedbackDetailTab === 'assessment'
                                    ? 'bg-brand-100 text-brand-700'
                                    : 'text-brand-600 hover:bg-brand-100 hover:text-brand-800'
                                }`}
                              >
                                <Bot className="w-4 h-4" /> 评估结果
                              </button>
                            </div>
                          </div>

                          {/* 内容区域 */}
                          <div className="p-4 bg-white max-h-[50vh] overflow-y-auto">
                            {feedbackDetailTab === 'transcript' ? (
                              <div>
                                {feedback.transcript ? (
                                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{feedback.transcript}</div>
                                ) : (
                                  <p className="text-sm text-slate-500 italic">暂无面试原文数据</p>
                                )}
                              </div>
                            ) : (
                              <div>
                                {feedback.assessmentResult ? (
                                  <div className="text-sm text-slate-700 whitespace-pre-wrap prose prose-sm">{feedback.assessmentResult}</div>
                                ) : (
                                  <p className="text-sm text-slate-500 italic">暂无评估结果数据</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'reports' ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">所有评估报告</h2>
              <button
                onClick={fetchData}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-brand-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
            </div>

            {reports.length === 0 ? (
              <div className="p-12 text-center text-slate-500">暂无评估报告</div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto">
                <div className="divide-y divide-slate-200">
                  {reports.map((report) => (
                    <div key={report.id} className="p-6 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex items-center gap-1.5 text-sm text-slate-500">
                              <Calendar className="w-4 h-4" />
                              <span>{format(new Date(report.createdAt), 'yyyy年M月d日 HH:mm')}</span>
                            </div>
                          </div>

                          <div className="mb-3">
                            <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
                              <Briefcase className="w-5 h-5 text-brand-600" />
                              {report.jobTitle}
                            </h3>
                            <p className="text-sm text-slate-600">{report.fileName}</p>
                          </div>

                          {report.competencies && (
                            <div className="mb-3">
                              <p className="text-sm font-semibold text-slate-700 mb-1">能力维度：</p>
                              <p className="text-sm text-slate-600 whitespace-pre-wrap">{report.competencies}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedReport(selectedReport?.id === report.id ? null : report)}
                            className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                              selectedReport?.id === report.id
                                ? 'bg-brand-100 text-brand-600'
                                : 'text-slate-400 hover:text-brand-600 hover:bg-slate-100'
                            }`}
                            title={selectedReport?.id === report.id ? "收起详情" : "查看评估"}
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* 展开的详细内容 */}
                      {selectedReport?.id === report.id && (
                        <div className="mt-4 border-2 border-brand-200 rounded-lg overflow-hidden">
                          {/* 标签页切换 */}
                          <div className="bg-brand-50 border-b border-brand-200">
                            <div className="flex">
                              <button
                                onClick={() => setReportDetailTab('transcript')}
                                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                                  reportDetailTab === 'transcript'
                                    ? 'bg-brand-100 text-brand-700'
                                    : 'text-brand-600 hover:bg-brand-100 hover:text-brand-800'
                                }`}
                              >
                                <FileText className="w-4 h-4" /> 面试原文
                              </button>
                              <button
                                onClick={() => setReportDetailTab('assessment')}
                                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                                  reportDetailTab === 'assessment'
                                    ? 'bg-brand-100 text-brand-700'
                                    : 'text-brand-600 hover:bg-brand-100 hover:text-brand-800'
                                }`}
                              >
                                <Bot className="w-4 h-4" /> 评估结果
                              </button>
                            </div>
                          </div>

                          {/* 内容区域 */}
                          <div className="p-4 bg-white max-h-[50vh] overflow-y-auto">
                            {reportDetailTab === 'transcript' ? (
                              <div>
                                {report.transcript ? (
                                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{report.transcript}</div>
                                ) : (
                                  <p className="text-sm text-slate-500 italic">暂无面试原文数据</p>
                                )}
                              </div>
                            ) : (
                              <div>
                                {report.result ? (
                                  <div className="text-sm text-slate-700 whitespace-pre-wrap prose prose-sm">{report.result}</div>
                                ) : (
                                  <p className="text-sm text-slate-500 italic">暂无评估结果数据</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">系统 Prompt</h2>
                <p className="mt-1 text-sm text-slate-500">招聘评估与个人复盘使用两套独立版本，修改互不影响。</p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {([
                  ['recruiter', '判断他人'],
                  ['candidate', '提升自己'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setPromptMode(mode)}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${promptMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between gap-4 mb-3">
                <label htmlFor="system-prompt" className="text-sm font-medium text-slate-700">
                  {promptMode === 'candidate' ? 'Candidate Prompt' : 'Recruiter Prompt'}
                </label>
                <span className="text-xs text-slate-400">当前版本：{promptVersion ?? '—'}</span>
              </div>
              {promptLoading ? (
                <div className="min-h-[420px] flex items-center justify-center text-sm text-slate-500">Prompt 加载中…</div>
              ) : (
                <textarea
                  id="system-prompt"
                  value={promptContent}
                  onChange={(event) => setPromptContent(event.target.value)}
                  spellCheck={false}
                  className="w-full min-h-[520px] rounded-lg border border-slate-300 px-4 py-3 font-mono text-sm leading-relaxed text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              )}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className={`text-sm ${promptMessage === '已保存为新版本' ? 'text-green-600' : 'text-red-600'}`}>{promptMessage}</div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fetchPrompt(promptMode)}
                    disabled={promptLoading || promptSaving}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    放弃修改
                  </button>
                  <button
                    onClick={savePrompt}
                    disabled={promptLoading || promptSaving}
                    className="px-5 py-2 rounded-lg bg-indigo-600 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {promptSaving ? '保存中…' : '保存为新版本'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* 提示信息 */}
      <div className="mt-8 p-4 bg-brand-50 border border-brand-200 rounded-lg">
        <h3 className="font-semibold text-brand-900 mb-2 flex items-center gap-1.5">
          <Lightbulb className="w-4 h-4" /> 提示
        </h3>
        <p className="text-sm text-brand-800">
          Prompt 修改会创建新版本并立即用于后续分析；Candidate Prompt 暂不使用反馈自动迭代。
        </p>
      </div>
    </div>
  );
};

export default AdminView;
