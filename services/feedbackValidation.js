export const CANDIDATE_FEEDBACK_ISSUES = Object.freeze([
  '核心问题不准确',
  '证据引用不准确',
  '示范回答不实用',
  '行动建议不具体',
  '遗漏重要问题',
  '其他问题',
]);

export const RECRUITER_FEEDBACK_ISSUES = Object.freeze([
  '评分标准不准确',
  'STAR法则应用不当',
  '人岗匹配分析错误',
  '维度评估不全面',
  '风险提示不清晰',
  '其他问题',
]);

export const ALL_FEEDBACK_ISSUES = Object.freeze([
  ...new Set([...CANDIDATE_FEEDBACK_ISSUES, ...RECRUITER_FEEDBACK_ISSUES]),
]);

const allowedIssues = new Set(ALL_FEEDBACK_ISSUES);

export const validateFeedback = (data) => {
  const reportId = data?.reportId;
  if (typeof reportId !== 'string' || reportId.trim().length === 0 || reportId.length > 128) {
    throw new Error('Invalid feedback report');
  }

  const { rating } = data;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Invalid feedback rating');
  }

  const comments = data.comments ?? '';
  if (typeof comments !== 'string') throw new Error('Invalid feedback comments');
  if (comments.length > 2000) throw new Error('Feedback comments exceed 2000 characters');

  const specificIssues = data.specificIssues ?? [];
  if (!Array.isArray(specificIssues) || specificIssues.length > 6) {
    throw new Error('Invalid feedback issues');
  }
  for (const issue of specificIssues) {
    if (typeof issue !== 'string' || !allowedIssues.has(issue)) {
      throw new Error('Invalid feedback issue');
    }
  }

  return {
    reportId: reportId.trim(),
    rating,
    comments,
    specificIssues: [...specificIssues],
  };
};
