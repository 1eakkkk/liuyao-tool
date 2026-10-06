import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReadingSession,prepareSelectedReadingTurn} from '../../../src/ai/output/session.js';
import {strictReadingRequest} from '../../../src/ai/output/strict-transport.js';
import {readingAvailability} from '../../../src/ai/output/availability.js';

const dir=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(path.join(dir,'plan.json')),plan=JSON.parse(bytes),seal=fs.readFileSync(path.join(dir,'plan.sha256'),'utf8').trim();
console.log('seal match      :',sha(bytes)===seal);
console.log('HEAD            :',execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
console.log('sourceCommit    :',plan.sourceCommit);
console.log('dirty tracked   :',JSON.stringify(execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim()));
const c=plan.cases[0];
const prepared=await prepareSelectedReadingTurn(createReadingSession(c.canonical,{style:'brief',custom:''}),c.question,{judgmentPolicyVersion:6,groundingPolicyVersion:2,basisPolicyVersion:4});
const rebuilt=strictReadingRequest(prepared);
console.log('context id ok   :',prepared.context.context_id===c.context.context_id);
console.log('body identical  :',JSON.stringify(rebuilt.body)===JSON.stringify(c.body));
console.log('endpoint ok     :',rebuilt.endpoint===c.endpoint);
for(const b of plan.blockedCases){
 const p=await prepareSelectedReadingTurn(createReadingSession(b.canonical,{style:'brief',custom:''}),b.question,{judgmentPolicyVersion:6,groundingPolicyVersion:2,basisPolicyVersion:4});
 const a=readingAvailability(p.context);
 console.log(`blocked ${b.id}: kind=${a.kind} matches=${a.kind===b.expectKind} blocked=${a.blocked===true} calls=0`);
}
console.log('maxCalls/reserve:',plan.maxCalls,plan.reserveCny,'budget',plan.budgetCny,'floor',plan.walletFloor);
