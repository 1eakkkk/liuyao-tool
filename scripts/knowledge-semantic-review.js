import fs from 'node:fs';
import path from 'node:path';
import {prepareReviewPacket,reviewTemplate,summarizeReviews} from '../experiments/reading-quality/semantic-review.js';
const [action,...args]=process.argv.slice(2);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
if(action==='prepare' && args.length===2) {
  const packet=prepareReviewPacket(read(args[0]));
  fs.mkdirSync(args[1]);
  write(path.join(args[1],'packet.json'),packet);write(path.join(args[1],'review-template.json'),reviewTemplate(packet));
  console.log(JSON.stringify({responses:packet.cases.length,packet_hash:packet.packet_hash,network_calls:0}));
} else if(action==='summarize' && args.length>=3) {
  const [packetFile,output,...reviewFiles]=args;
  const report=summarizeReviews(read(packetFile),reviewFiles.map(read));write(output,report);
  console.log(JSON.stringify(report));
} else throw Error('Use prepare <archive.json> <new-directory> or summarize <packet.json> <new-output.json> <review.json>...');
