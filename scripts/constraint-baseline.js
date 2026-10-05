import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {prepareConstraintBaseline} from '../experiments/reading-quality/constraint-baseline.js';
import {reviewTemplate} from '../experiments/reading-quality/semantic-review.js';
const directory=process.argv[2];
if(!directory)throw Error('Usage: node scripts/constraint-baseline.js <new-output-directory>');
const fixture=JSON.parse(await readFile(new URL('../experiments/reading-quality/grounded-exposed-reply.json',import.meta.url),'utf8'));
const {packet,gates}=await prepareConstraintBaseline(fixture);
await mkdir(directory,{recursive:false});
for(const [name,value] of Object.entries({'packet.json':packet,'gates.json':gates,'review-template.json':reviewTemplate(packet)}))
 await writeFile(`${directory}/${name}`,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({directory,cases:packet.cases.length,matched:gates.controls.filter(c=>c.matched).length,network_calls:0}));
