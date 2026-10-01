// Fixed, reviewed single-call entry point. Preparing does not read credentials.
import fs from 'node:fs';
import path from 'node:path';
import {prepareLiveBoundOne} from '../experiments/reading-quality/bound-live-one.js';
import {checkBoundOutput} from '../experiments/reading-quality/bound-reading.js';
import {sealPlan} from '../experiments/reading-quality/knowledge-pairs.js';
const [mode,directory]=process.argv.slice(2);
if(!['prepare','execute'].includes(mode)||!directory||process.argv.length!==4)throw Error('Use prepare|execute <new-directory>');
const plan=await prepareLiveBoundOne();
if(mode==='prepare'){
  fs.mkdirSync(directory);
  for(const [name,value] of [['plan.json',plan],['seal.json',{hash:sealPlan(plan)}]])
    fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const arm=plan.cases[0].arms[0];
  fs.writeFileSync(path.join(directory,arm.id+'-prompt.txt'),arm.body.messages[0].content+'\n\n【输入数据】\n'+arm.body.messages[1].content+'\n',{flag:'wx'});
  console.log(JSON.stringify({planned_calls:1,reserve_cny:plan.reserve_cny,network_calls:0,reservation_made:false,plan_hash:sealPlan(plan)}));
}else{
  const {executeFixedSourcedPilot}=await import('./sourced-pilot-runtime.js');
  await executeFixedSourcedPilot(directory,plan,checkBoundOutput);
}
