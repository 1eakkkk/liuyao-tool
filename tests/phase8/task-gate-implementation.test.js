// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { planTaskGate12 } from '../../src/knowledge/query-plan-v1.2.js';
import { readTaskGateDevelopment } from '../../scripts/phase8/read-task-gate-development.js';
import { evaluateTaskGateDevelopment } from '../../scripts/phase8/eval-task-gate-development.js';
import { caseContext } from '../../scripts/phase8/eval-query-planner.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';

const read = p => JSON.parse(fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const catalog = read('knowledge/catalog/catalog.json');
const map = read('knowledge/catalog/rule-concept-map.json');
const raw = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
const corpus = { ...loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, {
  ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION }), units: raw.units };
const development = readTaskGateDevelopment();
const fixtureCache = new Map();
const context = id => caseContext(development.find(x => x.case_id === id), fixtureCache, catalog, map, corpus);

test('development reader stops after 32 cases and never returns new holdout records', () => {
  expect(development).toHaveLength(32);
  expect(development.every(x => x.split === 'development')).toBe(true);
});

test('deterministic task gate separates concept recognition from Knowledge use', () => {
  const c = context('tg-002');
  expect(planTaskGate12(c).selected_concepts).toEqual(['shi-ying']);
  const nonK = planTaskGate12({ ...c, question: '请只确认本卦世应的位置，不要引用古籍。' });
  expect(nonK.knowledge_task).toBe('non_knowledge');
  expect(nonK.selected_concepts).toEqual([]);
  expect(nonK.retrieval_query).toBeNull();
  expect(planTaskGate12(c)).toEqual(planTaskGate12(c));
});

test('explicit no-K, missing anchor, admission, conflict and topic cap fail closed', () => {
  for (const id of ['tg-016', 'tg-021', 'tg-025', 'tg-029', 'tg-020']) {
    const result = planTaskGate12(context(id));
    expect(result.selected_concepts).toEqual([]);
    expect(result.retrieval_query).toBeNull();
  }
});

test('unresolved spelling remains unresolved rather than silently becoming a concept', () => {
  const result = planTaskGate12(context('tg-031'));
  expect(result.knowledge_task).toBe('non_knowledge');
  expect(result.requested_concepts).toEqual([]);
  expect(result.unresolved_mentions.map(x => x.text)).toContain('近神');
});

test('development gate has zero false-positive Knowledge injection and safety violations', () => {
  const report = evaluateTaskGateDevelopment().totals;
  expect(report.planner_exceptions).toBe(0);
  expect(report.false_positive_knowledge_injection).toBe(0);
  expect(report.explicit_no_k_violations).toBe(0);
  expect(report.missing_anchor_injections).toBe(0);
  expect(report.admission_violations).toBe(0);
  expect(report.deterministic_replay).toBe(32);
});
