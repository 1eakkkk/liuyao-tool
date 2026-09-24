// Development-only evaluator. The new task-gate holdout is never dispatched to the Planner here.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { planTaskGate12 } from '../../src/knowledge/query-plan-v1.2.js';
import { stableJson } from '../../src/knowledge/validate.js';
import { caseContext } from './eval-query-planner.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { readTaskGateDevelopment } from './read-task-gate-development.js';

const root = new URL('../../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const fields = ['question_scope', 'knowledge_task', 'status', 'requested_concepts', 'selected_concepts',
  'excluded_concepts', 'constraints', 'unresolved_mentions', 'task_evidence', 'task_conflict',
  'ambiguity_reasons', 'request_relation', 'output_directives', 'retrieval_query'];
const comparable = x => Object.fromEntries(fields.map(k => [k, x[k]]));
const set = values => new Set(values);
const ids = x => x.map(v => v.concept_id);
const eq = (a, b) => stableJson(a) === stableJson(b);
const sameSet = (a, b) => eq([...set(a)].sort(), [...set(b)].sort());
const ratio = (n, d) => d ? n / d : 1;
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };

export function evaluateTaskGateDevelopment() {
  const cases = readTaskGateDevelopment();
  const catalog = read('knowledge/catalog/catalog.json');
  const map = read('knowledge/catalog/rule-concept-map.json');
  const raw = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
  const corpus = { ...loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, {
    ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION }), units: raw.units };
  const totals = { cases: 32, planner_exceptions: 0, task_correct: 0, scope_correct: 0,
    requested_tp: 0, requested_predicted: 0, requested_expected: 0,
    selected_tp: 0, selected_predicted: 0, selected_expected: 0,
    per_concept_use_correct: 0, per_concept_use_total: 0, output_policy_correct: 0,
    strict_full_contract: 0, false_positive_knowledge_injection: 0, false_negative_knowledge_omission: 0,
    explicit_no_k_violations: 0, missing_anchor_injections: 0, admission_violations: 0,
    exclusion_violations: 0, deterministic_replay: 0,
    explicit_exclusion_cases: 0, explicit_exclusion_compliant: 0,
    missing_anchor_cases: 0, missing_anchor_compliant: 0,
    admission_cases: 0, admission_compliant: 0 };
  const results = [], fixtures = new Map();
  for (const item of cases) {
    const expected = item.primary_expected_plan;
    const context = caseContext(item, fixtures, catalog, map, corpus);
    try {
      const actual = planTaskGate12(context);
      if (eq(actual, planTaskGate12(context))) inc(totals, 'deterministic_replay');
      if (actual.knowledge_task === expected.knowledge_task) inc(totals, 'task_correct');
      if (actual.question_scope === expected.question_scope) inc(totals, 'scope_correct');
      if (eq({ constraints: actual.constraints.output_constraints, directives: actual.output_directives },
        { constraints: expected.constraints.output_constraints, directives: expected.output_directives })) inc(totals, 'output_policy_correct');
      if (eq(comparable(actual), expected)) inc(totals, 'strict_full_contract');
      const er = ids(expected.requested_concepts), ar = ids(actual.requested_concepts);
      const es = expected.selected_concepts, as = actual.selected_concepts;
      inc(totals, 'requested_tp', ar.filter(x => er.includes(x)).length);
      inc(totals, 'requested_predicted', ar.length); inc(totals, 'requested_expected', er.length);
      inc(totals, 'selected_tp', as.filter(x => es.includes(x)).length);
      inc(totals, 'selected_predicted', as.length); inc(totals, 'selected_expected', es.length);
      for (const req of expected.requested_concepts) {
        inc(totals, 'per_concept_use_total');
        if (actual.requested_concepts.find(x => x.concept_id === req.concept_id)?.knowledge_use === req.knowledge_use)
          inc(totals, 'per_concept_use_correct');
      }
      const falsePositive = as.filter(x => !es.includes(x)), falseNegative = es.filter(x => !as.includes(x));
      if (falsePositive.length) inc(totals, 'false_positive_knowledge_injection');
      if (falseNegative.length) inc(totals, 'false_negative_knowledge_omission');
      if (expected.constraints.knowledge_prohibited && as.length) inc(totals, 'explicit_no_k_violations');
      if (as.some(id => expected.excluded_concepts.some(x => x.concept_id === id && x.reason === 'case_relation_not_present')))
        inc(totals, 'missing_anchor_injections');
      if (as.some(id => expected.excluded_concepts.some(x => x.concept_id === id && x.reason === 'knowledge_not_admitted')))
        inc(totals, 'admission_violations');
      if (as.some(id => expected.constraints.exclude_concepts.includes(id))) inc(totals, 'exclusion_violations');
      if (expected.constraints.exclude_concepts.length) {
        inc(totals, 'explicit_exclusion_cases');
        if (!as.some(id => expected.constraints.exclude_concepts.includes(id))) inc(totals, 'explicit_exclusion_compliant');
      }
      const absentIds = expected.excluded_concepts.filter(x => x.reason === 'case_relation_not_present').map(x => x.concept_id);
      if (absentIds.length) {
        inc(totals, 'missing_anchor_cases');
        if (!as.some(id => absentIds.includes(id))) inc(totals, 'missing_anchor_compliant');
      }
      const unadmittedIds = expected.excluded_concepts.filter(x => x.reason === 'knowledge_not_admitted').map(x => x.concept_id);
      if (unadmittedIds.length) {
        inc(totals, 'admission_cases');
        if (!as.some(id => unadmittedIds.includes(id))) inc(totals, 'admission_compliant');
      }
      results.push({ case_id: item.case_id, task_match: actual.knowledge_task === expected.knowledge_task,
        scope_match: actual.question_scope === expected.question_scope, requested_match: sameSet(ar, er),
        selected_match: sameSet(as, es), full_match: eq(comparable(actual), expected),
        false_positive: falsePositive, false_negative: falseNegative, actual: comparable(actual) });
    } catch (error) {
      inc(totals, 'planner_exceptions');
      results.push({ case_id: item.case_id, error: error.message });
    }
  }
  return { evaluation: 'task-gate-1.2-development', new_holdout_exposure: false,
    old_holdout_informed_development: true, totals: { ...totals,
      requested_precision: ratio(totals.requested_tp, totals.requested_predicted),
      requested_recall: ratio(totals.requested_tp, totals.requested_expected),
      selected_precision: ratio(totals.selected_tp, totals.selected_predicted),
      selected_recall: ratio(totals.selected_tp, totals.selected_expected) }, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outputArg = process.argv.find(x => x.startsWith('--output='));
  if (!outputArg) throw new Error('Specify --output=<path>; no implicit overwrite');
  const output = outputArg.slice('--output='.length);
  fs.mkdirSync(new URL('../../test-results/', import.meta.url), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(evaluateTaskGateDevelopment(), null, 2) + '\n');
  fs.writeFileSync(output, bytes, { flag: 'wx' });
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  console.log(JSON.stringify({ output, sha256: hash, totals: JSON.parse(bytes).totals }, null, 2));
}
