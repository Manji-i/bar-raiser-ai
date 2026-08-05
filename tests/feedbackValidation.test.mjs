import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANDIDATE_FEEDBACK_ISSUES,
  validateFeedback,
} from '../services/feedbackValidation.js';

test('反馈只接受 1 到 5 分和允许的问题数组', () => {
  assert.deepEqual(validateFeedback({
    reportId: 'report-1',
    rating: 5,
    comments: '准确',
    specificIssues: [],
  }), {
    reportId: 'report-1',
    rating: 5,
    comments: '准确',
    specificIssues: [],
  });
  assert.throws(() => validateFeedback({
    reportId: 'report-1', rating: 999, specificIssues: [],
  }), /Invalid feedback rating/);
  assert.throws(() => validateFeedback({
    reportId: 'report-1', rating: 1, specificIssues: 'not-an-array',
  }), /Invalid feedback issues/);
  assert.throws(() => validateFeedback({
    reportId: 'report-1', rating: 1, specificIssues: ['未知问题'],
  }), /Invalid feedback issue/);
  assert.equal(CANDIDATE_FEEDBACK_ISSUES.length, 6);
});

test('反馈文本和数组数量具有固定上限', () => {
  assert.throws(() => validateFeedback({
    reportId: 'x'.repeat(129), rating: 1, specificIssues: [],
  }), /Invalid feedback report/);
  assert.throws(() => validateFeedback({
    reportId: 'report-1', rating: 1, comments: 'x'.repeat(2001), specificIssues: [],
  }), /Feedback comments exceed/);
  assert.throws(() => validateFeedback({
    reportId: 'report-1',
    rating: 1,
    specificIssues: Array(7).fill('其他问题'),
  }), /Invalid feedback issues/);
});
