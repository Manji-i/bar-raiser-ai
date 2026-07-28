import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Target, UserCheck, UserPlus } from 'lucide-react';
import { Button, Input, IconTile } from '../../components/ui';
import {
  consumePostLoginMode,
  modePath,
  type AnalysisMode,
} from '../../services/analysisMode';

const LoginPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<AnalysisMode>(
    () => consumePostLoginMode() ?? 'recruiter',
  );
  
  const { login, register, user, analysisMode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && analysisMode) {
      navigate(modePath(analysisMode, 'app'), { replace: true });
    }
  }, [user, analysisMode, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(username, password, selectedMode);
      } else {
        await register(username, password, selectedMode, email || undefined);
      }
      navigate(modePath(selectedMode, 'app'), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <IconTile className="w-16 h-16 rounded-xl mx-auto mb-4">
            {isLogin ? (
              <LogIn className="w-8 h-8" />
            ) : (
              <UserPlus className="w-8 h-8" />
            )}
          </IconTile>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {isLogin ? '欢迎回来' : '创建账号'}
          </h1>
          <p className="text-slate-600">
            {isLogin ? '登录以继续使用面试评估' : '注册账号，开始你的首次评估'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset>
            <legend className="block text-sm font-medium text-slate-700 mb-2">
              使用角色
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={selectedMode === 'candidate' ? 'primary' : 'secondary'}
                aria-pressed={selectedMode === 'candidate'}
                onClick={() => setSelectedMode('candidate')}
                className="min-h-20 flex-col"
              >
                <Target className="w-5 h-5" />
                <span>提升自己</span>
              </Button>
              <Button
                type="button"
                variant={selectedMode === 'recruiter' ? 'primary' : 'secondary'}
                aria-pressed={selectedMode === 'recruiter'}
                onClick={() => setSelectedMode('recruiter')}
                className="min-h-20 flex-col"
              >
                <UserCheck className="w-5 h-5" />
                <span>判断他人</span>
              </Button>
            </div>
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              用户名
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入用户名"
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                邮箱（可选）
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="输入邮箱"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              密码
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full py-3"
          >
            {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-brand-600 hover:text-brand-700 font-medium text-sm"
          >
            {isLogin ? '还没有账号？立即注册' : '已有账号？返回登录'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
