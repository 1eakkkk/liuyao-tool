// One new fixed manual development fixture; review its semantics before planning another batch.
import {buildCanonicalCast} from '../../src/core/normalize.js';
import {lineFromSum} from '../../src/core/physics.js';
import {JIAZI60} from '../../src/core/constants.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createPacketLocalContext,packetLocalMessages} from './packet-led-local.js';
import {planHash} from './plan.js';
export {planHash};
export const PRICE_CHECKED='2026-10-03';
export const CAMPAIGN_ID='packet-local-new-20261003';
export const CAMPAIGN_SCHEMA='packet-local-campaign-1';
export const PROMPT_REVISION='packet-local-live-p1';
export function buildPacketLocalLiveMessages(context){
  const messages=packetLocalMessages(context);
  const replacements=[
    ['factors的interpretation解释条件作用','factors的question_relevance解释条件作用'],
    ['仅引用的包可以支撑本段属性，未选包不能借用。','仅本段所选basis_ids及程序展开的规则来源、参与者六亲身份可支撑属性；包内其他未选属性不能借用。'],
  ];
  let system=messages[0].content;
  for(const [before,after] of replacements){if(!system.includes(before))throw Error('Live prompt adaptation source changed');system=system.replaceAll(before,after);}
  return [{...messages[0],content:system},...messages.slice(1).map(message=>({...message}))];
}
export const specs=Object.freeze([
  Object.freeze({id:'trend-spare-key',task:'trend',sums:Object.freeze([7,8,8,9,7,8]),question:'我把家里的备用门钥匙弄丢了，只在家里找过一遍。我关心继续寻找是否有希望找回，不问具体位置和日期。'}),
]);
export const criteria=Object.freeze([
  {id:'facts',requirement:'每段实际程序属性须由本段basis_ids及规则严格source_facts或程序标明的身份背景覆盖；不能借全包或其他因素未选属性。身份背景不冒称规则前提。'},
  {id:'scope',requirement:'回答继续寻找是否有希望找回；不编钥匙位置、具体日期、已被谁拿走、搜索机制或其他未提供现实，不替换目标。'},
  {id:'support',requirement:'角色映射和影响途径标为假设，不把类象当实际位置、状态或找回结果；实用建议独立且非成功必要条件；传统依据无法核实则uncertain。'},
  {id:'priority',requirement:'说明取用与因素主次及比较理由；focus由本段局部身份依据或参与关系覆盖，明确方向由primary覆盖；依据不足可保留unclear，不按数量定吉凶。'},
  {id:'direction',requirement:'方向与实际散文、影响对象和主次一致；unclear不得伴随肯定找回/找不到断语，mixed不能仅因存在两面，不预设方向或预测正确。'},
  {id:'task_boundary',requirement:'固定trend单例；每因素至多2包、1至4局部basis、至多3因素，建议仅general_advice，局部成员/闭包通过不代表自由文字事实及解释语义已验证。'},
]);
export async function preparePacketLocalLivePlan(){
  const now=new Date('2026-10-03T14:00:00Z'),day=JIAZI60.find(v=>v.label==='庚戌'),cases=[];
  if(!day)throw Error('Manual day fixture unavailable');
  for(const spec of specs){
    const canonical=buildCanonicalCast({lines:spec.sums.map(lineFromSum),source:'manual',question:spec.question,createdAt:now.getTime(),castId:`packet-local-new-${spec.id}`,
      calendar:{now,day,ymh:{yearLabel:'丙午',monthLabel:'丁酉',hourLabel:'丁亥'},dateText:'公历：2026年10月3日'}});
    const context=await createPacketLocalContext(await buildOutputContext(canonical,{includeMissingRecords:true}));
    const body={model:'deepseek-flash',thinking:{type:'disabled'},max_tokens:4096,response_format:{type:'json_object'},stream:true,stream_options:{include_usage:true},messages:buildPacketLocalLiveMessages(context)};
    const input_allowance=Buffer.byteLength(JSON.stringify(body.messages),'utf8')+4096;
    cases.push({id:spec.id,task:spec.task,question:spec.question,canonical,context_id:context.context_id,body,input_allowance,reserve_cny:(input_allowance*2+4096*8)/1e6});
  }
  const reserve_cny=Number(cases.reduce((sum,c)=>sum+c.reserve_cny,0).toFixed(6));if(cases.length!==1||reserve_cny>2)throw Error('Fixed batch exceeds cap');
  return {version:'packet-local-one-live-development-1',prompt_revision:PROMPT_REVISION,production:false,campaign_id:CAMPAIGN_ID,campaign_cap_cny:2,wallet_floor_cny:1,planned_calls:1,
    price_checked:PRICE_CHECKED,price_source:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',peak_cny_per_million:{input:2,output:8},reserve_cny,
    blind:false,semantic_acceptance:'unassessed',forecast_accuracy:'unassessed',review_criteria:criteria,review_values:['pass','fail','uncertain'],source_policy:'No literature or unreviewed source injection.',
    provenance:'One new fixed development question with explicit manual calendar/line fixture, not an actual cast. Freeze before response; review semantics before considering another independent batch. Not production, blind or forecast acceptance.',
    stop_policy:'At most one chat, no retry/automatic settlement. Confirmed wallet >= full reserve + 1 CNY required; any failure retains full reservation. No second case or automatic follow-up.',cases};
}
