import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/context/AuthContext';
import {
  BrainCircuit, LogIn, ArrowRight, UploadCloud, ScanSearch, FileBarChart,
  Crosshair, Sparkles, History, MessageSquareQuote, Check,
} from 'lucide-react';

// Scroll-triggered reveal wrapper (IntersectionObserver, no external animation lib)
const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({
  children,
  delay = 0,
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      } ${className}`}
    >
      {children}
    </div>
  );
};

const WORKFLOW_STEPS = [
  {
    icon: UploadCloud,
    title: '上传面试材料',
    desc: '支持上传面试记录文件或直接粘贴文本，浏览器本地完成解析，材料不出本机。',
  },
  {
    icon: ScanSearch,
    title: 'AI 行为证据分析',
    desc: '基于 STAR 法则提取情境、任务、行动与结果，逐条还原候选人的真实行为证据。',
  },
  {
    icon: FileBarChart,
    title: '生成评估报告',
    desc: '结合岗位胜任力维度输出匹配度评分与专业录用建议，报告可留存、可反馈。',
  },
];

const FEATURES = [
  {
    icon: ScanSearch,
    title: 'STAR 证据提取',
    desc: '从冗长面试记录中结构化提取行为证据，减少主观印象分。',
  },
  {
    icon: Crosshair,
    title: '胜任力维度匹配',
    desc: '按目标岗位的核心胜任力逐项打分，人岗匹配一目了然。',
  },
  {
    icon: Sparkles,
    title: '录用建议生成',
    desc: '综合证据与匹配度给出明确的录用倾向与风险提示。',
  },
  {
    icon: History,
    title: '历史与反馈追踪',
    desc: '报告自动归档，支持对评估结果反馈，持续校准评估质量。',
  },
];

const MOCK_DIMENSIONS = [
  { label: '问题解决能力', value: 88 },
  { label: '沟通协作', value: 76 },
  { label: '结果导向', value: 82 },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const entryPath = user ? '/app' : '/login';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-300 selection:bg-brand-100 selection:text-brand-900">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-indigo-500 to-violet-500 p-1.5 rounded-lg text-white shadow-lg shadow-indigo-500/20">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              Bar Raiser{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                AI
              </span>
            </h1>
          </div>
          {user ? (
            <button
              onClick={() => navigate('/app')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 transition-all shadow-lg shadow-indigo-500/20"
            >
              进入应用
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 border border-slate-700 hover:text-white hover:border-indigo-400 hover:bg-white/5 transition-all"
            >
              <LogIn className="w-4 h-4" />
              登录
            </button>
          )}
        </div>
      </header>

      {/* Hero 区 */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] bg-violet-500/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1.2s' }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5" />
                AI 驱动的面试评估助手
              </span>
            </Reveal>
            <Reveal delay={100}>
              <h2 className="mt-6 text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight">
                让每一次面试评估
                <br />
                更{' '}
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  精准
                </span>
              </h2>
            </Reveal>
            <Reveal delay={200}>
              <p className="mt-6 text-base md:text-lg text-slate-400 leading-relaxed max-w-xl">
                上传面试记录，Bar Raiser AI 将基于 STAR 法则分析候选人的行为证据，
                结合岗位胜任力进行人岗匹配，生成专业、可追溯的录用建议——
                帮你把招聘标准抬得更高。
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={() => navigate(entryPath)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 transition-all shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5"
                >
                  开始使用
                  <ArrowRight className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Check className="w-4 h-4 text-indigo-400" />
                  面试材料仅在浏览器本地解析
                </div>
              </div>
            </Reveal>
          </div>

          {/* 报告预览 mock 卡片 */}
          <Reveal delay={250}>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-500 blur-2xl opacity-20 rounded-3xl" />
              <div className="relative bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <FileBarChart className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-white">面试评估报告</span>
                  </div>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
                    AI 生成
                  </span>
                </div>
                <div className="flex items-center gap-6 mb-6">
                  {/* 评分环 */}
                  <div className="relative w-24 h-24 flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="10" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke="url(#scoreGradient)" strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={`${0.82 * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                      />
                      <defs>
                        <linearGradient id="scoreGradient" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#818cf8" />
                          <stop offset="100%" stopColor="#a78bfa" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-white">82</span>
                      <span className="text-[10px] text-slate-500">匹配度</span>
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
                    {MOCK_DIMENSIONS.map((d) => (
                      <div key={d.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400">{d.label}</span>
                          <span className="text-slate-300 font-medium">{d.value}</span>
                        </div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                            style={{ width: `${d.value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-xs font-semibold text-white">录用建议</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    候选人行为证据充分，核心维度表现稳定，建议进入下一轮评估。
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 三步工作流 */}
      <section className="relative bg-slate-50 text-slate-900 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="text-center mb-14">
              <h3 className="text-3xl font-extrabold tracking-tight">三步完成一次专业评估</h3>
              <p className="mt-3 text-slate-600">从面试记录到录用建议，全流程由 AI 辅助完成。</p>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* 桌面端连线 */}
            <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-indigo-200 via-violet-300 to-indigo-200" />
            {WORKFLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <Reveal key={step.title} delay={i * 150}>
                  <div className="relative bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-bold text-indigo-500 mb-1">STEP {i + 1}</div>
                    <h4 className="text-lg font-bold mb-2">{step.title}</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">{step.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 核心能力 */}
      <section className="bg-white text-slate-900 py-20 border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="text-center mb-14">
              <h3 className="text-3xl font-extrabold tracking-tight">核心能力</h3>
              <p className="mt-3 text-slate-600">为 Bar Raiser 和招聘团队打造的评估工具箱。</p>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 100}>
                  <div className="h-full rounded-2xl border border-slate-200 p-6 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100 transition-all duration-300 group">
                    <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center mb-4 group-hover:bg-gradient-to-br group-hover:from-indigo-500 group-hover:to-violet-500 group-hover:text-white transition-all">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold mb-2">{f.title}</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 底部 CTA */}
      <section className="bg-slate-900 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <Reveal>
            <h3 className="text-3xl font-extrabold text-white tracking-tight">
              准备好提升面试评估质量了吗？
            </h3>
            <p className="mt-4 text-slate-400">
              登录后即可开始你的第一次面试分析。
            </p>
            <button
              onClick={() => navigate(entryPath)}
              className="mt-8 inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 transition-all shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5"
            >
              {user ? '进入应用' : '立即登录'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </Reveal>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="bg-slate-900 border-t border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <BrainCircuit className="w-4 h-4 text-indigo-400" />
            Bar Raiser AI — 面试记录分析与人岗匹配工具
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <MessageSquareQuote className="w-3.5 h-3.5" />
            让招聘决策有据可依
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
