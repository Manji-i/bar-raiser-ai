import React from 'react';
import { FileBarChart, Crosshair, ScanSearch, ShieldAlert } from 'lucide-react';

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

const SAMPLE_GROUPS: SampleGroup[] = [
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
  return (
    <section className="bg-slate-50 text-slate-900 py-20 border-t border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h3 className="text-3xl font-extrabold tracking-tight">一份报告，讲清一个候选人</h3>
          <p className="mt-3 text-slate-600">
            从基础概览到风险提示，结论先行、证据可查、建议可执行。以下为脱敏示例，即最终交付效果。
          </p>
        </div>

        <div className="space-y-14">
          {SAMPLE_GROUPS.map((group, gi) => {
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
