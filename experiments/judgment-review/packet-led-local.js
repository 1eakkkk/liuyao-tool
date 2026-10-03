// Offline candidate: local program evidence, question interpretation and advice stay separate.
import {hashOutput} from '../../src/ai/output/context.js';
import {validateOutputShape,stableOutputJson} from '../../src/ai/output/contract.js';
import {collectEvidencePresentation} from '../../src/ai/output/evidence-presentation.js';
import {evidenceText} from '../../src/ai/output/view.js';
import {createPacketPriorityContext,PACKET_PRIORITY_SCHEMA,PACKET_PRIORITY_VERSION,packetPriorityMessages,validatePacketPriorityAnswer} from './packet-led-priority.js';
export const PACKET_LOCAL_VERSION='packet-led-local-offline-1';
const schema=structuredClone(PACKET_PRIORITY_SCHEMA);
schema.properties.schema_version={const:PACKET_LOCAL_VERSION};
const factor=schema.properties.factors.items;
factor.properties.question_relevance=factor.properties.interpretation;
delete factor.properties.interpretation;
factor.properties.basis_ids={type:'array',items:{type:'string',minLength:1,maxLength:180},minItems:1,maxItems:4,uniqueItems:true};
factor.required=Object.keys(factor.properties);
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export const PACKET_LOCAL_SCHEMA=freeze(schema);
const sources=new WeakMap();
export async function createPacketLocalContext(source){
  const base=await createPacketPriorityContext(source);
  const context={version:PACKET_LOCAL_VERSION,task:base.task,question:base.question,source_context_id:base.source_context_id,
    packets:base.packets,response_schema:PACKET_LOCAL_SCHEMA};
  context.context_id=await hashOutput(context);sources.set(context,{base,source});return Object.freeze(context);
}
function trusted(c){const state=sources.get(c);if(!state)throw Error('Untrusted local context');return state;}
function dense(v,seen=new Set()){
  if(!v||typeof v!=='object')return;if(seen.has(v))throw Error('Cyclic model value');seen.add(v);
  if(Array.isArray(v))for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))throw Error('Sparse model arrays rejected');
  Object.values(v).forEach(child=>dense(child,seen));seen.delete(v);
}
function packetBasis(p){return p.kind==='role_profile'?p.facts.map(f=>f.id):[p.rule.id,...p.premises.map(f=>f.id),...p.identity_facts.map(f=>f.id)];}
function adapt(a,c){return {...a,schema_version:PACKET_PRIORITY_VERSION,context_id:trusted(c).base.context_id,
  factors:a.factors.map(f=>{const {basis_ids,question_relevance,...rest}=f;return {...rest,interpretation:question_relevance};})};}
function factorCovers(f,role,c){
  return f.basis_ids.includes(role.relative_fact_id)||c.packets.some(p=>p.kind==='relation'&&f.basis_ids.includes(p.rule.id)&&p.participants.includes(role.id));
}
export function validatePacketLocalAnswer(a,c){
  const {base}=trusted(c);dense(a);validateOutputShape(a,PACKET_LOCAL_SCHEMA);
  if(a.context_id!==c.context_id)throw Error('Context mismatch');
  validatePacketPriorityAnswer(adapt(a,c),base);
  for(const f of a.factors){
    const packets=f.packet_ids.map(id=>c.packets.find(p=>p.id===id));
    const allowed=new Set(packets.flatMap(packetBasis));
    if(f.basis_ids.some(id=>!allowed.has(id)))throw Error('Basis absent from selected packets');
    if(packets.some(p=>!packetBasis(p).some(id=>f.basis_ids.includes(id))))throw Error('Unused packet selection');
  }
  for(const focus of a.focus){
    const role=c.packets.find(p=>p.id===focus.packet_id);
    if(!a.factors.some(f=>factorCovers(f,role,c)))throw Error('Focus absent from local basis');
    if(a.conclusion.direction!=='unclear'&&!a.factors.some(f=>f.priority==='primary'&&factorCovers(f,role,c)))throw Error('Focus absent from primary local basis');
  }
  return a;
}
export function packetLocalView(a,c){
  validatePacketLocalAnswer(a,c);const {source}=trusted(c),registry=new Map(source.evidence.map(e=>[e.id,e]));
  const factors=a.factors.map(f=>{
    const shown=collectEvidencePresentation(source.evidence,f.basis_ids),premises=new Set(shown.rules.flatMap(r=>r.entry.source_facts));
    const facts=new Map(shown.facts.map(v=>[v.entry.id,{id:v.entry.id,text:evidenceText(v.entry),direct:v.direct,rule_premise:premises.has(v.entry.id),identity_background:false}]));
    // Selected rules add only participant six-relative identity, not every participant state.
    for(const r of shown.rules){const p=c.packets.find(p=>p.kind==='relation'&&p.rule.id===r.entry.id);
      for(const id of p.participants){const role=c.packets.find(p=>p.id===id);
        if(!facts.has(role.relative_fact_id))facts.set(role.relative_fact_id,{id:role.relative_fact_id,text:evidenceText(registry.get(role.relative_fact_id)),direct:false,rule_premise:false,identity_background:true});
      }
    }
    return {id:f.id,priority:f.priority,effect:f.effect,selected_basis_ids:[...f.basis_ids],program_basis:{facts:[...facts.values()],
      rules:shown.rules.map(r=>({id:r.entry.id,text:evidenceText(r.entry),source_ids:[...r.entry.source_facts]}))},
      question_interpretation:{relevance:f.question_relevance,assumption:f.assumption,limitation:f.limitation}};
  });
  return {summary:a.conclusion.answer,direction:a.conclusion.direction,tradeoff_reason:a.tradeoff_reason,
    focus:a.focus.map(f=>({packet_id:f.packet_id,program_identity:evidenceText(registry.get(c.packets.find(p=>p.id===f.packet_id).relative_fact_id)),role_hypothesis:f.role_hypothesis})),
    factors,general_advice:[...a.general_advice],uncertainties:[...a.uncertainties],
    mechanical_check:'local_basis_membership_closure_and_focus_only',semantic_acceptance:'unassessed',forecast_accuracy:'unassessed'};
}
export function packetLocalMessages(c){
  const messages=packetPriorityMessages(trusted(c).base),payload=JSON.parse(messages[1].content);
  payload.context_id=c.context_id;payload.response_schema=PACKET_LOCAL_SCHEMA;
  return [{role:'system',content:messages[0].content.replaceAll(PACKET_PRIORITY_VERSION,PACKET_LOCAL_VERSION)+
    '\n本候选每项因素另选一至四个basis_ids，只能是本段packet_ids包内已有事实ID或rule.id。选规则时程序自动展开严格来源与参与者六亲身份背景，不必再列规则来源ID；来源只为推导该规则，不自动支持其他解释。每个所选包至少提供一个局部依据。focus必须由所选局部六亲身份事实或实际参与关系规则覆盖；明确方向须由primary的局部依据覆盖。'+
    '\n因素使用question_relevance而不是interpretation：只解释所选依据在当前问题中的可能对应、影响途径，不复述爻位、属性、旺衰和关系。原值由程序显示。assumption与limitation分别写取象假设和不能确认之处。不能关联当前目标就省略因素，不拿实用建议代替依据；unclear仍允许零因素。general_advice单列现实建议，不能以“必须如此才成功”将建议伪装成卦盘必要条件。字段拆分不代表解释已经验证。'},
    {role:'user',content:stableOutputJson(payload)}];
}
