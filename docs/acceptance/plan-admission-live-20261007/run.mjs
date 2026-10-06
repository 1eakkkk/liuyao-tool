import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn} from '../../src/ai/output/session.js';
import {strictReadingRequest,receiveStrictReading} from '../../src/ai/output/strict-transport.js';
import {readingAvailability} from '../../src/ai/output/availability.js';
import {reserveCampaign,accountedCampaignAmount} from '../../scripts/deepseek-campaign-budget.js';
import {archiveProviderBody} from '../../scripts/judgment-live-pilot.js';

const dir=path.dirname(fileURLToPath(import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const write=(name,value)=>{const p=path.join(dir,name);if(fs.existsSync(p))throw Error(`Refusing to overwrite ${name}`);fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');};
const bytes=fs.readFileSync(path.join(dir,'plan.json')),plan=JSON.parse(bytes),seal=fs.readFileSync(path.join(dir,'plan.sha256'),'utf8').trim();
if(sha(bytes)!==seal)throw Error('Plan seal mismatch');
if(plan.version!=='plan-admission-live-1'||plan.maxCalls!==1||plan.policy.basis!==4||plan.policy.judgment!==6||plan.automaticRetries!==false||plan.previousStageClosed!==true)throw Error('Plan config rejected');
if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==plan.sourceCommit)throw Error('Source drift');
if(execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim())throw Error('Dirty worktree during acceptance');
if(fs.existsSync(path.join(dir,'plan-covered-attempt.json')))throw Error('Replay denied');
const c=plan.cases[0];
const prepare=async question=>prepareSelectedReadingTurn(createReadingSession(c.canonical,{style:'brief',custom:''}),question,{judgmentPolicyVersion:6,groundingPolicyVersion:2,basisPolicyVersion:4});

// The two no-call expectations are verified here: they must be blocked, so no request is built.
const blocked=[];
for(const b of plan.blockedCases){
 const p=await prepare(b.question),availability=readingAvailability(p.context);
 if(availability.kind!==b.expectKind||availability.blocked!==true)throw Error(`Blocked expectation drift: ${b.id} -> ${availability.kind}`);
 if(availability.title!==b.availability.title||availability.message!==b.availability.message)throw Error(`Blocked message drift: ${b.id}`);
 blocked.push({id:b.id,kind:availability.kind,blocked:availability.blocked,calls:0});
}
// The covered case must rebuild byte-identical to the frozen request.
const prepared=await prepare(c.question),rebuilt=strictReadingRequest(prepared);
if(prepared.context.context_id!==c.context.context_id||JSON.stringify(rebuilt.body)!==JSON.stringify(c.body)||rebuilt.endpoint!==c.endpoint)throw Error('Request drift');

const ledger=path.join(dir,'budget.json');
fs.writeFileSync(ledger,JSON.stringify({limit_cny:plan.budgetCny,reservations:[]},null,2)+'\n',{flag:'wx'});
if(accountedCampaignAmount(JSON.parse(fs.readFileSync(ledger,'utf8')))+plan.reserveCny>plan.budgetCny)throw Error('Budget floor');
const envPath='D:/桌面/liuyao/liuyao-tool/.env.deepseek.local';
const key=fs.readFileSync(envPath,'utf8').split(/\r?\n/).find(l=>l.trim().startsWith('DEEPSEEK_API_KEY='))?.slice(-35).trim();
if(!key||/[\r\n]/.test(key))throw Error('Credential unavailable');
const headers={Authorization:`Bearer ${key}`};
async function balance(){const r=await fetch('https://api.deepseek.com/user/balance',{headers,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Balance unavailable');const d=await r.json(),n=Number(d.balance_infos?.find(x=>x.currency==='CNY')?.total_balance);if(!d.is_available||!Number.isFinite(n))throw Error('Balance unavailable');return n;}
const before=await balance();
if(before<plan.reserveCny+plan.walletFloor)throw Error('Wallet floor');
const reservation=reserveCampaign(ledger,{run:dir,amount:plan.reserveCny,planHash:seal});
write('execution.json',{started:new Date().toISOString(),planHash:seal,balanceBefore:before,reservation,automaticRetries:false,blockedVerified:blocked});
write(`${c.id}-attempt.json`,{started:new Date().toISOString(),requestHash:sha(JSON.stringify(c.body)),retry:false,endpoint:c.endpoint});
try{
 const signal=AbortSignal.timeout(180000);
 const r=await fetch(c.endpoint,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(c.body),redirect:'error',signal});
 const archive=await archiveProviderBody(r.body,path.join(dir,`${c.id}-provider.json`),{redact:key,limit:8*1024*1024});
 write(`${c.id}-archive.json`,{httpStatus:r.status,...archive.metadata});
 if(!r.ok||!archive.metadata.complete)throw Error('HTTP or incomplete body');
 const answer=await receiveStrictReading(new Response(archive.data),prepared.context,signal);
 fs.writeFileSync(path.join(dir,`${c.id}-response.txt`),answer.rawText,{flag:'wx'});
 const turn=appendReadingTurn(createReadingSession(c.canonical,{style:'brief',custom:''}),prepared,answer.rawText,answer.completed,'api',null,{completion:answer.completion});
 const u=answer.usage;
 const usageOk=Number.isSafeInteger(u?.prompt_tokens)&&u.prompt_tokens>=0&&u.prompt_tokens<=c.inputAllowance&&Number.isSafeInteger(u?.completion_tokens)&&u.completion_tokens>=0&&u.completion_tokens<=c.body.max_tokens;
 write(`${c.id}-check.json`,{id:c.id,status:turn.result.status,issues:turn.result.issues,completion:answer.completion,usage:u,usageOk,
  conservativePeakCostCny:usageOk?(u.prompt_tokens*plan.peakInputPrice+u.completion_tokens*plan.peakOutputPrice)/1e6:null,
  availability:c.availability,admitted:c.admitted,schemaSummary:c.schemaSummary,answer:turn.result.answer,rawSha256:sha(answer.rawText),noAutomaticRetries:true});
 console.log(JSON.stringify({id:c.id,status:turn.result.status,issues:turn.result.issues,completion:answer.completion,upperCost:(usageOk?(u.prompt_tokens*plan.peakInputPrice+u.completion_tokens*plan.peakOutputPrice)/1e6:null)}));
}catch(error){
 write(`${c.id}-failure.json`,{status:'transport_or_processing_failed',retry:false,costUnknown:true,message:String(error.message)});
 throw Error('Request failed; archive preserved, no retry');
}
