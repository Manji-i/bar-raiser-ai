import type { AnalysisMode, ResumeParseStatus } from '../types.ts';

export interface ReportSection {
  id: string;
  title: string;
  body: string;
}

export interface DimensionScore {
  name: string;
  score: string;
}

export interface CandidateConclusionItem {
  label: string;
  text: string;
}

export interface CandidateStrength {
  title: string;
  evidence: string;
}

export interface CandidateProblemField {
  label: string;
  text: string;
}

export interface CandidateProblem {
  rootCause: string;
  fields: CandidateProblemField[];
}

export interface CandidateReportData {
  conclusion: { id: string; title: string; items: CandidateConclusionItem[] };
  strengths: { id: string; title: string; items: CandidateStrength[] } | null;
  problems: { id: string; title: string; items: CandidateProblem[] };
  checklist: { id: string; title: string; items: string[] } | null;
}

export interface ReportDocumentInput {
  mode: AnalysisMode;
  result: string;
  fileName: string | null;
  createdAt: string | null;
  resumeFileName?: string | null;
  resumeParseStatus?: ResumeParseStatus | null;
}

export interface ReportDocumentModel extends ReportDocumentInput {
  title: string;
  sections: ReportSection[];
  dimensions: DimensionScore[];
  overallScore: string | null;
  candidate: CandidateReportData | null;
}

export const getOverallScore = (text: string): string => {
  const match = text.match(/(?:综合建议|匹配结论)\**\s*[：:]\s*\**\s*(MH|NH|H\+|H-|H)(?![+\-A-Za-z])/);
  return match ? match[1] : 'N/A';
};

export const splitSections = (markdown: string): ReportSection[] => {
  if (!markdown) return [];
  const parts = markdown.split(/^## /m);
  const sections: ReportSection[] = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const newlineIdx = chunk.indexOf('\n');
    const title = (newlineIdx === -1 ? chunk : chunk.slice(0, newlineIdx)).trim();
    const body = newlineIdx === -1 ? '' : chunk.slice(newlineIdx + 1);
    if (title) sections.push({ id: `report-section-${i}`, title, body });
  }
  return sections;
};

export const parseDimensions = (markdown: string): DimensionScore[] => {
  if (!markdown) return [];
  const parts = markdown.split(/^## /m);
  const section3 = parts.find((part) => /^3[.、\s]/.test(part.trim()));
  if (!section3) return [];

  const dimensions: DimensionScore[] = [];
  const blocks = section3.split(/^### /m);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const newlineIdx = block.indexOf('\n');
    const name = (newlineIdx === -1 ? block : block.slice(0, newlineIdx)).trim();
    const scoreMatch = block.match(/\*\*评分\*\*\s*[:：]\s*\**\s*(NH|MH|H\+|H-|H)(?![+\-A-Za-z])/);
    if (name && scoreMatch) dimensions.push({ name, score: scoreMatch[1] });
  }
  return dimensions;
};

const parseLabeledText = (text: string): { label: string; text: string } | null => {
  const match = text.match(/^\*\*([^*]+?)\*\*\s*[：:]?\s*([\s\S]+)$/);
  if (!match) return null;
  const label = match[1].replace(/[：:]\s*$/, '').replace(/^[\[【]|[\]】]$/g, '').trim();
  return { label, text: match[2].trim() };
};

const stripBulletMarker = (line: string): string => line.replace(/^\s*[-*]\s+/, '');
const stripNumberMarker = (line: string): string => line.replace(/^\s*\d+\s*[.、．]\s*/, '');

export const parseCandidateReport = (sections: ReportSection[]): CandidateReportData | null => {
  const findSection = (...keywords: string[]) =>
    sections.find((section) => keywords.some((keyword) => section.title.includes(keyword)));

  const conclusionSec = findSection('结论');
  const strengthsSec = findSection('值得保留', '亮点');
  const problemsSec = findSection('核心问题');
  const checklistSec = findSection('准备清单');
  if (!conclusionSec || !problemsSec) return null;

  let conclusionItems = conclusionSec.body
    .split(/\n\s*\n/)
    .map((paragraph) => parseLabeledText(stripNumberMarker(stripBulletMarker(paragraph.replace(/\n/g, ' ').trim()))))
    .filter((item): item is CandidateConclusionItem => !!item && !!item.text);
  if (conclusionItems.length === 0) {
    conclusionItems = conclusionSec.body
      .split(/\n\s*\n/)
      .flatMap((paragraph) => paragraph.replace(/\n/g, ' ').trim().split(/(?<=[。！？])/))
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ label: '', text }));
  }
  if (conclusionItems.length === 0) return null;

  const strengthItems = (strengthsSec?.body || '')
    .split('\n')
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map((line) => {
      const parsed = parseLabeledText(stripBulletMarker(line).trim());
      return parsed
        ? { title: parsed.label, evidence: parsed.text }
        : { title: '', evidence: stripBulletMarker(line).trim() };
    })
    .filter((strength) => strength.evidence);

  const problemItems: CandidateProblem[] = [];
  const blocks = problemsSec.body.split(/^###\s+/m);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const newlineIdx = block.indexOf('\n');
    const rootCause = stripNumberMarker((newlineIdx === -1 ? block : block.slice(0, newlineIdx)).trim());
    const rest = newlineIdx === -1 ? '' : block.slice(newlineIdx + 1);
    const fields = rest
      .split(/^\s*[-*]\s+/m)
      .slice(1)
      .map((field) => parseLabeledText(field.replace(/\n+/g, ' ').trim()))
      .filter((item): item is CandidateProblemField => !!item && !!item.text);
    if (rootCause) problemItems.push({ rootCause, fields });
  }
  if (problemItems.length === 0) return null;

  let checklistItems = (checklistSec?.body || '')
    .split('\n')
    .filter((line) => /^\s*\d+\s*[.、．]/.test(line))
    .map((line) => stripNumberMarker(line).trim())
    .filter(Boolean);
  if (checklistItems.length === 0 && checklistSec) {
    checklistItems = checklistSec.body
      .split('\n')
      .map((line) => stripBulletMarker(line).trim())
      .filter(Boolean);
  }

  return {
    conclusion: { id: conclusionSec.id, title: conclusionSec.title, items: conclusionItems },
    strengths: strengthsSec
      ? { id: strengthsSec.id, title: strengthsSec.title, items: strengthItems }
      : null,
    problems: { id: problemsSec.id, title: problemsSec.title, items: problemItems },
    checklist: checklistSec
      ? { id: checklistSec.id, title: checklistSec.title, items: checklistItems }
      : null,
  };
};

export const buildReportDocumentModel = (input: ReportDocumentInput): ReportDocumentModel => {
  const sections = splitSections(input.result);
  const isCandidate = input.mode === 'candidate';
  return {
    ...input,
    title: isCandidate ? '面试复盘与提升建议' : '人岗匹配评估',
    sections,
    dimensions: isCandidate ? [] : parseDimensions(input.result),
    overallScore: isCandidate ? null : getOverallScore(input.result),
    candidate: isCandidate ? parseCandidateReport(sections) : null,
  };
};
