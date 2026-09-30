import { test, expect } from 'vitest';
import { collectEvidencePresentation } from '../../src/ai/output/evidence-presentation.js';
const registry = [
  { id: 'fact:a', kind: 'program_fact', value: false },
  { id: 'fact:b', kind: 'program_fact', value: '木' },
  { id: 'rule:a', kind: 'rule_result', source_facts: ['fact:a', 'fact:b'], result: { label: '规则甲' } },
  { id: 'rule:b', kind: 'rule_result', source_facts: ['fact:b'], result: { label: '规则乙' } }
];
test('multiple representations preserve facts once, direct citation flags and complete shared rule dependencies', () => {
  const before=JSON.stringify(registry);
  const result=collectEvidencePresentation(registry,['rule:a','fact:a','rule:b','fact:b','rule:a']);
  expect(result.facts.map(f=>[f.entry.id,f.number,f.direct])).toEqual([['fact:a',1,true],['fact:b',2,true]]);
  expect(result.facts[0].entry.value).toBe(false);
  expect(result.rules.map(r=>r.sourceNumbers)).toEqual([[1,2],[2]]);
  expect(JSON.stringify(registry)).toBe(before);
});
test('rules alone expose source facts without pretending direct model citations or adding evidence weight', () => {
  const result=collectEvidencePresentation(registry,['rule:b']);
  expect(result.facts[0].direct).toBe(false); expect(result.facts[0].entry.id).toBe('fact:b');
  expect(result.rules[0].sourceNumbers).toEqual([1]);
  expect(result).not.toHaveProperty('score'); expect(result).not.toHaveProperty('confidence');
  expect(collectEvidencePresentation(registry,[])).toEqual({facts:[],rules:[]});
});
test.each(['unknown', 'missing_source', 'rule_as_source', 'duplicate_registry'])('rejects malformed citations: %s', defect => {
  let input=structuredClone(registry), ids=['rule:a'];
  if(defect==='unknown') ids=['fact:missing'];
  if(defect==='missing_source') input=input.filter(e=>e.id!=='fact:a');
  if(defect==='rule_as_source') input[2].source_facts=['rule:b'];
  if(defect==='duplicate_registry') input.push(input[0]);
  expect(()=>collectEvidencePresentation(input,ids)).toThrow();
});
