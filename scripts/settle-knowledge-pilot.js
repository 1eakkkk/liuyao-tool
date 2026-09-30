// Explicit reconciliation of a closed, fully recorded pilot; unknown calls retain their full reserve.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {sealPlan} from '../experiments/reading-quality/knowledge-pairs.js';
import {textHash,stableJson} from '../src/knowledge/validate.js';
import {accountedCampaignAmount} from './deepseek-campaign-budget.js';
const require=(ok,msg)=>{if(!ok) throw Error(msg);};
export function auditCompletedPilot(directory) {
  const dir=path.resolve(directory),files=[];
  const read=name=>{const raw=fs.readFileSync(path.join(dir,name),'utf8');files.push({name,sha256:textHash(raw)});return JSON.parse(raw);};
  const plan=read('plan.json'),seal=read('seal.json'),execution=read('execution.json'),summary=read('summary.json');
  require(sealPlan(plan)===seal.hash && execution.automatic_retries===false,'Pilot seal or retry policy mismatch');
  require(plan.model==='deepseek-flash' && Number.isFinite(plan.reservation_cny_per_million.input) && Number.isFinite(plan.reservation_cny_per_million.output) &&
    plan.reservation_cny_per_million.input>=2 && plan.reservation_cny_per_million.output>=8,'Unknown historical upper rates');
  const expected=plan.cases.flatMap(c=>c.arms.map(a=>a.id));
  require(summary.attempted_calls===summary.results.length && summary.results.length>0 && summary.planned_calls===expected.length,'Pilot summary incomplete');
  const attempts=fs.readdirSync(dir).filter(f=>f.endsWith('-attempt.json')).map(f=>f.slice(0,-13)).sort();
  require(new Set(expected).size===expected.length && !fs.readdirSync(dir).some(f=>f.endsWith('-failure.json')) &&
    JSON.stringify(attempts)===JSON.stringify(summary.results.map(r=>r.id).sort()),'Unknown or unaccounted attempt');
  let upper=0;
  const seen=new Set();
  for(const [i,r] of summary.results.entries()) {
    require(r.id===expected[i] && !seen.has(r.id) && r.within_reserve===true && !r.cost_unknown,'Unknown call status');seen.add(r.id);
    const attempt=read(`${r.id}-attempt.json`),response=read(`${r.id}-response.json`),check=read(`${r.id}-check.json`),u=response.usage;
    require(attempt.model===plan.model && response.model===plan.model && response.finish_reason==='stop' && check.id===r.id &&
      stableJson(check)===stableJson(r) && stableJson(u)===stableJson(r.usage),'Response or check mismatch');
    require(Number.isSafeInteger(u?.prompt_tokens) && u.prompt_tokens>=0 && u.prompt_tokens<=plan.input_token_allowance &&
      Number.isSafeInteger(u?.completion_tokens) && u.completion_tokens>=0 && u.completion_tokens<=plan.max_output_tokens,'Unknown usage');
    upper+=(u.prompt_tokens*plan.reservation_cny_per_million.input+u.completion_tokens*plan.reservation_cny_per_million.output)/1e6;
  }
  // Keep one fen for rounding. This is a conservative usage estimate, not exact billed cost.
  const accounted=Number((upper+0.01).toFixed(6));
  require(accounted<=plan.reserve_cny,'Usage cannot reduce this reserve');
  const audit={run:dir,planHash:seal.hash,original_amount:plan.reserve_cny,accounted_cny:accounted,
    usage_upper_cny:upper,rounding_pad_cny:0.01,exact_billed_cost_cny:null,attempted_calls:summary.results.length,
    unattempted_calls:expected.length-summary.results.length,files};
  return {...audit,evidence_hash:textHash(stableJson(audit))};
}
export function settlePilot(ledger,directory) {
  const fd=fs.openSync(`${ledger}.lock`,'wx');
  try {
    const state=JSON.parse(fs.readFileSync(ledger,'utf8'));accountedCampaignAmount(state);
    const audit=auditCompletedPilot(directory),r=state.reservations.find(r=>r.run===audit.run);
    require(r && r.planHash===audit.planHash && r.amount===audit.original_amount,'Reservation mismatch');
    require(!(state.settlements??[]).some(s=>s.run===audit.run),'Pilot already settled');
    state.settlements=[...(state.settlements??[]),{...audit,settled_at:new Date().toISOString()}];
    const accounted=accountedCampaignAmount(state);require(accounted<=state.limit_cny,'Campaign exceeded');
    fs.writeFileSync(ledger,JSON.stringify(state,null,2)+'\n');
    return {audit,accounted_cny:accounted,remaining_unreserved_cny:state.limit_cny-accounted};
  } finally {fs.closeSync(fd);fs.unlinkSync(`${ledger}.lock`);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode,dir,ledger]=process.argv.slice(2);
  if(mode==='audit' && dir && !ledger) console.log(JSON.stringify(auditCompletedPilot(dir)));
  else if(mode==='settle' && dir && ledger) console.log(JSON.stringify(settlePilot(ledger,dir)));
  else throw Error('Use audit <pilot-directory> or settle <pilot-directory> <ledger>');
}
