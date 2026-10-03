// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {replayPacketLedLive} from '../../scripts/replay-packet-led-live.js';
import {planHash} from '../../experiments/judgment-review/plan.js';
const source=path.resolve('docs/acceptance/packet-led-20261003');
async function fixture(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'packet-led-replay-'));
  try{fs.cpSync(source,dir,{recursive:true});return await fn(dir);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function change(dir,name,fn){const file=path.join(dir,name),v=JSON.parse(fs.readFileSync(file));fn(v);fs.writeFileSync(file,JSON.stringify(v));}
test('replays one rejected call, two planned calls and both independent reviews without network',()=>fixture(async dir=>{
  const r=await replayPacketLedLive(dir);
  expect(r.planned_calls).toBe(2);expect(r.attempted_calls).toBe(1);expect(r.network_calls).toBe(0);
  expect(r.results[0].issues).toEqual(['Invalid factor selection']);
  expect(r.reviews.map(v=>v.verified_quotes)).toEqual([17,19]);expect(r.forecast_accuracy).toBe('unassessed');
}));
test.each([
  ['seal.json',v=>v.hash='0','Plan seal'],
  ['trend-album-check.json',v=>v.usage.prompt_tokens++,'Usage mismatch'],
  ['trend-album-check.json',v=>v.status='validated','Validation status'],
  ['summary.json',v=>v.attempted_calls=2,'Call accounting'],
  ['summary.json',v=>v.results[0].status='validated','Unexplained early stop'],
  ['summary.json',v=>v.reservation.reserved_cny=0,'Reservation mismatch'],
  ['summary.json',v=>v.semantic_acceptance='pass','Execution policy'],
  ['trend-album-check.json',v=>v.reservation_retained=false,'Case policy'],
  ['trend-album-check.json',v=>v.forecast_accuracy='pass','Case policy'],
  ['trend-album-check.json',v=>v.semantic_acceptance='pass','Case policy'],
  ['semantic-review-a.json',v=>v.actual_responses_reviewed=2,'Review accounting'],
  ['semantic-review-a.json',v=>v.reviews[0].criteria.facts.reason=' ','Missing review reason'],
  ['semantic-review-a.json',v=>v.reviews[0].criteria.facts.evidence_ids=['fact:/invented'],'Unknown review evidence'],
  ['semantic-review-a.json',v=>v.reviews[0].criteria.facts.quotes[0].end=99999,'Review quotation'],
])('rejects altered %s',(name,fn,error)=>fixture(async dir=>{
  change(dir,name,fn);await expect(replayPacketLedLive(dir)).rejects.toThrow(error);
}));
test('rejects changed original provider bytes',()=>fixture(async dir=>{
  fs.appendFileSync(path.join(dir,'trend-album-raw.sse'),' ');
  await expect(replayPacketLedLive(dir)).rejects.toThrow('Provider bytes');
}));
test('rejects an edited prompt even when locally resealed',()=>fixture(async dir=>{
  change(dir,'plan.json',v=>v.cases[0].body.messages[0].content+=' altered');
  const h=planHash(JSON.parse(fs.readFileSync(path.join(dir,'plan.json'))));
  change(dir,'seal.json',v=>v.hash=h);change(dir,'summary.json',v=>v.plan_hash=h);
  await expect(replayPacketLedLive(dir)).rejects.toThrow('Trusted fixed plan');
}));
test.each(['attempt.json','response.txt'])('rejects unattempted second-case %s',suffix=>fixture(async dir=>{
  fs.writeFileSync(path.join(dir,'trend-puzzle-'+suffix),'{}');
  await expect(replayPacketLedLive(dir)).rejects.toThrow(suffix==='attempt.json'?'Unrecorded attempt':'unattempted case');
}));
test('quotes cannot refer to inherited constructor fields',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>Object.assign(v.reviews[0].criteria.facts.quotes[0],{path:'/constructor/name',start:0,end:6,text:'Object'}));
  await expect(replayPacketLedLive(dir)).rejects.toThrow('own JSON field');
}));
test('a forged case identity remains invalid when both check and summary agree',()=>fixture(async dir=>{
  change(dir,'trend-album-check.json',v=>v.id='forged-case-id');
  change(dir,'summary.json',v=>v.results[0].id='forged-case-id');
  await expect(replayPacketLedLive(dir)).rejects.toThrow('Case identity');
}));
