// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {replayEvidenceLedLive} from '../../scripts/replay-evidence-led-live.js';
import {planHash} from '../../experiments/judgment-review/plan.js';
const source=path.resolve('docs/acceptance/evidence-led-live-20261002');
async function fixture(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-led-replay-'));
  try{fs.cpSync(source,dir,{recursive:true});return await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function change(dir,name,fn){const file=path.join(dir,name),v=JSON.parse(fs.readFileSync(file));fn(v);fs.writeFileSync(file,JSON.stringify(v));}
test('replays all provider archives, retaining the rejected sixth answer',()=>fixture(async dir=>{
  const r=await replayEvidenceLedLive(dir);expect(r.network_calls).toBe(0);expect(r.verified_cases).toBe(6);
  expect(r.results.at(-1).status).toBe('rejected');expect(r.semantic_acceptance).toBe('requires_independent_review');
}));
test.each([
  ['seal.json',v=>v.hash='0','Plan seal'],
  ['facts-motion-check.json',v=>v.usage.prompt_tokens++,'Usage mismatch'],
  ['trend-trip-check.json',v=>v.status='validated','Validation status'],
  ['summary.json',v=>v.attempted_calls=5,'Call accounting'],
])('rejects edited %s',(file,fn,error)=>fixture(async dir=>{
  change(dir,file,fn);await expect(replayEvidenceLedLive(dir)).rejects.toThrow(error);
}));
test('rejects altered SSE bytes',()=>fixture(async dir=>{
  fs.appendFileSync(path.join(dir,'facts-motion-raw.sse'),' ');await expect(replayEvidenceLedLive(dir)).rejects.toThrow('Provider bytes');
}));
test('rejects altered extracted response',()=>fixture(async dir=>{
  fs.appendFileSync(path.join(dir,'facts-motion-response.txt'),' ');await expect(replayEvidenceLedLive(dir)).rejects.toThrow('Response text');
}));
test('rejects quotations moved away from the cited field',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>v.reviews[0].criteria.facts.quotes[0].start++);
  await expect(replayEvidenceLedLive(dir)).rejects.toThrow('Review quotation');
}));
test('rejects resealing a changed fixed request',()=>fixture(async dir=>{
  change(dir,'plan.json',v=>v.cases[0].body.messages[0].content+=' altered');
  const h=planHash(JSON.parse(fs.readFileSync(path.join(dir,'plan.json'))));
  change(dir,'seal.json',v=>v.hash=h);change(dir,'summary.json',v=>v.plan_hash=h);
  await expect(replayEvidenceLedLive(dir)).rejects.toThrow('Trusted fixed plan');
}));
test('rejects overflowing quote range',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>v.reviews[0].criteria.facts.quotes[0].end=9999);
  await expect(replayEvidenceLedLive(dir)).rejects.toThrow('Review quotation');
}));
test('rejects unknown reviewer evidence',()=>fixture(async dir=>{
  change(dir,'semantic-review-a.json',v=>v.reviews[0].criteria.facts.evidence_ids=['fact:/not-real']);
  await expect(replayEvidenceLedLive(dir)).rejects.toThrow('Unknown review evidence');
}));
test('rejects false usage-validity metadata',()=>fixture(async dir=>{
  change(dir,'facts-motion-check.json',v=>v.usage_ok=false);
  await expect(replayEvidenceLedLive(dir)).rejects.toThrow('Usage validity');
}));
