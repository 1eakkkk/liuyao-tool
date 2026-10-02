// A separately frozen, bounded experiment; not a production session or deployment.
import {prepareJudgmentCandidate} from './candidate.js';
import {planHash} from './plan.js';
export const CANDIDATE_PRICE_CHECKED='2026-10-02';
export async function prepareLiveJudgmentCandidate(){
  const offline=await prepareJudgmentCandidate(),plan=structuredClone(offline);
  plan.version='compact-judgment-two-live-development-1';
  plan.offline_candidate_hash=planHash(offline);
  plan.price_checked=CANDIDATE_PRICE_CHECKED;
  plan.live_execution_available=true;
  delete plan.network_calls;
  plan.scope='Two exposed compact-instruction development replies; full production4 user data retained. Not a production4 request, blind test, forecast acceptance or deployment.';
  plan.stop_policy='At most two paid calls, no retries or automatic repairs. Stop on transport, completion, usage or mechanical failure; retain full reservation and failures. Manual semantic review required.';
  return plan;
}
