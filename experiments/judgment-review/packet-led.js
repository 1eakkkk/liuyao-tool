// Program-built citation packets. Membership proves record coverage, never interpretation.
import {isOutputContext,hashOutput} from '../../src/ai/output/context.js';
import {validateOutputShape,stableOutputJson} from '../../src/ai/output/contract.js';
import {collectEvidencePresentation} from '../../src/ai/output/evidence-presentation.js';
import {evidenceText} from '../../src/ai/output/view.js';
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const str=maxLength=>({type:'string',minLength:1,maxLength});
const arr=(items,maxItems,minItems=0)=>({type:'array',items,maxItems,minItems,uniqueItems:true});
const factorId={enum:['f1','f2','f3']};
export const PACKET_LED_VERSION='packet-led-experiment-1';
export const PACKET_LED_SCHEMA=obj({schema_version:{const:PACKET_LED_VERSION},context_id:str(80),task:{const:'trend'},
  conclusion:obj({direction:{enum:['favorable','unfavorable','mixed','unclear']},answer:str(220)}),
  focus:arr(obj({packet_id:str(180),role_hypothesis:str(240)}),1),
  major_factor_ids:arr(factorId,3),counter_factor_ids:arr(factorId,3),tradeoff_reason:str(400),
  factors:arr(obj({id:factorId,effect:{enum:['support','oppose','neutral','conditional']},packet_ids:arr(str(180),2,1),
    interpretation:str(400),assumption:str(240),limitation:str(240)}),3),
  general_advice:arr(str(240),2),uncertainties:arr(str(300),3,1)});
const trusted=new WeakSet(),registries=new WeakMap();
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function dense(v,ancestors=new Set()){
  if(!v||typeof v!=='object')return;
  if(ancestors.has(v))throw Error('Cyclic model value');ancestors.add(v);
  if(Array.isArray(v))for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))throw Error('Sparse model arrays rejected');
  for(const child of Object.values(v))dense(child,ancestors);ancestors.delete(v);
}
const componentPrefix=(line,component)=>`/lines/${line-1}${component==='primary'?'':`/${component}`}`;
const roleId=(line,component)=>`role:${component}:${line}`;
export async function createPacketLedContext(source){
  if(!isOutputContext(source))throw Error('Trusted output source required');
  const entries=new Map(source.evidence.map(e=>[e.id,e])),roles=new Map(),packets=[];
  for(let line=1;line<=6;line++)for(const component of ['primary','changed','hidden']){
    const prefix=componentPrefix(line,component),relative=entries.get(`fact:${prefix}/relative`);
    if(relative?.kind!=='program_fact')continue;
    // One record profile, never the whole chart. Primary fields include identity and state;
    // hidden/changed fields remain distinct, with owning primary position/flags/motion.
    const ids=source.evidence.filter(e=>e.kind==='program_fact'&&(e.path.startsWith(prefix+'/')&&!e.path.slice(prefix.length+1).includes('/')||
      component!=='primary'&&[`/lines/${line-1}/position`,`/lines/${line-1}/is_shi`,`/lines/${line-1}/is_ying`,`/lines/${line-1}/moving`].includes(e.path))).map(e=>e.id);
    if(component==='primary')for(const field of ['month_strength','day_relation','return_relation','advance_retreat','hidden_relation']){
      const id=`fact:${prefix}/relations/${field}`;if(entries.has(id))ids.push(id);
    }
    const p={id:roleId(line,component),kind:'role_profile',target:{line,component},relative_fact_id:relative.id,
      facts:[...new Set(ids)].map(id=>({id,text:evidenceText(entries.get(id))}))};roles.set(p.id,p);packets.push(p);
  }
  for(const rule of source.evidence.filter(e=>e.kind==='rule_result')){
    collectEvidencePresentation(source.evidence,[rule.id]); // Require complete trusted premise closure.
    const participants=new Map();
    const add=t=>{if(t&&Number.isInteger(t.line)&&roles.has(roleId(t.line,t.component)))participants.set(roleId(t.line,t.component),roles.get(roleId(t.line,t.component)));};
    add(rule.target);if(rule.target?.related_line)add({line:rule.target.related_line,component:'primary'});
    add(rule.result.from);add(rule.result.to);
    // A hidden-target relation also has a primary owner even in directionless equality.
    if(rule.target?.component==='hidden')add({line:rule.target.line,component:'primary'});
    const identity=[...new Map([...participants.values()].flatMap(p=>p.facts).map(f=>[f.id,f])).values()];
    packets.push({id:`rel:${rule.id}`,kind:'relation',rule:{id:rule.id,text:evidenceText(rule),source_ids:[...rule.source_facts]},
      participants:[...participants.keys()],premises:rule.source_facts.map(id=>({id,text:evidenceText(entries.get(id))})),
      identity_facts:identity});
  }
  const context={version:PACKET_LED_VERSION,task:'trend',question:source.input.A_user_question,source_context_id:source.context_id,packets,response_schema:PACKET_LED_SCHEMA};
  context.context_id=await hashOutput(context);trusted.add(context);registries.set(context,entries);return freeze(context);
}
function assertContext(c){if(!trusted.has(c))throw Error('Untrusted packet-led context');}
function selectedPackets(factor,context){const map=new Map(context.packets.map(p=>[p.id,p]));return factor.packet_ids.map(id=>{const p=map.get(id);if(!p)throw Error('Unknown packet reference');return p;});}
function coversRole(packets,id){return packets.some(p=>p.id===id||p.kind==='relation'&&p.participants.includes(id));}
export function validatePacketLedAnswer(answer,context){
  assertContext(context);dense(answer);validateOutputShape(answer,PACKET_LED_SCHEMA);
  if(answer.context_id!==context.context_id)throw Error('Context mismatch');
  const factors=new Map();
  for(const f of answer.factors){if(factors.has(f.id))throw Error('Duplicate factor identity');factors.set(f.id,{factor:f,packets:selectedPackets(f,context)});}
  const major=answer.major_factor_ids,counter=answer.counter_factor_ids;
  if([...major,...counter].some(id=>!factors.has(id))||counter.some(id=>major.includes(id)))throw Error('Invalid factor selection');
  for(const focus of answer.focus){
    const role=context.packets.find(p=>p.id===focus.packet_id&&p.kind==='role_profile');
    if(!role)throw Error('Focus requires an existing role profile');
    if(![...factors.values()].some(v=>coversRole(v.packets,role.id)))throw Error('Focus absent from factor packets');
  }
  const direction=answer.conclusion.direction;
  if(direction!=='unclear'){
    if(!answer.focus.length||!major.length)throw Error('Trend requires focus and major factors');
    if(!major.some(id=>coversRole(factors.get(id).packets,answer.focus[0].packet_id)))throw Error('Focus absent from selected major factors');
    const effects=major.map(id=>factors.get(id).factor.effect);
    if(direction==='favorable'&&!effects.includes('support')||direction==='unfavorable'&&!effects.includes('oppose'))throw Error('Direction lacks its selected major effect');
    if(direction==='mixed'&&(!effects.includes('support')||!effects.includes('oppose')))throw Error('Mixed requires explicit opposed major effects');
  }
  return answer;
}
export function packetLedView(answer,context){
  validatePacketLedAnswer(answer,context);
  const entries=registries.get(context),ruleMap=new Map();
  const factors=answer.factors.map(f=>{
    const packets=selectedPackets(f,context),facts=new Map(),premiseIds=new Set(),rules=new Map();
    for(const p of packets){
      if(p.kind==='role_profile')for(const fact of p.facts)facts.set(fact.id,fact);
      else{
        for(const fact of p.premises){facts.set(fact.id,fact);premiseIds.add(fact.id);}
        for(const fact of p.identity_facts)facts.set(fact.id,fact);
        rules.set(p.rule.id,p.rule);ruleMap.set(p.rule.id,p.rule);
      }
    }
    return {id:f.id,effect:f.effect,major:answer.major_factor_ids.includes(f.id),counter:answer.counter_factor_ids.includes(f.id),
      interpretation:f.interpretation,assumption:f.assumption,limitation:f.limitation,selected_packet_ids:[...f.packet_ids],
      facts:[...facts.values()].map(v=>({...v,rule_premise:premiseIds.has(v.id)})),
      rules:[...rules.values()].map(r=>({id:r.id,text:r.text,source_ids:[...r.source_ids]}))};
  });
  return {task:'trend',summary:answer.conclusion.answer,direction:answer.conclusion.direction,tradeoff_reason:answer.tradeoff_reason,
    focus:answer.focus.map(f=>{const role=context.packets.find(p=>p.id===f.packet_id);return {packet_id:role.id,fact:evidenceText(entries.get(role.relative_fact_id)),role_hypothesis:f.role_hypothesis};}),
    factors,general_advice:[...answer.general_advice],uncertainties:[...answer.uncertainties],
    distinct_relation_ids:[...ruleMap.keys()],mechanical_check:'packet_membership_and_links_only',semantic_acceptance:'unassessed',forecast_accuracy:'unassessed'};
}
export function packetLedMessages(context){
  assertContext(context);
  return [{role:'system',content:`隔离开发实验 ${PACKET_LED_VERSION}。仅输出完整JSON。task固定trend。
每个因素选一至两个已有packet_ids，最多三个因素。role包是单爻身份／状态记录；rel包包含一条规则、严格来源premises和participants对应role包的身份背景。程序展开参与者身份，不必重复选同一个role包。身份背景不能冒称规则推导所用前提；相同规则和重复事实不重复计权。
程序展示包内原值与关系方向，你解释它为什么与用户目标相关，不抄一串盘面字段。仅引用的包可以支撑本段属性，未选包不能借用。focus须选已有role包，且由因素包直接选择或rel参与者覆盖；有明确方向时必须由主要因素覆盖。
conclusion.answer只回答用户目标和把握，tradeoff_reason用因素编号解释优先及原因，不复述盘面。factors的interpretation解释条件作用；assumption限定取象假设、limitation说明不能确认的现实。取象不能证明能力、精力、热度、天气、技术问题或他人意愿。
取法／权重无法核实就选unclear，可不选因素或focus，不强行填满三项。一利一弊不自动mixed；mixed需要同目标支持与阻碍均为主要且说明无法分主次。不按包数或爻数打分，不预设吉凶比例。
一般建议独立，不能当成盘面支持，不换掉免费私人目标、不编未知机制、不降成功标准。未注入古籍，不声称取法已获验证。限制声明不能抵消正文越界。`},
    {role:'user',content:stableOutputJson({context_id:context.context_id,task:'trend',question:context.question,
      packets:context.packets.map(p=>{if(p.kind!=='relation')return p;const {identity_facts,...compact}=p;return compact;}),response_schema:PACKET_LED_SCHEMA})}];
}
