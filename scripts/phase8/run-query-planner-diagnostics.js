// Synthetic safety diagnostics, separate from the frozen benchmark and its holdout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { planQuery } from '../../src/knowledge/query-plan.js';
import { stableJson } from '../../src/knowledge/validate.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { evaluateRules } from '../../src/rules/engine.js';

const root = new URL('../../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const same = (a, b) => stableJson(a) === stableJson(b);

export function runSyntheticDiagnostics() {
  const fixture = read('tests/phase8/fixtures/query-planner-synthetic.json');
  if (fixture.data_kind !== 'synthetic_diagnostic' || fixture.cases.length < 20 || fixture.cases.length > 30)
    throw new Error('Expected 20–30 synthetic diagnostic cases');
  const catalog = read('knowledge/catalog/catalog.json');
  const map = read('knowledge/catalog/rule-concept-map.json');
  const raw = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
  const index = loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, {
    ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION });
  const corpus = { ...index, units: raw.units };
  const fixtureCache = new Map();
  const results = [];
  for (const item of fixture.cases) {
    let canonical = null, ruleResult = null;
    if (item.cast) {
      const [phase, caseId] = item.cast.split(':');
      if (!['phase6', 'phase7'].includes(phase) || !caseId) throw new Error(`Invalid synthetic cast: ${item.id}`);
      const file = `experiments/${phase}/${phase === 'phase7' ? 'evaluation/' : ''}cases.json`;
      if (!fixtureCache.has(item.cast)) {
        const cast = read(file).cases.find(x => x.case_id === caseId)?.canonical;
        if (!cast) throw new Error(`Missing synthetic cast: ${item.cast}`);
        fixtureCache.set(item.cast, cast);
      }
      canonical = fixtureCache.get(item.cast);
      ruleResult = evaluateRules(canonical);
    }
    // The planner receives only the question and legitimate project context, never the expectations.
    let actual;
    try { actual = planQuery({ question: item.question, canonical, ruleResult, catalog, map, corpus,
      ruleIds: RULES.map(x => x.rule_id) }); }
    catch (error) { results.push({ id: item.id, category: item.category, error: error.message }); continue; }
    const expected = { requested: item.expected_requested, selected: item.expected_selected,
      status: item.expected_status, excluded: item.expected_excluded };
    const observed = { requested: actual.requested_concepts.map(x => x.concept_id),
      selected: actual.selected_concepts, status: actual.status,
      excluded: actual.excluded_concepts.map(x => `${x.concept_id}:${x.reason}`) };
    results.push({ id: item.id, category: item.category, expected, observed,
      requested_match: same(expected.requested, observed.requested),
      selected_match: same(expected.selected, observed.selected),
      status_match: expected.status === observed.status,
      exclusions_match: same(expected.excluded, observed.excluded),
      false_positive_concepts: observed.selected.filter(x => !expected.selected.includes(x)),
      false_negative_concepts: expected.selected.filter(x => !observed.selected.includes(x)),
      retrieval_query_present: actual.retrieval_query !== null });
  }
  const metrics = { cases: results.length, exceptions: results.filter(x => x.error).length,
    requested_match: results.filter(x => x.requested_match).length,
    selected_match: results.filter(x => x.selected_match).length,
    status_match: results.filter(x => x.status_match).length,
    exclusions_match: results.filter(x => x.exclusions_match).length,
    false_positive_cases: results.filter(x => x.false_positive_concepts?.length).length,
    false_positive_events: results.reduce((n, x) => n + (x.false_positive_concepts?.length ?? 0), 0),
    false_negative_cases: results.filter(x => x.false_negative_concepts?.length).length,
    false_negative_events: results.reduce((n, x) => n + (x.false_negative_concepts?.length ?? 0), 0) };
  return { data_kind: 'synthetic_diagnostic_result', version: fixture.version, metrics, results };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invoked) {
  const mode = process.argv[2];
  if (!['--first-pass', '--post-change', '--post-audit', '--final'].includes(mode) || process.argv.length !== 3)
    throw new Error('Specify --first-pass, --post-change, --post-audit, or --final');
  const output = new URL(`../../test-results/phase8-query-planner-synthetic-${mode.slice(2)}.json`, import.meta.url);
  const result = runSyntheticDiagnostics();
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.mkdirSync(path.dirname(fileURLToPath(output)), { recursive: true });
  // Exclusive create protects the first-pass evidence from silent replacement.
  const fd = fs.openSync(output, 'wx');
  try { fs.writeFileSync(fd, bytes); } finally { fs.closeSync(fd); }
  const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  console.log(JSON.stringify({ output: fileURLToPath(output), hash, metrics: result.metrics }, null, 2));
}
