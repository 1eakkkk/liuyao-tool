// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {replayEvidenceLedLive} from '../../scripts/replay-evidence-led-live.js';
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
