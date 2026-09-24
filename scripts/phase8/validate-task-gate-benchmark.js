// Offline candidate validation. No question classifier or holdout runner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateValue, stableJson } from '../../src/knowledge/validate.js';
import { identityHash, validateRuleConceptMap } from '../../src/knowledge/query-plan-schema.js';
import { QUERY_PLAN_LABEL_SCHEMA_12, validateTaskGate12, checkQuestionSpan12 } from '../../src/knowledge/query-plan-schema-v1.2.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { evaluateRules } from '../../src/rules/engine.js';

const root = new URL('../../', import.meta.url);
const read = file => JSON.parse(fs.readFileSync(new URL(file, root), 'utf8'));
const fail = message => { throw new Error(`Task Gate benchmark: ${message}`); };
const same = (a, b) => stableJson(a) === stableJson(b);
const str = { type: 'string', minLength: 1 };
const array = items => ({ type: 'array', items, uniqueItems: true });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const prior = read('experiments/phase8/query-planning/benchmark.schema.json').properties.cases.items.properties;
const family = object({ family_id: { type: 'string', pattern: '^tgf-[0-9]{2}$' }, split: { enum: ['development', 'holdout'] }, intent_template: str });
const item = object({
  case_id: { type: 'string', pattern: '^tg-[0-9]{3}$' }, split: family.properties.split,
  family_id: family.properties.family_id, coverage_tags: array(str), user_question: str,
  context_mode: { enum: ['case', 'no_case'] }, case_fixture: prior.case_fixture,
  available_rule_ids: array(str), catalog_revision: { type: 'integer', minimum: 1 },
  corpus_version: { const: 'phase8a-month-combine-hardening-1' },
  corpus_hash: { const: 'sha256:aa3522aebb7e4ad18b54e144ea26499323e55838f79856fdd59f2c53baadcda3' },
  primary_expected_plan: QUERY_PLAN_LABEL_SCHEMA_12,
  acceptable_plans: array(QUERY_PLAN_LABEL_SCHEMA_12), question_fact_references: prior.question_fact_references,
  ambiguity_status: { enum: ['clear', 'genuinely_ambiguous'] }, rationale: str
});
export const TASK_GATE_BENCHMARK_SCHEMA = object({
  version: { const: 'query-planning-task-gate-candidate-1.2' },
  candidate_status: { const: 'candidate_not_frozen' },
  baseline_commit: { const: '6e894077386d98dc1f38fab72ab095297055e3db' },
  semantic_families: array(family), cases: array(item)
});

export function validateTaskGateBenchmark(data = read('experiments/phase8/query-planning-task-gate/benchmark.json')) {
  validateValue(data, TASK_GATE_BENCHMARK_SCHEMA);
  const catalog = read('knowledge/catalog/catalog.json');
  const map = validateRuleConceptMap(read('knowledge/catalog/rule-concept-map.json'), { ruleIds: RULES.map(x => x.rule_id), catalog });
  const corpus = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
  const index = loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, { ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION });
  const historical = loadCorpus({ version: 'phase7.1-initial-1' }, { ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION });
  if (index.corpus_hash !== item.properties.corpus_hash.const || historical.corpus_hash !==
      'sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729') fail('corpus identity changed');
  const reviewed = corpus.units.filter(x => x.data_kind === 'corpus' && x.verification_status === 'reviewed');
  const old = read('experiments/phase8/query-planning/benchmark.json');
  const oldQuestions = new Set(old.cases.map(x => x.user_question));
  const phase7Questions = new Set(read('experiments/phase7/evaluation/cases.json').cases.map(x => x.question));
  if (data.semantic_families.length !== 16 || data.cases.length !== 64) fail('candidate size');
  if (new Set(data.semantic_families.map(x => x.family_id)).size !== 16 ||
      new Set(data.semantic_families.map(x => x.intent_template)).size !== 16) fail('duplicate family');
  const families = new Map(data.semantic_families.map(x => [x.family_id, x]));
  const counts = new Map(), ids = new Set(), questions = new Set(), fixtureCache = new Map();
  let alternatives = 0;
  for (const c of data.cases) {
    if (ids.has(c.case_id) || questions.has(c.user_question) || oldQuestions.has(c.user_question) || phase7Questions.has(c.user_question)) fail(`duplicate/prior question: ${c.case_id}`);
    ids.add(c.case_id); questions.add(c.user_question);
    const f = families.get(c.family_id);
    if (!f || f.split !== c.split) fail(`family split leakage: ${c.case_id}`);
    counts.set(c.family_id, (counts.get(c.family_id) ?? 0) + 1);
    if (c.catalog_revision !== catalog.revision || c.corpus_hash !== index.corpus_hash || c.corpus_version !== index.corpus_version) fail('corpus/catalog mismatch');
    let hits = [];
    if (c.context_mode === 'no_case') {
      if (c.case_fixture !== null || c.available_rule_ids.length || c.question_fact_references.length) fail('no-case fixture leakage');
    } else {
      if (!c.case_fixture) fail('case fixture missing');
      const key = `${c.case_fixture.file}:${c.case_fixture.case_id}`;
      if (!fixtureCache.has(key)) {
        const fixture = read(c.case_fixture.file).cases.find(x => x.case_id === c.case_fixture.case_id);
        if (!fixture) fail(`missing fixture ${key}`);
        fixtureCache.set(key, fixture.canonical);
      }
      const canonical = fixtureCache.get(key);
      if (identityHash(canonical) !== c.case_fixture.canonical_hash) fail('Canonical fixture identity');
      hits = evaluateRules(canonical).hits;
      if (!same(c.available_rule_ids, [...new Set(hits.map(x => x.rule_id))].sort())) fail('available Rules differ');
    }
    for (const reference of c.question_fact_references) {
      checkQuestionSpan12(c.user_question, reference.question_span);
      if (!hits.some(hit => hit.rule_id === reference.rule_id && same({ line: hit.target.line,
        component: hit.target.component, related_line: hit.target.related_line ?? null }, reference.target))) fail('question fact reference lacks hit');
    }
    const plans = [c.primary_expected_plan, ...c.acceptable_plans];
    if (c.ambiguity_status === 'clear' && c.acceptable_plans.length) fail('clear case has alternative');
    if (c.ambiguity_status === 'genuinely_ambiguous' && !c.acceptable_plans.length) fail('ambiguous case lacks complete alternative');
    if (new Set(plans.map(stableJson)).size !== plans.length) fail('duplicate complete plan');
    for (const plan of plans) validateTaskGate12(plan, { question: c.user_question, catalog,
      availableRuleIds: c.available_rule_ids, map, reviewedUnits: reviewed, contextMode: c.context_mode });
    alternatives += c.acceptable_plans.length;
  }
  if ([...counts.values()].some(n => n !== 4) || counts.size !== 16 ||
      data.cases.filter(x => x.split === 'development').length !== 32 ||
      data.cases.filter(x => x.split === 'holdout').length !== 32) fail('32/32 or 4-per-family split');
  return { version: data.version, cases: data.cases.length, development: 32, holdout: 32,
    families: counts.size, acceptable_complete_plans: alternatives, corpus_hash: index.corpus_hash };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(JSON.stringify(validateTaskGateBenchmark(), null, 2));
}
