// Candidate validation only. It does not infer intent from arbitrary questions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateValue, stableJson } from '../../src/knowledge/validate.js';
import { identityHash, validateRuleConceptMap, QUERY_PLAN_SCHEMA } from '../../src/knowledge/query-plan-schema.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { evaluateRules } from '../../src/rules/engine.js';

const root = new URL('../../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const fail = message => { throw new Error(`Query benchmark: ${message}`); };
const same = (a, b) => stableJson(a) === stableJson(b);
const unique = a => new Set(a).size === a.length;
const span = (question, value) => {
  if (value.end <= value.start || question.slice(value.start, value.end) !== value.matched_text) fail('invalid UTF-16 span');
};
const planFields = ['question_scope', 'status', 'requested_concepts', 'selected_concepts', 'excluded_concepts', 'constraints', 'unresolved_mentions'];
const planSchema = { type: 'object', properties: Object.fromEntries(planFields.map(k => [k, QUERY_PLAN_SCHEMA.properties[k]])),
  required: planFields, additionalProperties: false };
const requiredTags = ['catalog_alias', 'colloquial_chinese', 'typo_shorthand', 'explicit_exclusion',
  'narrow_factual_request', 'zero_knowledge_request', 'multi_topic_two', 'multi_topic_over_two',
  'theory_question', 'case_specific', 'mixed_question', 'unrelated_question',
  'relation_absent_from_case', 'source_checked_only', 'utf16_supplementary'];

function validatePlan(plan, item, { catalog, byRule, reviewed, hits }) {
  validateValue(plan, planSchema);
  const q = item.user_question;
  const known = new Set(catalog.concepts.map(c => c.concept_id));
  const requests = plan.requested_concepts, selected = plan.selected_concepts;
  const ids = requests.map(x => x.concept_id);
  const check = values => { for (const id of values) if (!known.has(id)) fail(`unknown concept: ${id}`); };
  check([...ids, ...selected, ...plan.excluded_concepts.map(x => x.concept_id), ...plan.constraints.exclude_concepts]);
  if (!unique(ids) || !unique(selected) || !unique(plan.excluded_concepts.map(x => x.concept_id))) fail('duplicate concept');
  for (const x of requests) {
    span(q, x.question_span);
    for (const s of x.additional_question_spans ?? []) span(q, s);
    const concept = catalog.concepts.find(c => c.concept_id === x.concept_id);
    if (x.basis === 'exact_term' && x.question_span.matched_text !== concept.label) fail(`exact_term differs from catalog label: ${item.case_id}`);
    if (x.basis === 'catalog_alias' && !concept.aliases.includes(x.question_span.matched_text)) fail(`catalog_alias not registered: ${item.case_id}`);
  }
  for (const x of plan.unresolved_mentions) {
    span(q, x.question_span);
    if (x.text !== x.question_span.matched_text) fail('unresolved text/span mismatch');
    check(x.candidate_concepts);
    if (!unique(x.candidate_concepts)) fail('duplicate unresolved candidate');
    if (requests.some(r => r.question_span.start === x.question_span.start && r.question_span.end === x.question_span.end)) fail('unresolved mention already requested');
  }
  const explicit = requests.filter(x => x.basis === 'explicit_exclusion').map(x => x.concept_id);
  if (!same([...explicit].sort(), [...plan.constraints.exclude_concepts].sort())) fail('explicit exclusion mismatch');
  if (explicit.some(id => !plan.excluded_concepts.some(x => x.concept_id === id && x.reason === 'explicit_exclusion'))) fail('missing explicit exclusion');
  if (plan.excluded_concepts.some(x => !ids.includes(x.concept_id))) fail('excluded concept not requested');
  if (plan.constraints.narrow_request && plan.constraints.knowledge_allowed) fail('narrow request allows knowledge');
  if (selected.length > 2 || selected.some(id => !ids.includes(id) || plan.excluded_concepts.some(x => x.concept_id === id))) fail('selected exceeds cap or request');
  const first = id => requests.find(x => x.concept_id === id)?.question_span.start ?? Infinity;
  if (!same(selected, [...selected].sort((a, b) => first(a) - first(b) || a.localeCompare(b)))) fail('selected order differs from question');
  if ((plan.status === 'ready') !== (selected.length > 0)) fail('ready/non-ready selection mismatch');
  if (plan.status === 'ambiguous' && !plan.unresolved_mentions.length) fail('ambiguous without unresolved mention');
  if (plan.status === 'zero_knowledge' && plan.unresolved_mentions.length) fail('zero knowledge used for unresolved intent');
  if (plan.status === 'needs_narrowing' && ids.filter(id => !explicit.includes(id)).length <= 2) fail('needs_narrowing without >2 topics');
  if (plan.status === 'zero_knowledge' && plan.constraints.knowledge_allowed && plan.question_scope !== 'unknown' && ids.length && !plan.excluded_concepts.length) fail('zero knowledge lacks reason');
  if (plan.question_scope === 'unknown' && plan.status === 'ready') fail('unknown scope ready');
  if (plan.question_scope === 'mixed' && selected.length && !requests.some(x => x.additional_question_spans?.length)) fail('mixed plan lacks second question mention');
  if (item.context_mode === 'no_case' && !['theory', 'unknown'].includes(plan.question_scope)) fail('no-case scope mismatch');
  const availability = new Map();
  for (const hit of hits) {
    const entry = byRule.get(hit.rule_id);
    if (!availability.has(entry.concept_id)) availability.set(entry.concept_id, []);
    availability.get(entry.concept_id).push(hit);
  }
  for (const id of selected) {
    if (!plan.constraints.knowledge_allowed) fail('selected Knowledge disallowed');
    const matching = availability.get(id) ?? [];
    if (['case_specific', 'mixed'].includes(plan.question_scope) && !matching.length) fail(`selected concept absent from case: ${id}`);
    if (!reviewed.some(u => u.related_concepts.includes(id) &&
      (!['case_specific', 'mixed'].includes(plan.question_scope) || matching.some(h => u.related_rule_ids.includes(h.rule_id))))) fail(`selected concept not admitted: ${id}`);
  }
  for (const ex of plan.excluded_concepts) {
    const matching = availability.get(ex.concept_id) ?? [];
    if (ex.reason === 'case_relation_not_present' && matching.length) fail('absent relation is present');
    if (ex.reason === 'knowledge_not_admitted' && reviewed.some(u => u.related_concepts.includes(ex.concept_id) &&
      (!['case_specific', 'mixed'].includes(plan.question_scope) || matching.some(h => u.related_rule_ids.includes(h.rule_id))))) fail('admitted unit incorrectly excluded');
  }
}

export function validateBenchmarkCandidate(data = read('experiments/phase8/query-planning/benchmark.json')) {
  validateValue(data, read('experiments/phase8/query-planning/benchmark.schema.json'));
  const catalog = read('knowledge/catalog/catalog.json');
  const map = validateRuleConceptMap(read('knowledge/catalog/rule-concept-map.json'), { ruleIds: RULES.map(r => r.rule_id), catalog });
  const current = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
  const currentIndex = loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION });
  const oldIndex = loadCorpus({ version: 'phase7.1-initial-1' }, { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION });
  if (currentIndex.corpus_hash !== 'sha256:aa3522aebb7e4ad18b54e144ea26499323e55838f79856fdd59f2c53baadcda3' ||
    oldIndex.corpus_hash !== 'sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729') fail('pinned corpus changed');
  const byRule = new Map(map.entries.map(x => [x.rule_id, x]));
  const reviewed = current.units.filter(u => u.verification_status === 'reviewed' && u.data_kind === 'corpus');
  const priorQuestions = new Set(read('experiments/phase7/evaluation/cases.json').cases.map(x => x.question));
  const familyMap = new Map();
  for (const family of data.semantic_families) {
    if (familyMap.has(family.family_id) || !family.intent_template.trim()) fail('duplicate/empty semantic family');
    familyMap.set(family.family_id, family);
  }
  if (!unique(data.semantic_families.map(x => x.intent_template))) fail('duplicate semantic intent template');
  const ids = new Set(), questions = new Set(), coverage = new Set(), fixtures = new Map(), familyCounts = new Map();
  for (const item of data.cases) {
    if (ids.has(item.case_id) || questions.has(item.user_question)) fail('duplicate case ID or question');
    ids.add(item.case_id); questions.add(item.user_question);
    const family = familyMap.get(item.family_id);
    if (!family || family.split !== item.split) fail('family crosses development/holdout');
    familyCounts.set(item.family_id, (familyCounts.get(item.family_id) ?? 0) + 1);
    if (item.split === 'holdout' && priorQuestions.has(item.user_question)) fail('Phase 7.3B question in holdout');
    if (!item.rationale.trim()) fail('missing rationale');
    for (const tag of item.coverage_tags) coverage.add(tag);
    if (item.catalog_revision !== catalog.revision || item.corpus_version !== currentIndex.corpus_version || item.corpus_hash !== currentIndex.corpus_hash) fail('catalog/corpus identity mismatch');
    let hits = [];
    if (item.context_mode === 'no_case') {
      if (item.case_fixture !== null || item.available_rule_ids.length || item.question_fact_references.length) fail('no-case reference mismatch');
    } else {
      if (!item.case_fixture || (item.split === 'holdout' && item.case_fixture.file.includes('phase7'))) fail('invalid case fixture');
      const key = `${item.case_fixture.file}:${item.case_fixture.case_id}`;
      if (!fixtures.has(key)) {
        const found = read(item.case_fixture.file).cases.find(x => x.case_id === item.case_fixture.case_id);
        if (!found) fail('missing case fixture');
        fixtures.set(key, found.canonical);
      }
      const cast = fixtures.get(key);
      if (identityHash(cast) !== item.case_fixture.canonical_hash) fail('canonical fixture hash mismatch');
      hits = evaluateRules(cast).hits;
      if (!same([...new Set(hits.map(h => h.rule_id))].sort(), item.available_rule_ids)) fail('Rule hits differ from fixture');
      if (/[初二三四五上]爻(?:受|月破|日冲|旬空|化退|空亡)/.test(item.user_question) && !item.question_fact_references.length) fail(`explicit line claim lacks fact reference: ${item.case_id}`);
    }
    for (const ref of item.question_fact_references) {
      validateValue(ref, { type: 'object', properties: { rule_id: { type: 'string' }, target: QUERY_PLAN_SCHEMA.properties.available_concepts.items.properties.rule_anchors.items.properties.target,
        question_span: QUERY_PLAN_SCHEMA.properties.requested_concepts.items.properties.question_span }, required: ['rule_id', 'target', 'question_span'], additionalProperties: false });
      span(item.user_question, ref.question_span);
      if (!hits.some(h => h.rule_id === ref.rule_id && same({ line: h.target.line, component: h.target.component, related_line: h.target.related_line ?? null }, ref.target))) fail(`fact reference differs from Rule hit: ${item.case_id}`);
    }
    const context = { catalog, byRule, reviewed, hits };
    validatePlan(item.primary_expected_plan, item, context);
    for (const plan of item.acceptable_plans) {
      validatePlan(plan, item, context);
      if (same(plan, item.primary_expected_plan)) fail('alternative repeats primary plan');
    }
    if (item.ambiguity_status === 'clear' && item.acceptable_plans.length) fail('clear item has alternatives');
    if (item.ambiguity_status !== 'clear' && !item.acceptable_plans.length) fail('ambiguous item lacks alternative plan');
  }
  if (familyCounts.size !== familyMap.size || data.cases.length !== 72 || data.cases.filter(x => x.split === 'development').length !== 48 ||
    data.cases.filter(x => x.split === 'holdout').length !== 24 || familyMap.size !== 24 ||
    [...familyCounts.values()].some(n => n !== 3)) fail('candidate or semantic-family split mismatch');
  for (const tag of requiredTags) if (!coverage.has(tag)) fail(`missing coverage: ${tag}`);
  return { valid: true, candidate_status: data.candidate_status, cases: data.cases.length,
    development: 48, holdout: 24, families: familyMap.size,
    ambiguous: data.cases.filter(x => x.ambiguity_status !== 'clear').length,
    fact_references: data.cases.reduce((n, x) => n + x.question_fact_references.length, 0),
    current_corpus_hash: currentIndex.corpus_hash, historical_corpus_hash: oldIndex.corpus_hash };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  console.log(JSON.stringify(validateBenchmarkCandidate(), null, 2));
