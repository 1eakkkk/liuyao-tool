// Explicit prepare/execute separation. Preparing does not read Key or reserve funds.
import fs from 'node:fs';
import path from 'node:path';
import {prepareLiveClarityPairs} from '../experiments/reading-quality/clarity-live-pairs.js';
import {sealPlan} from '../experiments/reading-quality/knowledge-pairs.js';
const [mode,directory]=process.argv.slice(2);
if(!['prepare','execute'].includes(mode) || !directory || process.argv.length!==4) throw Error('Use prepare|execute <directory>');
const plan=await prepareLiveClarityPairs();
if(mode==='prepare'){
  fs.mkdirSync(directory);
  for(const [name,value] of [['plan.json',plan],['seal.json',{hash:sealPlan(plan)}]])
    fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({planned_calls:4,reserve_cny:plan.reserve_cny,plan_hash:sealPlan(plan),network_calls:0,reservation_made:false}));
}else{
  const {executeFixedSourcedPilot}=await import('./sourced-pilot-runtime.js');
  await executeFixedSourcedPilot(directory,plan);
}
