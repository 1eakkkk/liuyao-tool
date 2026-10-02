// Offline integrity replay; never reads credentials or invokes a provider.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {planHash} from '../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../src/ai/output/context.js';
import {createEvidenceLedContext,validateEvidenceLedAnswer} from '../experiments/judgment-review/evidence-led.js';
import {parseEvidenceLedSse,strictJson} from './evidence-led-live-pilot.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const same=(a,b,label)=>{if(planHash(a)!==planHash(b))throw Error(label);};
export async function replayEvidenceLedLive(directory){
  const read=name=>strictJson(fs.readFileSync(path.join(directory,name),'utf8'));
  const plan=read('plan.json'),seal=read('seal.json'),summary=read('summary.json');
  same(seal.hash,planHash(plan),'Plan seal mismatch');
  same(summary.plan_hash,seal.hash,'Summary plan mismatch');
  const results=[];
  for(const c of plan.cases){
    const file=path.join(directory,c.id+'-check.json');
    if(!fs.existsSync(file))throw Error('Expected complete six-case archive');
    const check=read(c.id+'-check.json'),archive=read(c.id+'-archive.json');
    const bytes=fs.readFileSync(path.join(directory,c.id+'-raw.sse'));
    if(!archive.complete||archive.sha256!==hash(bytes)||archive.bytes!==bytes.length)throw Error('Provider bytes mismatch');
    const {http_status,...metadata}=archive;
    if(http_status!==200)throw Error('Non-success archive');
    same(check.archive,metadata,'Check archive mismatch');
    same(check.request_hash,planHash(c.body),'Request identity mismatch');
    same(read(c.id+'-attempt.json').request_hash,check.request_hash,'Attempt identity mismatch');
    const context=await createEvidenceLedContext(await buildOutputContext(c.canonical,{includeMissingRecords:true}),c.task);
    same(context.context_id,c.context_id,'Context mismatch');same(check.context_id,c.context_id,'Check context mismatch');
    const parsed=parseEvidenceLedSse(bytes,{inputAllowance:c.input_allowance,maxTokens:c.body.max_tokens});
    same(parsed.rawText,fs.readFileSync(path.join(directory,c.id+'-response.txt'),'utf8'),'Response text mismatch');
    same(check.raw_sha256,hash(parsed.rawText),'Response digest mismatch');
    same(check.usage,parsed.usage,'Usage mismatch');same(check.usage_sha256,parsed.usage===null?null:planHash(parsed.usage),'Usage identity mismatch');
    same(check.model,parsed.model,'Model mismatch');same(check.finish_reason,parsed.finishReason,'Completion mismatch');same(check.saw_done,parsed.sawDone,'Terminal mismatch');
    let issue=parsed.error,answer=null;
    if(!issue){try{answer=strictJson(parsed.rawText);validateEvidenceLedAnswer(answer,context);}catch(e){issue=e.message;answer=null;}}
    same(check.status,issue?'rejected':'validated','Validation status mismatch');same(check.issues,issue?[issue]:[],'Validation issue mismatch');same(check.response,answer,'Validated response mismatch');
    same(summary.results.find(v=>v.id===c.id),check,'Summary case mismatch');
    results.push({id:c.id,status:check.status,issues:check.issues,archive_sha256:hash(bytes),raw_sha256:check.raw_sha256});
  }
  if(summary.attempted_calls!==6||summary.planned_calls!==6||summary.results.length!==6)throw Error('Call accounting mismatch');
  return {plan_hash:seal.hash,network_calls:0,verified_cases:6,results,semantic_acceptance:'requires_independent_review',forecast_accuracy:'unassessed'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  console.log(JSON.stringify(await replayEvidenceLedLive(process.argv[2]),null,2));
}
