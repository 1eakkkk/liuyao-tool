// Preparation/export only: no credential loading, reservation or API execution.
import fs from 'node:fs';
import path from 'node:path';
import {prepareKnowledgePairs,sealPlan} from '../experiments/reading-quality/knowledge-pairs.js';
import {SOURCED_OUTPUT_VERSION,sourcedOutputInstructions} from '../experiments/reading-quality/sourced-output.js';
const [directory,profile='three-pairs']=process.argv.slice(2);
if(!directory || process.argv.length>4) throw Error('Use <new-directory> [one-pair|three-pairs]');
const base=await prepareKnowledgePairs({profile});
const candidate=structuredClone(base);
candidate.version='sourced-reading-pairs-dev-1';candidate.output_version=SOURCED_OUTPUT_VERSION;
candidate.instructions_version='sourced-instructions-dev-1';candidate.base_plan_hash=sealPlan(base);
candidate.scope='Exposed scoped development cases; candidate source linkage, not blind evaluation or live improvement';
for(const c of candidate.cases) for(const arm of c.arms) {
  arm.body.messages[0].content=sourcedOutputInstructions()+'\n只回答当前窄问题；保留规则完整来源事实。';
  arm.input_bytes_with_allowance=Buffer.byteLength(JSON.stringify(arm.body.messages),'utf8')+4096;
  if(arm.input_bytes_with_allowance>candidate.input_token_allowance) throw Error('Candidate exceeds unchanged input allowance');
}
const write=(name,value)=>fs.writeFileSync(path.join(directory,name),value,{flag:'wx'});
fs.mkdirSync(directory);
write('plan.json',JSON.stringify(candidate,null,2)+'\n');
write('seal.json',JSON.stringify({hash:sealPlan(candidate)},null,2)+'\n');
for(const c of candidate.cases) for(const arm of c.arms)
  write(`${arm.id}-prompt.txt`,`${arm.body.messages[0].content}\n\n【输入数据】\n${arm.body.messages[1].content}\n`);
console.log(JSON.stringify({cases:candidate.cases.length,planned_calls:candidate.cases.length*2,network_calls:0,
  reservation_made:false,live_executor_available:false,plan_hash:sealPlan(candidate)}));
