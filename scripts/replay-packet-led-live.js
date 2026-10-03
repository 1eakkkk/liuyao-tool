// Offline integrity replay; never reads credentials or invokes a provider.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {planHash} from '../experiments/judgment-review/plan.js';
import {preparePacketLedLivePlan} from '../experiments/judgment-review/packet-led-live-plan.js';
import {buildOutputContext} from '../src/ai/output/context.js';
import {createPacketLedContext,validatePacketLedAnswer} from '../experiments/judgment-review/packet-led.js';
import {parseEvidenceLedSse,strictJson} from './evidence-led-live-pilot.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const same=(a,b,label)=>{if(planHash(a)!==planHash(b))throw Error(label);};
function ownField(answer,pointer){
  if(typeof pointer!=='string'||!pointer.startsWith('/'))throw Error('Review path invalid');
  let value=answer;
  for(const segment of pointer.slice(1).split('/')){
    if(/~(?![01])/.test(segment))throw Error('Review path invalid');
    const key=segment.replaceAll('~1','/').replaceAll('~0','~');
    if(value===null||typeof value!=='object'||!Object.hasOwn(value,key)||Array.isArray(value)&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length))throw Error('Review path not an own JSON field');
    value=value[key];
  }
  return value;
}
export async function replayPacketLedLive(directory){
  const read=name=>strictJson(fs.readFileSync(path.join(directory,name),'utf8'));
  const plan=read('plan.json'),seal=read('seal.json'),summary=read('summary.json');
  same(seal.hash,planHash(plan),'Plan seal mismatch');
  same(plan,await preparePacketLedLivePlan(),'Trusted fixed plan mismatch');
  same(summary.plan_hash,seal.hash,'Summary plan mismatch');
  const results=[],contexts=new Map();
  if(summary.planned_calls!==2||summary.attempted_calls!==summary.results.length||!summary.results.length||summary.results.length>2)throw Error('Call accounting mismatch');
  const attempted=plan.cases.slice(0,summary.results.length);
  if(summary.results.length<2&&summary.results.at(-1).status!=='rejected')throw Error('Unexplained early stop');
  const expectedAttempts=new Set(attempted.map(c=>c.id+'-attempt.json'));
  if(fs.readdirSync(directory).filter(n=>n.endsWith('-attempt.json')).some(n=>!expectedAttempts.has(n)))throw Error('Unrecorded attempt');
  if(plan.cases.slice(attempted.length).some(c=>fs.readdirSync(directory).some(n=>n.startsWith(c.id+'-'))))throw Error('Artifacts for unattempted case');
  if(summary.results.slice(0,-1).some(r=>r.status!=='validated'))throw Error('Calls continued after rejection');
  const execution=read('execution.json');
  same(execution.plan_hash,seal.hash,'Execution plan mismatch');
  same(execution.reservation,summary.reservation,'Reservation mismatch');
  if(summary.reservation.reserved_cny!==plan.reserve_cny||summary.reservation.limit_cny!==plan.campaign_cap_cny||execution.automatic_retries!==false||summary.automatic_settlement!==false||summary.production_changes!==false||summary.semantic_acceptance!=='unassessed'||summary.exact_billed_cost_cny!==null)throw Error('Execution policy mismatch');
  if(!Number.isFinite(summary.balance_before_cny)||summary.balance_before_cny<plan.reserve_cny+plan.wallet_floor_cny||execution.balance_before_cny!==summary.balance_before_cny)throw Error('Wallet floor mismatch');
  for(const c of attempted){
    const file=path.join(directory,c.id+'-check.json');
    if(!fs.existsSync(file))throw Error('Expected complete attempted-case archive');
    const check=read(c.id+'-check.json'),archive=read(c.id+'-archive.json');
    if(check.id!==c.id)throw Error('Case identity mismatch');
    if(check.reservation_retained!==true||check.semantic_acceptance!=='unassessed'||check.forecast_accuracy!=='unassessed')throw Error('Case policy mismatch');
    const bytes=fs.readFileSync(path.join(directory,c.id+'-raw.sse'));
    if(!archive.complete||archive.sha256!==hash(bytes)||archive.bytes!==bytes.length)throw Error('Provider bytes mismatch');
    const {http_status,...metadata}=archive;
    if(http_status!==200)throw Error('Non-success archive');
    same(check.archive,metadata,'Check archive mismatch');
    same(check.request_hash,planHash(c.body),'Request identity mismatch');
    same(read(c.id+'-attempt.json').request_hash,check.request_hash,'Attempt identity mismatch');
    const source=await buildOutputContext(c.canonical,{includeMissingRecords:true}),context=await createPacketLedContext(source);
    contexts.set(c.id,source);
    same(context.context_id,c.context_id,'Context mismatch');same(check.context_id,c.context_id,'Check context mismatch');
    const parsed=parseEvidenceLedSse(bytes,{inputAllowance:c.input_allowance,maxTokens:c.body.max_tokens});
    same(parsed.rawText,fs.readFileSync(path.join(directory,c.id+'-response.txt'),'utf8'),'Response text mismatch');
    same(check.raw_sha256,hash(parsed.rawText),'Response digest mismatch');
    same(check.usage,parsed.usage,'Usage mismatch');same(check.usage_sha256,parsed.usage===null?null:planHash(parsed.usage),'Usage identity mismatch');
    same(check.usage_ok,parsed.usageOk,'Usage validity mismatch');same(check.cost_unknown,!parsed.usageOk,'Cost uncertainty mismatch');
    same(check.conservative_peak_cost_cny,parsed.usageOk?(parsed.usage.prompt_tokens*2+parsed.usage.completion_tokens*8)/1e6:null,'Cost estimate mismatch');
    same(check.model,parsed.model,'Model mismatch');same(check.finish_reason,parsed.finishReason,'Completion mismatch');same(check.saw_done,parsed.sawDone,'Terminal mismatch');
    let issue=parsed.error,answer=null;
    if(!issue){try{answer=strictJson(parsed.rawText);validatePacketLedAnswer(answer,context);}catch(e){issue=e.message;answer=null;}}
    same(check.status,issue?'rejected':'validated','Validation status mismatch');same(check.issues,issue?[issue]:[],'Validation issue mismatch');same(check.response,answer,'Validated response mismatch');
    same(summary.results[results.length],check,'Summary case mismatch');
    results.push({id:c.id,status:check.status,issues:check.issues,archive_sha256:hash(bytes),raw_sha256:check.raw_sha256});
  }
  const reviews=[];
  for(const name of ['semantic-review-a.json','semantic-review-b.json']){
    if(!fs.existsSync(path.join(directory,name)))continue;
    const review=read(name);
    if(review.plan_sha256!==hash(fs.readFileSync(path.join(directory,'plan.json')))||review.reviews.length!==results.length||new Set(review.reviews.map(v=>v.case_id)).size!==results.length)throw Error('Review identity mismatch');
    const reportedCounts=[review.actual_responses_reviewed,review.actual_responses].filter(v=>v!==undefined);
    if(!reportedCounts.length||reportedCounts.some(v=>v!==results.length)||review.planned_cases!==plan.planned_calls)throw Error('Review accounting mismatch');
    let quoteCount=0;
    for(const item of review.reviews){
      const c=attempted.find(v=>v.id===item.case_id);if(!c)throw Error('Unknown reviewed case');
      const raw=fs.readFileSync(path.join(directory,c.id+'-response.txt'),'utf8'),answer=strictJson(raw);
      if(item.response_sha256!==hash(raw))throw Error('Reviewed response mismatch');
      same(Object.keys(item.criteria).sort(),plan.review_criteria.map(v=>v.id).sort(),'Review dimensions mismatch');
      for(const criterion of Object.values(item.criteria)){
        if(!['pass','fail','uncertain'].includes(criterion.verdict))throw Error('Review verdict invalid');
        if(typeof criterion.reason!=='string'||!criterion.reason.trim())throw Error('Missing review reason');
        if(criterion.verdict!=='pass'&&!criterion.quotes?.length)throw Error('Missing failure quotation');
        const ids=new Set((contexts.get(c.id).evidence??[]).map(e=>e.id));
        for(const id of criterion.evidence_ids??[])if(!ids.has(id))throw Error('Unknown review evidence ID');
        for(const q of criterion.quotes??[]){
          const value=ownField(answer,q.path);
          if(typeof value!=='string'||q.offset_unit!=='UTF-16'||!Number.isInteger(q.start)||!Number.isInteger(q.end)||q.start<0||q.end<=q.start||q.end>value.length||value.slice(q.start,q.end)!==q.text)throw Error('Review quotation mismatch');
          quoteCount++;
        }
      }
    }
    reviews.push({file:name,reviewed_cases:results.length,dimensions:results.length*6,verified_quotes:quoteCount});
  }
  return {plan_hash:seal.hash,network_calls:0,planned_calls:2,attempted_calls:results.length,verified_cases:results.length,results,reviews,semantic_acceptance:'requires_independent_review',forecast_accuracy:'unassessed'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  console.log(JSON.stringify(await replayPacketLedLive(process.argv[2]),null,2));
}
