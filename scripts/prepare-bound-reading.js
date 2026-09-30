// Offline preparation only; no credential access, provider calls or reservations.
import fs from 'node:fs';
import path from 'node:path';
import {prepareBoundPairs} from '../experiments/reading-quality/bound-pairs.js';
import {sealPlan} from '../experiments/reading-quality/knowledge-pairs.js';
const [directory]=process.argv.slice(2);
if(!directory || process.argv.length!==3)throw Error('Use <new-directory>');
const plan=await prepareBoundPairs();fs.mkdirSync(directory);
for(const [name,value] of [['plan.json',plan],['seal.json',{hash:sealPlan(plan)}]])
  fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
for(const c of plan.cases)for(const arm of c.arms)
  fs.writeFileSync(path.join(directory,arm.id+'-prompt.txt'),arm.body.messages[0].content+'\n\n【输入数据】\n'+arm.body.messages[1].content+'\n',{flag:'wx'});
console.log(JSON.stringify({planned_calls:6,network_calls:0,reservation_made:false,plan_hash:sealPlan(plan)}));
