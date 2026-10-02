// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test,expect,vi,afterEach} from 'vitest';
import {prepareJudgmentPlan,planHash} from '../../experiments/judgment-review/plan.js';
import {prepareLiveJudgmentCandidate} from '../../experiments/judgment-review/live-candidate.js';
import {prepareJudgmentCandidate} from '../../experiments/judgment-review/candidate.js';
import {prepareJudgmentDirectory,executeJudgmentDirectory,archiveProviderBody} from '../../scripts/judgment-live-pilot.js';
import {createReadingSession,prepareReadingTurn} from '../../src/ai/output/session.js';
import {readingRequestBody} from '../../src/ai/output/client.js';
import {syntheticOutput} from '../../experiments/structured-output/example.js';
const dirs=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();for(const d of dirs.splice(0))fs.rmSync(d,{recursive:true,force:true});});
async function setup(limit=1){
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-01T15:00:00Z'));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'judgment-pilot-'));dirs.push(root);
  const dir=path.join(root,'run'),ledger=path.join(root,'budget.json');
  fs.writeFileSync(ledger,JSON.stringify({limit_cny:limit,reservations:[]}));
  await prepareJudgmentDirectory(dir);return {dir,ledger};
}
test('two exposed cases regenerate identical full production requests and no predetermined direction',async()=>{
  const plan=await prepareJudgmentPlan();expect(planHash(await prepareJudgmentPlan())).toBe(planHash(plan));
  expect(plan.cases.map(c=>c.id)).toEqual(['game-rank','private-project']);expect(plan.reserve_cny).toBeLessThan(1);
  expect(plan.scope).toContain('no blind');
  for(const c of plan.cases){
    const p=await prepareReadingTurn(createReadingSession(c.canonical,{style:'brief',custom:''}),c.question);
    expect(c.body).toEqual(readingRequestBody(p));expect(c.body.max_tokens).toBe(8192);
    expect(c.body.messages[0].content).toContain('本轮判断指引 reading-production-4');
    expect(c.input_allowance).toBe(Buffer.byteLength(JSON.stringify(c.body.messages))+4096);
    expect(c).not.toHaveProperty('expected_direction');
  }
});
test('compact live profile is separately sealed and cannot execute offline or production plans',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-02T03:00:00Z'));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'judgment-compact-'));dirs.push(root);
  const dir=path.join(root,'run'),ledger=path.join(root,'budget.json');
  fs.writeFileSync(ledger,JSON.stringify({limit_cny:.4,reservations:[]}));
  await prepareJudgmentDirectory(dir,'compact');
  const live=await prepareLiveJudgmentCandidate(),offline=await prepareJudgmentCandidate();
  expect(live.offline_candidate_hash).toBe(planHash(offline));expect(live.cases).toEqual(offline.cases);
  expect(live.production).toBe(false);expect(live.live_execution_available).toBe(true);
  const load=vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{}),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(executeJudgmentDirectory(dir,ledger)).rejects.toThrow('rejected');
  fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(offline));fs.writeFileSync(path.join(dir,'seal.json'),JSON.stringify({hash:planHash(offline)}));
  await expect(executeJudgmentDirectory(dir,ledger,'compact')).rejects.toThrow('rejected');
  await expect(executeJudgmentDirectory(dir,ledger,'arbitrary')).rejects.toThrow('Unknown');
  expect(load).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
test('compact profile retains the budget guard, two-call cap, stop and replay protections',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-02T03:00:00Z'));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'judgment-compact-'));dirs.push(root);
  const dir=path.join(root,'run'),ledger=path.join(root,'budget.json');
  fs.writeFileSync(ledger,JSON.stringify({limit_cny:.3,reservations:[]}));await prepareJudgmentDirectory(dir,'compact');
  const load=vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{});vi.stubEnv('DEEPSEEK_API_KEY','synthetic-key');
  const fetch=vi.fn(async url=>url.endsWith('/balance')?new Response(JSON.stringify({is_available:true,balance_infos:[{currency:'CNY',total_balance:'5'}]})):new Response('failure',{status:500}));vi.stubGlobal('fetch',fetch);
  await expect(executeJudgmentDirectory(dir,ledger,'compact')).rejects.toThrow('Additional authorized');expect(load).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  fs.writeFileSync(ledger,JSON.stringify({limit_cny:.4,reservations:[]}));
  const r=await executeJudgmentDirectory(dir,ledger,'compact');expect(r.attempted_calls).toBe(1);
  expect(fetch.mock.calls.filter(([url])=>url.endsWith('/completions'))).toHaveLength(1);
  expect(JSON.parse(fs.readFileSync(ledger)).reservations[0].amount).toBe((await prepareLiveJudgmentCandidate()).reserve_cny);
  const calls=fetch.mock.calls.length;await expect(executeJudgmentDirectory(dir,ledger,'compact')).rejects.toThrow('rejected');expect(fetch.mock.calls.length).toBe(calls);
});
test('insufficient authorization rejects before credentials or network and leaves ledger unchanged',async()=>{
  const {dir,ledger}=await setup(.07766),before=fs.readFileSync(ledger,'utf8');
  const load=vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{}),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(executeJudgmentDirectory(dir,ledger)).rejects.toThrow('Additional authorized');
  expect(load).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(fs.readFileSync(ledger,'utf8')).toBe(before);
});
test.each(['tamper','replay','date'])('rejects %s before credentials or network',async mode=>{
  const {dir,ledger}=await setup();
  if(mode==='tamper'){const p=JSON.parse(fs.readFileSync(path.join(dir,'plan.json')));p.cases[0].body.max_tokens=1;fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(p));}
  if(mode==='replay')fs.writeFileSync(path.join(dir,'execution.json'),'{}');
  if(mode==='date')vi.setSystemTime(new Date('2026-10-02T15:00:00Z'));
  const load=vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{}),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(executeJudgmentDirectory(dir,ledger)).rejects.toThrow('rejected');
  expect(load).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
test('provider failure stops after one paid attempt without retries, retaining its entire reservation',async()=>{
  const {dir,ledger}=await setup();vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{});vi.stubEnv('DEEPSEEK_API_KEY','synthetic-key');
  const fetch=vi.fn(async url=>url.endsWith('/balance')?new Response(JSON.stringify({is_available:true,balance_infos:[{currency:'CNY',total_balance:'5'}]})):new Response('failure',{status:500}));
  vi.stubGlobal('fetch',fetch);const result=await executeJudgmentDirectory(dir,ledger);
  expect(result.attempted_calls).toBe(1);expect(result.results[0].cost_unknown).toBe(true);
  expect(fetch.mock.calls.filter(([url])=>url.endsWith('/completions'))).toHaveLength(1);
  expect(JSON.parse(fs.readFileSync(ledger)).reservations[0].amount).toBe((await prepareJudgmentPlan()).reserve_cny);
  expect(fs.existsSync(path.join(dir,'game-rank-failure.json'))).toBe(true);
  expect(fs.existsSync(path.join(dir,'private-project-attempt.json'))).toBe(false);
  expect(fs.readFileSync(path.join(dir,'game-rank-http-error.txt'),'utf8')).toBe('failure');
  expect(JSON.parse(fs.readFileSync(path.join(dir,'game-rank-archive.json'))).complete).toBe(true);
});
test('duplicate reservation rejects before key or balance even without an execution marker',async()=>{
  const {dir,ledger}=await setup();fs.writeFileSync(ledger,JSON.stringify({limit_cny:1,reservations:[{run:path.resolve(dir),amount:.1,planHash:'fixed'}]}));
  const load=vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{}),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(executeJudgmentDirectory(dir,ledger)).rejects.toThrow('already reserved');
  expect(load).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
test('bounded archive preserves a malformed frame and its tail independently of parsing',async()=>{
  const {dir}=await setup(),text='data: {broken}\n\ndata: tail\n\ndata: [DONE]\n\n';
  const file=path.join(dir,'malformed.sse'),a=await archiveProviderBody(new Response(text).body,file);
  expect(a.metadata.complete).toBe(true);expect(fs.readFileSync(file,'utf8')).toBe(text);
  const partial=await archiveProviderBody(new Response(text).body,path.join(dir,'partial.sse'),{limit:10});
  expect(partial.metadata.complete).toBe(false);expect(partial.metadata.error).toBe('archive_limit');expect(partial.data.length).toBe(10);
  const redacted=await archiveProviderBody(new Response('error synthetic-secret').body,path.join(dir,'redacted.txt'),{redact:'synthetic-secret'});
  expect(redacted.metadata.redacted).toBe(true);expect(redacted.data.toString()).toBe('error [REDACTED]');
});
test('records two mocked complete SSE replies and still requires human semantic reviews',async()=>{
  const {dir,ledger}=await setup(),plan=await prepareJudgmentPlan();
  vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{});vi.stubEnv('DEEPSEEK_API_KEY','synthetic-key');
  let index=0;
  vi.stubGlobal('fetch',vi.fn(async url=>{
    if(url.endsWith('/balance'))return new Response(JSON.stringify({is_available:true,balance_infos:[{currency:'CNY',total_balance:'5'}]}));
    const c=plan.cases[index++],p=await prepareReadingTurn(createReadingSession(c.canonical,{style:'brief',custom:''}),c.question);
    const chunk={choices:[{delta:{content:JSON.stringify(syntheticOutput(p.context))},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:500}};
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`);
  }));
  const result=await executeJudgmentDirectory(dir,ledger);expect(index).toBe(2);
  expect(result.results.every(r=>r.status==='validated'&&r.usage_ok&&r.semantic_review==='pending')).toBe(true);
  for(const c of plan.cases)expect(fs.readFileSync(path.join(dir,`${c.id}-raw.sse`),'utf8')).toContain('[DONE]');
  for(const r of result.results)expect(r.raw_sha256).toBe(createHash('sha256').update(fs.readFileSync(path.join(dir,`${r.id}-response.txt`))).digest('hex'));
  expect(result.exact_billed_cost_cny).toBeNull();
});
