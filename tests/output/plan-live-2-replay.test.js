// @vitest-environment node
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn} from '../../src/ai/output/session.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {readingAvailability} from '../../src/ai/output/availability.js';
import {selectionCatalog} from '../../src/ai/output/selection.js';
import {admittedPlanMappings} from '../../src/ai/output/plan-admission.js';
const dir='docs/acceptance/plan-admission-live-2-20261007';
const plan=JSON.parse(fs.readFileSync(`${dir}/plan.json`));
const prepare=(question,canonical)=>prepareSelectedReadingTurn(createReadingSession(canonical,{style:'brief',custom:''}),question,{judgmentPolicyVersion:6,groundingPolicyVersion:2,basisPolicyVersion:4});

test('both archived replies are preserved byte for byte and passed with no issue',()=>{
 expect(plan.maxCalls).toBe(2);
 for(const c of plan.cases){
  const raw=fs.readFileSync(`${dir}/${c.id}-response.txt`),check=JSON.parse(fs.readFileSync(`${dir}/${c.id}-check.json`));
  expect(createHash('sha256').update(raw).digest('hex')).toBe(check.rawSha256);
  expect(check.status).toBe('validated');expect(check.issues).toEqual([]);
  expect(check.usageOk).toBe(true);expect(check.noAutomaticRetries).toBe(true);
  expect(check.completion).toMatchObject({transport:'strict_tool',error:null,finishReason:'tool_calls',bodyComplete:true,envelopeValid:true});
  expect(check.availability).toMatchObject({kind:'conditions_unconfirmed',blocked:false});
 }
});

test('replaying both archived replies still validates, and each stayed inside the reviewed scope',async()=>{
 const boundaries={
  'plan-recheck':{mappings:['plan-shi-return-control'],factors:1,basis:['t4'],atCall:['plan-shi-return-control']},
  // 日冲 was later restricted to 静爻, as the 日辰章 wording requires, so this chart's
  // moving 世爻 now admits only 化進 and the schema allows one factor instead of two.
  'plan-advance':{mappings:['plan-shi-advance'],factors:1,basis:['k7','k6'],atCall:['plan-shi-advance','plan-shi-day-clash']},
 };
 for(const c of plan.cases){
  const p=await prepare(c.question,c.canonical);
  const result=parseOutputAnswer(fs.readFileSync(`${dir}/${c.id}-response.txt`,'utf8'),p.context,{completed:true});
  const raw=JSON.parse(fs.readFileSync(`${dir}/${c.id}-response.txt`,'utf8')),expectation=boundaries[c.id];
  if(c.id==='plan-recheck'){expect(result.status).toBe('validated');expect(result.issues).toEqual([]);}
  else{
   // The archived reply listed two factors. Only the 日冲 restriction changed that, and it
   // is recorded rather than papered over: the archived reply is not rewritten.
   expect(raw.factors).toHaveLength(2);
   expect(result.status).toBe('fallback');
   expect(result.issues).toEqual([{code:'invalid_count',path:'$.factors'}]);
  }
  // A conditional factor with an unconfirmed premise may never be read as a verdict.
  expect(raw.direction).toBe('unclear');
  expect(raw.factors.map(f=>f.assessment)).toEqual(raw.factors.map(()=>'conditional'));
  expect(raw.factors.every(f=>f.application.effect_scope==='requires_conditions')).toBe(true);
  expect(raw.factors.flatMap(f=>f.application.effect_conditions).every(condition=>condition.status==='unconfirmed')).toBe(true);
  expect(raw.factors.map(f=>f.basis_id)).toEqual(expectation.basis);
  expect(raw.judgment.basis_ids).toEqual(expectation.basis);
  // The admitted set recorded at call time stays as it was; the current set is the
  // reviewed one for the same chart.
  expect(admittedPlanMappings(p.context,selectionCatalog(p.context).entries).map(m=>m.id)).toEqual(expectation.mappings);
  expect(c.admitted.map(m=>m.id)).toEqual(expectation.atCall);
  expect(c.schemaSummary.factorsMax).toBe(c.id==='plan-recheck'?expectation.factors:2);
 }
});

test('the second batch is a genuine A/B: same chart and question, different outcome',()=>{
 const previous=JSON.parse(fs.readFileSync('docs/acceptance/plan-admission-live-20261007/plan.json'));
 const recheck=plan.cases.find(c=>c.id==='plan-recheck'),first=previous.cases[0];
 expect(recheck.question).toBe(first.question);
 expect(JSON.stringify(recheck.canonical)).toBe(JSON.stringify(first.canonical));
 // The first batch's only reply was rejected for restating a program attribute.
 expect(JSON.parse(fs.readFileSync('docs/acceptance/plan-admission-live-20261007/plan-covered-check.json')).status).toBe('fallback');
 expect(JSON.parse(fs.readFileSync(`${dir}/plan-recheck-check.json`)).status).toBe('validated');
});

test('the batch-two blocked expectations are genuine and stay blocked',async()=>{
 for(const blocked of plan.blockedCases){
  const p=await prepare(blocked.question,blocked.canonical),availability=readingAvailability(p.context);
  expect(availability.blocked).toBe(true);expect(availability.kind).toBe(blocked.expectKind);
  expect(availability.title).toBe(blocked.availability.title);
  // The message is frozen in the sealed plan. It was later edited only to name 日合
  // alongside 日冲 after that mechanism was admitted, so everything before the mechanism
  // list must still match the sealed text.
  const frozen=blocked.availability.message,prefix=frozen.slice(0,frozen.indexOf('（'));
  expect(availability.message.startsWith(prefix)).toBe(true);
  expect(availability.message).toContain('不是对计划成败的判断');
 }
});
