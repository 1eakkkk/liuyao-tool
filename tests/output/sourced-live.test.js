// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {test,expect} from 'vitest';
import {auditCompletedPilot,settlePilot} from '../../scripts/settle-knowledge-pilot.js';
import {accountedCampaignAmount,reserveCampaign} from '../../scripts/deepseek-campaign-budget.js';
import {prepareSourcedPairs} from '../../experiments/reading-quality/sourced-pairs.js';
import {sealPlan} from '../../experiments/reading-quality/knowledge-pairs.js';
const repo=fileURLToPath(new URL('../../',import.meta.url));
function temporary(work){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sourced-live-'));try{return work(root);}finally{
  if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)) throw Error('Unexpected cleanup path');fs.rmSync(root,{recursive:true,force:true});}}
const write=(file,v)=>fs.writeFileSync(file,JSON.stringify(v));
function oldPilot(root){const dir=path.join(root,'pilot');fs.mkdirSync(dir);
  for(const f of fs.readdirSync(path.join(repo,'test-results/knowledge-reading-pilot-01')).filter(f=>f.endsWith('.json')))
    fs.copyFileSync(path.join(repo,'test-results/knowledge-reading-pilot-01',f),path.join(dir,f));return dir;}
test('explicit settlement preserves reservations and accounts only complete recorded usage plus padding',()=>temporary(root=>{
  const dir=oldPilot(root),audit=auditCompletedPilot(dir),ledger=path.join(root,'ledger.json');
  expect(audit.accounted_cny).toBe(0.03683);expect(audit.unattempted_calls).toBe(5);
  const reservation={run:dir,amount:audit.original_amount,planHash:audit.planHash};
  write(ledger,{limit_cny:2,reservations:[reservation]});
  expect(settlePilot(ledger,dir).accounted_cny).toBe(0.03683);
  expect(JSON.parse(fs.readFileSync(ledger)).reservations[0]).toEqual(reservation);
  expect(()=>settlePilot(ledger,dir)).toThrow('already settled');
  expect(reserveCampaign(ledger,{run:'new',amount:1,planHash:'new'}).reserved_cny).toBeCloseTo(1.03683,6);
  const state=JSON.parse(fs.readFileSync(ledger));state.settlements[0].accounted_cny=0;
  expect(()=>accountedCampaignAmount(state)).toThrow('Invalid audited settlement');
}));
test.each(['unknown_attempt','failure','usage_change','unknown_model','seal','retry'])('unknown old consumption never frees money: %s',kind=>temporary(root=>{
  const dir=oldPilot(root),read=name=>JSON.parse(fs.readFileSync(path.join(dir,name)));
  if(kind==='unknown_attempt') write(path.join(dir,'unknown-attempt.json'),{});
  if(kind==='failure') write(path.join(dir,'unknown-failure.json'),{});
  if(kind==='usage_change'){const r=read('month-break-without-literature-response.json');r.usage.prompt_tokens--;write(path.join(dir,'month-break-without-literature-response.json'),r);}
  if(kind==='unknown_model'){const r=read('month-break-without-literature-response.json');r.model='unknown';write(path.join(dir,'month-break-without-literature-response.json'),r);}
  if(kind==='seal') write(path.join(dir,'seal.json'),{hash:'wrong'});
  if(kind==='retry'){const e=read('execution.json');e.automatic_retries=true;write(path.join(dir,'execution.json'),e);}
  expect(()=>auditCompletedPilot(dir)).toThrow();
}));
test('ledger lock rejects reconciliation and preserves bytes',()=>temporary(root=>{
  const ledger=path.join(root,'ledger.json');write(ledger,{limit_cny:2,reservations:[]});const before=fs.readFileSync(ledger,'utf8');
  fs.writeFileSync(ledger+'.lock','');expect(()=>settlePilot(ledger,root)).toThrow();expect(fs.readFileSync(ledger,'utf8')).toBe(before);
}));
test.each(['valid','duplicate','escaped_duplicate','truncated','invalid_origin','wrong_seal','insufficient_balance'])('paid executor mocked: %s, replay rejected without further calls',async kind=>{
  const plan=await prepareSourcedPairs('one-pair');
  temporary(root=>{
    const dir=path.join(root,'run');fs.mkdirSync(dir);write(path.join(dir,'plan.json'),plan);write(path.join(dir,'seal.json'),{hash:sealPlan(plan)});
    if(kind==='wrong_seal') write(path.join(dir,'seal.json'),{hash:'wrong'});
    fs.mkdirSync(path.join(root,'test-results'));write(path.join(root,'test-results/deepseek-campaign-budget.json'),{limit_cny:19.95,reservations:[]});
    fs.writeFileSync(path.join(root,'.env.deepseek.local'),'DEEPSEEK_API_KEY=MOCK_ONLY\n');
    const mock=path.join(root,'mock.mjs');fs.writeFileSync(mock,`import fs from 'node:fs';
globalThis.fetch=async(url,options)=>{
 if(url==='https://api.deepseek.com/user/balance')return{ok:true,json:async()=>({is_available:true,balance_infos:[{currency:'CNY',total_balance:${JSON.stringify(kind==='insufficient_balance'?'0':'20')}}]})};
 if(url!=='https://api.deepseek.com/chat/completions')throw Error('Unexpected endpoint');
 fs.appendFileSync('calls.txt','POST\\n');const input=JSON.parse(JSON.parse(options.body).messages[1].content),card=input.literature_packet.cards[0];
 const a={schema_version:'layered-reading-sourced-dev-1',conclusion:'模拟协议检查，不是模型评价。',facts:input.evidence.filter(e=>e.kind==='program_fact').map(e=>({evidence_id:e.id,value:e.value})),rules:input.evidence.filter(e=>e.kind==='rule_result').map(e=>({evidence_id:e.id,result:e.result})),interpretations:[{text:'仅核对字段。',fact_ids:input.evidence.filter(e=>e.kind==='program_fact').map(e=>e.id),rule_ids:input.evidence.filter(e=>e.kind==='rule_result').map(e=>e.id),literature_ids:card?[card.literature_id]:[],applicability:'开发检查。',uncertainties:['语义未确认。'],source_claims:card?[{literature_id:card.literature_id,field:'/original_text',origin:${JSON.stringify(kind==='invalid_origin'?'modern_editorial':'source_transcription')},quote:card.original_text}]:[]}],advice:[]};
 let content=JSON.stringify(a);if(${JSON.stringify(kind)}==='duplicate')content=content.replace('"conclusion":','"conclusion":"重复", "conclusion":');
 if(${JSON.stringify(kind)}==='escaped_duplicate')content=content.replace('"conclusion":','"concl'+String.fromCharCode(92)+'u0075sion":"重复","conclusion":');
 return{ok:true,json:async()=>({model:'deepseek-flash',choices:[{finish_reason:${JSON.stringify(kind==='truncated'?'length':'stop')},message:{content}}],usage:{prompt_tokens:100,completion_tokens:200,total_tokens:300}})};
};`);
    const args=['--import',pathToFileURL(mock).href,path.join(repo,'scripts/execute-sourced-reading.js'),dir];
    const run=()=>execFileSync(process.execPath,args,{cwd:root,stdio:'pipe'});
    if(kind==='valid') expect(()=>run()).not.toThrow();else expect(()=>run()).toThrow();
    if(['wrong_seal','insufficient_balance'].includes(kind)) {
      expect(fs.existsSync(path.join(root,'calls.txt'))).toBe(false);
      expect(fs.existsSync(path.join(dir,'execution.json'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(root,'test-results/deepseek-campaign-budget.json'))).reservations).toHaveLength(0);
      return;
    }
    const calls=fs.readFileSync(path.join(root,'calls.txt'),'utf8');expect(calls.trim().split('\n')).toHaveLength(['valid','invalid_origin'].includes(kind)?2:1);
    const summary=JSON.parse(fs.readFileSync(path.join(dir,'summary.json')));expect(summary.production_changes).toBe(false);
    if(kind==='duplicate') expect(summary.results[0].status).toBe('request_or_processing_failed');
    expect(()=>run()).toThrow();expect(fs.readFileSync(path.join(root,'calls.txt'),'utf8')).toBe(calls);
  });
});
