// Every case below is exposed development/regression data, never a new holdout.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { planTaskGate12 } from '../../src/knowledge/query-plan-v1.2.js';
import { planTaskGateScopeRevision, TASK_SCOPE_REVISION } from '../../src/knowledge/query-plan-task-scope.js';
import { caseContext } from './eval-query-planner.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { stableJson } from '../../src/knowledge/validate.js';

const root = new URL('../../', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8'));
const hashFile = name => createHash('sha256').update(fs.readFileSync(new URL(name, root))).digest('hex');
export function taskScopeRegressionContext() {
  const catalog = read('knowledge/catalog/catalog.json');
  const map = read('knowledge/catalog/rule-concept-map.json');
  const version = 'phase8a-month-combine-hardening-1';
  const corpus = { ...loadCorpus({ version }, { ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION }),
    units: readCorpus({ version }).units };
  const benchmark = read('experiments/phase8/query-planning-task-gate/benchmark.json');
  const fixtures = new Map();
  return { cases: benchmark.cases, context: item => caseContext(item, fixtures, catalog, map, corpus) };
}

export function evaluateTaskScopeRegression() {
  const { cases, context } = taskScopeRegressionContext();
  const runs = {};
  for (const [name, planner] of Object.entries({ baseline: planTaskGate12, candidate: planTaskGateScopeRevision })) {
    const totals = { cases: cases.length, exceptions: 0, false_positive_cases: 0, false_negative_cases: 0,
      exclusion_violations: 0, prohibition_violations: 0, missing_anchor_violations: 0, admission_violations: 0,
      selected_set_matches: 0, task_matches: 0, scope_matches: 0, strict_contract_matches: 0, deterministic_replay: 0 };
    const results = [];
    for (const item of cases) {
      const expected = item.primary_expected_plan;
      try {
        const input = context(item), actual = planner(input);
        const falsePositive = actual.selected_concepts.filter(id => !expected.selected_concepts.includes(id));
        const falseNegative = expected.selected_concepts.filter(id => !actual.selected_concepts.includes(id));
        const excluded = actual.selected_concepts.filter(id => expected.constraints.exclude_concepts.includes(id));
        totals.false_positive_cases += Number(!!falsePositive.length);
        totals.false_negative_cases += Number(!!falseNegative.length);
        totals.exclusion_violations += Number(!!excluded.length);
        totals.prohibition_violations += Number(expected.constraints.knowledge_prohibited && !!actual.selected_concepts.length);
        for (const [key, reason] of [['missing_anchor_violations', 'case_relation_not_present'], ['admission_violations', 'knowledge_not_admitted']])
          totals[key] += Number(actual.selected_concepts.some(id => expected.excluded_concepts.some(x => x.concept_id === id && x.reason === reason)));
        totals.selected_set_matches += Number(!falsePositive.length && !falseNegative.length);
        totals.task_matches += Number(actual.knowledge_task === expected.knowledge_task);
        totals.scope_matches += Number(actual.question_scope === expected.question_scope);
        const labels = Object.fromEntries(Object.keys(expected).map(key => [key, actual[key]]));
        totals.strict_contract_matches += Number(stableJson(labels) === stableJson(expected));
        totals.deterministic_replay += Number(stableJson(actual) === stableJson(planner(input)));
        results.push({ case_id: item.case_id, original_split: item.split,
          false_positive: falsePositive, false_negative: falseNegative, excluded_injected: excluded,
          selected: actual.selected_concepts, task: actual.knowledge_task, scope: actual.question_scope,
          strict_match: stableJson(labels) === stableJson(expected) });
      } catch (error) { totals.exceptions++; results.push({ case_id: item.case_id, error: error.message }); }
    }
    runs[name] = { totals, results };
  }
  return { evaluation: 'exposed-task-scope-regression', implementation: TASK_SCOPE_REVISION,
    holdout_informed: true, independent_holdout: false, production_ready: false,
    benchmark_sha256: hashFile('experiments/phase8/query-planning-task-gate/benchmark.json'),
    baseline_source_sha256: hashFile('src/knowledge/query-plan-v1.2.js'),
    candidate_source_sha256: hashFile('src/knowledge/query-plan-task-scope.js'), runs };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const output = process.argv.find(x => x.startsWith('--output='))?.slice(9);
  if (!output) throw new Error('Specify --output=<new file>; previous results are never overwritten');
  const report = evaluateTaskScopeRegression();
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, baseline: report.runs.baseline.totals, candidate: report.runs.candidate.totals }, null, 2));
}
