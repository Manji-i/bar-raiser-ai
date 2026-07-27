import React from 'react';

/**
 * 视觉基元层 —— 项目视觉体系的单一来源。
 * 新增页面/组件优先使用这里的 Button / Card / Input / ScoreBadge / IconTile；
 * 需要新的视觉元素时先在此扩展，不要在页面里另写一套样式。
 * 修改本文件即修改整个视觉体系，需同步更新 AGENTS.md「视觉体系」章节。
 */

/** 品牌渐变（indigo → violet），全站唯一品牌签名 */
export const BRAND_GRADIENT = 'bg-gradient-to-r from-indigo-500 to-violet-500';
export const BRAND_GRADIENT_HOVER = 'hover:from-indigo-600 hover:to-violet-600';

/** 评分等级语义配色：H+/MH → 品牌渐变，H → 绿，H- → 琥珀，NH → 红 */
export const getScoreBadgeClass = (score: string) => {
  if (score === 'MH' || score === 'H+') {
    return `${BRAND_GRADIENT} text-white border-transparent`;
  }
  if (score === 'H') return 'bg-green-50 border-green-200 text-green-800';
  if (score === 'H-') return 'bg-amber-50 border-amber-200 text-amber-800';
  if (score === 'NH') return 'bg-red-50 border-red-200 text-red-800';
  return 'bg-slate-50 border-slate-200 text-slate-600';
};

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'icon';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariantClass: Record<ButtonVariant, string> = {
  // 主按钮：品牌渐变 + 白字，hover 加深
  primary: `${BRAND_GRADIENT} text-white font-medium ${BRAND_GRADIENT_HOVER} transition-all shadow-sm disabled:opacity-50`,
  // 次按钮：白底 slate 边框
  secondary:
    'text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 font-medium shadow-sm transition-colors disabled:opacity-50',
  // 危险按钮：浅红底
  danger: 'text-red-600 bg-red-50 hover:bg-red-100 font-medium transition-colors disabled:opacity-50',
  // 图标按钮：无框，hover 显示品牌色
  icon: 'p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50',
};

const buttonSizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-8 py-3.5 text-base rounded-xl gap-2',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) => (
  <button
    className={`inline-flex items-center justify-center ${buttonVariantClass[variant]} ${
      variant === 'icon' ? '' : buttonSizeClass[size]
    } ${className}`}
    {...props}
  />
);

/** 标准卡片：白底、圆角 2xl、slate 边框、轻阴影 */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 小一号圆角（rounded-xl），用于嵌套或紧凑场景 */
  compact?: boolean;
}

export const Card: React.FC<CardProps> = ({ compact = false, className = '', ...props }) => (
  <div
    className={`bg-white ${compact ? 'rounded-xl' : 'rounded-2xl'} border border-slate-200 shadow-sm p-6 md:p-8 ${className}`}
    {...props}
  />
);

/** 标准输入框：slate 边框，focus 显示品牌色 ring */
export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className = '',
  ...props
}) => (
  <input
    className={`w-full px-4 py-3 border border-slate-300 rounded-lg outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-200 placeholder:text-slate-400 ${className}`}
    {...props}
  />
);

/** 评分徽章：封装评分等级配色与徽章尺寸 */
interface ScoreBadgeProps {
  score: string;
  /** sm = 圆角小徽章（维度分），md = 药丸大徽章（综合评级） */
  size?: 'sm' | 'md';
  className?: string;
}

export const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score, size = 'sm', className = '' }) => (
  <span
    className={`${
      size === 'md' ? 'px-3 py-1.5 rounded-full' : 'px-2.5 py-0.5 rounded-md'
    } text-xs font-bold border ${getScoreBadgeClass(score)} ${className}`}
  >
    {score}
  </span>
);

/** 图标容器：gradient = 品牌渐变块（Logo/强调），soft = 浅色品牌底（功能图标） */
interface IconTileProps {
  variant?: 'gradient' | 'soft';
  className?: string;
  children: React.ReactNode;
}

export const IconTile: React.FC<IconTileProps> = ({
  variant = 'gradient',
  className = '',
  children,
}) => (
  <div
    className={`flex items-center justify-center rounded-lg ${
      variant === 'gradient'
        ? `${BRAND_GRADIENT} text-white shadow-lg shadow-indigo-500/20`
        : 'bg-brand-50 text-brand-600'
    } ${className}`}
  >
    {children}
  </div>
);
