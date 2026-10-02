import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareJudgmentPlan,planHash} from '../experiments/judgment-review/plan.js';
import {prepareLiveJudgmentCandidate} from '../experiments/judgment-review/live-candidate.js';
import {createReadingSession,prepareReadingTurn,appendReadingTurn} from '../src/ai/output/session.js';
import {parseOutputSse} from '../src/ai/output/sse.js';
import {accountedCampaignAmount,reserveCampaign} from './deepseek-campaign-budget.js';
export async function archiveProviderBody(body,file,{limit=4*1024*1024,redact=''}={}){
  const chunks=[];let bytes=0,complete=false,error=null;
  try{
    for await(const chunk of body){
      const buffer=Buffer.from(chunk),available=limit-bytes;
      chunks.push(buffer.subarray(0,Math.max(0,available)));bytes+=Math.min(buffer.length,Math.max(0,available));
      if(buffer.length>available){error='archive_limit';break;}
    }
    complete=error===null;
  }catch{error='stream_read_failed';}
  let data=Buffer.concat(chunks),redacted=false;
  if(redact){const text=data.toString('utf8');redacted=text.includes(redact);if(redacted)data=Buffer.from(text.replaceAll(redact,'[REDACTED]'));}
  fs.writeFileSync(file,data,{flag:'wx'});
  return {data,metadata:{complete,error,redacted,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')}};
}
async function trustedPlan(profile){
  if(profile==='production4')return prepareJudgmentPlan();
  if(profile==='compact')return prepareLiveJudgmentCandidate();
  throw Error('Unknown experiment profile');
}
export async function prepareJudgmentDirectory(directory,profile='production4'){
  const plan=await trustedPlan(profile);fs.mkdirSync(directory);
  for(const [name,value]of [['plan.json',plan],['seal.json',{hash:planHash(plan)}]])
    fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  return {planned_calls:plan.cases.length,reserve_cny:plan.reserve_cny,plan_hash:planHash(plan),network_calls:0};
}
export async function executeJudgmentDirectory(directory,ledger,profile='production4'){
  const dir=path.resolve(directory),write=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json'),'utf8'));
  const seal=JSON.parse(fs.readFileSync(path.join(dir,'seal.json'),'utf8'));
  const expected=await trustedPlan(profile);
  if(seal.hash!==planHash(plan)||seal.hash!==planHash(expected)||fs.existsSync(path.join(dir,'execution.json'))||
    expected.price_checked!==new Date().toISOString().slice(0,10))throw Error('Plan, price date or replay rejected');
  const state=JSON.parse(fs.readFileSync(ledger,'utf8'));
  if(state.reservations.some(r=>r.run===dir))throw Error('Run already reserved; replay rejected');
  if(accountedCampaignAmount(state)+plan.reserve_cny>state.limit_cny)throw Error('Additional authorized campaign budget required');
  // No credential reads or network activity before frozen-plan and budget checks.
  process.loadEnvFile('.env.deepseek.local');const key=process.env.DEEPSEEK_API_KEY?.trim();
  if(!key||/[\r\n]/.test(key))throw Error('Local credential unavailable');
  const headers={Authorization:`Bearer ${key}`};
  async function balance(){
    try{const r=await fetch('https://api.deepseek.com/user/balance',{redirect:'error',signal:AbortSignal.timeout(20000),headers});
      if(!r.ok)return null;const d=await r.json(),b=d.balance_infos?.find(v=>v.currency==='CNY');
      return d.is_available===true&&b&&Number.isFinite(Number(b.total_balance))?Number(b.total_balance):null;
    }catch{return null;}
  }
  const before=await balance();if(before===null||before<plan.reserve_cny)throw Error('Confirmed provider balance insufficient');
  const reservation=reserveCampaign(ledger,{run:dir,amount:plan.reserve_cny,planHash:seal.hash});
  write('execution.json',{started_at:new Date().toISOString(),plan_hash:seal.hash,reservation,balance_before_cny:before,automatic_retries:false});
  const results=[];
  for(const c of plan.cases){
    const session=createReadingSession(c.canonical,{style:'brief',custom:''});
    const prepared=await prepareReadingTurn(session,c.question);
    if(prepared.context.context_id!==c.context_id)throw Error('Context reconstruction mismatch');
    write(`${c.id}-attempt.json`,{started_at:new Date().toISOString(),request_hash:planHash(c.body)});
    let httpStatus=null;
    try{
      const signal=AbortSignal.timeout(180000);
      const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',signal,
        headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(c.body)});
      httpStatus=r.status;
      // Archive independently: a malformed SSE frame must not discard its tail.
      const archive=await archiveProviderBody(r.body,path.join(dir,`${c.id}-${r.ok?'raw.sse':'http-error.txt'}`),
        r.ok?{}:{limit:65536,redact:key});
      write(`${c.id}-archive.json`,{http_status:httpStatus,...archive.metadata});
      if(!r.ok||!archive.metadata.complete)throw Error('Provider response incomplete or failed');
      async function* frozenStream(){yield archive.data;}
      const parsed=await parseOutputSse(frozenStream(),prepared.context,{signal});
      fs.writeFileSync(path.join(dir,`${c.id}-response.txt`),parsed.rawText,{flag:'wx'});
      const u=parsed.usage,known=Number.isSafeInteger(u?.prompt_tokens)&&u.prompt_tokens>=0&&
        Number.isSafeInteger(u?.completion_tokens)&&u.completion_tokens>=0;
      const usage_ok=known&&u.prompt_tokens<=c.input_allowance&&u.completion_tokens<=c.body.max_tokens;
      const complete=!parsed.error&&parsed.sawDone&&parsed.finishReason==='stop';
      const turn=appendReadingTurn(session,prepared,parsed.rawText,complete,'api');
      const result={id:c.id,status:turn.result.status,issues:turn.result.issues,finish_reason:parsed.finishReason,saw_done:parsed.sawDone,
        transport_error:parsed.error,http_status:httpStatus,archive:archive.metadata,usage:u,usage_ok,conservative_peak_cost_cny:known?(u.prompt_tokens*2+u.completion_tokens*8)/1e6:null,
        semantic_review:'pending',raw_sha256:createHash('sha256').update(parsed.rawText).digest('hex'),response:turn.result.answer??null};
      write(`${c.id}-check.json`,result);results.push(result);
      if(!usage_ok||!complete||result.status!=='validated')break;
    }catch{
      const result={id:c.id,status:'request_or_processing_failed',http_status:httpStatus,cost_unknown:true,retry:false};
      write(`${c.id}-failure.json`,result);results.push(result);break;
    }
  }
  const after=await balance();
  const summary={plan_hash:seal.hash,planned_calls:2,attempted_calls:results.length,results,reservation,
    balance_before_cny:before,balance_after_cny:after,exact_billed_cost_cny:null,
    balance_difference_is_not_exact_attributed_cost:true,production_changes:false};
  write('summary.json',summary);return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [mode,directory,ledger]=process.argv.slice(2);
  if(['prepare','prepare-compact'].includes(mode)&&directory&&!ledger)console.log(JSON.stringify(await prepareJudgmentDirectory(directory,mode==='prepare'?'production4':'compact')));
  else if(['execute','execute-compact'].includes(mode)&&directory&&ledger){const r=await executeJudgmentDirectory(directory,ledger,mode==='execute'?'production4':'compact');
    console.log(JSON.stringify({attempted_calls:r.attempted_calls,statuses:r.results.map(x=>({id:x.id,status:x.status})),reservation:r.reservation}));
    if(r.attempted_calls!==2||r.results.some(x=>x.status!=='validated'||!x.usage_ok))process.exitCode=2;
  }else throw Error('Use prepare[ -compact] <new-directory> or execute[-compact] <prepared-directory> <budget-ledger>');
}
