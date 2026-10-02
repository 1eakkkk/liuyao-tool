// Offline prototype only. Valid links and required reasons do not prove reasoning.
import {validateOutputShape,stableOutputJson} from '../../src/ai/output/contract.js';
import {isOutputContext,hashOutput} from '../../src/ai/output/context.js';
import {collectEvidencePresentation} from '../../src/ai/output/evidence-presentation.js';
import {evidenceText} from '../../src/ai/output/view.js';
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const str=maxLength=>({type:'string',minLength:1,maxLength});
const arr=(items,maxItems,minItems=0)=>({type:'array',items,maxItems,minItems,uniqueItems:true});
const factorId={enum:['f1','f2','f3']};
const refs=arr(str(180),8,1);
export const EVIDENCE_LED_VERSION='evidence-led-offline-1';
export const EVIDENCE_LED_SCHEMA=obj({
  schema_version:{const:EVIDENCE_LED_VERSION},context_id:str(80),summary:str(450),
  decision:obj({task:{enum:['trend','advice','facts']},direction:{enum:['favorable','unfavorable','mixed','unclear']},
    focus:arr(obj({evidence_id:str(180),role_hypothesis:str(300)}),1),
    major_factor_ids:arr(factorId,3),counter_factor_ids:arr(factorId,3),tradeoff_reason:str(600)}),
  factors:arr(obj({id:factorId,effect:{enum:['support','oppose','neutral','conditional']},evidence_ids:refs,
    interpretation:str(600),assumption:str(300),limitation:str(300)}),3,1),
  general_advice:arr(str(300),2),uncertainties:arr(str(400),3,1),
});
const trusted=new WeakSet();
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export async function createEvidenceLedContext(source,task){
  if(!isOutputContext(source)||!['trend','advice','facts'].includes(task))throw Error('Trusted source context and explicit task required');
  const context={version:EVIDENCE_LED_VERSION,task,source_context_id:source.context_id,
    input:source.input,evidence:source.evidence};
  context.context_id=await hashOutput(context);trusted.add(context);return freeze(context);
}
export function validateEvidenceLedAnswer(answer,context){
  if(!trusted.has(context))throw Error('Untrusted evidence-led context');
  validateOutputShape(answer,EVIDENCE_LED_SCHEMA);
  if(answer.context_id!==context.context_id||answer.decision.task!==context.task)throw Error('Context or task mismatch');
  const entries=new Map(context.evidence.map(e=>[e.id,e])),factors=new Map();
  for(const f of answer.factors){
    if(factors.has(f.id))throw Error('Duplicate factor identity');factors.set(f.id,f);
    // Reuse production identity, source closure and deduplication, never model values.
    collectEvidencePresentation(context.evidence,f.evidence_ids);
  }
  const d=answer.decision,major=d.major_factor_ids,counter=d.counter_factor_ids;
  if([...major,...counter].some(id=>!factors.has(id))||counter.some(id=>major.includes(id)))throw Error('Invalid factor selection');
  for(const f of d.focus){
    const e=entries.get(f.evidence_id);
    if(e?.kind!=='program_fact'||!/^\/lines\/[0-5]\/(?:changed\/|hidden\/)?relative$/.test(e.path))throw Error('Focus requires an existing relative fact');
    if(!answer.factors.some(v=>v.evidence_ids.includes(e.id)))throw Error('Focus absent from selected factor evidence');
  }
  if(context.task!=='trend'){
    if(d.direction!=='unclear'||d.focus.length||major.length||counter.length)throw Error('Non-trend tasks cannot assert a trend');
    if(context.task==='facts'&&(answer.general_advice.length||answer.factors.some(f=>f.effect!=='neutral')))throw Error('Fact task cannot add advice or directional factors');
  }else if(d.direction!=='unclear'){
    if(!d.focus.length||!major.length)throw Error('Trend requires focus and major factors');
    if(!major.some(id=>factors.get(id).evidence_ids.includes(d.focus[0].evidence_id)))throw Error('Focus absent from selected major factors');
    const effects=major.map(id=>factors.get(id).effect);
    if(d.direction==='favorable'&&!effects.includes('support')||d.direction==='unfavorable'&&!effects.includes('oppose'))throw Error('Direction lacks its selected major effect');
    if(d.direction==='mixed'&&(!effects.includes('support')||!effects.includes('oppose')))throw Error('Mixed requires explicit opposed major effects');
  }
  return answer;
}
export function evidenceLedView(answer,context){
  validateEvidenceLedAnswer(answer,context);
  const d=answer.decision,entries=new Map(context.evidence.map(e=>[e.id,e]));
  return {summary:answer.summary,direction:d.direction,tradeoff_reason:d.tradeoff_reason,
    focus:d.focus.map(f=>({fact:evidenceText(entries.get(f.evidence_id)),role_hypothesis:f.role_hypothesis})),
    factors:answer.factors.map(f=>{
      const p=collectEvidencePresentation(context.evidence,f.evidence_ids);
      return {id:f.id,effect:f.effect,major:d.major_factor_ids.includes(f.id),counter:d.counter_factor_ids.includes(f.id),
        interpretation:f.interpretation,assumption:f.assumption,limitation:f.limitation,
        selected:f.evidence_ids.map(id=>({id,text:evidenceText(entries.get(id))})),
        source_facts:p.facts.map(v=>({id:v.entry.id,text:evidenceText(v.entry)})),
        rules:p.rules.map(v=>({id:v.entry.id,text:evidenceText(v.entry),source_ids:v.entry.source_facts}))};
    }),general_advice:answer.general_advice.map(text=>({label:'一般建议',text})),uncertainties:answer.uncertainties,
    mechanical_check:'structure_and_links_only',semantic_acceptance:'unassessed',forecast_accuracy:'unassessed'};
}
export function evidenceLedMessages(context){
  if(!trusted.has(context))throw Error('Untrusted evidence-led context');
  return [{role:'system',content:`离线实验 ${EVIDENCE_LED_VERSION}，不用于正式网站。仅输出完整JSON，遵守response_schema。
task由程序固定，不自行改成趋势问题。summary直接回应当前目标，通常100–250字，不凑篇幅。
程序展示事实值、规则方向及来源；你只选择已有evidence_id，不输出facts/value/result，不抄整串纳甲名称。解释文字仍不得添加未引用属性。
每项解释限定当前目标、一个作用对象。assumption说明取象假设，limitation说明本解释不能确认什么现实。传统取法没有出处时不能声称已获经典证明。
趋势判断最多一个主要取用角度；focus引用相应六亲事实，role_hypothesis说明为什么选择，只是解释假设。取法不足时focus可空且direction=unclear。
major_factor_ids和counter_factor_ids只引用本次因素，不是按条数评分；tradeoff_reason必须说明优先关系及其依据。mixed需说明同一目标上的实际牵制和为何不能分主次；有一利一弊不自动mixed。不为结论多样强行判吉凶。
factors最多三项，只保留当前目标直接相关的依据。一般建议独立放general_advice，不能成为盘面支持或抵消阻碍。facts任务不加建议，只核对事实，因素用neutral。
未知游戏或产品机制，不推断组队、英雄、晋升规则等。类象不证明资源、精力、故障、热度或他人意愿；条件解释也不能偷换当前免费娱乐目标为正式盈利运营。
假设、限制和取舍字段非空只是机械要求；不能靠模板免责声明补救正文越界。没有合理判断时直接说明不足。`},
    {role:'user',content:stableOutputJson({context_id:context.context_id,task:context.task,
      input:context.input,evidence:context.evidence,response_schema:EVIDENCE_LED_SCHEMA})}];
}
