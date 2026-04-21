import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { AnalysisState, AnalysisStatus } from './types';
import { analyzeInterview } from './services/geminiService';
import FileUpload from './components/FileUpload';
import ReportView from './components/ReportView';
import HistoryView from './components/HistoryView';
import AdminView from './components/AdminView';
import LoginPage from './src/components/LoginPage';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Sparkles, BrainCircuit, History, Home, Settings, LogOut, User } from 'lucide-react';

// 飞书回调处理组件
const FeishuCallback: React.FC = () => {
  const { handleFeishuCallback, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  React.useEffect(() => {
    console.log('FeishuCallback: 开始处理回调');
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const userStr = params.get('user');
    
    console.log('FeishuCallback: URL参数 - token:', !!token, 'userStr:', !!userStr);
    
    if (token && userStr) {
      try {
        const decodedUserStr = decodeURIComponent(userStr);
        console.log('FeishuCallback: 解码后的userStr:', decodedUserStr);
        const parsedUser = JSON.parse(decodedUserStr);
        console.log('FeishuCallback: 解析后的user:', parsedUser);
        handleFeishuCallback(token, parsedUser);
        console.log('FeishuCallback: 用户数据已设置');
        // 不需要立即导航，让下面的 useEffect 处理
      } catch (error) {
        console.error('处理飞书回调失败:', error);
        navigate('/login');
      }
    } else {
      console.log('FeishuCallback: 缺少参数，导航到登录页');
      navigate('/login');
    }
  }, [location.search, handleFeishuCallback, navigate]);

  // 监听用户状态，当用户数据设置好后再导航
  React.useEffect(() => {
    console.log('FeishuCallback: 用户状态变化 - loading:', loading, 'user:', !!user);
    if (!loading && user) {
      console.log('FeishuCallback: 用户已登录，导航到首页');
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );
};

// 飞书登录错误组件
const FeishuError: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const params = new URLSearchParams(location.search);
  const error = params.get('error') || '登录失败';
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-red-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 90011-18 0 9 900118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">飞书登录失败</h1>
        <p className="text-slate-600 mb-6">{error}</p>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          返回登录
        </button>
      </div>
    </div>
  );
};

// 受保护的路由组件
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  console.log('ProtectedRoute: loading=', loading, 'user=', !!user);
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }
  
  if (!user) {
    console.log('ProtectedRoute: 没有用户，导航到登录页');
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

// 登录页面路由组件
const LoginRoute: React.FC = () => {
  const { user, loading } = useAuth();
  
  console.log('LoginRoute: loading=', loading, 'user=', !!user);
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }
  
  if (user) {
    console.log('LoginRoute: 已有用户，导航到首页');
    return <Navigate to="/" replace />;
  }
  
  return <LoginPage />;
};

// 仅管理员的路由组件
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }
  
  if (!user || !user.isAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

// 主应用内容
const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
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
      const { result, reportId } = await analyzeInterview(
        data.content, 
        data.jobTitle, 
        data.competencies,
        data.fileName
      );
      
      setAnalysisState((prev) => ({
        ...prev,
        status: AnalysisStatus.COMPLETE,
        result,
        reportId
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
    navigate('/');
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Bar Raiser <span className="text-indigo-600">AI</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <User className="w-4 h-4" />
                  <span>{user.username}</span>
                  {user.isAdmin && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      管理员
                    </span>
                  )}
                </div>
                
                {location.pathname !== '/history' && (
                  <button 
                    onClick={() => navigate('/history')}
                    className="text-sm font-medium text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 transition-colors"
                  >
                    <History className="w-4 h-4" />
                    History
                  </button>
                )}
                
                {user.isAdmin && location.pathname !== '/admin' && (
                  <button 
                    onClick={() => navigate('/admin')}
                    className="text-sm font-medium text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Admin
                  </button>
                )}
                
                {location.pathname !== '/' && (
                  <button 
                    onClick={() => navigate('/')}
                    className="text-sm font-medium text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 transition-colors"
                  >
                    <Home className="w-4 h-4" />
                    Home
                  </button>
                )}
                
                <button 
                  onClick={handleLogout}
                  className="text-sm font-medium text-slate-600 hover:text-red-600 flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  退出
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Routes>
          {/* 登录页面 */}
          <Route path="/login" element={<LoginRoute />} />
          
          {/* 飞书回调路由 */}
          <Route path="/auth/feishu/callback" element={<FeishuCallback />} />
          <Route path="/auth/feishu/error" element={<FeishuError />} />
          
          {/* 受保护的路由 */}
          <Route path="/" element={
            <ProtectedRoute>
              <>
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
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 90011-18 0 9 900118 0zm-9 3.75h.008v.008H12v-.008z" />
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
              </>
            </ProtectedRoute>
          } />
          
          <Route path="/history" element={
            <ProtectedRoute>
              <HistoryView />
            </ProtectedRoute>
          } />
          <Route path="/report/:id" element={
            <ProtectedRoute>
              <ReportView />
            </ProtectedRoute>
          } />
          
          {/* Admin路由 - 仅管理员 */}
          <Route path="/admin" element={
            <AdminRoute>
              <AdminView />
            </AdminRoute>
          } />
        </Routes>
      </main>
    </div>
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
