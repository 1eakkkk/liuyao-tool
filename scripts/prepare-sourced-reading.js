// Preparation/export only: no credential loading, reservation or API execution.
import fs from 'node:fs';
import path from 'node:path';
import {sealPlan} from '../experiments/reading-quality/knowledge-pairs.js';
import {prepareSourcedPairs} from '../experiments/reading-quality/sourced-pairs.js';
const [directory,profile='three-pairs']=process.argv.slice(2);
if(!directory || process.argv.length>4) throw Error('Use <new-directory> [one-pair|three-pairs]');
const candidate=await prepareSourcedPairs(profile);
const write=(name,value)=>fs.writeFileSync(path.join(directory,name),value,{flag:'wx'});
fs.mkdirSync(directory);
write('plan.json',JSON.stringify(candidate,null,2)+'\n');
write('seal.json',JSON.stringify({hash:sealPlan(candidate)},null,2)+'\n');
for(const c of candidate.cases) for(const arm of c.arms)
  write(`${arm.id}-prompt.txt`,`${arm.body.messages[0].content}\n\n【输入数据】\n${arm.body.messages[1].content}\n`);
console.log(JSON.stringify({cases:candidate.cases.length,planned_calls:candidate.cases.length*2,network_calls:0,
  reservation_made:false,live_executor_available:profile==='one-pair',
  live_executor_scope:'one-pair only; separate explicit execution',plan_hash:sealPlan(candidate)}));
