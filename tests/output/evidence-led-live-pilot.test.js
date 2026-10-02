// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {test,expect,vi,afterEach} from 'vitest';
import {prepareEvidenceLedLivePlan,planHash,CAMPAIGN_ID,CAMPAIGN_SCHEMA} from '../../experiments/judgment-review/evidence-led-live-plan.js';
import {prepareEvidenceLedLiveDirectory,executeEvidenceLedLiveDirectory,parseEvidenceLedSse,strictJson} from '../../scripts/evidence-led-live-pilot.js';
import {evidenceLedSynthetic} from '../../scripts/prepare-evidence-led.js';
import {createEvidenceLedContext} from '../../experiments/judgment-review/evidence-led.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
const roots=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const event=v=>'data: '+JSON.stringify(v)+'\n\n';
const usage={prompt_tokens:100,completion_tokens:30,total_tokens:130,prompt_cache_hit_tokens:10,prompt_cache_miss_tokens:90};
function stream(raw,{model='deepseek-flash',finish='stop',done=true,u=usage,tail=''}={}){
  return event({model,choices:[{index:0,delta:{content:raw},finish_reason:null}]})+
    event({model,choices:[{index:0,delta:{},finish_reason:finish}],usage:u})+(done?'data: [DONE]\n\n':'')+tail;
}
async function setup(){
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-02T04:00:00Z'));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-led-live-'));roots.push(root);
  const dir=path.join(root,'run'),ledger=path.join(root,'new-campaign.json');
  fs.writeFileSync(ledger,JSON.stringify({schema_version:CAMPAIGN_SCHEMA,campaign_id:CAMPAIGN_ID,authorized:true,limit_cny:2,reservations:[]}));
  await prepareEvidenceLedLiveDirectory(dir);const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json'))),answers=[];
  for(const c of plan.cases)answers.push(JSON.stringify(evidenceLedSynthetic(await createEvidenceLedContext(await buildOutputContext(c.canonical,{includeMissingRecords:true}),c.task))));
  return {root,dir,ledger,plan,answers};
}
function mockNetwork(answers,options={}){
  const load=vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{});vi.stubEnv('DEEPSEEK_API_KEY','synthetic-key');let chats=0,balances=0;
  const fetch=vi.fn(async(url,init)=>{
    if(url.endsWith('/balance')){balances++;return new Response(JSON.stringify({is_available:true,balance_infos:[{currency:'CNY',total_balance:String(options.balance?.(balances)??10)}]}));}
    const i=chats++;if(options.httpError)return new Response('synthetic-key failure',{status:500});
    return new Response(options.payload?.(i,answers[i])??stream(answers[i]));
  });vi.stubGlobal('fetch',fetch);return {fetch,load,get chats(){return chats;},get balances(){return balances;}};
}
test('six fixed fresh questions preserve explicit 2/2/2 tasks, full evidence and unassessed criteria',async()=>{
  const p=await prepareEvidenceLedLivePlan();expect(planHash(await prepareEvidenceLedLivePlan())).toBe(planHash(p));
  expect(p.cases.map(c=>c.task)).toEqual(['facts','facts','advice','advice','trend','trend']);expect(p.reserve_cny).toBeGreaterThan(0);expect(p.reserve_cny).toBeLessThan(2);
  expect(p.production).toBe(false);expect(p.blind).toBe(false);expect(p.review_criteria.map(c=>c.id)).toEqual(['facts','scope','support','priority','direction','task_boundary']);
  for(const c of p.cases){expect(c.body.max_tokens).toBe(4096);expect(c.body.model).toBe('deepseek-flash');expect(c.body.thinking.type).toBe('disabled');
    expect(c.body).not.toHaveProperty('tools');expect(c.body).not.toHaveProperty('functions');
    const user=JSON.parse(c.body.messages[1].content);expect(user.task).toBe(c.task);expect(user.evidence.length).toBeGreaterThan(30);expect(user.context_id).toBe(c.context_id);expect(c).not.toHaveProperty('expected_direction');
    expect(c.body.messages[0].content).toContain('evidence-led-offline-2');expect(user.response_schema.properties.factors.minItems).toBe(0);expect(user.evidence.every(e=>['program_fact','rule_result'].includes(e.kind))).toBe(true);}
});
test('prepare never loads credentials, fetches or touches ledger and cannot overwrite artifacts',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-led-prepare-'));roots.push(root);const dir=path.join(root,'run');
  const load=vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{throw Error('No key');}),fetch=vi.fn(()=>{throw Error('No network');});vi.stubGlobal('fetch',fetch);
  const result=await prepareEvidenceLedLiveDirectory(dir),before=fs.readFileSync(path.join(dir,'plan.json'));expect(result.network_calls).toBe(0);expect(result.budget_reserved).toBe(false);
  await expect(prepareEvidenceLedLiveDirectory(dir)).rejects.toThrow();expect(fs.readFileSync(path.join(dir,'plan.json')).equals(before)).toBe(true);expect(load).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(fs.readdirSync(root)).toEqual(['run']);
});
test.each(['tamper','fake_seal','date','execution','old_ledger','unauthorized','cap','reserved'])('rejects %s before credentials or network',async mode=>{
  const {dir,ledger,plan}=await setup();
  if(mode==='tamper'){plan.cases[0].task='trend';fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(plan));}
  if(mode==='fake_seal')fs.writeFileSync(path.join(dir,'seal.json'),JSON.stringify({hash:'fake'}));
  if(mode==='date')vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
  if(mode==='execution')fs.writeFileSync(path.join(dir,'execution.json'),'{}');
  if(mode==='old_ledger')fs.writeFileSync(ledger,JSON.stringify({limit_cny:20,reservations:[]}));
  if(['unauthorized','cap','reserved'].includes(mode)){const b=JSON.parse(fs.readFileSync(ledger));if(mode==='unauthorized')b.authorized=false;if(mode==='cap')b.limit_cny=3;if(mode==='reserved')b.reservations=[{run:'previous'}];fs.writeFileSync(ledger,JSON.stringify(b));}
  const before=fs.readFileSync(ledger),load=vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{}),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(executeEvidenceLedLiveDirectory(dir,ledger)).rejects.toThrow();expect(load).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(fs.readFileSync(ledger).equals(before)).toBe(true);
});
test('wallet floor rejects without a chat or reservation',async()=>{
  const {dir,ledger,answers}=await setup(),before=fs.readFileSync(ledger),net=mockNetwork(answers,{balance:()=>1});
  await expect(executeEvidenceLedLiveDirectory(dir,ledger)).rejects.toThrow('Wallet');expect(net.chats).toBe(0);expect(fs.readFileSync(ledger).equals(before)).toBe(true);
});
test('exactly six mocked calls with wallet checks retain full reserve, no replay or semantic claim',async()=>{
  const {dir,ledger,plan,answers}=await setup(),net=mockNetwork(answers),r=await executeEvidenceLedLiveDirectory(dir,ledger);
  expect(net.chats).toBe(6);expect(net.balances).toBe(6);expect(r.attempted_calls).toBe(6);expect(r.results.every(c=>c.status==='validated'&&c.semantic_acceptance==='unassessed')).toBe(true);
  expect(JSON.parse(fs.readFileSync(ledger)).reservations[0].amount).toBe(plan.reserve_cny);const calls=net.fetch.mock.calls.length;
  await expect(executeEvidenceLedLiveDirectory(dir,ledger)).rejects.toThrow();expect(net.fetch.mock.calls.length).toBe(calls);
});
test('v2 advice and unclear trend can omit decorative factors while facts still requires evidence',async()=>{
  const {dir,ledger,plan,answers}=await setup();const clean=answers.map((raw,i)=>{const a=JSON.parse(raw);if(plan.cases[i].task!=='facts')a.factors=[];if(plan.cases[i].task==='advice')a.general_advice=['先确认用户实际条件，这只是一般建议。'];return JSON.stringify(a);});
  const net=mockNetwork(clean),r=await executeEvidenceLedLiveDirectory(dir,ledger);expect(net.chats).toBe(6);expect(r.results.every(c=>c.status==='validated')).toBe(true);expect(r.results[2].response.factors).toEqual([]);expect(r.results[4].response.factors).toEqual([]);
});
test('v2 fact task cannot discard all evidence factors',async()=>{
  const {dir,ledger,answers}=await setup(),net=mockNetwork(answers,{payload:(i,raw)=>{const a=JSON.parse(raw);a.factors=[];return stream(JSON.stringify(a));}});
  const result=await executeEvidenceLedLiveDirectory(dir,ledger);expect(net.chats).toBe(1);expect(result.results[0].issues.join()).toContain('Fact task');
});
test.each(['http','length','no_done','unknown_model','unknown_usage','duplicate_usage','after_done','duplicate_json','wrong_context'])('failure %s archives and stops with no retry or release',async mode=>{
  const {dir,ledger,plan,answers}=await setup();const payload=(i,raw)=>{
    if(mode==='length')return stream(raw,{finish:'length'});if(mode==='no_done')return stream(raw,{done:false});if(mode==='unknown_model')return stream(raw,{model:'deepseek-other'});
    if(mode==='unknown_usage')return stream(raw,{u:null});if(mode==='duplicate_usage')return stream(raw,{done:false,tail:event({model:'deepseek-flash',choices:[],usage})+'data: [DONE]\n\n'});
    if(mode==='after_done')return stream(raw,{tail:event({model:'deepseek-flash',choices:[],usage})});
    if(mode==='duplicate_json')return stream(raw.replace('{','{"context_id":"other",'));
    if(mode==='wrong_context'){const a=JSON.parse(raw);a.context_id='wrong';return stream(JSON.stringify(a));}return stream(raw);
  };const net=mockNetwork(answers,{httpError:mode==='http',payload}),r=await executeEvidenceLedLiveDirectory(dir,ledger);
  expect(net.chats).toBe(1);expect(r.attempted_calls).toBe(1);expect(r.results[0].status).not.toBe('validated');expect(JSON.parse(fs.readFileSync(ledger)).reservations[0].amount).toBe(plan.reserve_cny);
  expect(fs.existsSync(path.join(dir,plan.cases[0].id+'-archive.json'))).toBe(true);
  if(mode==='after_done')expect(fs.readFileSync(path.join(dir,plan.cases[0].id+'-raw.sse'),'utf8')).toBe(payload(0,answers[0]));
});
test('third case failure stops at three calls; wallet floor dropping stops before next chat',async()=>{
  const first=await setup(),net=mockNetwork(first.answers,{payload:(i,raw)=>stream(raw,{done:i!==2})}),r=await executeEvidenceLedLiveDirectory(first.dir,first.ledger);expect(net.chats).toBe(3);expect(r.attempted_calls).toBe(3);
  vi.restoreAllMocks();const second=await setup(),net2=mockNetwork(second.answers,{balance:n=>n===1?10:1}),r2=await executeEvidenceLedLiveDirectory(second.dir,second.ledger);expect(net2.chats).toBe(1);expect(r2.attempted_calls).toBe(1);expect(r2.results.at(-1).request_started).toBe(false);
});
test('strict response/event parser rejects escaped duplicate keys, changed model, inconsistent or excessive usage',()=>{
  expect(()=>strictJson('{"x":1,"\\u0078":2}')).toThrow('duplicate');
  const raw='{"x":1}',base=stream(raw);expect(parseEvidenceLedSse(Buffer.from(base),{inputAllowance:200}).error).toBeNull();
  const changed=base.replace('"delta":{}','"delta":{}').replace(/("model":"deepseek-flash")/,'"model":"deepseek-other"');expect(parseEvidenceLedSse(Buffer.from(changed),{inputAllowance:200}).error).toContain('model');
  expect(parseEvidenceLedSse(Buffer.from(stream(raw,{u:{...usage,total_tokens:131}})),{inputAllowance:200}).error).toBe('unknown_usage');
  expect(parseEvidenceLedSse(Buffer.from(base),{inputAllowance:99}).error).toBe('usage_limit');
  expect(parseEvidenceLedSse(Buffer.from(base)).error).toBe('invalid_usage_bounds');
  expect(parseEvidenceLedSse(Buffer.from(stream(raw,{u:{...usage,prompt_tokens_details:{cached_tokens:101}}})),{inputAllowance:200}).error).toBe('invalid_cache_usage');
});
test('parser rejects model change, multiple choices, duplicate usage fields and abnormal DONE tail',()=>{
  const first=event({model:'deepseek-flash',choices:[{index:0,delta:{content:'{}'},finish_reason:null}]}),end=event({model:'deepseek-flash',choices:[{index:0,delta:{},finish_reason:'stop'}],usage});
  const changed=first+end.replace('deepseek-flash','deepseek-flash-alt')+'data: [DONE]\n\n';expect(parseEvidenceLedSse(Buffer.from(changed),{inputAllowance:200}).error).toContain('model');
  const two=event({model:'deepseek-flash',choices:[{index:0,delta:{}},{index:1,delta:{}}]});expect(parseEvidenceLedSse(Buffer.from(two),{inputAllowance:200}).error).toBe('invalid_choices');
  const duplicate=first+end.replace('"usage":','"usage":null,"usage":')+'data: [DONE]\n\n';expect(parseEvidenceLedSse(Buffer.from(duplicate),{inputAllowance:200}).error).toBe('duplicate_json_key');
  expect(parseEvidenceLedSse(Buffer.from(stream('{}',{tail:'event: unexpected\n\n'})),{inputAllowance:200}).error).toBe('sse_after_done');
});
test.each([{tool_calls:[{id:'x',type:'function',function:{name:'not_requested'}}]},{function_call:{name:'not_requested'}},{reasoning_content:0},{reasoning_content:false},{reasoning_content:{}},{reasoning_content:'thinking'}])('unrequested tool/thinking delta channel is rejected: %j',delta=>{
  const raw=event({model:'deepseek-flash',choices:[{index:0,delta:{content:'{}',...delta},finish_reason:null}]})+event({model:'deepseek-flash',choices:[{index:0,delta:{},finish_reason:'stop'}],usage})+'data: [DONE]\n\n';
  expect(parseEvidenceLedSse(Buffer.from(raw),{inputAllowance:200}).error).toMatch(/unexpected_(?:tool|function|thinking)_channel/);
});
test('empty provider reasoning fields are harmless; no requested tool or reasoning channel is enabled',()=>{
  for(const reasoning_content of ['',null]){
    const raw=event({model:'deepseek-flash',choices:[{index:0,delta:{content:'{}',reasoning_content,tool_calls:[],function_call:{}},finish_reason:null}]})+event({model:'deepseek-flash',choices:[{index:0,delta:{},finish_reason:'stop'}],usage})+'data: [DONE]\n\n';
    expect(parseEvidenceLedSse(Buffer.from(raw),{inputAllowance:200}).error).toBeNull();
  }
});
test('schema/reference errors stop before second call despite complete known usage',async()=>{
  const {dir,ledger,answers}=await setup(),net=mockNetwork(answers,{payload:(i,raw)=>{const a=JSON.parse(raw);a.factors[0].evidence_ids=['fact:/unknown'];return stream(JSON.stringify(a));}});
  const result=await executeEvidenceLedLiveDirectory(dir,ledger);expect(net.chats).toBe(1);expect(result.results[0].issues.join()).toContain('Unknown evidence');expect(result.results[0].usage_ok).toBe(true);expect(result.results[0].semantic_acceptance).toBe('unassessed');
});
test('UTC price day changing midbatch stops before another chat and retains reserve',async()=>{
  const {dir,ledger,answers}=await setup(),net=mockNetwork(answers,{payload:(i,raw)=>{if(i===0)vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));return stream(raw);}});
  const result=await executeEvidenceLedLiveDirectory(dir,ledger);expect(net.chats).toBe(1);expect(result.results.at(-1).request_started).toBe(false);expect(JSON.parse(fs.readFileSync(ledger)).reservations).toHaveLength(1);
});
test('fixed manual recipe hashes are identical across UTC and Asia/Singapore processes',()=>{
  const code="import {prepareEvidenceLedLivePlan,planHash} from './experiments/judgment-review/evidence-led-live-plan.js';process.stdout.write(planHash(await prepareEvidenceLedLivePlan()));";
  const hashes=['UTC','Asia/Singapore'].map(TZ=>execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:path.resolve('.'),env:{...process.env,TZ},encoding:'utf8'}));
  expect(hashes[0]).toBe(hashes[1]);
});
test('network errors cannot persist the local credential in failure artifacts',async()=>{
  const {dir,ledger,answers}=await setup();mockNetwork(answers);vi.stubGlobal('fetch',vi.fn(async url=>{
    if(url.endsWith('/balance'))return new Response(JSON.stringify({is_available:true,balance_infos:[{currency:'CNY',total_balance:'10'}]}));
    throw Error('connection failed synthetic-key');
  }));const result=await executeEvidenceLedLiveDirectory(dir,ledger);expect(result.results[0].error).toContain('[REDACTED]');
  expect(JSON.stringify(result)).not.toContain('synthetic-key');expect(fs.readFileSync(path.join(dir,'summary.json'),'utf8')).not.toContain('synthetic-key');
});
