// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {replayTaskLedLive} from '../../scripts/replay-task-led-live.js';
import {planHash} from '../../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createTaskLedContext,validateTaskLedAnswer} from '../../experiments/judgment-review/task-led.js';
const source=path.resolve('docs/acceptance/task-led-20261002');
async function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'task-led-replay-'));try{fs.cpSync(source,dir,{recursive:true});return await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function change(dir,name,fn){const file=path.join(dir,name),v=JSON.parse(fs.readFileSync(file));fn(v);fs.writeFileSync(file,JSON.stringify(v));}
test('replays exactly three calls and retains rejected trend and unattempted fourth case',()=>fixture(async dir=>{
  const r=await replayTaskLedLive(dir);expect(r.planned_calls).toBe(4);expect(r.attempted_calls).toBe(3);expect(r.network_calls).toBe(0);expect(r.results.at(-1).status).toBe('rejected');
}));
test.each([
  ['seal.json',v=>v.hash='0','Plan seal'],
  ['advice-notes-check.json',v=>v.usage.prompt_tokens++,'Usage mismatch'],
  ['advice-boxes-check.json',v=>v.usage_ok=false,'Usage validity'],
  ['trend-writing-check.json',v=>v.status='validated','Validation status'],
  ['summary.json',v=>v.attempted_calls=4,'Call accounting'],
  ['summary.json',v=>v.results.at(-1).status='validated','Unexplained early stop'],
])('rejects edited %s',(name,fn,error)=>fixture(async dir=>{
  change(dir,name,fn);await expect(replayTaskLedLive(dir)).rejects.toThrow(error);
}));
test('rejects changed raw stream',()=>fixture(async dir=>{
  fs.appendFileSync(path.join(dir,'advice-notes-raw.sse'),' ');await expect(replayTaskLedLive(dir)).rejects.toThrow('Provider bytes');
}));
test('rejects resealed modified prompt',()=>fixture(async dir=>{
  change(dir,'plan.json',v=>v.cases[0].body.messages[0].content+=' altered');const h=planHash(JSON.parse(fs.readFileSync(path.join(dir,'plan.json'))));change(dir,'seal.json',v=>v.hash=h);change(dir,'summary.json',v=>v.plan_hash=h);
  await expect(replayTaskLedLive(dir)).rejects.toThrow('Trusted fixed plan');
}));
test('rejects unrecorded attempted fourth question',()=>fixture(async dir=>{
  fs.writeFileSync(path.join(dir,'trend-gathering-attempt.json'),'{}');await expect(replayTaskLedLive(dir)).rejects.toThrow('Unrecorded attempt');
}));
test('rejects response artifacts for an unattempted question',()=>fixture(async dir=>{
  fs.writeFileSync(path.join(dir,'trend-gathering-response.txt'),'{}');await expect(replayTaskLedLive(dir)).rejects.toThrow('unattempted case');
}));
test('rejects changed reservation policy',()=>fixture(async dir=>{
  change(dir,'summary.json',v=>v.reservation.reserved_cny=0);await expect(replayTaskLedLive(dir)).rejects.toThrow('Reservation mismatch');
}));
test('rejects review quotes with offsets outside their decoded field',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>v.reviews.find(v=>v.case_id==='trend-writing').criteria.facts.quotes[0].end=99999);
  await expect(replayTaskLedLive(dir)).rejects.toThrow('Review quotation');
}));
test('rejects program evidence invented for chart-free advice',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>v.reviews[0].criteria.facts.evidence_ids=['fact:/lines/0/moving']);
  await expect(replayTaskLedLive(dir)).rejects.toThrow('Unknown review evidence');
}));
test('rejects empty review reasons',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>v.reviews[0].criteria.facts.reason=' ');
  await expect(replayTaskLedLive(dir)).rejects.toThrow('Missing review reason');
}));
test('rejects review count that claims the unattempted fourth response',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>v.actual_responses_reviewed=4);
  await expect(replayTaskLedLive(dir)).rejects.toThrow('Review accounting');
}));
test('reducing the failed reply citation count does not cure its unlinked focus',async()=>{
  const plan=JSON.parse(fs.readFileSync(path.join(source,'plan.json'))),c=plan.cases.find(c=>c.id==='trend-writing');
  const context=await createTaskLedContext(await buildOutputContext(c.canonical,{includeMissingRecords:true}),c.task);
  const answer=JSON.parse(fs.readFileSync(path.join(source,'trend-writing-response.txt')));
  expect(answer.factors[1].evidence_ids).toHaveLength(9);
  expect(()=>validateTaskLedAnswer(answer,context)).toThrow('invalid_count');
  // Counterfactual offline negative only; the archived provider response is never altered.
  answer.factors[1].evidence_ids.pop();
  expect(()=>validateTaskLedAnswer(answer,context)).toThrow('Focus absent from selected factor');
});
test('review paths cannot quote inherited constructors or array methods',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>{
    const q=v.reviews.find(v=>v.case_id==='trend-writing').criteria.facts.quotes[0];
    q.path='/constructor/name';q.start=0;q.end=6;q.text='Object';
  });
  await expect(replayTaskLedLive(dir)).rejects.toThrow('own JSON field');
}));
