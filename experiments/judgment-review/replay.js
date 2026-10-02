// Integrity of human review records, not automatic semantic judgment.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {planHash,reviewCriteria} from './plan.js';
import {prepareLiveJudgmentCandidate} from './live-candidate.js';
import {createReadingSession,prepareReadingTurn,appendReadingTurn} from '../../src/ai/output/session.js';
import {parseOutputSse} from '../../src/ai/output/sse.js';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const digest=raw=>createHash('sha256').update(raw).digest('hex');
function fieldKeys(expression){
  const keys=expression.replace(/^\$\.?/,'').replace(/\[(\d+)\]/g,'.$1').split('.');
  need(keys.every(k=>/^[a-z_]+$|^\d+$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)),'Invalid quote field');
  return keys;
}
// Exact JSON token ranges, including duplicate natural-language phrases in different fields.
function stringRanges(raw){
  let index=0;const ranges=new Map(),space=()=>{while(/\s/.test(raw[index]??'')&&index<raw.length)index++;};
  function string(){const start=index++;while(index<raw.length){const ch=raw[index++];if(ch==='\\')index++;else if(ch==='"')return {start,end:index,value:JSON.parse(raw.slice(start,index))};}throw Error('Unterminated JSON string');}
  function value(keys,pairStart=index){
    space();const start=index,ch=raw[index];
    if(ch==='"'){const token=string();ranges.set(keys.join('.'),{start:token.start+1,end:token.end-1,pairStart,pairEnd:token.end});return;}
    if(ch==='{'){
      index++;space();if(raw[index]==='}'){index++;return;}
      while(index<raw.length){space();const key=string();space();need(raw[index++]===':','Invalid JSON object');space();value([...keys,key.value],key.start);space();const next=raw[index++];if(next==='}')return;need(next===',','Invalid JSON separator');}
    }else if(ch==='['){
      index++;space();if(raw[index]===']'){index++;return;}
      for(let n=0;index<raw.length;n++){space();value([...keys,String(n)],index);space();const next=raw[index++];if(next===']')return;need(next===',','Invalid JSON separator');}
    }else{while(index<raw.length&&!/[\s,}\]]/.test(raw[index]))index++;need(index>start,'Invalid JSON value');return;}
    throw Error('Incomplete JSON');
  }
  value([]);space();need(index===raw.length,'Unexpected JSON tail');return ranges;
}
export async function replayJudgmentReview(directory){
  const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
  const planBytes=fs.readFileSync(path.join(directory,'plan.json')),plan=JSON.parse(planBytes),seal=read('seal.json');
  const compact=plan.version==='compact-judgment-two-live-development-1';
  need(planHash(plan)===seal.hash&&(compact||plan.reading_prompt==='reading-production-4'),'Frozen plan mismatch');
  const candidate=compact?await prepareLiveJudgmentCandidate():null;
  if(compact)need(planHash(candidate)===seal.hash,'Compact plan identity mismatch');
  need(planHash(plan.review_criteria)===planHash(reviewCriteria),'Review criteria changed');
  const inputs=new Map();
  for(const c of plan.cases){
    need(/^[a-z-]+$/.test(c.id),'Invalid case ID');
    const raw=fs.readFileSync(path.join(directory,c.id+'-response.txt'),'utf8'),check=read(c.id+'-check.json');
    const session=createReadingSession(c.canonical,{style:'brief',custom:''});session.prompt=compact?plan.source_reading_prompt:plan.reading_prompt;
    const prepared=await prepareReadingTurn(session,c.question);
    const messages=compact?candidate.cases.find(v=>v.id===c.id)?.body.messages:prepared.messages;
    need(planHash(messages)===planHash(c.body.messages)&&prepared.context.context_id===c.context_id,'Production replay input mismatch');
    need(digest(raw)===check.raw_sha256,'Raw reply hash mismatch');
    const result=appendReadingTurn(session,prepared,raw,check.saw_done&&check.finish_reason==='stop'&&!check.transport_error,'api').result;
    need(result.status===check.status&&planHash(result.answer)===planHash(check.response),'Mechanical replay mismatch');
    const archive=read(c.id+'-archive.json'),bytes=fs.readFileSync(path.join(directory,c.id+'-raw.sse'));
    need(archive.complete===true&&archive.bytes===bytes.length&&archive.sha256===digest(bytes),'SSE archive mismatch');
    const {http_status,...archiveMetadata}=archive;
    need(planHash(check.archive)===planHash(archiveMetadata),'Archive metadata mismatch');
    async function* frozenStream(){yield bytes;}
    const parsed=await parseOutputSse(frozenStream(),prepared.context);
    need(parsed.rawText===raw&&planHash(parsed.usage)===planHash(check.usage)&&parsed.finishReason===check.finish_reason&&
      parsed.sawDone===check.saw_done&&parsed.error===check.transport_error,'SSE replay differs from recorded reply');
    inputs.set(c.id,{raw,answer:JSON.parse(raw),ranges:stringRanges(raw),check,evidence:new Set(prepared.context.evidence.map(e=>e.id))});
  }
  const reviewers=['reviewer-a.json','reviewer-b.json'].map(read),ids=new Set();
  for(const r of reviewers){
    need(typeof r.reviewer_id==='string'&&!ids.has(r.reviewer_id),'Independent reviewer IDs required');ids.add(r.reviewer_id);
    need(planHash(r.review_criteria??r.criteria)===planHash(plan.review_criteria),'Reviewer criteria mismatch');
    need(r.cases.length===inputs.size&&new Set(r.cases.map(c=>c.case_id)).size===inputs.size,'Review cases incomplete');
    if(r.inputs?.plan_sha256)need(r.inputs.plan_sha256===digest(planBytes),'Review input hash mismatch');
    for(const c of r.cases){
      const input=inputs.get(c.case_id);need(!!input,'Unknown review case');
      const expectedHash=c.response_sha256??r.inputs?.responses?.find(v=>v.case_id===c.case_id)?.raw_sha256;
      need(expectedHash===digest(input.raw),'Reviewer reply hash mismatch');
      need(Object.keys(c.dimensions).sort().join()===reviewCriteria.map(d=>d.id).sort().join(),'Review dimensions incomplete');
      for(const d of Object.values(c.dimensions)){
        need(['pass','fail','uncertain'].includes(d.verdict??d.status)&&typeof d.reason==='string'&&d.reason.trim(),'Invalid manual verdict');
        need(Array.isArray(d.quotes)&&d.quotes.length>0,'Manual verdict needs original quotes');
        for(const q of d.quotes){
          need(Number.isSafeInteger(q.start)&&Number.isSafeInteger(q.end)&&q.start>=0&&q.end>q.start&&
            typeof q.text==='string'&&input.raw.slice(q.start,q.end)===q.text,'Original quote mismatch');
          const keys=fieldKeys(q.field??q.path),field=keys.reduce((v,k)=>v?.[k],input.answer),range=input.ranges.get(keys.join('.'));
          const directionPair=['direction','$.direction'].includes(q.field??q.path)&&
            typeof field==='string'&&new RegExp(`^"direction"\\s*:\\s*"${field}"$`).test(q.text);
          need(typeof field==='string'&&(field.includes(q.text)||directionPair),'Quote belongs to different field');
          need(range&&q.start>=(directionPair?range.pairStart:range.start)&&q.end<=(directionPair?range.pairEnd:range.end),'Quote offset belongs to different field');
        }
        for(const id of d.evidence_ids??[])need(input.evidence.has(id),'Unknown review evidence');
      }
    }
  }
  const cases=[...inputs].map(([id,input])=>({case_id:id,mechanical:input.check.status,model_direction:input.answer.direction,
    dimensions:Object.fromEntries(reviewCriteria.map(({id:dimension})=>{
      const by_reviewer=reviewers.map(r=>({reviewer:r.reviewer_id,verdict:(r.cases.find(c=>c.case_id===id).dimensions[dimension].verdict??r.cases.find(c=>c.case_id===id).dimensions[dimension].status)}));
      return [dimension,{by_reviewer,conservative_status:by_reviewer.some(v=>v.verdict==='fail')?'fail':by_reviewer.some(v=>v.verdict==='uncertain')?'uncertain':'pass'}];
    }))}));
  return {version:'judgment-review-replay-1',plan_hash:seal.hash,quote_integrity:'passed',cases,
    semantic_acceptance:cases.every(c=>Object.values(c.dimensions).every(d=>d.conservative_status==='pass'))?'accepted_in_this_development_sample':'not_established',
    forecast_accuracy:'unassessed',blind:false,overall_improvement:'unassessed'};
}
