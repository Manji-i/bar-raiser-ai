export type ResumeParseStatus = 'usable' | 'low_quality' | 'empty' | 'manual';

export interface ParseQualityResult {
  status: Exclude<ResumeParseStatus, 'manual'>;
  charCount: number;
  corruptedRatio: number;
  charsPerPage: number;
}

export const assessParseQuality = (text: string, pageCount = 1): ParseQualityResult => {
  const normalized = text.replace(/\s/g, '');
  const replacementCount = (normalized.match(/\uFFFD/g) || []).length;
  const corruptedRatio = normalized.length === 0 ? 0 : replacementCount / normalized.length;
  const safePageCount = Math.max(Number.isFinite(pageCount) ? pageCount : 1, 1);
  const charsPerPage = normalized.length / safePageCount;

  // 几乎没有可识别文本时视为解析为空；有少量正文但不足以支撑分析时归为低质量。
  if (normalized.length < 50) {
    return { status: 'empty', charCount: normalized.length, corruptedRatio, charsPerPage };
  }

  if (normalized.length < 200 || charsPerPage < 150 || corruptedRatio > 0.05) {
    return { status: 'low_quality', charCount: normalized.length, corruptedRatio, charsPerPage };
  }

  return { status: 'usable', charCount: normalized.length, corruptedRatio, charsPerPage };
};
