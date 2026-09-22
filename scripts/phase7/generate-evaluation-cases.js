// Explicit pre-answer generation only. Existing frozen files are never overwritten.
import fs from 'node:fs';
import { regenerate, conditionHits, assertFresh, digest } from './evaluation-cases.js';
import { evaluateRules } from '../../src/rules/engine.js';
import { readCorpus } from '../../src/knowledge/load.js';
import { buildKnowledgePair } from '../../src/ai/knowledge-input.js';
import { REVIEW_SCHEMA } from './evaluation-review-schema.js';
import { getTodayJiaziIndex } from '../../src/core/ganzhi.js';
const specs=[
 ['ying_generates','shi-ying','shiying-scope','我想请合作方帮忙推进申请。这里世应的生扶方向怎么理解，能说明对方一定会帮我吗？','如果换成我替对方办事，还能沿用刚才的解释吗？',['生扶方向正确','联系所问帮助对象解释','不能把关系当实际行动保证']],
 ['shi_generates','shi-ying','shiying-scope','我准备替朋友联系一个机会，世生应在这件事里表示什么？','那是不是所有占问遇到世生应，都表示自己吃亏？',['不颠倒生扶方向','明确彼此之事的解释范围','拒绝推广到所有占问']],
 ['month_clash','month-break','month-clash','这爻月破，是不是就永远没有用了？','那你能只凭月破，确定它以后都不能起作用吗？',['区分月建相冲事实与效力解释','拒绝永远无用的无条件推论','说明单一关系不足以判断实际效力']],
 ['month_combine','month-combine','month-combine','这里月合，是不是说明这件事肯定有利？','“有用”能不能直接理解为事情一定成功？',['月合关系正确','区分文献评价与程序事实','不能从月合推出必成']],
 ['static_day_clash','day-clash','day-clash-context','这个静爻受日冲，是不是就是被冲散了？','如果它的月令显示旺，就能直接认定是暗动吗？',['日冲不能一概解释为冲散','区分条件性解释与已确定事实','月令不等于综合旺衰，不能直接认定暗动']],
 ['advance','advance','advance-definition','这个动爻化进，是不是可以直接当成好消息？','不知道它在所问事情里代表什么，也能说化进必吉吗？',['本变方向正确','化进定义与吉凶评价分开','不自动选择用神或断吉']],
 ['retreat','retreat','retreat-definition','这个动爻化退，是不是说明事情一定会变差？','不管这个爻代表的是帮助还是阻碍，都一定不好吗？',['本变方向正确','拒绝化退必凶','保留评价所需的语境前提']],
 ['jiazi_void','xunkong','void-definition','这个爻标了旬空，是不是就等于完全不存在、可以删掉？','如果后来认为它仍能起作用，是不是要把原来的旬空标记去掉？',['解释旬空的历法标记性质','旬空不等于爻不存在','后续效力解释不能清除原旬空字段']],
 ['void','xunkong','void-definition','请只列出本卦与变卦名称，以及动爻位置，不判断吉凶。','请再核对一次动爻位置，仍只回答盘面信息。',['本卦与变卦名称正确','动爻位置正确','按要求只回答盘面信息']],
 ['month_combine','month-combine','month-combine','请只说明世爻、应爻各在几爻，以及两者五行的生克方向。','请确认谁生谁、谁克谁，不扩展到事情成败。',['世应位置正确','五行关系方向正确','不扩展为成败判断']],
 ['return','return-relation',null,'请说明这里回头生克的作用方向，这条关系本身能确定事情成败吗？','只根据这条关系，哪些结论还不能确定？',['主爻与变爻身份正确','回头作用方向正确','局部关系不足以确定最终成败']],
 ['hidden','flying-hidden',null,'请说明飞神与伏神之间是谁生谁或谁克谁。','仅有这条关系，能保证伏神一定发挥作用吗？',['飞伏身份正确','飞伏生克方向正确','不能仅凭关系保证实际效力']],
];
const corpus=readCorpus(),cases=[];
const oldTZ=process.env.TZ;process.env.TZ='Asia/Shanghai';
try {
 for(const [index,s]of specs.entries()){
  const [condition,concept,unit,question,follow_up,checks]=s,case_id=`case-${String(index+1).padStart(2,'0')}`;
  // Dates are fixed away from solar-term boundaries. Case 08 finds a real Jiazi-cycle day.
  let now=new Date(`2026-10-${String(12+index).padStart(2,'0')}T12:00:00+08:00`);
  if(index===7)while(getTodayJiaziIndex(now)>9)now=new Date(now.getTime()+86400000);
  const timestamp=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T12:00:00+08:00`;
  let chosen;
  for(let step=0;step<4096;step++){
   // Permutation of the finite legal six-line input space, unrelated to any model response.
   let n=(step*277+index*179+917)%4096;
   const sums=Array.from({length:6},()=>{const v=6+n%4;n=Math.floor(n/4);return v;});
   const recipe={sums,timestamp,timezone:'Asia/Shanghai',explicit_day_index:getTodayJiaziIndex(now)};
   const canonical=regenerate(recipe,question,case_id),rule_result=evaluateRules(canonical);
   if(!conditionHits(canonical,rule_result,condition).length)continue;
   const candidate={recipe,canonical};try{assertFresh([...cases,candidate]);}catch{continue;}
   const query={concepts:[concept],limit:100};
   const pair=buildKnowledgePair({canonical,corpus,case_id,query});
   const selected_ids=unit?[`zsby-${unit}-001`]:[];
   if(JSON.stringify(selected_ids)!==JSON.stringify(pair.archive.selected_knowledge_ids))continue;
   const checklist=checks.map((statement,j)=>({checklist_id:`${case_id}-C${j+1}`,statement,
    turns:index===8&&j===0?['initial']:index===4&&j===2?['follow_up']:['initial','follow_up'],
    reason:'用户问题直接要求此项；两组相同，不要求引用古籍，不评价预测准确率。'}));
   chosen={case_id,case_type:index<8?'explanation_boundary':index<10?'low_gain':'zero_match',category:concept,
    condition,question,follow_up,query,recipe,canonical,rule_result,checklist,checklist_hash:digest(checklist),
    known_traps:checks,rationale:index<8?'检验定义、方向、条件和解释边界；不能将引用当独立事实。':index<10?'窄问题下保留合法但非必要文献，检验无关扩展。':'相关文献未准入，不得补入或提升审核状态。',
    expected:{selected_ids,zero_match:!unit,archive:pair.archive}};break;
  }
  if(!chosen)throw Error(`No legal recipe for ${case_id}`);cases.push(chosen);
 }
} finally {if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;}
const data={version:'phase7-unseen-v1',rubric_version:'blind-review-v2',base_commit:'a8c8dbb701ec2962ca40287f9c94f6a89bb78536',
 purpose:'Pre-answer targeted diagnostic cases; frozen manual concept queries; no prediction accuracy or retrieval recall evaluation.',cases};
// Closed structural schema inferred across the complete snapshot; semantic replay is mandatory too.
function schema(values){
 const types=[...new Set(values.map(v=>v===null?'null':Array.isArray(v)?'array':typeof v))];
 const out={type:types.length===1?types[0]:types};
 if(types.includes('object')){const objects=values.filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
  const keys=[...new Set(objects.flatMap(Object.keys))];out.properties=Object.fromEntries(keys.map(k=>[k,schema(objects.filter(v=>k in v).map(v=>v[k]))]));out.required=keys.filter(k=>objects.every(v=>k in v));out.additionalProperties=false;}
 if(types.includes('array'))out.items=values.filter(Array.isArray).flat().length?schema(values.filter(Array.isArray).flat()):{type:['string','number','boolean','null']};
 return out;
}
const caseSchema=schema([data]);caseSchema.properties.cases.minItems=12;caseSchema.properties.cases.maxItems=12;
caseSchema.properties.cases.items.properties.recipe.properties.sums={type:'array',minItems:6,maxItems:6,items:{enum:[6,7,8,9]}};
const dir='experiments/phase7/evaluation/';
for(const [name,value]of Object.entries({'cases.json':data,'cases.schema.json':caseSchema,'review.schema.json':REVIEW_SCHEMA,'manifest.json':{cases_hash:digest(data),external_answers:0,case_count:12}}))fs.writeFileSync(dir+name,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(cases.map(c=>({id:c.case_id,recipe:c.recipe,hits:conditionHits(c.canonical,c.rule_result,c.condition).map(h=>[h.rule_id,h.target.line]),selected:c.expected.selected_ids,chars:c.expected.archive.prompt_chars,delta:c.expected.archive.delta_percent})),null,2));
