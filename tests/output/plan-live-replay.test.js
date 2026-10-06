// @vitest-environment node
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn} from '../../src/ai/output/session.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {readingAvailability} from '../../src/ai/output/availability.js';
const dir='docs/acceptance/plan-admission-live-20261007';
const plan=JSON.parse(fs.readFileSync(`${dir}/plan.json`));
const live=plan.cases[0];
const prepare=(question,canonical)=>prepareSelectedReadingTurn(createReadingSession(canonical,{style:'brief',custom:''}),question,{judgmentPolicyVersion:6,groundingPolicyVersion:2,basisPolicyVersion:4});

test('the archived live reply is preserved byte for byte and keeps its recorded verdict',()=>{
 const raw=fs.readFileSync(`${dir}/plan-covered-response.txt`);
 const check=JSON.parse(fs.readFileSync(`${dir}/plan-covered-check.json`));
 expect(createHash('sha256').update(raw).digest('hex')).toBe(check.rawSha256);
 expect(check.noAutomaticRetries).toBe(true);
 expect(check.status).toBe('fallback');
 expect(check.issues).toEqual([{code:'program_attribute_in_explanation',path:'$.factors[0].interpretation'}]);
 expect(check.completion).toMatchObject({transport:'strict_tool',error:null,finishReason:'tool_calls',bodyComplete:true,envelopeValid:true});
 // The reply is archived unmodified: the offending phrase really is present in the raw text.
 expect(raw.toString('utf8')).toContain('变爻对其本位动爻呈现回克方向');
});

test('replaying the archived reply still produces the same rejection for the same reason',async()=>{
 const raw=fs.readFileSync(`${dir}/plan-covered-response.txt`,'utf8');
 const p=await prepare(live.question,live.canonical);
 const result=parseOutputAnswer(raw,p.context,{completed:true});
 expect(result.status).toBe('fallback');
 expect(result.issues).toEqual([{code:'program_attribute_in_explanation',path:'$.factors[0].interpretation'}]);
 expect(result.answer).toBeNull();
 // The rejection is not a blanket refusal: the rest of the reply is well formed and
 // only the factor explanation overreaches, so the raw text stays fully available.
 expect(JSON.parse(raw).factors).toHaveLength(1);
 expect(JSON.parse(raw).judgment.basis_ids).toEqual(['t4']);
});

test('the same chart and question still admit exactly the reviewed plan mechanism',async()=>{
 const p=await prepare(live.question,live.canonical);
 const availability=readingAvailability(p.context);
 expect(availability.blocked).toBe(false);expect(availability.kind).toBe('conditions_unconfirmed');
 expect(live.admitted.map(m=>m.id)).toEqual(['plan-shi-return-control']);
 expect(live.schemaSummary).toEqual({factorsMax:1,basisEnum:['t4'],assessmentEnum:['conditional','neutral'],direction:{enum:['favorable','unfavorable','mixed','unclear']},perspectives:['none','self']});
 const schema=JSON.parse(p.messages[1].content).response_schema;
 expect(schema.properties.factors.items.properties.assessment.enum).toEqual(['conditional','neutral']);
 // The factor explanation now states that the program already prints the direction.
 expect(schema.properties.factors.items.properties.interpretation.description).toContain('程序已在上方展示本依据的原文方向');
});

test('the two blocked expectations stay blocked, so the batch spent exactly one call',async()=>{
 expect(plan.maxCalls).toBe(1);
 for(const blocked of plan.blockedCases){
  const p=await prepare(blocked.question,blocked.canonical),availability=readingAvailability(p.context);
  expect(availability.blocked).toBe(true);
  expect(availability.kind).toBe(blocked.expectKind);
  expect(availability.title).toBe(blocked.availability.title);
  expect(availability.message).toBe(blocked.availability.message);
 }
});
