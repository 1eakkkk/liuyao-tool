// Offline-only: does not read credentials, call providers or mutate budget records.
import fs from 'node:fs';
import path from 'node:path';
import {prepareClarityPairs} from '../experiments/reading-quality/sourced-clarity.js';
import {sealPlan} from '../experiments/reading-quality/knowledge-pairs.js';
const [directory]=process.argv.slice(2);
if(!directory || process.argv.length!==3) throw Error('Use <new-directory>');
const plan=await prepareClarityPairs();fs.mkdirSync(directory);
const write=(name,value)=>fs.writeFileSync(path.join(directory,name),value,{flag:'wx'});
write('plan.json',JSON.stringify(plan,null,2)+'\n');write('seal.json',JSON.stringify({hash:sealPlan(plan)},null,2)+'\n');
write('rubric.json',JSON.stringify(plan.evaluation,null,2)+'\n');
for(const c of plan.cases) for(const arm of c.arms)
  write(`${arm.id}-prompt.txt`,`${arm.body.messages[0].content}\n\n【输入数据】\n${arm.body.messages[1].content}\n`);
console.log(JSON.stringify({cases:plan.cases.length,planned_calls:plan.cases.length*2,network_calls:0,
  reservation_made:false,live_executor_available:false,plan_hash:sealPlan(plan)}));
