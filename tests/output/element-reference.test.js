// @vitest-environment node
import {test,expect} from 'vitest';
import {buildElementReference,elementalDirection} from '../../src/ai/output/relation-reference.js';
import {createReadingSession,prepareCompactReadingTurn,readingExport} from '../../src/ai/output/session.js';
import {prepareRelationReadingTurn} from '../../experiments/reading-quality/relation-reading.js';
import {auditElementClaims} from '../../experiments/reading-quality/element-claims.js';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {readingRequestBody} from '../../src/ai/output/client.js';
const spec=(await prepareJudgmentPlan()).cases[0];
test('25 elemental directions follow the full five-element cycle and unknowns fail closed',()=>{
 const elements=['木','火','土','金','水'];
 const expected=[['same','generates','controls','controlled_by','generated_by'],['generated_by','same','generates','controls','controlled_by'],['controlled_by','generated_by','same','generates','controls'],['controls','controlled_by','generated_by','same','generates'],['generates','controls','controlled_by','generated_by','same']];
 for(let i=0;i<5;i++)for(let j=0;j<5;j++)expect(elementalDirection(elements[i],elements[j])).toBe(expected[i][j]);
 expect(()=>elementalDirection('未知','水')).toThrow();
});
test('rank replay derives gold-to-water generation, all relation sources exist, no prediction label',async()=>{
 const p=await prepareCompactReadingTurn(createReadingSession(spec.canonical),spec.question),ref=buildElementReference(p.context);
 expect(ref.shi_line).toBe(4);expect(ref.to_shi[2].direction).toBe('generates');expect(ref.to_shi[4].direction).toBe('generates');
 expect(ref.returning.find(r=>r.to.line===4).direction).toBe('controls');
 for(const row of [...ref.to_shi,...ref.returning])for(const id of row.source_fact_ids)expect(p.context.evidence.some(e=>e.id===id)).toBe(true);
 expect(JSON.stringify(ref)).not.toMatch(/favorable|unfavorable|mixed/);expect(()=>buildElementReference(structuredClone(p.context))).toThrow();
});
test('API and export share exactly the program table without changing existing protocol or default input',async()=>{
 const old=await prepareCompactReadingTurn(createReadingSession(spec.canonical),spec.question);
 const p=await prepareRelationReadingTurn(createReadingSession(spec.canonical),spec.question);
 expect(p.context.context_id).toBe(old.context.context_id);
 const payload=JSON.parse(readingRequestBody(p).messages[1].content);
 expect(payload.element_reference).toEqual(buildElementReference(p.context));expect(readingExport(p)).toContain(JSON.stringify(payload));
 expect(JSON.parse(old.messages[1].content).element_reference).toBeUndefined();
});
test('named negative generation conflicts; pronouns stay unassessed and missing citations never become complete checks',async()=>{
 const p=await prepareCompactReadingTurn(createReadingSession(spec.canonical),spec.question);
 const ids=['fact:/lines/2/element','fact:/lines/4/element'];
 const run=(text,evidence_ids=ids)=>auditElementClaims({factors:[{interpretation:text,evidence_ids}]},p.context);
 const failed=run('第三爻与第五爻都是官鬼酉金，得月令旺；官鬼可看作段位与竞争门槛，旺相说明竞争强度和名位分量都在，但两爻没有直接生扶世爻，因此不能作为上分顺利的正面依据。');
 expect(failed.conflicts).toBe(0);expect(failed.unassessed).toBe(1);
 const named=run('第三爻与第五爻没有直接生扶世爻。');
 expect(named.conflicts).toBe(1);expect(named.checked).toBe(0);expect(named.incomplete_citations).toBe(1);
 expect(named.results[0].missing_direct_citations).toContain('fact:/lines/3/element');
 const correct=run('第3爻与第5爻生世爻。',[...ids,'fact:/lines/3/element','fact:/lines/3/is_shi']);
 expect(correct.conflicts).toBe(0);expect(correct.checked).toBe(1);
 expect(run('第3爻不生世爻。').conflicts).toBe(1);
 for(const text of ['两爻没有实际生扶世爻。','两爻没有有效生扶世爻。','若两爻不生世爻。','“两爻不生世爻”。','两爻不生世爻？','两爻可能不生世爻。'])expect(run(text).checked).toBe(0);
 expect(run('两爻不生世爻。',['fact:/lines/2/element']).unassessed).toBe(1);
 expect(run('第1爻与第2爻生世爻。',ids).results[0].missing_direct_citations).toContain('fact:/lines/0/element');
 expect(run('第3爻生世爻。',[]).results[0].status).toBe('incomplete_citations');
});
