import {prepareKnowledgePairs,sealPlan} from './knowledge-pairs.js';
import {SOURCED_OUTPUT_VERSION,sourcedOutputInstructions} from './sourced-output.js';
export async function prepareSourcedPairs(profile='three-pairs') {
  const base=await prepareKnowledgePairs({profile}),candidate=structuredClone(base);
  candidate.version='sourced-reading-pairs-dev-1';candidate.output_version=SOURCED_OUTPUT_VERSION;
  candidate.instructions_version='sourced-instructions-dev-1';candidate.base_plan_hash=sealPlan(base);
  candidate.scope='Exposed scoped development cases; candidate source linkage, not blind evaluation or live improvement';
  for(const c of candidate.cases) for(const arm of c.arms) {
    arm.body.messages[0].content=sourcedOutputInstructions()+'\n只回答当前窄问题；保留规则完整来源事实。';
    arm.input_bytes_with_allowance=Buffer.byteLength(JSON.stringify(arm.body.messages),'utf8')+4096;
    if(arm.input_bytes_with_allowance>candidate.input_token_allowance) throw Error('Candidate exceeds unchanged input allowance');
  }
  return candidate;
}
