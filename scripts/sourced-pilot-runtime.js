// Shared bounded paid test runtime. Entry points supply freshly regenerated fixed plans.
import fs from 'node:fs';
import path from 'node:path';
import {sealPlan} from '../experiments/reading-quality/knowledge-pairs.js';
import {checkSourcedOutput} from '../experiments/reading-quality/sourced-output.js';
import {reserveCampaign} from './deepseek-campaign-budget.js';
export async function executeFixedSourcedPilot(directory,expectedPlan){
const dir=path.resolve(directory),read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const write=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const plan=read('plan.json'),seal=read('seal.json');
const plannedCalls=expectedPlan.cases.reduce((n,c)=>n+c.arms.length,0);
if(plannedCalls<1 || plannedCalls>4 || seal.hash!==sealPlan(plan) || seal.hash!==sealPlan(expectedPlan) ||
  fs.existsSync(path.join(dir,'execution.json')) || plan.price_checked!==new Date().toISOString().slice(0,10)) throw Error('Plan/version/date/replay rejected');
process.loadEnvFile('.env.deepseek.local');
const key=process.env.DEEPSEEK_API_KEY?.trim();
if(!key || /[\r\n]/.test(key)) throw Error('Local credential missing or invalid');
async function balance() {
  try {
    const r=await fetch('https://api.deepseek.com/user/balance',{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${key}`}});
    if(!r.ok) return null;const d=await r.json(),b=d.balance_infos?.find(x=>x.currency==='CNY');
    return b && Number.isFinite(Number(b.total_balance)) ? {available:d.is_available===true,total_cny:Number(b.total_balance)}:null;
  } catch{return null;}
}
const before=await balance();
if(!before?.available || before.total_cny<plan.reserve_cny) throw Error('Balance could not be confirmed sufficient');
const reservation=reserveCampaign('test-results/deepseek-campaign-budget.json',{run:dir,amount:plan.reserve_cny,planHash:seal.hash});
write('execution.json',{started_at:new Date().toISOString(),plan_hash:seal.hash,reservation,balance_before:before,automatic_retries:false});
const results=[];
for(const c of plan.cases) for(const arm of c.arms) {
  if(results.some(r=>!r.check?.mechanical_ok)) break;
  write(`${arm.id}-attempt.json`,{started_at:new Date().toISOString(),model:plan.model});
  try {
    const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(arm.body)});
    if(!response.ok) throw Error('Provider request failed');
    const data=await response.json(),choice=data.choices?.[0],u=data.usage,raw=choice?.message?.content??'';
    write(`${arm.id}-response.json`,{model:data.model??null,finish_reason:choice?.finish_reason??null,content:raw,usage:u??null});
    if(data.model!==plan.model || choice?.finish_reason!=='stop' || typeof raw!=='string' || raw.length>100000 ||
      !Number.isSafeInteger(u?.prompt_tokens) || u.prompt_tokens<0 || u.prompt_tokens>plan.input_token_allowance ||
      !Number.isSafeInteger(u?.completion_tokens) || u.completion_tokens<0 || u.completion_tokens>plan.max_output_tokens) throw Error('Incomplete reply or unknown usage');
    // Reject duplicate keys, including escaped aliases, before accepting JSON.
    const frames=[];
    for(let i=0;i<raw.length;i++) {
      const ch=raw[i];if(ch==='{') frames.push({keys:new Set(),expect:true});else if(ch==='[') frames.push(null);
      else if(ch==='}'||ch===']') frames.pop();else if(ch===','&&frames.at(-1)) frames.at(-1).expect=true;
      else if(ch==='"') {const start=i;for(i++;i<raw.length;i++){if(raw[i]==='\\') i++;else if(raw[i]==='"') break;}
        const frame=frames.at(-1);if(frame?.expect){const name=JSON.parse(raw.slice(start,i+1));if(frame.keys.has(name)) throw Error('Duplicate field');frame.keys.add(name);frame.expect=false;}}
    }
    const check=checkSourcedOutput(JSON.parse(raw),c.evidence,arm.material.packet);
    const result={id:arm.id,case_id:c.id,arm:arm.arm,usage:u,check,model_quality:'manual_review_pending',
      conservative_peak_cost_cny:(u.prompt_tokens*2+u.completion_tokens*8)/1e6};
    write(`${arm.id}-check.json`,result);results.push(result);console.log(JSON.stringify({id:arm.id,mechanical_ok:check.mechanical_ok}));
  } catch {
    const result={id:arm.id,status:'request_or_processing_failed',cost_unknown:true,retry:false};
    write(`${arm.id}-failure.json`,result);results.push(result);console.log(JSON.stringify({id:arm.id,status:result.status}));
  }
}
const after=await balance();
write('summary.json',{plan_hash:seal.hash,planned_calls:plannedCalls,attempted_calls:results.length,results,reservation,
  balance_before:before,balance_after:after,balance_difference_cny:after?Number((before.total_cny-after.total_cny).toFixed(6)):null,
  balance_difference_is_not_exact_attributed_cost:true,exact_billed_cost_cny:null,production_changes:false});
if(results.length!==plannedCalls || results.some(r=>!r.check?.mechanical_ok)) process.exitCode=2;

}
