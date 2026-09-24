// @vitest-environment node
import { test, expect } from 'vitest';
import { planTaskGateScopeRevision } from '../../src/knowledge/query-plan-task-scope.js';
import { taskScopeRegressionContext, evaluateTaskScopeRegression } from '../../scripts/phase8/eval-task-scope-regression.js';

const { cases, context } = taskScopeRegressionContext();
const input = context(cases.find(x => x.case_id === 'tg-002'));
const plan = question => planTaskGateScopeRevision({ ...input, question });

test('exposed regression repairs safety failures without claiming unseen evaluation', () => {
  const report = evaluateTaskScopeRegression();
  expect(report.independent_holdout).toBe(false);
  expect(report.production_ready).toBe(false);
  expect(report.runs.baseline.totals.false_positive_cases).toBe(4);
  expect(report.runs.baseline.totals.exceptions).toBe(1);
  const candidate = report.runs.candidate.totals;
  for (const key of ['exceptions', 'false_positive_cases', 'exclusion_violations', 'prohibition_violations',
    'missing_anchor_violations', 'admission_violations']) expect(candidate[key], key).toBe(0);
  expect(candidate.deterministic_replay).toBe(64);
  expect(candidate.false_negative_cases).toBeLessThanOrEqual(report.runs.baseline.totals.false_negative_cases);
  expect(report.runs.candidate.results.filter(x => x.original_split === 'development' &&
    (x.false_positive.length || x.false_negative.length))).toEqual([]);
});

test('explicit theory request can negate a cast reference without needing a cast', () => {
  const result = planTaskGateScopeRevision({ ...input, canonical: null, ruleResult: null,
    question: '不讨论这卦，解释月合的古籍原句。' });
  expect(result.question_scope).toBe('theory');
  expect(result.selected_concepts).toEqual(['month-combine']);
});

test('whole-answer exclusive format conflicts with literature but local formatting does not', () => {
  const conflict = plan('全文只允许输出一个数字，但请引用月合的古籍原句。');
  expect(conflict.status).toBe('ambiguous');
  expect(conflict.task_conflict.present).toBe(true);
  expect(conflict.retrieval_query).toBeNull();
  const sequential = plan('先写一个数字，再解释月合的古籍原句。');
  expect(sequential.task_conflict.present).toBe(false);
  expect(sequential.selected_concepts).toEqual(['month-combine']);
});

test('background labels cannot supply an additional requested topic', () => {
  const result = plan('请解释月合的古籍原句；旬空只是背景标签。');
  expect(result.selected_concepts).toEqual(['month-combine']);
  expect(result.requested_concepts.map(x => x.concept_id)).toEqual(['month-combine']);
  expect(plan('请解释旬空这个标签的古籍原句。').selected_concepts).toEqual(['xunkong']);
});

test('local exclusions bind to their concept, regardless of repetition or order', () => {
  for (const question of [
    '请引用月合的古籍原句；旬空这一栏留白。',
    '旬空这一栏留白；请引用月合的古籍原句。',
    '请引用月合与旬空的古籍原句；旬空这一栏留白。',
    '请引用月合的古籍原句；旬空只列为待办。',
    '请引用月合的古籍原句；旬空只写“未处理”。',
  ]) {
    const result = plan(question);
    expect(result.constraints.exclude_concepts, question).toEqual(['xunkong']);
    expect(result.selected_concepts, question).toEqual(['month-combine']);
  }
});
