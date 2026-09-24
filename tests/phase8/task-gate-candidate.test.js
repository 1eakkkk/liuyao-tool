// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { QUERY_PLAN_VERSION, QUERY_PLAN_SCHEMA, RULE_CONCEPT_MAP_VERSION, identityHash } from '../../src/knowledge/query-plan-schema.js';
import { QUERY_PLAN_VERSION_12, QUERY_PLAN_SCHEMA_12, QUERY_PLAN_LABEL_SCHEMA_12 } from '../../src/knowledge/query-plan-schema-v1.2.js';
import { validateValue, textHash } from '../../src/knowledge/validate.js';
import { evaluateRules } from '../../src/rules/engine.js';
import { RULES } from '../../src/rules/registry.js';
import { loadCorpus } from '../../src/knowledge/load.js';
import { buildTaskGateCandidate } from '../../scripts/phase8/generate-task-gate-benchmark.js';
import { TASK_GATE_BENCHMARK_SCHEMA, validateTaskGateBenchmark } from '../../scripts/phase8/validate-task-gate-benchmark.js';

const read = p => JSON.parse(fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const data = read('experiments/phase8/query-planning-task-gate/benchmark.json');
const schema = read('experiments/phase8/query-planning-task-gate/benchmark.schema.json');
const item = id => data.cases.find(x => x.case_id === id);
const edit = fn => { const copy = structuredClone(data); fn(copy); return copy; };

test('1.1 remains a separate historical contract and 1.2 is closed', () => {
  expect(QUERY_PLAN_VERSION).toBe('query-plan-1.1');
  expect(QUERY_PLAN_SCHEMA.properties.planner_version.const).toBe('query-plan-1.1');
  expect(QUERY_PLAN_VERSION_12).toBe('query-plan-1.2');
  expect(QUERY_PLAN_SCHEMA_12.properties.planner_version.const).toBe('query-plan-1.2');
  expect(QUERY_PLAN_SCHEMA.properties).not.toHaveProperty('knowledge_task');
  expect(QUERY_PLAN_SCHEMA_12.properties).toHaveProperty('knowledge_task');
  expect(() => validateValue({ ...item('tg-001').primary_expected_plan, confidence: 0.8 }, QUERY_PLAN_LABEL_SCHEMA_12)).toThrow(/unknown field/);
});

test('a complete 1.2 envelope can carry a validated candidate label without altering 1.1', () => {
  const c = item('tg-002'), label = c.primary_expected_plan;
  const canonical = read(c.case_fixture.file).cases.find(x => x.case_id === c.case_fixture.case_id).canonical;
  const rules = evaluateRules(canonical);
  const mapping = read('knowledge/catalog/rule-concept-map.json');
  const byRule = new Map(mapping.entries.map(x => [x.rule_id, x]));
  const available = new Map();
  const toAnchor = hit => ({ rule_id: hit.rule_id, target: { line: hit.target.line,
    component: hit.target.component, related_line: hit.target.related_line ?? null } });
  for (const hit of rules.hits) {
    const mapped = byRule.get(hit.rule_id);
    if (!available.has(mapped.concept_id)) available.set(mapped.concept_id, { concept_id: mapped.concept_id,
      exposure: mapped.exposure, rule_anchors: [] });
    available.get(mapped.concept_id).rule_anchors.push(toAnchor(hit));
  }
  const request = label.requested_concepts[0];
  const anchors = rules.hits.filter(x => byRule.get(x.rule_id).concept_id === 'shi-ying').map(toAnchor);
  const index = loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, { ruleIds: RULES.map(x => x.rule_id), rulesetVersion: 'r1' });
  const full = { planner_version: QUERY_PLAN_VERSION_12, ...label,
    available_concepts: [...available.values()], selection_reasons: [{ concept_id: 'shi-ying',
      uses: ['case_relation'], basis: request.basis, question_span: request.question_span, rule_anchors: anchors }],
    input_identity: { question_hash: textHash(c.user_question), canonical_hash: identityHash(canonical),
      rule_result_hash: identityHash(rules), ruleset_version: 'r1', mapping_version: RULE_CONCEPT_MAP_VERSION,
      catalog_revision: c.catalog_revision, corpus_version: index.corpus_version, corpus_hash: index.corpus_hash } };
  expect(validateValue(full, QUERY_PLAN_SCHEMA_12)).toBe(full);
  expect(() => validateValue(full, QUERY_PLAN_SCHEMA)).toThrow();
});

test('candidate generation, JSON schema, corpus identity and split are stable', () => {
  expect(buildTaskGateCandidate()).toEqual(data);
  expect(TASK_GATE_BENCHMARK_SCHEMA).toEqual(schema);
  expect(validateTaskGateBenchmark(data)).toMatchObject({ cases: 64, development: 32, holdout: 32, families: 16, acceptable_complete_plans: 0 });
  expect(data.candidate_status).toBe('candidate_not_frozen');
  expect(data.cases.filter(x => x.context_mode === 'no_case')).toHaveLength(7);
});

test('task and scope stay orthogonal, including non-Knowledge with recognized topics', () => {
  expect(item('tg-001').primary_expected_plan).toMatchObject({ question_scope: 'case_specific', knowledge_task: 'non_knowledge', selected_concepts: [], status: 'zero_knowledge' });
  expect(item('tg-028').primary_expected_plan).toMatchObject({ question_scope: 'theory', knowledge_task: 'knowledge_seeking', selected_concepts: [] });
  expect(item('tg-009').primary_expected_plan).toMatchObject({ question_scope: 'unknown', knowledge_task: 'non_knowledge', requested_concepts: [] });
  expect(item('tg-013').context_mode).toBe('no_case');
  expect(item('tg-013').primary_expected_plan.selected_concepts).toEqual(['month-combine']);
  expect(item('tg-008').primary_expected_plan).toMatchObject({ question_scope: 'mixed', knowledge_task: 'mixed' });
  expect(item('tg-008').primary_expected_plan.requested_concepts[0].context_use).toBe('theory');
  expect(item('tg-036').primary_expected_plan.requested_concepts[0].context_use).toBe('theory');
  expect(item('tg-048').primary_expected_plan).toMatchObject({ question_scope: 'theory', request_relation: 'none' });
});

test('mixed and sequential tasks select only requested literature', () => {
  expect(item('tg-006').primary_expected_plan).toMatchObject({ knowledge_task: 'mixed', selected_concepts: ['xunkong'], status: 'ready' });
  expect(item('tg-003').primary_expected_plan.task_conflict.present).toBe(false);
  expect(item('tg-027').primary_expected_plan).toMatchObject({ selected_concepts: ['day-clash'], excluded_concepts: [{ concept_id: 'return-relation', reason: 'knowledge_not_admitted' }] });
  expect(item('tg-018').primary_expected_plan.requested_concepts.map(x => x.knowledge_use)).toEqual(['excluded', 'required', 'required']);
});

test('exclusive global conflict fails closed and unknown typo is unresolved', () => {
  for (const id of ['tg-029', 'tg-041']) expect(item(id).primary_expected_plan).toMatchObject({
    status: 'ambiguous', knowledge_task: 'unknown', selected_concepts: [], retrieval_query: null,
    task_conflict: { present: true }
  });
  expect(item('tg-064').primary_expected_plan.unresolved_mentions[0].text).toBe('旬孔');
  for (const id of ['tg-031', 'tg-064']) expect(item(id).primary_expected_plan).toMatchObject({
    knowledge_task: 'non_knowledge', requested_concepts: [], selected_concepts: [], retrieval_query: null
  });
  expect(() => validateTaskGateBenchmark(edit(d => { d.cases[28].primary_expected_plan.task_conflict.evidence_spans = []; }))).toThrow(/conflict requires/);
});

test('output policies are independent of retrieval', () => {
  expect(item('tg-014').primary_expected_plan).toMatchObject({ selected_concepts: ['month-combine'], constraints: { output_constraints: ['no_prediction'] } });
  expect(item('tg-013').primary_expected_plan).toMatchObject({ selected_concepts: ['month-combine'], constraints: { output_constraints: ['quote_only', 'no_explanation'] } });
  expect(item('tg-016').primary_expected_plan.constraints.output_constraints).toEqual(['boolean_only']);
  for (const id of ['tg-023', 'tg-032']) expect(item(id).primary_expected_plan.constraints.output_constraints).toContain('boolean_only');
  expect(item('tg-043').primary_expected_plan.constraints.output_constraints).toContain('no_explanation');
  expect(item('tg-043').primary_expected_plan.output_directives).toEqual([expect.objectContaining({ kind: 'format', text: '罗马数字' })]);
  expect(() => validateTaskGateBenchmark(edit(d => { d.cases[42].primary_expected_plan.output_directives[0].question_span.start++; }))).toThrow(/UTF-16/);
});

test('background mention and explicit exclusion do not cause retrieval', () => {
  expect(item('tg-011').primary_expected_plan.requested_concepts).toEqual([]);
  expect(item('tg-046').primary_expected_plan.requested_concepts).toEqual([]);
  expect(item('tg-053').primary_expected_plan.selected_concepts).toEqual(['day-clash']);
  expect(item('tg-053').primary_expected_plan.excluded_concepts).toEqual([{ concept_id: 'month-break', reason: 'explicit_exclusion' }]);
});

test('admission, anchor and topic cap are validated', () => {
  expect(item('tg-025').primary_expected_plan.excluded_concepts[0].reason).toBe('knowledge_not_admitted');
  expect(item('tg-021').primary_expected_plan.excluded_concepts[0].reason).toBe('case_relation_not_present');
  expect(item('tg-020').primary_expected_plan.status).toBe('needs_narrowing');
  expect(() => validateTaskGateBenchmark(edit(d => { d.cases[24].primary_expected_plan.selected_concepts = ['return-relation']; }))).toThrow();
  expect(() => validateTaskGateBenchmark(edit(d => { d.cases[20].primary_expected_plan.selected_concepts = ['month-break']; }))).toThrow();
});

test('rewritten scope question has one complete plan', () => {
  const c = item('tg-062');
  expect(c.ambiguity_status).toBe('clear');
  expect(c.primary_expected_plan.question_scope).toBe('theory');
  expect(c.primary_expected_plan.requested_concepts.every(x => x.context_use === 'theory')).toBe(true);
  expect(c.acceptable_plans).toEqual([]);
  expect(() => validateTaskGateBenchmark(edit(d => { d.cases[61].primary_expected_plan.question_scope = 'case_specific'; }))).toThrow(/case scope needs Canonical/);
});

test('UTF-16 spans, family isolation and historic questions are checked', () => {
  expect(data.cases.reduce((n, c) => n + c.question_fact_references.length, 0)).toBe(8);
  expect(() => validateTaskGateBenchmark(edit(d => { d.cases[5].question_fact_references[0].target.line = 99; }))).toThrow(/fact reference lacks hit/);
  expect(() => validateTaskGateBenchmark(edit(d => { d.cases[0].primary_expected_plan.requested_concepts[0].question_span.start++; }))).toThrow(/UTF-16/);
  expect(() => validateTaskGateBenchmark(edit(d => { d.cases[32].family_id = d.cases[0].family_id; }))).toThrow(/family split leakage/);
  const old = read('experiments/phase8/query-planning/benchmark.json');
  expect(() => validateTaskGateBenchmark(edit(d => { d.cases[32].user_question = old.cases[0].user_question; }))).toThrow(/duplicate\/prior question/);
});

test('standalone questions and holdout language remain independent of exact catalog terms', () => {
  for (const c of data.cases) expect(c.user_question).not.toMatch(/刚才|上一句|前面那句|我的提问|该典籍句/);
  const holdout = data.cases.filter(c => c.split === 'holdout');
  expect(holdout.filter(c => c.primary_expected_plan.requested_concepts.length &&
    !c.primary_expected_plan.requested_concepts.some(r => r.basis === 'exact_term'))).toHaveLength(13);
  expect(holdout.flatMap(c => c.primary_expected_plan.requested_concepts)
    .filter(r => r.basis === 'catalog_alias')).toHaveLength(6);
  expect(holdout.flatMap(c => c.primary_expected_plan.requested_concepts)
    .filter(r => r.basis === 'deterministic_phrase')).toHaveLength(11);
});

test('query feasibility remains a non-Knowledge meta task even with Rule hits', () => {
  for (const id of ['tg-031', 'tg-064']) {
    const c = item(id), p = c.primary_expected_plan;
    expect(c.available_rule_ids.length).toBeGreaterThan(0);
    expect(p.knowledge_task).toBe('non_knowledge');
    expect(p.requested_concepts).toEqual([]);
    expect(p.selected_concepts).toEqual([]);
    expect(p.retrieval_query).toBeNull();
    expect(p.unresolved_mentions).toHaveLength(1);
  }
});
