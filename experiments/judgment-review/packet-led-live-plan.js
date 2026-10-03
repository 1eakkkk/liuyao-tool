// Two fixed new manual fixtures; freeze before answers, never tune from their output.
import {buildCanonicalCast} from '../../src/core/normalize.js';
import {lineFromSum} from '../../src/core/physics.js';
import {JIAZI60} from '../../src/core/constants.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createPacketLedContext,packetLedMessages} from './packet-led.js';
import {planHash} from './plan.js';
export {planHash};
export const PRICE_CHECKED='2026-10-03';
export const CAMPAIGN_ID='packet-led-new-20261003';
export const CAMPAIGN_SCHEMA='packet-led-campaign-1';
export const specs=Object.freeze([
  {id:'trend-album',task:'trend',sums:[8,9,7,8,7,8],question:'我想把自己积累的照片选出一小册，只给家人翻看，不收费，目前还没确定筛选办法。我关心是否容易把这一册做出来，不问具体日期。'},
  {id:'trend-puzzle',task:'trend',sums:[7,8,9,8,8,7],question:'我想和一位熟人一起试做一个只给自己玩的合作解谜小活动，不收费，还没确定具体玩法。我关心是否容易把这个小活动准备出来，不问具体日期。'},
].map(v=>Object.freeze({...v,sums:Object.freeze(v.sums)})));
export const criteria=Object.freeze([
  {id:'facts',requirement:'实际说出的程序属性与冻结材料相符，并由本段所选packet来源或身份补充覆盖；规则source_facts与身份补充严格区分，不能扩大规则证明范围。'},
  {id:'scope',requirement:'只回答当前私人免费目标，不补未知筛选方式、玩法、收费或参与机制，不改变成功标准，不添加未问日期。'},
  {id:'support',requirement:'取象明确为解释假设，不确认现实能力、家人/熟人意愿、资源或进度；一般建议独立且不能抵消阻碍；传统依据不足标uncertain。'},
  {id:'priority',requirement:'取用与主要因素解释相关性和比较理由；focus身份须被所选因素包参与者覆盖，依据不足保留不确定性，不靠引用存在就证明取用有效。'},
  {id:'direction',requirement:'方向与正文、作用对象和因素主次一致；mixed不能只由一利一弊推出，不能预设吉凶。允许传统取法或权重不足时unclear。'},
  {id:'task_boundary',requirement:'本批仅trend；每因素至多两个packet_ids、至多三因素，建议只放general_advice；程序展开来源和身份不能代替自由文字语义审核。'},
]);
export async function preparePacketLedLivePlan(){
  // Explicit manual calendar fixture: no host-zone-dependent pillar derivation.
  const now=new Date('2026-10-03T14:00:00Z'),day=JIAZI60.find(v=>v.label==='庚戌'),cases=[];
  if(!day)throw Error('Manual day fixture unavailable');
  for(const spec of specs){
    const canonical=buildCanonicalCast({lines:spec.sums.map(lineFromSum),source:'manual',question:spec.question,createdAt:now.getTime(),castId:`packet-led-new-${spec.id}`,
      calendar:{now,day,ymh:{yearLabel:'丙午',monthLabel:'丁酉',hourLabel:'丁亥'},dateText:'公历：2026年10月3日'}});
    const context=await createPacketLedContext(await buildOutputContext(canonical,{includeMissingRecords:true}));
    const body={model:'deepseek-flash',thinking:{type:'disabled'},max_tokens:4096,response_format:{type:'json_object'},stream:true,stream_options:{include_usage:true},messages:packetLedMessages(context)};
    const input_allowance=Buffer.byteLength(JSON.stringify(body.messages),'utf8')+4096;
    cases.push({id:spec.id,task:spec.task,question:spec.question,canonical,context_id:context.context_id,body,input_allowance,reserve_cny:(input_allowance*2+4096*8)/1e6});
  }
  const reserve_cny=Number(cases.reduce((sum,c)=>sum+c.reserve_cny,0).toFixed(6));if(cases.length!==2||reserve_cny>2)throw Error('Fixed batch exceeds cap');
  return {version:'packet-led-two-live-development-1',production:false,campaign_id:CAMPAIGN_ID,campaign_cap_cny:2,wallet_floor_cny:1,planned_calls:2,
    price_checked:PRICE_CHECKED,price_source:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',peak_cny_per_million:{input:2,output:8},reserve_cny,
    blind:false,semantic_acceptance:'unassessed',forecast_accuracy:'unassessed',review_criteria:criteria,review_values:['pass','fail','uncertain'],source_policy:'No literature or unreviewed source injection.',
    provenance:'Two new fixed questions with explicit manual calendar and line recipes; labels are fixtures, not actual cast observations. Freeze before answers. Not production, blind or forecast acceptance.',
    stop_policy:'At most two chats, no retry/automatic settlement. Every chat needs confirmed wallet >= full reserve + 1 CNY; any failure stops and retains full reservation.',cases};
}
