// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {replayPacketLocalLive} from '../../scripts/replay-packet-local-live.js';
import {planHash} from '../../experiments/judgment-review/plan.js';
const source=path.resolve('docs/acceptance/packet-local-live-20261003');
async function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'packet-local-replay-'));try{fs.cpSync(source,dir,{recursive:true});return await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function change(dir,name,fn){const file=path.join(dir,name),v=JSON.parse(fs.readFileSync(file));fn(v);fs.writeFileSync(file,JSON.stringify(v));}
test('replays exactly one paid response and two independent reviews, retaining the rejected result',()=>fixture(async dir=>{
  const r=await replayPacketLocalLive(dir);expect(r.planned_calls).toBe(1);expect(r.attempted_calls).toBe(1);expect(r.network_calls).toBe(0);
  expect(r.results[0].issues).toEqual(['Mixed requires explicit opposed major effects']);expect(r.reviews.map(v=>v.verified_quotes)).toEqual([24,23]);
}));
test.each([
  ['seal.json',v=>v.hash='0','Plan seal'],
  ['trend-spare-key-check.json',v=>v.usage.prompt_tokens++,'Usage mismatch'],
  ['trend-spare-key-check.json',v=>v.status='validated','Validation status'],
  ['trend-spare-key-check.json',v=>v.reservation_retained=false,'Case policy'],
  ['trend-spare-key-check.json',v=>v.forecast_accuracy='pass','Case policy'],
  ['summary.json',v=>v.attempted_calls=2,'Call accounting'],
  ['summary.json',v=>v.semantic_acceptance='pass','Execution policy'],
  ['summary.json',v=>v.reservation.reserved_cny=0,'Reservation mismatch'],
  ['semantic-review-a.json',v=>v.actual_responses_reviewed=2,'Review accounting'],
  ['semantic-review-a.json',v=>v.reviews[0].criteria.facts.reason=' ','Missing review reason'],
  ['semantic-review-a.json',v=>v.reviews[0].criteria.facts.evidence_ids=['fact:/invented'],'Unknown review evidence'],
  ['semantic-review-a.json',v=>v.reviews[0].criteria.facts.quotes[0].end=99999,'Review quotation'],
  ['preflight-failure.json',v=>v.chat_requests=1,'Preflight audit'],
  ['preflight-failure.json',v=>v.reserved_cny=1,'Preflight audit'],
])('rejects altered %s',(name,fn,error)=>fixture(async dir=>{change(dir,name,fn);await expect(replayPacketLocalLive(dir)).rejects.toThrow(error);}));
test('rejects changed original provider stream',()=>fixture(async dir=>{fs.appendFileSync(path.join(dir,'trend-spare-key-raw.sse'),' ');await expect(replayPacketLocalLive(dir)).rejects.toThrow('Provider bytes');}));
test('the known preflight event cannot be silently omitted from this historical batch',()=>fixture(async dir=>{fs.unlinkSync(path.join(dir,'preflight-failure.json'));await expect(replayPacketLocalLive(dir)).rejects.toThrow('Known preflight audit missing');}));
test('rejects modified prompt even when its local seal agrees',()=>fixture(async dir=>{
  change(dir,'plan.json',v=>v.cases[0].body.messages[0].content+=' altered');const h=planHash(JSON.parse(fs.readFileSync(path.join(dir,'plan.json'))));change(dir,'seal.json',v=>v.hash=h);change(dir,'summary.json',v=>v.plan_hash=h);
  await expect(replayPacketLocalLive(dir)).rejects.toThrow('Trusted fixed plan');
}));
test.each(['attempt.json','response.txt'])('rejects an extra unplanned case %s',suffix=>fixture(async dir=>{fs.writeFileSync(path.join(dir,'unplanned-'+suffix),'{}');await expect(replayPacketLocalLive(dir)).rejects.toThrow('Unrecorded case');}));
test('rejects conflicting chat failure file beside a completed response',()=>fixture(async dir=>{fs.writeFileSync(path.join(dir,'trend-spare-key-failure.json'),'{}');await expect(replayPacketLocalLive(dir)).rejects.toThrow('conflicting failure');}));
test('quotes cannot traverse inherited fields',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>Object.assign(v.reviews[0].criteria.facts.quotes[0],{path:'/constructor/name',start:0,end:6,text:'Object'}));await expect(replayPacketLocalLive(dir)).rejects.toThrow('own JSON field');
}));
test('agreement between forged summary and case identity cannot override frozen identity',()=>fixture(async dir=>{change(dir,'trend-spare-key-check.json',v=>v.id='forged');change(dir,'summary.json',v=>v.results[0].id='forged');await expect(replayPacketLocalLive(dir)).rejects.toThrow('Case identity');}));
