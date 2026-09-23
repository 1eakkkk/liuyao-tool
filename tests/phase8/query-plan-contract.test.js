// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { QUERY_PLAN_SCHEMA, validateQueryPlan, validateRuleConceptMap, identityHash,
  QUERY_PLAN_VERSION, RULE_CONCEPT_MAP_VERSION } from '../../src/knowledge/query-plan-schema.js';
import { validateValue, textHash } from '../../src/knowledge/validate.js';
import { RULES } from '../../src/rules/registry.js';
import { evaluateRules } from '../../src/rules/engine.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';

const read = p => JSON.parse(fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const map = read('knowledge/catalog/rule-concept-map.json');
const catalog = read('knowledge/catalog/catalog.json');
const corpus = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
const index = loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: 'r1' });
const canonical = read('experiments/phase6/cases.json').cases[0].canonical;
const rules = evaluateRules(canonical);
const contractContext = (cast = canonical, result = rules) => ({ question: '🧭这爻月破，是不是一定无用？', canonical: cast, ruleResult: result,
  catalog, corpus: { ...index, units: corpus.units }, map, ruleIds: RULES.map(r => r.rule_id) });
const anchor = hit => ({ rule_id: hit.rule_id, target: { line: hit.target.line, component: hit.target.component, related_line: hit.target.related_line ?? null } });
function availability(result) {
  const byRule = new Map(map.entries.map(e => [e.rule_id, e]));
  const byConcept = new Map();
  for (const hit of result?.hits || []) {
    const mapping = byRule.get(hit.rule_id);
    if (!byConcept.has(mapping.concept_id)) byConcept.set(mapping.concept_id, { concept_id: mapping.concept_id,
      exposure: mapping.exposure, rule_anchors: [] });
    byConcept.get(mapping.concept_id).rule_anchors.push(anchor(hit));
  }
  return [...byConcept.values()];
}
function makePlan(question = '🧭这爻月破，是不是一定无用？', cast = canonical, result = rules) {
  const start = question.indexOf('月破'), match = { start, end: start + 2, matched_text: '月破' };
  const hit = result?.hits.find(h => h.rule_id === 'MONTH-CLASH-001');
  return { planner_version: QUERY_PLAN_VERSION, status: 'ready', question_scope: 'case_specific',
    requested_concepts: [{ concept_id: 'month-break', basis: 'exact_term', question_span: match }], unresolved_mentions: [],
    available_concepts: availability(result), selected_concepts: ['month-break'], excluded_concepts: [],
    constraints: { exclude_concepts: [], knowledge_allowed: true, narrow_request: false, output_constraints: [] },
    selection_reasons: [{ concept_id: 'month-break', uses: ['case_relation'], basis: 'exact_term', question_span: match,
      rule_anchors: [anchor(hit)] }],
    retrieval_query: { concepts: ['month-break'], limit: 4, verification_status: 'reviewed' },
    input_identity: { question_hash: textHash(question), canonical_hash: cast ? identityHash(cast) : null,
      rule_result_hash: result ? identityHash(result) : null, ruleset_version: 'r1', mapping_version: RULE_CONCEPT_MAP_VERSION,
      catalog_revision: catalog.revision, corpus_version: index.corpus_version, corpus_hash: index.corpus_hash } };
}
const validate = (plan, context = contractContext()) => validateQueryPlan(plan, context);

test('closed planner schema accepts an anchored plan and rejects unknown fields', () => {
  const plan = makePlan();
  expect(validate(plan)).toBe(plan);
  expect(validateValue(plan, QUERY_PLAN_SCHEMA)).toBe(plan);
  expect(() => validate({ ...plan, confidence: 0.9 })).toThrow(/unknown field/);
  expect(() => validate({ ...plan, requested_concepts: [{ ...plan.requested_concepts[0], extra: true }] })).toThrow(/unknown field/);
});

test('r1 mapping covers all 25 IDs and rejects unknown rule or concept', () => {
  expect(validateRuleConceptMap(map, { ruleIds: RULES.map(r => r.rule_id), catalog }).entries).toHaveLength(25);
  const unknownRule = structuredClone(map); unknownRule.entries[0].rule_id = 'UNKNOWN-001';
  expect(() => validateRuleConceptMap(unknownRule, { ruleIds: RULES.map(r => r.rule_id), catalog })).toThrow(/each r1 rule/);
  const unknownConcept = structuredClone(map); unknownConcept.entries[0].concept_id = 'invented';
  expect(() => validateRuleConceptMap(unknownConcept, { ruleIds: RULES.map(r => r.rule_id), catalog })).toThrow(/unknown concept/);
});

test('requested, available, selected remain distinct and unknown concept fails', () => {
  const p = makePlan();
  expect(p.available_concepts.some(x => x.concept_id === 'xunkong')).toBe(true);
  expect(p.requested_concepts.map(x => x.concept_id)).toEqual(['month-break']);
  expect(p.selected_concepts).toEqual(['month-break']);
  p.selected_concepts = ['xunkong'];
  expect(() => validate(p)).toThrow(/request|reason/i);
  p.selected_concepts = ['invented'];
  expect(() => validate(p)).toThrow(/unknown concept/);
});

test('zero Knowledge is an explicit no-retrieval status, never limit:0', () => {
  const q = '只告诉我卦名。', p = makePlan();
  p.status = 'zero_knowledge'; p.question_scope = 'unknown'; p.requested_concepts = []; p.selected_concepts = [];
  p.selection_reasons = []; p.retrieval_query = null;
  p.constraints = { exclude_concepts: [], knowledge_allowed: false, narrow_request: true, output_constraints: ['names_only'] };
  p.input_identity.question_hash = textHash(q);
  expect(validate(p, { ...contractContext(), question: q })).toBe(p);
  p.retrieval_query = { concepts: [], limit: 0, verification_status: 'reviewed' };
  expect(() => validate(p, { ...contractContext(), question: q })).toThrow();
});

test('source_checked concept is recognized but not selected; absent case relation also blocks selection', () => {
  const q = '这个回头克有文献吗？', p = makePlan();
  const match = { start: q.indexOf('回头克'), end: q.indexOf('回头克') + 3, matched_text: '回头克' };
  p.status = 'zero_knowledge'; p.requested_concepts = [{ concept_id: 'return-relation', basis: 'deterministic_phrase', question_span: match }];
  p.selected_concepts = []; p.selection_reasons = []; p.retrieval_query = null;
  p.excluded_concepts = [{ concept_id: 'return-relation', reason: 'knowledge_not_admitted' }];
  p.input_identity.question_hash = textHash(q);
  expect(validate(p, { ...contractContext(), question: q })).toBe(p);
  p.selected_concepts = ['return-relation']; p.status = 'ready';
  p.retrieval_query = { concepts: ['return-relation'], limit: 4, verification_status: 'reviewed' };
  expect(() => validate(p, { ...contractContext(), question: q })).toThrow();

  const absent = '我这个爻是不是月合？', b = makePlan();
  const a = { start: absent.indexOf('月合'), end: absent.indexOf('月合') + 2, matched_text: '月合' };
  b.status = 'zero_knowledge'; b.requested_concepts = [{ concept_id: 'month-combine', basis: 'exact_term', question_span: a }];
  b.selected_concepts = []; b.selection_reasons = []; b.retrieval_query = null;
  b.excluded_concepts = [{ concept_id: 'month-combine', reason: 'case_relation_not_present' }];
  b.input_identity.question_hash = textHash(absent);
  expect(validate(b, { ...contractContext(), question: absent })).toBe(b);
});

test('theory permits reviewed Knowledge without cast or current anchor', () => {
  const q = '六爻里的月合一般是什么意思？', p = makePlan();
  const match = { start: q.indexOf('月合'), end: q.indexOf('月合') + 2, matched_text: '月合' };
  p.question_scope = 'theory'; p.requested_concepts = [{ concept_id: 'month-combine', basis: 'exact_term', question_span: match }];
  p.available_concepts = []; p.selected_concepts = ['month-combine'];
  p.selection_reasons = [{ concept_id: 'month-combine', uses: ['theory_context'], basis: 'exact_term', question_span: match, rule_anchors: [] }];
  p.retrieval_query = { concepts: ['month-combine'], limit: 4, verification_status: 'reviewed' };
  p.input_identity = { ...p.input_identity, question_hash: textHash(q), canonical_hash: null, rule_result_hash: null };
  expect(validate(p, { ...contractContext(), question: q, canonical: null, ruleResult: null })).toBe(p);
  p.selection_reasons[0].rule_anchors = [anchor(rules.hits[0])];
  expect(() => validate(p, { ...contractContext(), question: q, canonical: null, ruleResult: null })).toThrow(/theory context/);
});

test('mixed use records theory and case relation separately; internal metadata is not selectable', () => {
  const q = '一般月破怎么理解；本卦月破又该怎样说明？', p = makePlan();
  const phrase = '本卦月破', match = { start: q.indexOf(phrase), end: q.indexOf(phrase) + phrase.length, matched_text: phrase };
  p.question_scope = 'mixed'; p.requested_concepts = [{ concept_id: 'month-break', basis: 'deterministic_phrase', question_span: match,
    additional_question_spans: [{ start: q.indexOf('一般月破'), end: q.indexOf('一般月破') + 4, matched_text: '一般月破' }] }];
  p.selection_reasons[0] = { ...p.selection_reasons[0], basis: 'deterministic_phrase', question_span: match,
    uses: ['theory_context', 'case_relation'] };
  p.input_identity.question_hash = textHash(q);
  expect(validate(p, { ...contractContext(), question: q })).toBe(p);
  p.selection_reasons[0].rule_anchors = [];
  expect(() => validate(p, { ...contractContext(), question: q })).toThrow(/case relation anchor/);

  const t = makePlan(); t.requested_concepts[0].concept_id = 'temporal-scope';
  t.selected_concepts = ['temporal-scope']; t.selection_reasons[0].concept_id = 'temporal-scope';
  t.retrieval_query.concepts = ['temporal-scope'];
  expect(() => validate(t)).toThrow(/internal concept/);
});

test('two-topic cap, needs_narrowing, explicit exclusion and narrow constraints are enforced', () => {
  const p = makePlan();
  p.selected_concepts = ['month-break', 'xunkong', 'advance'];
  expect(() => validate(p)).toThrow(/maximum two/);
  const q = '月破、旬空、化进三项都要文献。', n = makePlan();
  n.status = 'needs_narrowing'; n.requested_concepts = [
    ['month-break', '月破'], ['xunkong', '旬空'], ['advance', '化进']].map(([concept_id, text]) => ({ concept_id, basis: 'exact_term', question_span: {
      start: q.indexOf(text), end: q.indexOf(text) + text.length, matched_text: text } }));
  n.selected_concepts = []; n.selection_reasons = []; n.retrieval_query = null;
  n.excluded_concepts = n.requested_concepts.map(x => ({ concept_id: x.concept_id, reason: 'too_many_requested_topics' }));
  n.input_identity.question_hash = textHash(q);
  expect(validate(n, { ...contractContext(), question: q })).toBe(n);

  const e = makePlan(); e.constraints.exclude_concepts = ['month-break'];
  expect(() => validate(e)).toThrow(/explicit exclusion mismatch/);
  const narrow = makePlan(); narrow.constraints.narrow_request = true;
  expect(() => validate(narrow)).toThrow(/narrow no-literature/);
});

test('question spans are JavaScript UTF-16 offsets, including supplementary characters', () => {
  const p = makePlan(), q = '🧭这爻月破，是不是一定无用？';
  expect(p.requested_concepts[0].question_span.start).toBe(q.indexOf('月破'));
  expect(q.slice(p.requested_concepts[0].question_span.start, p.requested_concepts[0].question_span.end)).toBe('月破');
  p.requested_concepts[0].question_span.start -= 1;
  expect(() => validate(p)).toThrow(/UTF-16/);
});

test('unresolved mentions retain UTF-16 evidence without becoming requested or selected', () => {
  const q = '🧭“近神”可能写错了；请解释月破。';
  const p = makePlan(q);
  p.requested_concepts[0].question_span = { start: q.indexOf('月破'), end: q.indexOf('月破') + 2, matched_text: '月破' };
  p.selection_reasons[0].question_span = p.requested_concepts[0].question_span;
  p.unresolved_mentions = [{ text: '近神', reason: 'possible_typo', candidate_concepts: ['advance'],
    question_span: { start: q.indexOf('近神'), end: q.indexOf('近神') + 2, matched_text: '近神' } }];
  expect(validate(p, { ...contractContext(), question: q })).toBe(p);
  expect(p.requested_concepts.map(x => x.concept_id)).toEqual(['month-break']);
  p.unresolved_mentions[0].candidate_concepts = ['invented'];
  expect(() => validate(p, { ...contractContext(), question: q })).toThrow(/unknown unresolved concept/);
  p.unresolved_mentions[0].candidate_concepts = ['advance'];
  p.unresolved_mentions[0].question_span.start -= 1;
  expect(() => validate(p, { ...contractContext(), question: q })).toThrow(/UTF-16/);
});
