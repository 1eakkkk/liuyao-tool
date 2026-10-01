// One exposed monthly-combine case; no retries or model-improvement claim.
import {prepareBoundPairs} from './bound-pairs.js';
import {sealPlan} from './knowledge-pairs.js';
export async function prepareLiveBoundOne(){
  const base=await prepareBoundPairs(),plan=structuredClone(base);
  plan.version='source-bound-one-live-dev-3';plan.profile='bound-month-combine-one';
  plan.base_plan_hash=sealPlan(base);plan.price_checked='2026-10-01';
  plan.price_source='https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
  plan.checked_peak_cny_per_million={input:2,output:8};
  plan.input_token_allowance=20000;
  plan.cases=plan.cases.filter(c=>c.id==='month-combine');
  if(plan.cases.length!==1)throw Error('Fixed case missing');
  plan.cases[0].arms=plan.cases[0].arms.filter(a=>a.arm==='with-literature');
  if(plan.cases[0].arms.length!==1)throw Error('Fixed literature arm missing');
  for(const arm of plan.cases[0].arms)
    if(arm.input_bytes_with_allowance>plan.input_token_allowance)throw Error('Fixed input exceeds allowance');
  plan.reserve_cny=(plan.input_token_allowance*plan.reservation_cny_per_million.input+
    plan.max_output_tokens*plan.reservation_cny_per_million.output)/1e6;
  plan.scope='One exposed development reply, not a paired, blind or old-versus-new comparison';
  plan.execution_policy={preparation_only:false,live_executor_available:true,automatic_retries:false,max_calls:1,
    stopping_rule:'Stop after one attempt. Preserve raw reply and failures; independent reviews of omissions, attribution and support. No production promotion.'};
  return plan;
}
