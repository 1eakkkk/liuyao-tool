// Fixed new development questions; freeze before obtaining any model answers.
import {buildCanonicalCast} from '../../src/core/normalize.js';
import {lineFromSum} from '../../src/core/physics.js';
import {JIAZI60} from '../../src/core/constants.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createEvidenceLedContext,evidenceLedMessages} from './evidence-led.js';
import {planHash} from './plan.js';
export {planHash};
export const PRICE_CHECKED='2026-10-02';
export const CAMPAIGN_ID='evidence-led-new-20261002';
export const CAMPAIGN_SCHEMA='evidence-led-campaign-1';
export const specs=Object.freeze([
  {id:'facts-motion',task:'facts',sums:[7,8,7,9,8,8],question:'只核对本卦六条爻的动静，并指出世爻和应爻各在第几爻。不要解释趋势或给建议。'},
  {id:'facts-records',task:'facts',sums:[8,7,8,7,9,7],question:'只核对第三爻是否记载伏神，以及第五爻的本爻六亲与变爻六亲；未记载只说明记录情况。不要推断现实或趋势。'},
  {id:'advice-photos',task:'advice',sums:[8,8,7,7,7,8],question:'我准备把旧照片整理成家庭电子相册，只供家人查看。请给两条开始整理的建议，不判断成败，也不预测时间。'},
  {id:'advice-plant',task:'advice',sums:[7,7,8,8,8,7],question:'我想试着在阳台养一盆薄荷，目前还没确认光照和浇水条件。请给两条试种前的建议，不预测长势或收获。'},
  {id:'trend-course',task:'trend',sums:[9,7,8,8,7,8],question:'我报名了一个周末陶艺入门课程，想完成一件自己满意的小作品；只作兴趣体验，不参加比赛。就这个目标怎么看？'},
  {id:'trend-trip',task:'trend',sums:[8,7,7,8,8,9],question:'我计划与一位朋友安排一次当天往返的近郊散步，具体路线和天气尚未确定。我想知道这次安排是否容易顺利落实，不问日期。'},
].map(v=>Object.freeze({...v,sums:Object.freeze(v.sums)})));
export const criteria=Object.freeze([
  {id:'facts',requirement:'每段实际说出的盘面属性须准确且由本段引用覆盖；未说属性不强求。程序值和规则来源由可信目录展示，不能用引用存在证明解释。'},
  {id:'scope',requirement:'回应固定问题与显式task，不将事实或建议任务改为趋势；不虚构未知机制，不替换用户目标，不附加未问的应期。'},
  {id:'support',requirement:'事实、取象假设、用户现实和一般建议分开；关系影响结合对象角色；一般建议不能作为盘面支持，传统依据不足标无法确认。'},
  {id:'priority',requirement:'趋势说明主要取用、相关因素主次及取舍；取法影响方向而无法确定须保留不确定性。事实/建议不强迫取用。'},
  {id:'direction',requirement:'方向、正文、因素与主次一致；mixed解释同一目标上的牵制及为何不能分主次，不按条数评分或预设吉凶；facts/advice只能unclear。'},
  {id:'task_boundary',requirement:'固定task不得改写；facts无建议或趋势因素，advice一般建议单列；自由文字边界另由人工审查，结构通过不证明文字正确。'},
]);
export async function prepareEvidenceLedLivePlan(){
  const now=new Date('2026-10-02T14:00:00Z'),day=JIAZI60.find(v=>v.label==='己酉'),cases=[];
  for(const spec of specs){
    const canonical=buildCanonicalCast({lines:spec.sums.map(lineFromSum),source:'manual',question:spec.question,createdAt:now.getTime(),castId:`evidence-led-new-${spec.id}`,
      calendar:{now,day,ymh:{yearLabel:'丙午',monthLabel:'丁酉',hourLabel:'乙亥'},dateText:'公历：2026年10月2日'}});
    const context=await createEvidenceLedContext(await buildOutputContext(canonical,{includeMissingRecords:true}),spec.task);
    const body={model:'deepseek-flash',thinking:{type:'disabled'},max_tokens:4096,response_format:{type:'json_object'},stream:true,stream_options:{include_usage:true},messages:evidenceLedMessages(context)};
    const input_allowance=Buffer.byteLength(JSON.stringify(body.messages),'utf8')+4096;
    cases.push({id:spec.id,task:spec.task,question:spec.question,canonical,context_id:context.context_id,body,input_allowance,reserve_cny:(input_allowance*2+4096*8)/1e6});
  }
  const reserve_cny=Number(cases.reduce((sum,c)=>sum+c.reserve_cny,0).toFixed(6));
  if(cases.length!==6||reserve_cny>2)throw Error('Fixed batch exceeds cap');
  return {version:'evidence-led-six-live-development-1',production:false,campaign_id:CAMPAIGN_ID,campaign_cap_cny:2,wallet_floor_cny:1,planned_calls:6,
    price_checked:PRICE_CHECKED,price_source:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',peak_cny_per_million:{input:2,output:8},reserve_cny,
    blind:false,semantic_acceptance:'unassessed',forecast_accuracy:'unassessed',review_criteria:criteria,review_values:['pass','fail','uncertain'],
    source_policy:'No literature or unreviewed source injection.',provenance:'Six fixed new development questions, manual canonical recipes. Freeze before model answers; no answer-driven instruction changes. Not production or blind acceptance.',
    stop_policy:'At most six chats; no retry. Stop on any transport, archive, completion, model, usage, JSON or link failure; full batch reservation remains. Every chat requires confirmed wallet >= full reserve + 1 CNY.',cases};
}
