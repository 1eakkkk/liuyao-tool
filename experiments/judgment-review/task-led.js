// Isolated development protocol. Explicit task routing is not natural-language classification.
import {isOutputContext,hashOutput} from '../../src/ai/output/context.js';
import {validateOutputShape,stableOutputJson} from '../../src/ai/output/contract.js';
import {evidenceText} from '../../src/ai/output/view.js';
import {createEvidenceLedContext,validateEvidenceLedAnswer,evidenceLedView,EVIDENCE_LED_VERSION} from './evidence-led.js';
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const str=maxLength=>({type:'string',minLength:1,maxLength});
const arr=(items,maxItems,minItems=0)=>({type:'array',items,maxItems,minItems,uniqueItems:true});
const id={enum:['f1','f2','f3']};
export const TASK_LED_VERSION='task-led-experiment-1';
const envelope={schema_version:{const:TASK_LED_VERSION},context_id:str(80)};
export const TASK_LED_ADVICE_SCHEMA=obj({...envelope,task:{const:'advice'},advice:arr(str(240),2,1),limits:arr(str(240),2,1)});
export const TASK_LED_TREND_SCHEMA=obj({...envelope,task:{const:'trend'},
  conclusion:obj({direction:{enum:['favorable','unfavorable','mixed','unclear']},answer:str(220)}),
  focus:arr(obj({evidence_id:str(180),role_hypothesis:str(240)}),1),
  major_factor_ids:arr(id,3),counter_factor_ids:arr(id,3),tradeoff_reason:str(400),
  factors:arr(obj({id,effect:{enum:['support','oppose','neutral','conditional']},evidence_ids:arr(str(180),8,1),
    interpretation:str(400),assumption:str(240),limitation:str(240)}),3),
  general_advice:arr(str(240),2),uncertainties:arr(str(300),3,1)});
const trusted=new WeakSet(),underlying=new WeakMap();
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export async function createTaskLedContext(source,task,{fact_ids}={}){
  if(!isOutputContext(source)||!['facts','advice','trend'].includes(task))throw Error('Trusted source and explicit task required');
  const question=source.input.A_user_question;
  if(typeof question!=='string'||!question.trim())throw Error('Question required');
  const context={version:TASK_LED_VERSION,task,question};
  if(task==='advice'){
    if(fact_ids!==undefined)throw Error('Advice cannot select chart evidence');
    // No source identity, canonical, rules, facts, prior conversations or cast history are transmitted.
    context.response_schema=TASK_LED_ADVICE_SCHEMA;
  }else if(task==='facts'){
    if(!Array.isArray(fact_ids)||!fact_ids.length||fact_ids.length>18||new Set(fact_ids).size!==fact_ids.length)throw Error('Explicit unique fact selection required');
    for(let i=0;i<fact_ids.length;i++)if(!Object.hasOwn(fact_ids,i)||typeof fact_ids[i]!=='string')throw Error('Dense string fact selection required');
    const registry=new Map(source.evidence.map(e=>[e.id,e]));
    context.selected= fact_ids.map(id=>{const e=registry.get(id);if(e?.kind!=='program_fact')throw Error('Fact selection requires existing program facts');return {id:e.id,text:evidenceText(e)};});
    context.source_context_id=source.context_id;
  }else{
    if(fact_ids!==undefined)throw Error('Trend does not accept fact-only selection');
    context.source_context_id=source.context_id;context.evidence=source.evidence;
    context.response_schema=TASK_LED_TREND_SCHEMA;
    underlying.set(context,await createEvidenceLedContext(source,'trend'));
  }
  context.context_id=await hashOutput(context);trusted.add(context);return freeze(context);
}
function assertContext(context){if(!trusted.has(context))throw Error('Untrusted task-led context');}
function assertDenseJson(value,ancestors=new Set()){
  if(!value||typeof value!=='object')return;
  if(ancestors.has(value))throw Error('Cyclic model value');
  ancestors.add(value);
  if(Array.isArray(value))for(let i=0;i<value.length;i++)if(!Object.hasOwn(value,i))throw Error('Sparse model arrays rejected');
  for(const child of Object.values(value))assertDenseJson(child,ancestors);
  ancestors.delete(value);
}
export function taskLedMessages(context){
  assertContext(context);
  if(context.task==='facts')throw Error('Fact checks are program-generated; no model request');
  const system=context.task==='advice'
    ?`开发实验 ${TASK_LED_VERSION}。只输出完整JSON。当前任务为一般建议，不作趋势判断。输入仅含用户问题，不提供卦盘。给一到两条直接可用的建议和实际信息限制，不编卦盘、爻位、取用、预测或现实状态，不为建议添加占卜依据，不扩大用户目标。`
    :`开发实验 ${TASK_LED_VERSION}。只输出完整JSON，按response_schema。当前task固定trend。
conclusion.answer只回答当前目标及判断把握，不复述爻位、六亲、五行、旺衰、卦名或纳甲；程序展示所有盘面值。tradeoff_reason只说明哪些已选因素优先、为什么及其对同一目标的影响，用因素编号指代，不重新复述属性。
至多三项因素。只选择已有evidence_id，在interpretation解释这些依据对当前目标的相关性，不另抄属性；取象必须明确为假设，不把关系名直接当吉凶，也不把象意当成实际能力、精力、配合、天气、故障或热度。assumption限定角色映射，limitation限定不能确认的现实。所有正文言及的属性仍须由相应因素引用覆盖，规则来源闭包由程序显示。
focus至多一个，必须引用相应六亲relative的program_fact，不能选moving等其他字段。非unclear须直接关联所选主要因素。主要与需权衡因素不可重叠；需要同时主要支持和阻碍才能mixed，且必须解释不能分主次的理由，一利一弊不会自动mixed，不按数量计分。若已认为阻碍优先，不应同时无理由宣称mixed。
没有已核实传统取法或权重足以支撑方向时选unclear，不强行填因素或唯一用神，不靠结尾免责声明抵消正文越界。不要改变用户目标或未知机制。
一般建议只放general_advice，不引用卦盘、不成为因素支持，不降低用户成功标准来冒充成功。uncertainties描述真实缺口，不添未问应期。输入不含古籍，不能声称来源已获验证。`;
  return [{role:'system',content:system},{role:'user',content:stableOutputJson({context_id:context.context_id,task:context.task,
    question:context.question,...(context.task==='trend'?{evidence:context.evidence}:{}),response_schema:context.response_schema})}];
}
function adapted(answer,context){
  const source=underlying.get(context);
  return {schema_version:EVIDENCE_LED_VERSION,context_id:source.context_id,summary:answer.conclusion.answer,
    decision:{task:'trend',direction:answer.conclusion.direction,focus:answer.focus,major_factor_ids:answer.major_factor_ids,counter_factor_ids:answer.counter_factor_ids,tradeoff_reason:answer.tradeoff_reason},
    factors:answer.factors,general_advice:answer.general_advice,uncertainties:answer.uncertainties};
}
export function validateTaskLedAnswer(answer,context){
  assertContext(context);if(context.task==='facts')throw Error('Model fact answers are not accepted');
  assertDenseJson(answer);
  validateOutputShape(answer,context.response_schema);
  if(answer.context_id!==context.context_id||answer.task!==context.task)throw Error('Context or task mismatch');
  if(context.task==='trend')validateEvidenceLedAnswer(adapted(answer,context),underlying.get(context));
  return answer;
}
export function taskLedView(answer,context){
  assertContext(context);
  if(context.task==='facts'){
    if(answer!==null&&answer!==undefined)throw Error('Model fact answers are not accepted');
    return {task:'facts',question:context.question,generated_by:'program',facts:context.selected.map(v=>({...v})),network_calls:0,
      mechanical_check:'selected_program_records_only',semantic_acceptance:'not_applicable_to_model',forecast_accuracy:'unassessed'};
  }
  validateTaskLedAnswer(answer,context);
  if(context.task==='advice')return {task:'advice',question:context.question,advice:[...answer.advice],limits:[...answer.limits],
    mechanical_check:'shape_and_task_only',semantic_acceptance:'unassessed',forecast_accuracy:'unassessed'};
  return {task:'trend',question:context.question,...evidenceLedView(adapted(answer,context),underlying.get(context))};
}
