// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { validateBenchmarkCandidate } from '../../scripts/phase8/validate-query-planning.js';
import { buildBenchmarkCandidate } from '../../scripts/phase8/generate-query-benchmark.js';

const read = p => JSON.parse(fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const original = read('experiments/phase8/query-planning/benchmark.json');
const edit = fn => { const data = structuredClone(original); fn(data); return data; };
const item = id => original.cases.find(x => x.case_id === id);

test('candidate generation is deterministic and remains unfrozen', () => {
  expect(buildBenchmarkCandidate()).toEqual(original);
  expect(validateBenchmarkCandidate(original)).toMatchObject({ valid: true, candidate_status: 'candidate_not_frozen',
    cases: 72, development: 48, holdout: 24, families: 24, fact_references: 23 });
});

test('semantic families have a single split and holdout excludes Phase 7 questions', () => {
  const phase7 = new Set(read('experiments/phase7/evaluation/cases.json').cases.map(c => c.question));
  expect(original.cases.filter(c => c.split === 'holdout').some(c => phase7.has(c.user_question))).toBe(false);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[48].family_id = d.cases[0].family_id; }))).toThrow(/family crosses/);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[48].user_question = [...phase7][0]; }))).toThrow(/Phase 7\.3B/);
});

test('atomic alternatives are complete plans with independently checked scope, status and admission', () => {
  expect(item('qp-012').primary_expected_plan).toMatchObject({ status: 'ambiguous', requested_concepts: [], selected_concepts: [] });
  expect(item('qp-012').acceptable_plans[0]).toMatchObject({ question_scope: 'case_specific', status: 'ready', selected_concepts: ['advance'] });
  expect(item('qp-072').primary_expected_plan).toMatchObject({ status: 'ready', selected_concepts: ['retreat'] });
  expect(item('qp-072').acceptable_plans[0].selected_concepts).toEqual(['advance', 'retreat']);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[11].acceptable_plans[0].status = 'zero_knowledge'; }))).toThrow(/ready\/non-ready/);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[71].acceptable_plans[0].selected_concepts = ['day-combine']; }))).toThrow(/selected exceeds|selected concept not admitted/);
});

test('unresolved spelling and explicit xunkong mention remain separate', () => {
  const typo = item('qp-072').primary_expected_plan;
  expect(typo.unresolved_mentions).toMatchObject([{ text: '近神', reason: 'possible_typo', candidate_concepts: ['advance'] }]);
  const shorthand = item('qp-066').primary_expected_plan;
  expect(shorthand.requested_concepts[0].question_span.matched_text).toBe('旬空');
  expect(shorthand.selected_concepts).toEqual(['xunkong']);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[71].primary_expected_plan.unresolved_mentions[0].question_span.start--; }))).toThrow(/UTF-16/);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[71].primary_expected_plan.unresolved_mentions[0].candidate_concepts = ['invented']; }))).toThrow(/unknown concept/);
});

test('label basis follows actual catalog and mixed questions record both mentions', () => {
  for (const id of ['qp-010', 'qp-013', 'qp-015', 'qp-048', 'qp-061', 'qp-062'])
    expect(item(id).primary_expected_plan.requested_concepts.find(x => ['化进', '化退'].includes(x.question_span.matched_text))?.basis).toBe('catalog_alias');
  for (const id of ['qp-046', 'qp-047'])
    expect(item(id).primary_expected_plan.requested_concepts[0].additional_question_spans).toHaveLength(1);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[9].primary_expected_plan.requested_concepts[0].basis = 'exact_term'; }))).toThrow(/exact_term/);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[45].primary_expected_plan.requested_concepts[0].additional_question_spans[0].start--; }))).toThrow(/UTF-16/);
});

test('question fact references check real Rule target and UTF-16 question text', () => {
  expect(item('qp-031').question_fact_references.map(x => x.target.line)).toEqual([1, 5]);
  expect(item('qp-052').question_fact_references.map(x => x.target.line)).toEqual([6, 3]);
  expect(item('qp-065').question_fact_references.map(x => x.target.line)).toEqual([3, 5]);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[30].question_fact_references[0].target.line = 2; }))).toThrow(/fact reference differs/);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[30].question_fact_references = []; }))).toThrow(/explicit line claim/);
});

test('source checked, absence, exclusion and narrow outputs are not selected', () => {
  expect(item('qp-039').context_mode).toBe('no_case');
  expect(item('qp-039').primary_expected_plan).toMatchObject({ status: 'zero_knowledge', selected_concepts: [] });
  expect(item('qp-053').primary_expected_plan).toMatchObject({ selected_concepts: ['retreat', 'xunkong'],
    excluded_concepts: [{ concept_id: 'month-break', reason: 'explicit_exclusion' }] });
  expect(item('qp-069').primary_expected_plan).toMatchObject({ requested_concepts: [], selected_concepts: [], status: 'zero_knowledge' });
  expect(item('qp-069').question_fact_references[0].rule_id).toBe('DAY-COMBINE-001');
  expect(() => validateBenchmarkCandidate(edit(d => { const p = d.cases[38].primary_expected_plan; p.selected_concepts = ['day-combine']; p.status = 'ready'; p.excluded_concepts = []; }))).toThrow(/selected concept not admitted/);
});

test('closed schemas reject unknown fields and stale fixture identity', () => {
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[0].invented = true; }))).toThrow(/unknown field/);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[0].primary_expected_plan.invented = true; }))).toThrow(/unknown field/);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[0].case_fixture.canonical_hash = `sha256:${'0'.repeat(64)}`; }))).toThrow(/fixture hash/);
  expect(() => validateBenchmarkCandidate(edit(d => { d.cases[0].corpus_hash = `sha256:${'0'.repeat(64)}`; }))).toThrow();
});
