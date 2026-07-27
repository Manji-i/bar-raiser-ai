import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';
import { AnalysisInput, AnalysisMode, AnalysisState, AnalysisStatus, CandidateAnalysisInput } from './types';
import { analyzeInterview } from './services/geminiService';
import FileUpload from './components/FileUpload';
import CandidateFileUpload from './components/CandidateFileUpload';
import ReportView from './components/ReportView';
import HistoryView from './components/HistoryView';
import AdminView from './components/AdminView';
import LoginPage from './src/components/LoginPage';
import LandingPage from './components/LandingPage';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import {
  consumePostLoginPath,
  getRecentMode,
  isAnalysisMode,
  modeFromPath,
  modePath,
  rememberMode,
} from './services/analysisMode';
import {
  BrainCircuit, History, PlusCircle, Settings, LogOut, User, Menu, X,
  FileSearch, ScanSearch, Crosshair, Sparkles, Check,
} from 'lucide-react';

// 受保护的路由组件
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// 登录页面路由组件
const LoginRoute: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to={consumePostLoginPath() ?? modePath(getRecentMode(), 'app')} replace />;
  }

  return <LoginPage />;
};

// 仅管理员的路由组件
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!user || !user.isAdmin) {
    return <Navigate to={modePath(getRecentMode(), 'app')} replace />;
  }

  return <>{children}</>;
};

const LegacyModeRedirect: React.FC<{ area: 'app' | 'history' }> = ({ area }) => (
  <Navigate to={modePath(getRecentMode(), area)} replace />
);

const ModeParamRoute: React.FC<{
  children: (mode: AnalysisMode) => React.ReactNode;
}> = ({ children }) => {
  const { mode } = useParams();
  const validMode = isAnalysisMode(mode) ? mode : null;

  useEffect(() => {
    if (validMode) rememberMode(validMode);
  }, [validMode]);

  if (!validMode) {
    return <Navigate to={modePath('recruiter', 'app')} replace />;
  }

  return <>{children(validMode)}</>;
};

// Sidebar navigation definition
interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: '新建分析', path: '/app', icon: PlusCircle },
  { label: '历史记录', path: '/history', icon: History },
];

const TopNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentMode = modeFromPath(location.pathname) ?? getRecentMode();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const items = NAV_ITEMS.map((item) => ({
    ...item,
    path: item.path === '/app' ? modePath(currentMode, 'app') : modePath(currentMode, 'history'),
  }));
  if (user?.isAdmin) {
    items.push({ label: '管理后台', path: '/admin', icon: Settings });
  }

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const go = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const switchMode = (mode: AnalysisMode) => {
    rememberMode(mode);
    go(modePath(mode, 'app'));
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900 text-slate-300 shadow-lg shadow-slate-900/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer flex-shrink-0" onClick={() => go(modePath(currentMode, 'app'))}>
          <div className="bg-gradient-to-br from-indigo-500 to-violet-500 p-1.5 rounded-lg text-white shadow-lg shadow-indigo-500/20">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">
            Eval Bar <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">AI</span>
          </h1>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <div className="flex items-center p-1 mr-2 rounded-full bg-white/5 border border-white/10" aria-label="分析模式">
            {([
              ['candidate', '提升自己'],
              ['recruiter', '判断他人'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  currentMode === mode ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {items.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? 'text-white bg-white/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
                {active && (
                  <span className="absolute inset-x-4 -bottom-[13px] h-0.5 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Desktop user */}
        {user && (
          <div className="hidden md:flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white">
                <User className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-white max-w-[120px] truncate">{user.username}</span>
              {user.isAdmin && (
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full">
                  管理员
                </span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              退出
            </button>
          </div>
        )}

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-800 px-4 py-3 space-y-1">
          <div className="grid grid-cols-2 gap-2 pb-3 mb-2 border-b border-slate-800">
            {([
              ['candidate', '提升自己'],
              ['recruiter', '判断他人'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentMode === mode ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {items.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'text-white bg-white/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
          {user && (
            <div className="pt-3 mt-2 border-t border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-white truncate">{user.username}</span>
                {user.isAdmin && (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    管理员
                  </span>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors flex-shrink-0"
              >
                <LogOut className="w-4 h-4" />
                退出
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

// Staged progress component shown while ANALYZING
const ANALYSIS_STAGES = [
  { label: '解析面试材料', icon: FileSearch },
  { label: '提取 STAR 行为证据', icon: ScanSearch },
  { label: '匹配胜任力维度', icon: Crosshair },
  { label: '生成评估结论', icon: Sparkles },
];

const CANDIDATE_ANALYSIS_STAGES = [
  { label: '解析面试与简历材料', icon: FileSearch },
  { label: '识别关键问题与真实追问', icon: ScanSearch },
  { label: '归纳核心改进问题', icon: Crosshair },
  { label: '生成示范与训练建议', icon: Sparkles },
];

const AnalyzingProgress: React.FC<{ mode: AnalysisMode }> = ({ mode }) => {
  const [stage, setStage] = useState(0);
  const stages = mode === 'candidate' ? CANDIDATE_ANALYSIS_STAGES : ANALYSIS_STAGES;

  useEffect(() => {
    // Illustrative staged progress: advance on a timer, hold on the last stage
    const timer = setInterval(() => {
      setStage((s) => Math.min(s + 1, stages.length - 1));
    }, 2500);
    return () => clearInterval(timer);
  }, [stages.length]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-300 to-violet-300 blur-xl rounded-full opacity-50 animate-pulse"></div>
        <Sparkles className="w-14 h-14 text-brand-600 relative z-10 animate-bounce" />
      </div>
      <h3 className="mt-8 text-2xl font-bold text-slate-800">正在分析面试记录…</h3>
      <p className="mt-2 text-slate-500 text-center max-w-md">
        正在执行评估流程，可能需要片刻时间。
      </p>

      <div className="mt-10 w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        {stages.map((s, i) => {
          const Icon = s.icon;
          const done = i < stage;
          const current = i === stage;
          return (
            <div key={s.label} className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  done
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white'
                    : current
                      ? 'bg-brand-50 text-brand-600 ring-2 ring-brand-200 animate-pulse'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span
                className={`text-sm font-medium transition-colors ${
                  done ? 'text-slate-700' : current ? 'text-brand-700' : 'text-slate-400'
                }`}
              >
                {s.label}
              </span>
              {current && (
                <span className="ml-auto flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Global shell: top navigation + content area
const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-brand-100 selection:text-brand-900">
      <TopNav />
      <main className="min-h-[calc(100vh-4rem)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
};

// 主应用内容
const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeMode = modeFromPath(location.pathname);
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: AnalysisStatus.IDLE,
    result: null,
    error: null,
    fileName: null,
  });

  useEffect(() => {
    if (!routeMode) return;
    setAnalysisState({
      status: AnalysisStatus.IDLE,
      result: null,
      error: null,
      fileName: null,
      analysisMode: routeMode,
    });
  }, [routeMode]);

  const runAnalysis = async (input: AnalysisInput) => {
    setAnalysisState((prev) => ({
      ...prev,
      status: AnalysisStatus.ANALYZING,
      fileName: input.fileName,
      analysisMode: input.analysisMode,
      jobDescription: input.analysisMode === 'candidate' ? input.jobDescription : null,
      resumeFileName: input.analysisMode === 'candidate' ? input.resumeFile?.name ?? null : null,
      resumeParseStatus: input.analysisMode === 'candidate' ? input.resumeParseStatus : null,
      error: null,
    }));

    try {
      const { result, reportId } = await analyzeInterview(input);
      setAnalysisState((prev) => ({
        ...prev,
        status: AnalysisStatus.COMPLETE,
        result,
        reportId,
      }));
    } catch (error: any) {
      setAnalysisState((prev) => ({
        ...prev,
        status: AnalysisStatus.ERROR,
        error: error.message || '分析过程中出现错误，请稍后重试。',
      }));
    }
  };

  const handleStartAnalysis = (data: {
    content: string;
    fileName: string;
    jobTitle: string;
    competencies: string
  }) => {
    void runAnalysis({
      analysisMode: 'recruiter',
      transcript: data.content,
      fileName: data.fileName,
      jobTitle: data.jobTitle,
      competencies: data.competencies,
    });
  };

  const handleCandidateStartAnalysis = (input: CandidateAnalysisInput) => {
    void runAnalysis(input);
  };

  const handleReset = () => {
    setAnalysisState({
      status: AnalysisStatus.IDLE,
      result: null,
      error: null,
      fileName: null,
      analysisMode: routeMode ?? getRecentMode(),
    });
    navigate(modePath(routeMode ?? getRecentMode(), 'app'));
  };

  return (
    <Routes>
      {/* 产品首页（公开） */}
      <Route path="/" element={<LandingPage />} />

      {/* 登录页面 */}
      <Route path="/login" element={<LoginRoute />} />

      {/* 受保护的路由 */}
      <Route path="/app" element={<LegacyModeRedirect area="app" />} />
      <Route path="/app/:mode" element={
        <ProtectedRoute>
          <ModeParamRoute>{(mode) => (
          <AppShell>
            {analysisState.status === AnalysisStatus.IDLE && (
              <div className="space-y-8">
                <div className="text-center max-w-4xl mx-auto mb-10">
                  <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
                    {mode === 'candidate' ? '复盘每一次面试，让自己更' : '让每一次面试评估更'}{' '}
                    <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
                      {mode === 'candidate' ? '出色' : '精准'}
                    </span>
                  </h2>
                  <p className="text-base md:text-lg text-slate-600 leading-relaxed md:whitespace-nowrap">
                    {mode === 'candidate'
                      ? '上传你的面试记录，AI 将优先依据真实追问，找出核心问题并给出下一次可直接使用的改进建议。'
                      : '上传面试记录，AI 将基于 STAR 法则分析行为证据，结合人岗匹配度生成专业的录用建议。'}
                  </p>
                </div>

                {mode === 'candidate' ? (
                  <CandidateFileUpload onStartAnalysis={handleCandidateStartAnalysis} isLoading={false} />
                ) : (
                  <FileUpload onStartAnalysis={handleStartAnalysis} isLoading={false} />
                )}
              </div>
            )}

            {analysisState.status === AnalysisStatus.ANALYZING && (
              <AnalyzingProgress mode={mode} />
            )}

            {analysisState.status === AnalysisStatus.COMPLETE && (
              <ReportView
                analysis={analysisState}
                onReset={handleReset}
              />
            )}

            {analysisState.status === AnalysisStatus.ERROR && (
              <div className="max-w-xl mx-auto mt-12 text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 90011-18 0 9 900118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">分析失败</h3>
                <p className="text-slate-500 mb-8">{analysisState.error}</p>
                <button
                  onClick={handleReset}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg font-medium hover:from-indigo-600 hover:to-violet-600 transition-all shadow-sm"
                >
                  重试
                </button>
              </div>
            )}
          </AppShell>
          )}</ModeParamRoute>
        </ProtectedRoute>
      } />

      <Route path="/history" element={<LegacyModeRedirect area="history" />} />
      <Route path="/history/:mode" element={
        <ProtectedRoute>
          <ModeParamRoute>{(mode) => (
            <AppShell>
              <HistoryView mode={mode} />
            </AppShell>
          )}</ModeParamRoute>
        </ProtectedRoute>
      } />
      <Route path="/report/:id" element={
        <ProtectedRoute>
          <AppShell>
            <ReportView />
          </AppShell>
        </ProtectedRoute>
      } />

      {/* Admin路由 - 仅管理员 */}
      <Route path="/admin" element={
        <AdminRoute>
          <AppShell>
            <AdminView />
          </AppShell>
        </AdminRoute>
      } />
    </Routes>
  );
};

// 根应用
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
