// Offline benchmark evaluator. The default path evaluates development only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planQuery } from '../../src/knowledge/query-plan.js';
import { stableJson } from '../../src/knowledge/validate.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { evaluateRules } from '../../src/rules/engine.js';

const root = new URL('../../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const same = (a, b) => stableJson(a) === stableJson(b);
const ids = values => values.map(x => typeof x === 'string' ? x : x.concept_id);
const equalSet = (a, b) => same([...new Set(a)].sort(), [...new Set(b)].sort());
const intersection = (a, b) => a.filter(x => b.includes(x)).length;
const precision = (tp, predicted) => predicted ? tp / predicted : 1;
const recall = (tp, expected) => expected ? tp / expected : 1;
const expectedFields = ['question_scope', 'status', 'requested_concepts', 'selected_concepts',
  'excluded_concepts', 'constraints', 'unresolved_mentions'];
export const comparablePlan = plan => Object.fromEntries(expectedFields.map(key => [key, plan[key]]));
function normalizedComparable(plan) {
  const value = comparablePlan(plan);
  // Closed-list constraints are sets; their written order is not a plan decision.
  value.constraints = { ...value.constraints,
    exclude_concepts: [...value.constraints.exclude_concepts].sort(),
    output_constraints: [...value.constraints.output_constraints].sort() };
  return value;
}
export function matchesCompletePlan(actual, expected) { return same(normalizedComparable(actual), normalizedComparable(expected)); }
export function matchesAcceptablePlan(actual, item) {
  return matchesCompletePlan(actual, item.primary_expected_plan) ||
    item.acceptable_plans.some(alt => matchesCompletePlan(actual, alt));
}
export function selectionSafety(actual, item) {
  const alternatives = [item.primary_expected_plan, ...item.acceptable_plans];
  const matched = alternatives.find(plan => matchesCompletePlan(actual, plan));
  const allowed = new Set(alternatives.flatMap(plan => plan.selected_concepts));
  const reference = matched ?? item.primary_expected_plan;
  return {
    false_positive_concepts: actual.selected_concepts.filter(id => !allowed.has(id)),
    false_negative_concepts: reference.selected_concepts.filter(id => !actual.selected_concepts.includes(id))
  };
}

export function caseContext(item, fixtures, catalog, map, corpus) {
  if (item.context_mode === 'no_case') return { question: item.user_question, canonical: null, ruleResult: null,
    catalog, map, corpus, ruleIds: RULES.map(x => x.rule_id) };
  const key = `${item.case_fixture.file}:${item.case_fixture.case_id}`;
  if (!fixtures.has(key)) {
    const found = read(item.case_fixture.file).cases.find(x => x.case_id === item.case_fixture.case_id);
    if (!found) throw new Error(`Missing fixture: ${key}`);
    fixtures.set(key, found.canonical);
  }
  const canonical = fixtures.get(key);
  return { question: item.user_question, canonical, ruleResult: evaluateRules(canonical),
    catalog, map, corpus, ruleIds: RULES.map(x => x.rule_id) };
}

function errorKinds(expected, actual) {
  const kinds = [];
  const wanted = ids(expected.requested_concepts), got = ids(actual.requested_concepts);
  if (got.some(x => !wanted.includes(x))) kinds.push('intent_false_positive');
  if (wanted.some(x => !got.includes(x))) kinds.push('intent_false_negative');
  if (expected.question_scope !== actual.question_scope) kinds.push('scope_error');
  if (!equalSet(expected.constraints.exclude_concepts, actual.constraints.exclude_concepts)) kinds.push('exclusion_error');
  if (expected.excluded_concepts.some(x => x.reason === 'case_relation_not_present') !==
    actual.excluded_concepts.some(x => x.reason === 'case_relation_not_present')) kinds.push('anchor_error');
  if (expected.excluded_concepts.some(x => x.reason === 'knowledge_not_admitted') !==
    actual.excluded_concepts.some(x => x.reason === 'knowledge_not_admitted')) kinds.push('admission_error');
  if (expected.constraints.narrow_request !== actual.constraints.narrow_request) kinds.push('narrow_request_error');
  if (!same(expected.unresolved_mentions, actual.unresolved_mentions)) kinds.push('ambiguity_error');
  if ((expected.status === 'needs_narrowing') !== (actual.status === 'needs_narrowing')) kinds.push('too_many_topics_error');
  if (!kinds.length && !matchesCompletePlan(actual, expected)) kinds.push('plan_detail_error');
  return kinds;
}

export function evaluatePlanner({ split = 'development', acknowledgeHoldoutExposure = false } = {}) {
  if (!['development', 'holdout'].includes(split)) throw new Error('Split must be development or holdout');
  if (split === 'holdout' && acknowledgeHoldoutExposure !== true)
    throw new Error('Holdout predictions require --acknowledge-holdout-exposure');
  const benchmark = read('experiments/phase8/query-planning/benchmark.json');
  if (benchmark.version !== 'query-planning-candidate-1.1') throw new Error('Unexpected benchmark version');
  const catalog = read('knowledge/catalog/catalog.json');
  const map = read('knowledge/catalog/rule-concept-map.json');
  const rawCorpus = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
  const index = loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, {
    ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION });
  const corpus = { ...index, units: rawCorpus.units };
  const fixtures = new Map();
  const selected = benchmark.cases.filter(item => item.split === split);
  if (selected.length !== (split === 'development' ? 48 : 24)) throw new Error('Benchmark split count changed');
  const count = { requested_tp: 0, requested_predicted: 0, requested_expected: 0,
    selected_tp: 0, selected_predicted: 0, selected_expected: 0 };
  const totals = { primary_plan_match: 0, alternate_plan_match: 0,
    accepted_plan_match: 0, requested_exact_set: 0, selected_exact_set: 0,
    false_positive_knowledge_injection: 0, false_negative_knowledge_omission: 0,
    zero_knowledge_correct: 0, zero_knowledge_cases: 0, explicit_exclusion_correct: 0,
    explicit_exclusion_cases: 0, needs_narrowing_correct: 0, needs_narrowing_cases: 0,
    case_anchor_compliant: 0, case_anchor_cases: 0, knowledge_admission_compliant: 0,
    knowledge_admission_cases: 0, question_scope_correct: 0, status_correct: 0,
    unresolved_mention_correct: 0, deterministic_replay: 0 };
  const errors = [], results = [];
  for (const item of selected) {
    const context = caseContext(item, fixtures, catalog, map, corpus);
    let actual;
    try {
      actual = planQuery(context);
      if (same(actual, planQuery(context))) totals.deterministic_replay++;
    } catch (error) {
      errors.push({ case_id: item.case_id, categories: ['planner_exception'],
        expected_summary: comparablePlan(item.primary_expected_plan), actual_summary: { error: error.message },
        responsible_pattern: 'planner contract validation' });
      results.push({ case_id: item.case_id, primary_match: false, alternate_match: false,
        accepted_match: false, error: error.message });
      continue;
    }
    const expected = item.primary_expected_plan;
    const primary = matchesCompletePlan(actual, expected);
    const alternate = item.acceptable_plans.some(plan => matchesCompletePlan(actual, plan));
    const accepted = primary || alternate;
    const expectedRequested = ids(expected.requested_concepts), actualRequested = ids(actual.requested_concepts);
    const expectedSelected = expected.selected_concepts, actualSelected = actual.selected_concepts;
    if (primary) totals.primary_plan_match++;
    if (alternate) totals.alternate_plan_match++;
    if (accepted) totals.accepted_plan_match++;
    if (equalSet(expectedRequested, actualRequested)) totals.requested_exact_set++;
    if (equalSet(expectedSelected, actualSelected)) totals.selected_exact_set++;
    count.requested_tp += intersection(actualRequested, expectedRequested);
    count.requested_predicted += actualRequested.length; count.requested_expected += expectedRequested.length;
    count.selected_tp += intersection(actualSelected, expectedSelected);
    count.selected_predicted += actualSelected.length; count.selected_expected += expectedSelected.length;
    const safety = selectionSafety(actual, item);
    if (safety.false_positive_concepts.length) totals.false_positive_knowledge_injection++;
    if (safety.false_negative_concepts.length) totals.false_negative_knowledge_omission++;
    if (expected.status === 'zero_knowledge') {
      totals.zero_knowledge_cases++;
      if (actual.status === 'zero_knowledge') totals.zero_knowledge_correct++;
    }
    if (expected.constraints.exclude_concepts.length) {
      totals.explicit_exclusion_cases++;
      if (equalSet(expected.constraints.exclude_concepts, actual.constraints.exclude_concepts)) totals.explicit_exclusion_correct++;
    }
    if (expected.status === 'needs_narrowing') {
      totals.needs_narrowing_cases++;
      if (actual.status === 'needs_narrowing') totals.needs_narrowing_correct++;
    }
    if (expected.excluded_concepts.some(x => x.reason === 'case_relation_not_present')) {
      totals.case_anchor_cases++;
      if (!actualSelected.some(id => expected.excluded_concepts.some(x => x.concept_id === id && x.reason === 'case_relation_not_present')))
        totals.case_anchor_compliant++;
    }
    if (expected.excluded_concepts.some(x => x.reason === 'knowledge_not_admitted')) {
      totals.knowledge_admission_cases++;
      if (!actualSelected.some(id => expected.excluded_concepts.some(x => x.concept_id === id && x.reason === 'knowledge_not_admitted')))
        totals.knowledge_admission_compliant++;
    }
    if (actual.question_scope === expected.question_scope) totals.question_scope_correct++;
    if (actual.status === expected.status) totals.status_correct++;
    if (same(actual.unresolved_mentions, expected.unresolved_mentions)) totals.unresolved_mention_correct++;
    if (!accepted) errors.push({ case_id: item.case_id, categories: errorKinds(expected, actual),
      expected_summary: comparablePlan(expected), actual_summary: comparablePlan(actual),
      responsible_pattern: actual.requested_concepts.map(x => `${x.basis}:${x.question_span.matched_text}`).join(', ') || 'no safe term match' });
    results.push({ case_id: item.case_id, primary_match: primary, alternate_match: alternate,
      accepted_match: accepted,
      status: actual.status, selected_concepts: actualSelected });
  }
  const error_categories = {};
  for (const error of errors) for (const category of error.categories) error_categories[category] = (error_categories[category] ?? 0) + 1;
  return { split, holdout_exposure: split === 'holdout', benchmark_version: benchmark.version,
    planner_version: 'query-plan-1.1', cases: selected.length, metrics: {
      ...totals, requested_precision: precision(count.requested_tp, count.requested_predicted),
      requested_recall: recall(count.requested_tp, count.requested_expected),
      selected_precision: precision(count.selected_tp, count.selected_predicted),
      selected_recall: recall(count.selected_tp, count.selected_expected) },
    error_categories, results, errors };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invoked) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--split');
  const split = at < 0 ? 'development' : args[at + 1];
  if (args.some((x, i) => !['--split', '--acknowledge-holdout-exposure', split].includes(x))) throw new Error('Unknown argument');
  const report = evaluatePlanner({ split, acknowledgeHoldoutExposure: args.includes('--acknowledge-holdout-exposure') });
  const destination = new URL(`../../test-results/phase8-query-planner-${split}.json`, import.meta.url);
  fs.mkdirSync(path.dirname(fileURLToPath(destination)), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ split: report.split, cases: report.cases, metrics: report.metrics,
    error_categories: report.error_categories, report: fileURLToPath(destination) }, null, 2));
}
