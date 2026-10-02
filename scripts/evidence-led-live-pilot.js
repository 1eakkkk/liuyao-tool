import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareEvidenceLedLivePlan,planHash,CAMPAIGN_ID,CAMPAIGN_SCHEMA} from '../experiments/judgment-review/evidence-led-live-plan.js';
import {buildOutputContext} from '../src/ai/output/context.js';
import {createEvidenceLedContext,validateEvidenceLedAnswer} from '../experiments/judgment-review/evidence-led.js';
import {archiveProviderBody} from './judgment-live-pilot.js';
export {archiveProviderBody};
const digest=v=>createHash('sha256').update(v).digest('hex');
const write=(dir,name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
export function strictJson(raw){
  const value=JSON.parse(raw),stack=[];
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(ch==='{')stack.push({keys:new Set(),expected:true});else if(ch==='[')stack.push(null);
    else if(ch==='}'||ch===']')stack.pop();else if(ch===','&&stack.at(-1))stack.at(-1).expected=true;
    else if(ch==='"'){
      const start=i;for(i++;i<raw.length;i++){if(raw[i]==='\\')i++;else if(raw[i]==='"')break;}
      const frame=stack.at(-1);if(frame?.expected){const key=JSON.parse(raw.slice(start,i+1));if(frame.keys.has(key))throw Error('duplicate_json_key');frame.keys.add(key);frame.expected=false;}
    }
  }
  return value;
}
export function parseEvidenceLedSse(bytes,{inputAllowance,maxTokens=4096}={}){
  let rawText='',usage=null,model=null,finishReason=null,sawDone=false,error=null,usageOk=false;
  try{
    if(!Number.isSafeInteger(inputAllowance)||inputAllowance<1||!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>4096)throw Error('invalid_usage_bounds');
    if(!(bytes instanceof Uint8Array)||bytes.byteLength>4*1024*1024)throw Error('invalid_or_excessive_archive');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);let data=[];
    function dispatch(){
      if(!data.length)return;const payload=data.join('\n');data=[];
      if(sawDone)throw Error('sse_after_done');if(payload==='[DONE]'){sawDone=true;return;}
      if(payload.length>256*1024)throw Error('sse_event_too_large');
      const item=strictJson(payload);
      if(!item||typeof item!=='object'||Array.isArray(item)||Object.hasOwn(item,'error'))throw Error('sse_provider_error');
      if(item.model!=='deepseek-flash'||model&&model!==item.model)throw Error('unknown_or_changed_model');model=item.model;
      if(item.usage!=null){if(usage!==null)throw Error('duplicate_usage');usage=item.usage;}
      if(!Array.isArray(item.choices)||item.choices.length>1)throw Error('invalid_choices');
      if(!item.choices.length){if(item.usage==null)throw Error('empty_event');return;}
      const choice=item.choices[0];if(choice.index!==0)throw Error('unknown_choice');
      const delta=choice.delta;if(!delta||typeof delta!=='object'||Array.isArray(delta))throw Error('invalid_delta');
      if(delta.role!=null&&delta.role!=='assistant')throw Error('unexpected_role');
      if(delta.reasoning_content!=null&&(typeof delta.reasoning_content!=='string'||delta.reasoning_content.length))throw Error('unexpected_thinking_channel');
      if(delta.tool_calls!=null&&(!Array.isArray(delta.tool_calls)||delta.tool_calls.length))throw Error('unexpected_tool_channel');
      if(delta.function_call!=null&&(typeof delta.function_call!=='object'||Array.isArray(delta.function_call)||Object.keys(delta.function_call).length))throw Error('unexpected_function_channel');
      if(delta.content!=null&&typeof delta.content!=='string')throw Error('invalid_content');
      if(finishReason!==null&&(delta.content||choice.finish_reason!=null))throw Error('content_after_finish');
      rawText+=delta.content??'';if(rawText.length>32768)throw Error('response_too_large');
      if(choice.finish_reason!=null){finishReason=choice.finish_reason;if(finishReason!=='stop')throw Error('nonstop_completion');}
    }
    for(const line of text.replaceAll('\r\n','\n').replaceAll('\r','\n').split('\n')){
      if(!line){dispatch();continue;}if(line.startsWith(':'))continue;
      if(sawDone)throw Error('sse_after_done');
      if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
      else if(!/^(event|id|retry):/.test(line))throw Error('invalid_sse_line');
    }
    dispatch();
    if(!sawDone||finishReason!=='stop'||!rawText)throw Error('incomplete_completion');
    if(!usage||![usage.prompt_tokens,usage.completion_tokens,usage.total_tokens].every(v=>Number.isSafeInteger(v)&&v>=0)||usage.prompt_tokens+usage.completion_tokens!==usage.total_tokens||usage.prompt_tokens<1||usage.completion_tokens<1)throw Error('unknown_usage');
    if(usage.prompt_tokens>inputAllowance||usage.completion_tokens>maxTokens)throw Error('usage_limit');
    for(const name of ['prompt_cache_hit_tokens','prompt_cache_miss_tokens'])if(usage[name]!=null&&(!Number.isSafeInteger(usage[name])||usage[name]<0||usage[name]>usage.prompt_tokens))throw Error('invalid_cache_usage');
    if(usage.prompt_cache_hit_tokens!=null&&usage.prompt_cache_miss_tokens!=null&&usage.prompt_cache_hit_tokens+usage.prompt_cache_miss_tokens!==usage.prompt_tokens)throw Error('invalid_cache_usage');
    const cached=usage.prompt_tokens_details?.cached_tokens;
    if(cached!=null&&(!Number.isSafeInteger(cached)||cached<0||cached>usage.prompt_tokens||usage.prompt_cache_hit_tokens!=null&&cached!==usage.prompt_cache_hit_tokens))throw Error('invalid_cache_usage');
    usageOk=true;
    strictJson(rawText);
  }catch(e){error=e.message;}
  return {rawText,usage,usageOk,model,finishReason,sawDone,error};
}
function readCampaign(file){
  const state=strictJson(fs.readFileSync(file,'utf8'));
  if(state.schema_version!==CAMPAIGN_SCHEMA||state.campaign_id!==CAMPAIGN_ID||state.authorized!==true||state.limit_cny!==2||!Array.isArray(state.reservations)||state.reservations.length||state.settlements&&(!Array.isArray(state.settlements)||state.settlements.length))throw Error('New authorized empty campaign required; no replay');
  return state;
}
function reserve(file,dir,plan){
  const lock=file+'.lock',fd=fs.openSync(lock,'wx');
  try{const state=readCampaign(file);if(plan.reserve_cny>state.limit_cny)throw Error('Campaign cap');
    state.reservations.push({run:dir,amount:plan.reserve_cny,planHash:planHash(plan),reserved_at:new Date().toISOString()});fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n');
    return {reserved_cny:plan.reserve_cny,limit_cny:2};
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
export async function prepareEvidenceLedLiveDirectory(directory){
  const plan=await prepareEvidenceLedLivePlan();fs.mkdirSync(directory);write(directory,'plan.json',plan);write(directory,'seal.json',{hash:planHash(plan)});
  return {planned_calls:6,reserve_cny:plan.reserve_cny,plan_hash:planHash(plan),network_calls:0,budget_reserved:false};
}
export async function executeEvidenceLedLiveDirectory(directory,ledger){
  const dir=path.resolve(directory),plan=strictJson(fs.readFileSync(path.join(dir,'plan.json'),'utf8')),seal=strictJson(fs.readFileSync(path.join(dir,'seal.json'),'utf8')),expected=await prepareEvidenceLedLivePlan();
  if(seal.hash!==planHash(plan)||seal.hash!==planHash(expected)||expected.price_checked!==new Date().toISOString().slice(0,10)||fs.existsSync(path.join(dir,'execution.json'))||fs.readdirSync(dir).some(n=>/-attempt\.json$/.test(n)))throw Error('Frozen plan, UTC price date or replay rejected');
  const contexts=[];for(const c of plan.cases){const context=await createEvidenceLedContext(await buildOutputContext(c.canonical,{includeMissingRecords:true}),c.task);if(context.context_id!==c.context_id)throw Error('Context reconstruction mismatch');contexts.push(context);}
  const campaign=readCampaign(ledger); // Before any credential or network access; never accepts the old campaign.
  if(!Number.isFinite(plan.reserve_cny)||plan.reserve_cny<=0||plan.reserve_cny>campaign.limit_cny)throw Error('Authorized batch budget insufficient');
  try{process.loadEnvFile('.env.deepseek.local');}catch{throw Error('Local credential loading failed');}
  const key=process.env.DEEPSEEK_API_KEY?.trim();if(!key||/[\r\n]/.test(key))throw Error('Local credential unavailable');
  const safeError=e=>String(e?.message??e).replaceAll(key,'[REDACTED]');
  const headers={Authorization:`Bearer ${key}`};
  async function balance(){
    try{
    const r=await fetch('https://api.deepseek.com/user/balance',{redirect:'error',signal:AbortSignal.timeout(20000),headers});if(!r.ok)throw Error('Balance unconfirmed');const d=strictJson(await r.text()),rows=d.balance_infos?.filter(v=>v.currency==='CNY');
    if(d.is_available!==true||!rows||rows.length!==1||!/^\d+(?:\.\d+)?$/.test(String(rows[0].total_balance)))throw Error('Balance unconfirmed');const n=Number(rows[0].total_balance);if(!Number.isFinite(n))throw Error('Balance unconfirmed');return n;
    }catch(e){throw Error(safeError(e));}
  }
  const before=await balance();if(before<plan.reserve_cny+1)throw Error('Wallet reserve plus 1 CNY floor required');
  const reservation=reserve(ledger,dir,plan);write(dir,'execution.json',{plan_hash:seal.hash,started_at:new Date().toISOString(),reservation,balance_before_cny:before,automatic_retries:false});
  const results=[];let calls=0;
  for(let i=0;i<plan.cases.length;i++){
    const c=plan.cases[i];let requestStarted=false;
    try{
      if(plan.price_checked!==new Date().toISOString().slice(0,10))throw Error('UTC price date changed before chat');
      if(i&&await balance()<plan.reserve_cny+1)throw Error('Wallet floor before next chat');
      write(dir,c.id+'-attempt.json',{started_at:new Date().toISOString(),request_hash:planHash(c.body)});requestStarted=true;calls++;
      const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(c.body)});
      const archived=await archiveProviderBody(r.body,path.join(dir,c.id+(r.ok?'-raw.sse':'-http-error.txt')),r.ok?{}:{limit:65536,redact:key});write(dir,c.id+'-archive.json',{http_status:r.status,...archived.metadata});
      if(!r.ok||!archived.metadata.complete)throw Error('HTTP or archive incomplete');
      const parsed=parseEvidenceLedSse(archived.data,{inputAllowance:c.input_allowance,maxTokens:c.body.max_tokens});fs.writeFileSync(path.join(dir,c.id+'-response.txt'),parsed.rawText,{flag:'wx'});
      let answer=null,issue=parsed.error;if(!issue){try{answer=strictJson(parsed.rawText);validateEvidenceLedAnswer(answer,contexts[i]);}catch(e){issue=e.message;answer=null;}}
      const check={id:c.id,context_id:c.context_id,request_hash:planHash(c.body),status:issue?'rejected':'validated',issues:issue?[issue]:[],model:parsed.model,finish_reason:parsed.finishReason,saw_done:parsed.sawDone,usage:parsed.usage,usage_ok:parsed.usageOk,usage_sha256:parsed.usage===null?null:planHash(parsed.usage),cost_unknown:!parsed.usageOk,conservative_peak_cost_cny:parsed.usageOk?(parsed.usage.prompt_tokens*2+parsed.usage.completion_tokens*8)/1e6:null,archive:archived.metadata,raw_sha256:digest(parsed.rawText),response:answer,semantic_acceptance:'unassessed',forecast_accuracy:'unassessed',reservation_retained:true};
      write(dir,c.id+'-check.json',check);results.push(check);if(issue)break;
    }catch(e){const failure={id:c.id,status:'request_or_processing_failed',request_started:requestStarted,cost_unknown:requestStarted,error:safeError(e),retry:false,reservation_retained:true};write(dir,c.id+'-failure.json',failure);results.push(failure);break;}
  }
  const summary={plan_hash:seal.hash,planned_calls:6,attempted_calls:calls,results,reservation,balance_before_cny:before,exact_billed_cost_cny:null,production_changes:false,semantic_acceptance:'unassessed',automatic_settlement:false};write(dir,'summary.json',summary);return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [mode,directory,ledger]=process.argv.slice(2);let result;
  if(mode==='prepare'&&directory&&!ledger)result=await prepareEvidenceLedLiveDirectory(directory);
  else if(mode==='execute'&&directory&&ledger)result=await executeEvidenceLedLiveDirectory(directory,ledger);
  else throw Error('Use prepare <new-directory> or execute <prepared-directory> <new-authorized-ledger>');
  console.log(JSON.stringify({planned_calls:result.planned_calls,attempted_calls:result.attempted_calls,plan_hash:result.plan_hash,reserve_cny:result.reserve_cny}));
  if(mode==='execute'&&(result.attempted_calls!==6||result.results.some(v=>v.status!=='validated')))process.exitCode=2;
}
