// @vitest-environment node
import {test,expect} from 'vitest';
import {checkExplicitPrimaryFacts} from '../../experiments/reading-quality/explicit-facts.js';
const registry=[{id:'fact:/lines/0/relative',kind:'program_fact',value:'父母'},
  {id:'fact:/lines/0/is_shi',kind:'program_fact',value:true},
  {id:'fact:/lines/0/is_ying',kind:'program_fact',value:false},
  {id:'rule:example',kind:'rule_result',source_facts:['fact:/lines/0/relative']}];
const factor=(text,ids=[])=>({interpretation:text,evidence_ids:ids});
const run=factors=>checkExplicitPrimaryFacts({factors},registry);
test('a valid citation does not excuse an explicit false relative or role',()=>{
  const r=run([factor('第1爻的六亲为兄弟。',['fact:/lines/0/relative']),factor('第1爻不是世爻。',['fact:/lines/0/is_shi'])]);
  expect([r.checked,r.conflicts,r.missing_direct_citations]).toEqual([2,2,0]);
});
test('absence of a direct citation remains separate from indirect rule mentions and borrowed citations',()=>{
  const r=run([factor('第1爻的六亲为父母。',['rule:example']),factor('第1爻不是应爻。',['fact:/lines/0/relative']),
    factor('另一段的引用不支持上一段。',['fact:/lines/0/is_ying'])]);
  expect([r.conflicts,r.missing_direct_citations,r.unassessed]).toEqual([0,2,1]);
  expect(r.factors[0].rule_mentions_source).toBe(true);
  expect(r.factors[1].direct_citation).toBe(false);
});
test.each(['第1爻是世爻？','第1爻不是世爻吗？','如果第1爻是世爻。','“第1爻是世爻。”',
 '第1爻变出的是世爻。','第1爻的伏神六亲为兄弟。','第1爻是世爻。必然成功。','第1爻可能是世爻。'])('context remains unassessed: %s',text=>{
  const r=run([factor(text,['fact:/lines/0/is_shi'])]);expect([r.checked,r.conflicts,r.unassessed]).toEqual([0,0,1]);
});
test('Chinese numbering and explicit negative roles match source types',()=>{
  const r=run([factor('本卦第一爻非应爻。',['fact:/lines/0/is_ying'])]);
  expect([r.checked,r.conflicts,r.missing_direct_citations]).toEqual([1,0,0]);
});
test('missing sources and unknown references never become semantic success',()=>{
  const r=run([factor('第2爻的六亲为兄弟。'),factor('第1爻是世爻。',['missing'])]);
  expect(r.factors[0].reason).toBe('source_missing');expect(r.factors[1].unknown_citations).toEqual(['missing']);
  expect(r.missing_direct_citations).toBe(1);
  expect(()=>checkExplicitPrimaryFacts({factors:[]},[...registry,registry[0]])).toThrow('Duplicate');
});
