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
import {prepareLiveClarityPairs} from '../../experiments/reading-quality/clarity-live-pairs.js';
import {prepareLiveBoundOne} from '../../experiments/reading-quality/bound-live-one.js';
import {sealPlan} from '../../experiments/reading-quality/knowledge-pairs.js';
const repo=fileURLToPath(new URL('../../',import.meta.url));
function temporary(work){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sourced-live-'));try{return work(root);}finally{
  if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)) throw Error('Unexpected cleanup path');fs.rmSync(root,{recursive:true,force:true});}}
const write=(file,v)=>fs.writeFileSync(file,JSON.stringify(v));
function oldPilot(root){const dir=path.join(root,'pilot');fs.mkdirSync(dir);
  const fixture=path.join(repo,'docs/acceptance/sourced-reading-live-20260930/settled-historical-pilot');
  for(const f of fs.readdirSync(fixture).filter(f=>f.endsWith('.json')))
    fs.copyFileSync(path.join(fixture,f),path.join(dir,f));return dir;}
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
function closedSourcedPilot(root){
  const dir=oldPilot(root),read=name=>JSON.parse(fs.readFileSync(path.join(dir,name)));
  const p=read('plan.json');p.cases=p.cases.slice(0,1);p.cases[0].arms=p.cases[0].arms.slice(0,1);
  write(path.join(dir,'plan.json'),p);const hash=sealPlan(p);write(path.join(dir,'seal.json'),{hash});
  const e=read('execution.json');e.plan_hash=hash;write(path.join(dir,'execution.json'),e);
  const s=read('summary.json');s.plan_hash=hash;s.planned_calls=1;s.attempted_calls=1;s.production_changes=false;s.balance_difference_is_not_exact_attributed_cost=true;
  const r=s.results[0];delete r.within_reserve;r.model_quality='manual_review_pending';r.check={mechanical_ok:true};
  r.conservative_peak_cost_cny=(r.usage.prompt_tokens*2+r.usage.completion_tokens*8)/1e6;
  write(path.join(dir,`${r.id}-check.json`),r);write(path.join(dir,'summary.json'),s);return dir;
}
test('complete sourced format settles using original higher reservation rates, not mechanical quality as billing proof',()=>temporary(root=>{
  const dir=closedSourcedPilot(root),options={format:'sourced-complete'};
  expect(()=>auditCompletedPilot(dir)).toThrow('Unknown call status');
  const a=auditCompletedPilot(dir,options);expect(a.unattempted_calls).toBe(0);expect(a.accounted_cny).toBe(0.03683);
  const ledger=path.join(root,'ledger.json');write(ledger,{limit_cny:2,reservations:[{run:dir,amount:a.original_amount,planHash:a.planHash}]});
  expect(settlePilot(ledger,dir,options).accounted_cny).toBe(a.accounted_cny);
}));
test.each(['incomplete','execution_seal','summary_seal','estimate','unknown_quality','extra_attempt'])('sourced reconciliation refuses unverifiable closure: %s',kind=>temporary(root=>{
  const dir=closedSourcedPilot(root),read=name=>JSON.parse(fs.readFileSync(path.join(dir,name)));
  if(kind==='incomplete'){const p=read('plan.json');p.cases[0].arms.push({...p.cases[0].arms[0],id:'unattempted-arm'});const h=sealPlan(p);write(path.join(dir,'plan.json'),p);write(path.join(dir,'seal.json'),{hash:h});const e=read('execution.json');e.plan_hash=h;write(path.join(dir,'execution.json'),e);const s=read('summary.json');s.plan_hash=h;s.planned_calls=2;write(path.join(dir,'summary.json'),s);}
  if(kind==='execution_seal'){const e=read('execution.json');e.plan_hash='wrong';write(path.join(dir,'execution.json'),e);}
  if(kind==='summary_seal'){const s=read('summary.json');s.plan_hash='wrong';write(path.join(dir,'summary.json'),s);}
  if(['estimate','unknown_quality'].includes(kind)){const s=read('summary.json'),r=s.results[0];if(kind==='estimate')r.conservative_peak_cost_cny=0;else r.model_quality='unknown';write(path.join(dir,'summary.json'),s);write(path.join(dir,`${r.id}-check.json`),r);}
  if(kind==='extra_attempt')write(path.join(dir,'unknown-attempt.json'),{});
  expect(()=>auditCompletedPilot(dir,{format:'sourced-complete'})).toThrow();
}));
const kinds=['valid','duplicate','escaped_duplicate','truncated','invalid_origin','wrong_seal','insufficient_balance','missing_usage','unknown_model'];
const pilots=['original','clarity','bound'].flatMap(pilot=>[...kinds,...(pilot==='clarity'?['third_case_failure']:pilot==='bound'?['missing_note']:[])].map(kind=>({pilot,kind})));
test.each(pilots)('paid executor mocked: $pilot $kind, replay rejected without further calls',async ({pilot,kind})=>{
  const plan=pilot==='original'?await prepareSourcedPairs('one-pair'):pilot==='clarity'?await prepareLiveClarityPairs():await prepareLiveBoundOne();
  temporary(root=>{
    const dir=path.join(root,'run');fs.mkdirSync(dir);write(path.join(dir,'plan.json'),plan);write(path.join(dir,'seal.json'),{hash:sealPlan(plan)});
    if(kind==='wrong_seal') write(path.join(dir,'seal.json'),{hash:'wrong'});
    fs.mkdirSync(path.join(root,'test-results'));write(path.join(root,'test-results/deepseek-campaign-budget.json'),{limit_cny:19.95,reservations:[]});
    fs.writeFileSync(path.join(root,'.env.deepseek.local'),'DEEPSEEK_API_KEY=MOCK_ONLY\n');
    const mock=path.join(root,'mock.mjs');fs.writeFileSync(mock,`import fs from 'node:fs';
const RealDate=globalThis.Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[${JSON.stringify(plan.price_checked+'T12:00:00.000Z')}]));}static now(){return new RealDate(${JSON.stringify(plan.price_checked+'T12:00:00.000Z')}).valueOf();}};
globalThis.fetch=async(url,options)=>{
 if(url==='https://api.deepseek.com/user/balance')return{ok:true,json:async()=>({is_available:true,balance_infos:[{currency:'CNY',total_balance:${JSON.stringify(kind==='insufficient_balance'?'0':'20')}}]})};
 if(url!=='https://api.deepseek.com/chat/completions')throw Error('Unexpected endpoint');
 fs.appendFileSync('calls.txt','POST\\n');const input=JSON.parse(JSON.parse(options.body).messages[1].content),card=input.literature_packet.cards[0];
 const a={schema_version:'layered-reading-sourced-dev-1',conclusion:'模拟协议检查，不是模型评价。',facts:input.evidence.filter(e=>e.kind==='program_fact').map(e=>({evidence_id:e.id,value:e.value})),rules:input.evidence.filter(e=>e.kind==='rule_result').map(e=>({evidence_id:e.id,result:e.result})),interpretations:[{text:'仅核对字段。',fact_ids:input.evidence.filter(e=>e.kind==='program_fact').map(e=>e.id),rule_ids:input.evidence.filter(e=>e.kind==='rule_result').map(e=>e.id),literature_ids:card?[card.literature_id]:[],applicability:'开发检查。',uncertainties:['语义未确认。'],source_claims:card?[{literature_id:card.literature_id,field:'/original_text',origin:${JSON.stringify(kind==='invalid_origin'?'modern_editorial':'source_transcription')},quote:card.original_text}]:[]}],advice:[]};
 if(${JSON.stringify(pilot)}==='bound'){
   a.schema_version='layered-reading-sourced-dev-2';a.source_catalog_hash=input.source_catalog.catalog_hash;
   const i=a.interpretations[0];delete i.source_claims;
   i.source_ids=input.source_catalog.items.map(s=>s.source_id);
   i.applicability={program:'模拟程序依据。',editorial:input.source_catalog.items.filter(s=>s.origin==='modern_editorial').map(s=>({source_id:s.source_id,explanation:'模拟现代整理说明。'}))};
   if(${JSON.stringify(kind)}==='invalid_origin')i.applicability.editorial[0].origin='source_transcription';
   if(${JSON.stringify(kind)}==='missing_note')i.applicability.editorial.pop();
 }
 let content=JSON.stringify(a);if(${JSON.stringify(kind)}==='duplicate')content=content.replace('"conclusion":','"conclusion":"重复", "conclusion":');
 if(${JSON.stringify(kind)}==='escaped_duplicate')content=content.replace('"conclusion":','"concl'+String.fromCharCode(92)+'u0075sion":"重复","conclusion":');
 if(${JSON.stringify(kind)}==='third_case_failure' && input.question.includes('第五爻'))content=content.replace('"conclusion":','"conclusion":"重复","conclusion":');
 return{ok:true,json:async()=>({model:${JSON.stringify(kind==='unknown_model'?'unknown':'deepseek-flash')},choices:[{finish_reason:${JSON.stringify(kind==='truncated'?'length':'stop')},message:{content}}],usage:${kind==='missing_usage'?'null':'{prompt_tokens:100,completion_tokens:200,total_tokens:300}'}})};
};`);
    const args=['--import',pathToFileURL(mock).href,...(pilot==='original'?[path.join(repo,'scripts/execute-sourced-reading.js'),dir]:[path.join(repo,pilot==='bound'?'scripts/bound-live-pilot.js':'scripts/clarity-live-pilot.js'),'execute',dir])];
    const run=()=>execFileSync(process.execPath,args,{cwd:root,stdio:'pipe'});
    if(kind==='valid') expect(()=>run()).not.toThrow();else expect(()=>run()).toThrow();
    if(['wrong_seal','insufficient_balance'].includes(kind)) {
      expect(fs.existsSync(path.join(root,'calls.txt'))).toBe(false);
      expect(fs.existsSync(path.join(dir,'execution.json'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(root,'test-results/deepseek-campaign-budget.json'))).reservations).toHaveLength(0);
      return;
    }
    const calls=fs.readFileSync(path.join(root,'calls.txt'),'utf8');
    expect(calls.trim().split('\n')).toHaveLength(kind==='valid'?(pilot==='original'?2:pilot==='clarity'?4:1):kind==='invalid_origin'&&pilot!=='bound'?2:kind==='third_case_failure'?3:1);
    const summary=JSON.parse(fs.readFileSync(path.join(dir,'summary.json')));expect(summary.production_changes).toBe(false);
    if(kind==='duplicate') expect(summary.results[0].status).toBe('request_or_processing_failed');
    expect(()=>run()).toThrow();expect(fs.readFileSync(path.join(root,'calls.txt'),'utf8')).toBe(calls);
  });
});
