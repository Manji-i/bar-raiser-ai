import React, { useState } from 'react';
import {
  FileBarChart, Crosshair, ScanSearch, ShieldAlert, Sparkles, ClipboardCheck,
  UserRound, Users,
} from 'lucide-react';

// 脱敏示例报告内容：全部为虚构数据，仅用于展示报告结构与效果
interface SampleSection {
  id: string;
  title: string;
  subtitle?: string;
  bullets: { label: string; text: string }[];
}

interface SampleGroup {
  icon: React.ComponentType<{ className?: string }>;
  headline: string;
  copy: string;
  sections: SampleSection[];
}

const CANDIDATE_GROUPS: SampleGroup[] = [
  {
    icon: FileBarChart,
    headline: '先给结论，不打分、不贴标签',
    copy: '复盘报告开头用三句话讲清本场表现：整体状态、值得保留与需要改进的数量、下次最该准备什么。不预测录用结果，只关注你能控制的部分。',
    sections: [
      {
        id: 'c0',
        title: '本场表现结论',
        bullets: [
          { label: '一句话总结', text: '整场回答信息量大但主线不够聚焦，高价值案例没有讲出与岗位要求匹配的深度' },
          { label: '本场重点', text: '值得保留的做法 2 项、核心改进问题 3 个；最优先改进的是"成果缺少量化结果"' },
          { label: '下次准备', text: '把 2 个核心项目按 STAR 结构重写，并补齐可量化的结果数据' },
        ],
      },
    ],
  },
  {
    icon: Sparkles,
    headline: '做对的地方，明确保留',
    copy: '复盘不是只挑毛病。报告会指出本场值得保留的做法与对应证据，让偶然的好表现变成稳定的答题习惯。',
    sections: [
      {
        id: 'c1',
        title: '值得保留的做法',
        bullets: [
          { label: '主动确认问题边界', text: '回答"如何处理招聘需求变更"前先澄清业务背景，避免答非所问' },
          { label: '用数据开场', text: '介绍交付成果时先报"年度 70+ 岗位、完成率 85%"，让面试官快速抓住体量' },
        ],
      },
    ],
  },
  {
    icon: ScanSearch,
    headline: '每个核心问题，拆到根因',
    copy: '只聚焦最影响表现的 3–5 个问题：面试官在验证什么、你的回答缺在哪、更好的结构是什么，并基于你的真实经历给出示范回答。',
    sections: [
      {
        id: 'c2',
        title: '最需要改进的核心问题',
        subtitle: '1. 成果缺少量化结果',
        bullets: [
          { label: '代表性问题', text: '"讲讲你主导过的最复杂的招聘项目。"' },
          { label: '面试官意图', text: '验证结果导向与项目的真实深度' },
          { label: '原回答的问题', text: '过程描述充分，但未给出交付周期、完成率等结果数据' },
          { label: '更好的结构', text: '结论先行 → 任务目标 → 2 个关键动作 → 量化结果' },
          { label: '示范回答', text: '"上季度我牵头 40+ 岗位集中交付，通过重构渠道组合与周度漏斗复盘，完成率 92%，高端岗位交付周期缩短 20%……"' },
        ],
      },
    ],
  },
  {
    icon: ClipboardCheck,
    headline: '下次面试，照着清单准备',
    copy: '报告最后收敛成一张按优先级排序的准备清单，每一条都可以直接执行，练完就能用。',
    sections: [
      {
        id: 'c3',
        title: '下一次面试准备清单',
        bullets: [
          { label: '动作 1', text: '为 2 个核心项目各补 3 个量化指标（完成率、交付周期、成本）' },
          { label: '动作 2', text: '用 90 秒版本复述"最复杂项目"，录音自查主线是否聚焦' },
          { label: '动作 3', text: '对照目标 JD 整理 5 个高频行为问题，写出 STAR 提纲' },
        ],
      },
    ],
  },
];

const RECRUITER_GROUPS: SampleGroup[] = [
  {
    icon: FileBarChart,
    headline: '基础信息与组织环境，不再遗漏',
    copy: '面试中的基础信息过往很容易被忽略或不好保存。报告会结构化整理候选人的基本情况与求职动机，避免遗漏，也方便多位候选人横向对比。',
    sections: [
      {
        id: 's0',
        title: '0. 候选人基础概览 (Candidate Overview)',
        bullets: [
          { label: '岗位/职级', text: '某出海互联网公司 高级招聘专家（P7 相当） | 状态: 在职' },
          { label: '看机会原因', text: '希望从单一模块转向全链路招聘管理，寻求业务体量更大、流程更规范的平台' },
          { label: '面试/Offer情况', text: '暂无已确认 Offer，另有 2 家同类企业在面试流程中' },
          { label: '过往绩效', text: '近两年绩效均为 B+ 及以上（团队前 30%）' },
          { label: '核心工作', text: '负责海外多条业务线招聘交付，年度交付 70+ 岗位，需求完成率超 85%，覆盖 P5-P8 职级' },
        ],
      },
    ],
  },
  {
    icon: Crosshair,
    headline: '结论先行，一眼看懂匹配度',
    copy: '报告开头直接给出 NH 到 H+ 的分级结论和一句话核心评价——不仅评价能力，更评价人与岗位的匹配度。先看结论，再按需深入证据细节。',
    sections: [
      {
        id: 's2',
        title: '2. 人岗匹配综述 (Job Fit Summary)',
        bullets: [
          { label: '岗位名称', text: '高级招聘专家' },
          { label: '匹配结论', text: 'H（可录用）' },
          { label: '核心评价', text: '作为【高级招聘专家】，候选人交付体量与跨市场经验与岗位要求高度匹配；管理复杂度略低于带团队要求，但不构成录用障碍。' },
        ],
      },
    ],
  },
  {
    icon: ScanSearch,
    headline: '每个维度都有据可查',
    copy: '指定的考察维度逐一评分，并附完整 STAR 证据链与匹配度分析。评估结果可追溯、可复核，减少主观印象分。',
    sections: [
      {
        id: 's3',
        title: '3. 指定维度详细评估 (Competency Evaluation)',
        subtitle: '结果导向',
        bullets: [
          { label: '评分', text: '8 / 10' },
          { label: 'STAR 证据 · S', text: '业务扩张期，季度招聘需求翻倍至 40+ 岗位' },
          { label: 'STAR 证据 · A', text: '重构渠道组合并建立周度漏斗复盘机制，亲自攻坚 10 个高端岗位' },
          { label: 'STAR 证据 · R', text: '季度需求完成率 92%，高端岗位平均交付周期缩短 20%' },
          { label: '匹配度分析', text: '案例体量与目标岗位相当，且有机制化沉淀，评为 H。' },
        ],
      },
    ],
  },
  {
    icon: ShieldAlert,
    headline: '风险提示与后续考察建议',
    copy: '报告会明确能力短板、人岗匹配风险（大材小用、经验断层、文化匹配等）与下一轮考察重点，让面试决策形成闭环。',
    sections: [
      {
        id: 's5',
        title: '5. 风险与建议',
        bullets: [
          { label: '能力短板', text: '雇主品牌与校招体系搭建经验较少' },
          { label: '匹配风险', text: '无明显大材小用风险；跳槽动机为寻求更大平台，与岗位诉求一致' },
          { label: '后续考察建议', text: '建议交叉面试重点验证高端岗位 Mapping 深度与带教方法论' },
        ],
      },
    ],
  },
];

const REPORT_MODES = [
  { id: 'candidate', label: '求职者 · 复盘报告', icon: UserRound, activeClass: 'bg-violet-600 text-white shadow-sm' },
  { id: 'recruiter', label: '招聘方 · 评估报告', icon: Users, activeClass: 'bg-indigo-600 text-white shadow-sm' },
] as const;

type ReportMode = (typeof REPORT_MODES)[number]['id'];

const ReportCard: React.FC<{ section: SampleSection }> = ({ section }) => {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
      <div className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-900">
        <span className="text-sm sm:text-base font-bold text-white tracking-tight">
          {section.title}
        </span>
      </div>
      <div className="bg-white px-5 sm:px-7 py-5">
        {section.subtitle && (
          <h5 className="text-sm font-bold text-indigo-600 mb-3">{section.subtitle}</h5>
        )}
        <ul className="space-y-2.5">
          {section.bullets.map((b) => (
            <li key={b.label} className="flex gap-2 text-sm leading-relaxed text-slate-700">
              <span className="mt-[9px] w-1 h-1 rounded-full bg-slate-900 flex-shrink-0" />
              <span>
                <strong className="text-slate-900">{b.label}:</strong> {b.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const SampleReportSection: React.FC = () => {
  const [mode, setMode] = useState<ReportMode>('candidate');
  const groups = mode === 'candidate' ? CANDIDATE_GROUPS : RECRUITER_GROUPS;

  return (
    <section className="bg-slate-50 text-slate-900 py-20 border-t border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <h3 className="text-3xl font-extrabold tracking-tight">两种视角，两份报告</h3>
          <p className="mt-3 text-slate-600">
            求职者拿到成长路径，招聘方拿到录用依据。以下为脱敏示例，即最终交付效果。
          </p>
          <div className="mt-8 flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full bg-slate-200/70 p-1">
              {REPORT_MODES.map((m) => {
                const Icon = m.icon;
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                      active ? m.activeClass : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-14">
          {groups.map((group, gi) => {
            const Icon = group.icon;
            return (
              <div
                key={group.headline}
                className="grid lg:grid-cols-5 gap-6 lg:gap-10 items-start"
              >
                {/* 配文 */}
                <div className={`lg:col-span-2 lg:sticky lg:top-24 ${gi % 2 === 1 ? 'lg:order-2' : ''}`}>
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h4 className="text-xl font-bold mb-2">{group.headline}</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">{group.copy}</p>
                </div>
                {/* 示例报告卡片 */}
                <div className={`lg:col-span-3 space-y-4 ${gi % 2 === 1 ? 'lg:order-1' : ''}`}>
                  {group.sections.map((s) => (
                    <ReportCard key={s.id} section={s} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SampleReportSection;
