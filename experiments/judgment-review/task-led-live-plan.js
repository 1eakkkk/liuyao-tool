// New fixed development questions. No answer-driven changes after freezing.
import {buildCanonicalCast} from '../../src/core/normalize.js';
import {lineFromSum} from '../../src/core/physics.js';
import {JIAZI60} from '../../src/core/constants.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createTaskLedContext,taskLedMessages} from './task-led.js';
import {planHash} from './plan.js';
export {planHash};
export const PRICE_CHECKED='2026-10-02';
export const CAMPAIGN_ID='task-led-new-20261002';
export const CAMPAIGN_SCHEMA='task-led-campaign-1';
export const specs=Object.freeze([
  {id:'advice-notes',task:'advice',sums:[8,7,8,7,8,7],question:'我想把个人读书笔记整理成便于检索的目录，目前没有固定分类。请给两条开始整理的建议，不预测学习成绩或完成时间。'},
  {id:'advice-boxes',task:'advice',sums:[7,8,8,7,8,8],question:'我准备给家里的收纳盒贴分类标签，只方便自己找东西。请给两条开始整理的建议，不判断成败或时间。'},
  {id:'trend-writing',task:'trend',sums:[7,9,8,7,8,7],question:'我准备试着用一个月写三篇短的旅行回忆，只写给自己看。我关心是否容易完成这个写作计划，不问应期。'},
  {id:'trend-gathering',task:'trend',sums:[8,8,9,7,7,8],question:'我想在邻里熟人间发起一次小型桌游聚会，没有收费计划，时间地点尚未确定。就能否顺利组织成一次活动怎么看？'},
].map(v=>Object.freeze({...v,sums:Object.freeze(v.sums)})));
export const criteria=Object.freeze([
  {id:'facts',requirement:'实际说出的事实应与给定材料相符；趋势每段程序属性须被本段引用覆盖，规则只覆盖source_facts。建议无盘面输入，不自行补盘或未提供的现实。'},
  {id:'scope',requirement:'回应当前明确目标与固定task，不虚构机制，不替换目标，不将计划时长当预测日期，不扩写未问应期。'},
  {id:'support',requirement:'取象是解释假设，不确认现实条件或他人意愿；普通建议独立，不能作为盘面支持或抵消阻碍；传统依据不足标uncertain。'},
  {id:'priority',requirement:'趋势说明取用与相关主次及其比较理由，依据不足坦然保留不确定性；一般建议无取用、无装饰性因素。'},
  {id:'direction',requirement:'趋势方向与正文、因素、主次一致；mixed须解释同目标牵制及不可分主次，不能由两面存在自动mixed；不预设方向。建议不输出趋势方向。'},
  {id:'task_boundary',requirement:'建议模型只接收question及协议metadata/schema，无canonical/evidence或其他盘面线索，不输出趋势或引用；事实核对是程序投影，不调用模型；本批仅advice/trend各二。自由文字仍需人工审查。'},
]);
export async function prepareTaskLedLivePlan(){
  const now=new Date('2026-10-02T14:00:00Z'),day=JIAZI60.find(v=>v.label==='己酉'),cases=[];
  for(const spec of specs){
    const canonical=buildCanonicalCast({lines:spec.sums.map(lineFromSum),source:'manual',question:spec.question,createdAt:now.getTime(),castId:`task-led-new-${spec.id}`,
      calendar:{now,day,ymh:{yearLabel:'丙午',monthLabel:'丁酉',hourLabel:'乙亥'},dateText:'公历：2026年10月2日'}});
    const context=await createTaskLedContext(await buildOutputContext(canonical,{includeMissingRecords:true}),spec.task);
    const body={model:'deepseek-flash',thinking:{type:'disabled'},max_tokens:4096,response_format:{type:'json_object'},stream:true,stream_options:{include_usage:true},messages:taskLedMessages(context)};
    const input_allowance=Buffer.byteLength(JSON.stringify(body.messages),'utf8')+4096;
    cases.push({id:spec.id,task:spec.task,question:spec.question,canonical,context_id:context.context_id,body,input_allowance,reserve_cny:(input_allowance*2+4096*8)/1e6});
  }
  const reserve_cny=Number(cases.reduce((sum,c)=>sum+c.reserve_cny,0).toFixed(6));if(cases.length!==4||reserve_cny>2)throw Error('Fixed batch exceeds cap');
  return {version:'task-led-four-live-development-1',production:false,campaign_id:CAMPAIGN_ID,campaign_cap_cny:2,wallet_floor_cny:1,planned_calls:4,
    price_checked:PRICE_CHECKED,price_source:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',peak_cny_per_million:{input:2,output:8},reserve_cny,
    blind:false,semantic_acceptance:'unassessed',forecast_accuracy:'unassessed',review_criteria:criteria,review_values:['pass','fail','uncertain'],source_policy:'No literature or unreviewed source injection.',
    provenance:'Four new fixed manual-recipe questions, advice and trend separately supplied. Freeze before answers; no model calls for facts. Not production, blind or forecast acceptance.',
    stop_policy:'At most four chats, no retry/automatic settlement. Every chat needs confirmed wallet >= full reserve + 1 CNY; any failure stops and retains full reservation.',cases};
}
