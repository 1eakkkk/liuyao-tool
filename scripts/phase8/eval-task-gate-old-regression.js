// The Phase 8B.1 holdout was exposed before this phase. Regression only; not independent evaluation.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planTaskGate12 } from '../../src/knowledge/query-plan-v1.2.js';
import { caseContext } from './eval-query-planner.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';

const root = new URL('../../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
export function oldExposedRegression() {
  const benchmark = read('experiments/phase8/query-planning/benchmark.json');
  const cases = benchmark.cases.filter(x => x.split === 'holdout');
  if (cases.length !== 24) throw new Error('Old exposed holdout count changed');
  const catalog = read('knowledge/catalog/catalog.json'), map = read('knowledge/catalog/rule-concept-map.json');
  const raw = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
  const corpus = { ...loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, {
    ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION }), units: raw.units };
  const fixtures = new Map(), results = [];
  for (const item of cases) {
    try {
      const predicted = planTaskGate12(caseContext(item, fixtures, catalog, map, corpus));
      const expected = item.primary_expected_plan.selected_concepts;
      results.push({ case_id: item.case_id, expected_selected: expected, actual_selected: predicted.selected_concepts,
        extra: predicted.selected_concepts.filter(x => !expected.includes(x)),
        missing: expected.filter(x => !predicted.selected_concepts.includes(x)) });
    } catch (error) { results.push({ case_id: item.case_id, error: error.message }); }
  }
  return { evaluation: 'old-exposed-holdout-regression', old_holdout_exposure: true,
    old_holdout_informed_development: true, new_holdout_exposure: false,
    cases: cases.length, exceptions: results.filter(x => x.error).length,
    false_positive_injection: results.filter(x => x.extra?.length).length,
    conservative_misses: results.filter(x => x.missing?.length).length, results };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = JSON.stringify(oldExposedRegression(), null, 2) + '\n';
  const output = process.argv.find(x => x.startsWith('--output='))?.slice('--output='.length);
  if (output) fs.writeFileSync(output, report, { flag: 'wx' });
  console.log(report);
}
