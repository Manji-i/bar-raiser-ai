import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { CandidateReportData, ReportDocumentModel } from '../reportDocumentModel.ts';

const PDF = {
  brand: '#6366F1',
  brandDark: '#4F46E5',
  slate900: '#0F172A',
  slate800: '#1E293B',
  slate600: '#475569',
  slate400: '#94A3B8',
  slate200: '#E2E8F0',
  brand50: '#EEF2FF',
  brand100: '#E0E7FF',
};

type PdfTextRun = { text: string; bold?: boolean };

export const toPdfRuns = (markdown: string): PdfTextRun[] => {
  const runs: PdfTextRun[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  for (const match of markdown.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) runs.push({ text: markdown.slice(cursor, index) });
    runs.push({ text: match[1], bold: true });
    cursor = index + match[0].length;
  }
  if (cursor < markdown.length) runs.push({ text: markdown.slice(cursor) });
  return runs.length > 0 ? runs : [{ text: markdown }];
};

const formatCreatedAt = (createdAt: string | null): string | null => {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const buildHero = (model: ReportDocumentModel): Content => {
  const metadata = [model.fileName, formatCreatedAt(model.createdAt)].filter(Boolean).join('  ·  ');
  const heroColumns: Content[] = [{
    width: '*',
    stack: [
      {
        text: model.mode === 'candidate' ? '个人复盘报告' : '评估报告',
        fontSize: 8,
        bold: true,
        color: PDF.brand100,
        characterSpacing: 0.8,
      },
      { text: model.title, style: 'heroTitle', margin: [0, 4, 0, 5] },
      { text: metadata || '由 Eval Bar AI 生成', fontSize: 8, color: PDF.slate200 },
    ],
  }];

  if (model.overallScore) {
    heroColumns.push({
      width: 76,
      stack: [
        { text: '匹配等级', alignment: 'center', fontSize: 7, bold: true, color: PDF.slate200 },
        { text: model.overallScore, alignment: 'center', fontSize: 24, bold: true, color: '#FFFFFF', margin: [0, 2, 0, 0] },
      ],
    });
  }

  return {
    table: {
      widths: ['*'],
      body: [[{
        columns: heroColumns,
        columnGap: 12,
        margin: [14, 12, 14, 12],
      }]],
    },
    layout: {
      fillColor: () => PDF.slate800,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
    margin: [0, 0, 0, 10],
  };
};

const sectionBand = (title: string): Content => ({
  table: {
    dontBreakRows: true,
    widths: ['*'],
    body: [[{ text: title, style: 'sectionTitle', margin: [10, 7, 10, 7] }]],
  },
  layout: {
    fillColor: () => PDF.slate800,
    hLineWidth: () => 0,
    vLineWidth: () => 0,
  },
  margin: [0, 8, 0, 8],
  headlineLevel: 1,
  unbreakable: true,
});

const paragraphCard = (text: string, fillColor = '#FFFFFF'): Content => {
  if (text.length > 800) {
    return {
      text: toPdfRuns(text),
      style: 'body',
      margin: [9, 7, 9, 7],
    };
  }
  return {
    table: {
      widths: ['*'],
      body: [[{ text: toPdfRuns(text), style: 'body', margin: [9, 7, 9, 7] }]],
    },
    layout: {
      fillColor: () => fillColor,
      hLineColor: () => PDF.slate200,
      vLineColor: () => PDF.slate200,
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
    },
    margin: [0, 0, 0, 6],
  };
};

const markdownBody = (body: string): Content[] => body
  .split(/\n\s*\n/)
  .map((block) => block.trim())
  .filter(Boolean)
  .flatMap((block): Content[] => {
    if (block.startsWith('### ')) {
      const [heading, ...bodyLines] = block.split('\n');
      return [
        {
          text: heading.slice(4).trim(),
          style: 'dimensionTitle',
          headlineLevel: 2,
          margin: [0, 6, 0, 5],
        },
        ...markdownBody(bodyLines.join('\n')),
      ];
    }

    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      return [{
        ul: lines.map((line) => ({ text: toPdfRuns(line.replace(/^[-*]\s+/, '')) })),
        margin: [12, 0, 0, 6],
      }];
    }
    return [paragraphCard(lines.join(' '))];
  });

const dimensionOverview = (model: ReportDocumentModel): Content[] => model.dimensions.length === 0 ? [] : [{
  table: {
    headerRows: 1,
    widths: ['*', 44],
    body: [
      [
        { text: '胜任力维度评分', bold: true, color: PDF.slate900, fillColor: PDF.brand50, margin: [7, 5, 7, 5] },
        { text: '等级', bold: true, alignment: 'center', color: PDF.slate900, fillColor: PDF.brand50, margin: [7, 5, 7, 5] },
      ],
      ...model.dimensions.map((item) => [
        { text: item.name, margin: [7, 5, 7, 5] },
        { text: item.score, bold: true, color: PDF.brandDark, alignment: 'center', margin: [7, 5, 7, 5] },
      ]),
    ],
  },
  layout: {
    hLineColor: () => PDF.slate200,
    vLineColor: () => PDF.slate200,
    hLineWidth: () => 0.6,
    vLineWidth: () => 0.6,
  },
  margin: [0, 0, 0, 8],
}];

const buildRecruiterContent = (model: ReportDocumentModel): Content[] => [
  ...dimensionOverview(model),
  ...model.sections.flatMap((section) => [sectionBand(section.title), ...markdownBody(section.body)]),
];

const buildCandidateContent = (candidate: CandidateReportData): Content[] => [
  sectionBand(candidate.conclusion.title),
  ...candidate.conclusion.items.map((item) => paragraphCard(
    item.label ? `**${item.label}：**${item.text}` : item.text,
  )),
  ...(candidate.strengths ? [
    sectionBand(candidate.strengths.title),
    ...candidate.strengths.items.map((item) => paragraphCard(
      item.title ? `**${item.title}：**${item.evidence}` : item.evidence,
    )),
  ] : []),
  sectionBand(candidate.problems.title),
  ...candidate.problems.items.flatMap((problem, index) => [
    {
      text: `${String(index + 1).padStart(2, '0')}  ${problem.rootCause}`,
      style: 'dimensionTitle',
      headlineLevel: 2,
      margin: [0, 6, 0, 5],
    },
    ...problem.fields.map((field) => paragraphCard(
      `**${field.label}：**${field.text}`,
      field.label.includes('示范') ? PDF.brand50 : '#FFFFFF',
    )),
  ]),
  ...(candidate.checklist ? [
    sectionBand(candidate.checklist.title),
    {
      ol: candidate.checklist.items.map((text) => ({ text: toPdfRuns(text) })),
      margin: [12, 0, 0, 6],
    },
  ] : []),
];

const buildContent = (model: ReportDocumentModel): Content[] => [
  buildHero(model),
  ...(model.mode === 'candidate' && model.candidate
    ? buildCandidateContent(model.candidate)
    : buildRecruiterContent(model)),
];

export const buildReportPdfDocument = (model: ReportDocumentModel): TDocumentDefinitions => ({
  pageSize: 'A4',
  pageMargins: [30, 34, 30, 38],
  defaultStyle: {
    font: 'NotoSansSC',
    fontSize: 9.5,
    lineHeight: 1.55,
    color: PDF.slate600,
  },
  styles: {
    heroTitle: { fontSize: 22, bold: true, color: '#FFFFFF' },
    sectionTitle: { fontSize: 13, bold: true, color: '#FFFFFF' },
    dimensionTitle: { fontSize: 11, bold: true, color: PDF.brandDark },
    body: { fontSize: 9.5, lineHeight: 1.55, color: PDF.slate600 },
  },
  footer: (page, pages) => ({
    margin: [30, 10, 30, 0],
    columns: [
      { text: 'Eval Bar AI · 仅供内部参考', color: PDF.slate400, fontSize: 7.5 },
      { text: `第 ${page} / ${pages} 页`, alignment: 'right', color: PDF.slate400, fontSize: 7.5 },
    ],
  }),
  content: buildContent(model),
  pageBreakBefore: (node, container) => (
    (node.headlineLevel === 1 || node.headlineLevel === 2)
    && (
      node.startPosition.verticalRatio > 0.8
      || container.getFollowingNodesOnPage().length === 0
    )
  ),
});
