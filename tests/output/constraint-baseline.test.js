// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {test,expect} from 'vitest';
import {prepareConstraintBaseline} from '../../experiments/reading-quality/constraint-baseline.js';
import {reviewTemplate,validateReview,summarizeReviews} from '../../experiments/reading-quality/semantic-review.js';
const fixture=JSON.parse(await readFile(new URL('../../experiments/reading-quality/grounded-exposed-reply.json',import.meta.url),'utf8'));
const baseline=await prepareConstraintBaseline(fixture);
test('seven bounded controls preserve historical failure and expose semantic gap',()=>{
 expect(baseline.gates.controls).toHaveLength(7);
 expect(baseline.gates.controls.every(c=>c.matched)).toBe(true);
 expect(baseline.gates.controls.find(c=>c.id==='unsupported-feature').observed.mechanical_ok).toBe(true);
 expect(baseline.packet.cases.at(-1).raw).toBe(fixture.raw);
 expect(baseline.packet.cases.at(-1).mechanical_result_as_executed).toEqual(fixture.mechanical_result_as_executed);
 expect(baseline.gates.network_calls).toBe(0);
});
test('changed raw or request cannot masquerade as frozen replay',async()=>{
 await expect(prepareConstraintBaseline({...fixture,raw:fixture.raw+' '})).rejects.toThrow('raw changed');
 await expect(prepareConstraintBaseline({...fixture,messages_hash:'sha256:changed'})).rejects.toThrow('reconstruction');
});
test('empty reviews are not content acceptance and enriched packet is bound',()=>{
 const template=reviewTemplate(baseline.packet);template.reviewer_id='test';
 expect(()=>validateReview(template,baseline.packet)).toThrow('reason');
 const changed=structuredClone(baseline.packet);changed.rubric.support='Always pass';
 expect(()=>reviewTemplate(changed)).toThrow('packet changed');
});
test('semantic dissent remains visible and unknown source IDs are rejected',()=>{
 const make=(reviewer,verdict)=>{
  const r=reviewTemplate(baseline.packet);r.reviewer_id=reviewer;
  for(const [i,c] of baseline.packet.cases.entries()){
   const entry=r.reviews[i];entry.attribution_claims='none';
   for(const dimension of ['facts','scope','support','attribution'])entry[dimension]={
    verdict:dimension==='attribution'?'not_applicable':verdict,reason:'Synthetic validator control, not a content judgment.',
    quotes:[{start:0,end:1,text:c.raw.slice(0,1),evidence_ids:[],literature_ids:[]}]};
  }
  return r;
 };
 const a=make('a','pass'),b=make('b','uncertain');
 const report=summarizeReviews(baseline.packet,[a,b]);
 expect(report.disagreements).toHaveLength(21);expect(report.production_ready).toBe(false);
 a.reviews[0].support.quotes[0].evidence_ids=['imaginary'];
 expect(()=>validateReview(a,baseline.packet)).toThrow('Unknown');
});
