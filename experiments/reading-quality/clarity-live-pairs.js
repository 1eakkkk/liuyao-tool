// Fixed small paid test plan; no production changes or automatic retries.
import {prepareClarityPairs} from './sourced-clarity.js';
import {sealPlan} from './knowledge-pairs.js';
export async function prepareLiveClarityPairs(){
  const base=await prepareClarityPairs(),plan=structuredClone(base);
  plan.version='sourced-clarity-live-pairs-dev-2';plan.profile='clarity-two-pairs';
  plan.base_plan_hash=sealPlan(base);plan.cases=plan.cases.filter(c=>['month-combine','void'].includes(c.id));
  plan.scope='Two exposed development topics, month combine and void; not blind acceptance or old-versus-new comparison';
  plan.reserve_cny=plan.cases.length*2*(plan.input_token_allowance*plan.reservation_cny_per_million.input+
    plan.max_output_tokens*plan.reservation_cny_per_million.output)/1e6;
  plan.execution_policy={preparation_only:false,live_executor_available:true,automatic_retries:false,max_calls:4,
    stopping_rule:'Stop at mechanical/request failure; no repeated generation. After four calls, two independent reviews of facts, scope, support, attribution. Any fail or uncertainty leaves acceptance unestablished. No production promotion from exposed cases.'};
  return plan;
}
