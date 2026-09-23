// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { planQuery } from '../../src/knowledge/query-plan.js';
import { QUERY_INTENT_PATTERNS_VERSION, QUERY_INTENT_PATTERNS } from '../../src/knowledge/query-intent-patterns.js';
import { validateQueryPlan } from '../../src/knowledge/query-plan-schema.js';
import { stableJson } from '../../src/knowledge/validate.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES } from '../../src/rules/registry.js';
import { evaluateRules } from '../../src/rules/engine.js';
import { evaluatePlanner, caseContext, matchesCompletePlan, matchesAcceptablePlan,
  selectionSafety } from '../../scripts/phase8/eval-query-planner.js';

const read = p => JSON.parse(fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const catalog = read('knowledge/catalog/catalog.json');
const map = read('knowledge/catalog/rule-concept-map.json');
const raw = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
const index = loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, { ruleIds: RULES.map(x => x.rule_id), rulesetVersion: 'r1' });
const corpus = { ...index, units: raw.units };
const canonical = read('experiments/phase6/cases.json').cases[0].canonical;
const ruleResult = evaluateRules(canonical);
const options = question => ({ question, canonical, ruleResult, catalog, map, corpus, ruleIds: RULES.map(x => x.rule_id) });
const make = question => planQuery(options(question));

test('planner is deterministic, validates its own closed contract and has an explicit pattern version', () => {
  const q = '这爻月破怎么理解？', first = make(q);
  expect(QUERY_INTENT_PATTERNS_VERSION).toBe('query-intent-patterns-1.0');
  expect(QUERY_INTENT_PATTERNS.every(x => x.text && x.concept_id && x.why)).toBe(true);
  expect(QUERY_INTENT_PATTERNS.some(x => ['空', '近神'].includes(x.text))).toBe(false);
  expect(stableJson(first)).toBe(stableJson(make(q)));
  expect(validateQueryPlan(first, options(q))).toBe(first);
});

test('canonical label, catalog alias and a bounded phrase retain original UTF-16 spans', () => {
  const label = make('🧭这一爻月破是什么意思？');
  expect(label.requested_concepts[0]).toMatchObject({ concept_id: 'month-break', basis: 'exact_term' });
  expect(label.requested_concepts[0].question_span.start).toBe(5);
  const alias = make('日沖的术语怎么理解？');
  expect(alias.requested_concepts[0]).toMatchObject({ concept_id: 'day-clash', basis: 'catalog_alias' });
  const phrase = make('这爻与月建相合有什么文献语境？');
  expect(phrase.requested_concepts[0]).toMatchObject({ concept_id: 'month-combine', basis: 'deterministic_phrase' });
  for (const p of [label, alias, phrase]) for (const r of p.requested_concepts)
    expect(p.input_identity.question_hash).toMatch(/^sha256:/);
});

test('Rule hits generate availability but never user intent', () => {
  const p = make('这个卦怎么看？');
  expect(p.available_concepts.length).toBeGreaterThan(0);
  expect(p.requested_concepts).toEqual([]);
  expect(p.selected_concepts).toEqual([]);
  expect(p.retrieval_query).toBeNull();
});

test('the same question keeps requested intent when the Rule hits change', () => {
  const cases = read('experiments/phase7/evaluation/cases.json').cases;
  for (const question of ['这叫什么卦？', '月破这个名称指什么？']) {
    const plans = ['case-01', 'case-02', 'case-07', 'case-09', 'case-12'].map(id => {
      const cast = cases.find(x => x.case_id === id).canonical;
      return planQuery({ ...options(question), canonical: cast, ruleResult: evaluateRules(cast) });
    });
    for (const p of plans.slice(1)) expect(p.requested_concepts).toEqual(plans[0].requested_concepts);
  }
});

test('Planner and phrase tables contain no benchmark case IDs or complete development questions', () => {
  const sources = ['src/knowledge/query-plan.js', 'src/knowledge/query-intent-patterns.js']
    .map(p => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
  for (const source of sources) {
    expect(source).not.toMatch(/qp-\d{3}|case-\d{2}|family_id|primary_expected_plan|acceptable_plans/);
    for (const item of read('experiments/phase8/query-planning/benchmark.json').cases.filter(x => x.split === 'development'))
      expect(source).not.toContain(item.user_question);
  }
});

test('explicit exclusion differs from a no-prediction output constraint', () => {
  const a = make('先别说月破，我问日冲。');
  expect(a.constraints.exclude_concepts).toEqual(['month-break']);
  expect(a.selected_concepts).toEqual(['day-clash']);
  const b = make('不要判断吉凶，解释月破。');
  expect(b.constraints.exclude_concepts).toEqual([]);
  expect(b.constraints.output_constraints).toContain('no_prediction');
  expect(b.selected_concepts).toEqual(['month-break']);
  const c = make('本卦有旬空和月破，但只看月破。');
  expect(c.constraints.exclude_concepts).toEqual(['xunkong']);
  expect(c.selected_concepts).toEqual(['month-break']);
});

test('anchored excluded and narrow topics cannot leak Knowledge', () => {
  const casts = read('experiments/phase7/evaluation/cases.json').cases;
  const breakCast = casts.find(x => x.case_id === 'case-02').canonical;
  const bothCast = casts.find(x => x.case_id === 'case-05').canonical;
  for (const question of ['我只问卦名，至于月破以后再说。', '虽然盘上写着月破，我现在只要动爻数量。']) {
    const p = planQuery({ ...options(question), canonical: breakCast, ruleResult: evaluateRules(breakCast) });
    expect(p.selected_concepts).toEqual([]);
    expect(p.retrieval_query).toBeNull();
    expect(p.excluded_concepts).toContainEqual({ concept_id: 'month-break', reason: 'narrow_request' });
  }
  for (const question of ['月破先放一边，讲日冲的文献定义。', '不要讨论月破，解释本卦的日冲。']) {
    const p = planQuery({ ...options(question), canonical: bothCast, ruleResult: evaluateRules(bothCast) });
    expect(p.selected_concepts).toEqual(['day-clash']);
    expect(p.excluded_concepts).toContainEqual({ concept_id: 'month-break', reason: 'explicit_exclusion' });
  }
});

test('narrow factual request and unknown broad request do not call retrieval', () => {
  const narrow = make('只告诉我卦名。');
  expect(narrow.status).toBe('zero_knowledge');
  expect(narrow.constraints.narrow_request).toBe(true);
  expect(narrow.retrieval_query).toBeNull();
  const broad = make('这个卦怎么看？');
  expect(broad.question_scope).toBe('unknown');
  expect(broad.status).toBe('zero_knowledge');
});

test('theory may select reviewed knowledge without any case Rule hit', () => {
  const p = planQuery({ ...options('六爻术语里的月合一般是什么意思？'), canonical: null, ruleResult: null });
  expect(p.question_scope).toBe('theory');
  expect(p.available_concepts).toEqual([]);
  expect(p.selected_concepts).toEqual(['month-combine']);
  expect(p.selection_reasons[0].uses).toEqual(['theory_context']);
});

test('case-specific relation without an anchor cannot select Knowledge', () => {
  const p = make('我这个爻是不是月合？');
  expect(p.requested_concepts.map(x => x.concept_id)).toEqual(['month-combine']);
  expect(p.selected_concepts).toEqual([]);
  expect(p.excluded_concepts).toContainEqual({ concept_id: 'month-combine', reason: 'case_relation_not_present' });
});

test('mixed request keeps separate theory and case evidence for one concept', () => {
  const cast = read('experiments/phase7/evaluation/cases.json').cases.find(x => x.case_id === 'case-07').canonical;
  const p = planQuery({ ...options('一般化退是什么意思；这卦的化退又该怎么引用？'),
    canonical: cast, ruleResult: evaluateRules(cast) });
  expect(p.question_scope).toBe('mixed');
  expect(p.requested_concepts[0].additional_question_spans).toHaveLength(1);
  expect(p.selection_reasons[0].uses).toEqual(['theory_context', 'case_relation']);
});

test('source-checked terms are recognized but cannot be selected', () => {
  const p = make('这个回头克有文献吗？');
  expect(p.requested_concepts.map(x => x.concept_id)).toEqual(['return-relation']);
  expect(p.excluded_concepts).toContainEqual({ concept_id: 'return-relation', reason: 'knowledge_not_admitted' });
  expect(p.selected_concepts).toEqual([]);
  const day = planQuery({ ...options('日合在理论上是什么意思？'), canonical: null, ruleResult: null });
  expect(day.requested_concepts.map(x => x.concept_id)).toEqual(['day-combine']);
  expect(day.excluded_concepts).toContainEqual({ concept_id: 'day-combine', reason: 'knowledge_not_admitted' });
  const flying = planQuery({ ...options('飞伏在理论上是什么意思？'), canonical: null, ruleResult: null });
  expect(flying.excluded_concepts).toContainEqual({ concept_id: 'flying-hidden', reason: 'knowledge_not_admitted' });
});

test('世应 availability does not imply reviewed coverage for every relation direction', () => {
  const cast = read('experiments/phase7/evaluation/cases.json').cases.find(x => x.case_id === 'case-03').canonical;
  const p = planQuery({ ...options('这个世应关系怎样引用文献？'), canonical: cast, ruleResult: evaluateRules(cast) });
  expect(p.available_concepts.some(x => x.concept_id === 'shi-ying')).toBe(true);
  expect(p.selected_concepts).toEqual([]);
  expect(p.excluded_concepts).toContainEqual({ concept_id: 'shi-ying', reason: 'knowledge_not_admitted' });
});

test('more than two requested topics asks for narrowing rather than choosing two', () => {
  const p = make('解释月破、旬空和日冲的文献。');
  expect(p.status).toBe('needs_narrowing');
  expect(p.selected_concepts).toEqual([]);
  expect(p.retrieval_query).toBeNull();
});

test('safe topic can coexist with unresolved typo; unresolved-only input remains ambiguous', () => {
  const safe = make('近神可能写错了；请解释月破。');
  expect(safe.status).toBe('ready');
  expect(safe.selected_concepts).toEqual(['month-break']);
  expect(safe.unresolved_mentions).toMatchObject([{ text: '近神', reason: 'possible_typo' }]);
  const ambiguous = make('动爻往前进那种标注，文献有怎么界定吗？');
  expect(ambiguous.status).toBe('ambiguous');
  expect(ambiguous.selected_concepts).toEqual([]);
  expect(ambiguous.unresolved_mentions).toHaveLength(1);
});

test('bare 空 and unknown words are not promoted to a concept or alias', () => {
  const ambiguous = make('退与空是不是一样？');
  expect(ambiguous.requested_concepts).toEqual([]);
  expect(ambiguous.unresolved_mentions.some(x => x.text === '空')).toBe(true);
  expect(ambiguous.selected_concepts).toEqual([]);
  const unknown = make('这个卦的玄妙指标怎么看？');
  expect(unknown.selected_concepts).toEqual([]);
});

test('unknown Rule ID and unknown concept mapping fail closed', () => {
  const badRule = structuredClone(ruleResult);
  badRule.hits[0].rule_id = 'UNREGISTERED-001';
  expect(() => planQuery({ ...options('月破是什么？'), ruleResult: badRule })).toThrow(/Unknown Rule hit/);
  const badMap = structuredClone(map);
  badMap.entries[0].concept_id = 'unknown-concept';
  expect(() => planQuery({ ...options('月破是什么？'), map: badMap })).toThrow(/unknown concept/);
});

test('atomic acceptable plans cannot mix fields from different alternatives', () => {
  const p = { question_scope: 'unknown', status: 'zero_knowledge', requested_concepts: [], selected_concepts: [],
    excluded_concepts: [], constraints: { exclude_concepts: [], knowledge_allowed: true, narrow_request: false, output_constraints: [] }, unresolved_mentions: [] };
  const a = { ...p, question_scope: 'theory' }, b = { ...p, status: 'ambiguous' };
  expect(matchesCompletePlan(a, a)).toBe(true);
  expect(matchesAcceptablePlan({ ...p, question_scope: 'theory', status: 'ambiguous' },
    { primary_expected_plan: p, acceptable_plans: [a, b] })).toBe(false);
  const alt = { ...p, status: 'ready', selected_concepts: ['advance'] };
  expect(selectionSafety(alt, { primary_expected_plan: p, acceptable_plans: [alt] })).toEqual({
    false_positive_concepts: [], false_negative_concepts: [] });
});

test('evaluator is development-only by default and holdout requires explicit acknowledgement', () => {
  expect(() => evaluatePlanner({ split: 'holdout' })).toThrow(/acknowledge-holdout-exposure/);
  const report = evaluatePlanner();
  expect(report.split).toBe('development');
  expect(report.cases).toBe(48);
  expect(report.holdout_exposure).toBe(false);
  expect(report.results).toHaveLength(48);
  expect(report.metrics.deterministic_replay).toBe(48);
  expect(report.metrics.primary_plan_match).toBe(48);
  expect(report.metrics.alternate_plan_match).toBe(0);
  expect(report.metrics.accepted_plan_match).toBe(48);
});

test('benchmark expected labels never enter Planner input or change its raw output', () => {
  const benchmark = read('experiments/phase8/query-planning/benchmark.json');
  const item = benchmark.cases.find(x => x.split === 'development');
  const context = caseContext(item, new Map(), catalog, map, corpus);
  expect(Object.keys(context).sort()).toEqual(['canonical', 'catalog', 'corpus', 'map', 'question', 'ruleIds', 'ruleResult']);
  const first = planQuery(context);
  const tampered = structuredClone(item);
  tampered.primary_expected_plan.status = 'invalid';
  tampered.primary_expected_plan.requested_concepts = [];
  tampered.acceptable_plans = [];
  tampered.rationale = 'deliberately wrong synthetic label';
  tampered.case_id = 'changed-label-only';
  tampered.family_id = 'changed-family-only';
  expect(stableJson(planQuery(caseContext(tampered, new Map(), catalog, map, corpus)))).toBe(stableJson(first));
  expect(matchesAcceptablePlan(first, tampered)).toBe(false);
});

test('five repeated plans have identical canonical serialization and no runtime metadata', () => {
  const outputs = Array.from({ length: 5 }, () => make('这爻月破怎么理解？'));
  expect(new Set(outputs.map(stableJson)).size).toBe(1);
  for (const p of outputs) {
    expect(p).not.toHaveProperty('timestamp');
    expect(p).not.toHaveProperty('confidence');
  }
});
