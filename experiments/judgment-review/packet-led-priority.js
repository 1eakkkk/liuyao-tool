// Offline follow-up candidate. One priority per factor replaces conflicting parallel arrays.
import {hashOutput} from '../../src/ai/output/context.js';
import {validateOutputShape,stableOutputJson} from '../../src/ai/output/contract.js';
import {createPacketLedContext,PACKET_LED_SCHEMA,PACKET_LED_VERSION,packetLedMessages,validatePacketLedAnswer,packetLedView} from './packet-led.js';
export const PACKET_PRIORITY_VERSION='packet-led-priority-offline-1';
const baseSchema=structuredClone(PACKET_LED_SCHEMA);
const properties={...baseSchema.properties,schema_version:{const:PACKET_PRIORITY_VERSION},
  factors:{...baseSchema.properties.factors,items:{...baseSchema.properties.factors.items,
    properties:{...baseSchema.properties.factors.items.properties,priority:{enum:['primary','counter','background']}},
    required:[...baseSchema.properties.factors.items.required,'priority']}}};
delete properties.major_factor_ids;delete properties.counter_factor_ids;
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export const PACKET_PRIORITY_SCHEMA=freeze({...baseSchema,properties,required:Object.keys(properties)});
const underlying=new WeakMap();
export async function createPacketPriorityContext(source){
  const base=await createPacketLedContext(source);
  const context={version:PACKET_PRIORITY_VERSION,task:'trend',question:base.question,source_context_id:base.source_context_id,
    packets:base.packets,response_schema:PACKET_PRIORITY_SCHEMA};
  context.context_id=await hashOutput(context);underlying.set(context,base);return Object.freeze(context);
}
function requireContext(c){const base=underlying.get(c);if(!base)throw Error('Untrusted priority context');return base;}
function adapt(a,c){const base=requireContext(c);return {...a,schema_version:PACKET_LED_VERSION,context_id:base.context_id,
  major_factor_ids:a.factors.filter(f=>f.priority==='primary').map(f=>f.id),counter_factor_ids:a.factors.filter(f=>f.priority==='counter').map(f=>f.id),
  factors:a.factors.map(f=>{const {priority,...rest}=f;return rest;})};}
function dense(v,seen=new Set()){
  if(!v||typeof v!=='object')return;if(seen.has(v))throw Error('Cyclic model value');seen.add(v);
  if(Array.isArray(v))for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))throw Error('Sparse model arrays rejected');
  for(const child of Object.values(v))dense(child,seen);seen.delete(v);
}
export function validatePacketPriorityAnswer(a,c){
  requireContext(c);dense(a);validateOutputShape(a,PACKET_PRIORITY_SCHEMA);
  if(a.context_id!==c.context_id)throw Error('Context mismatch');
  validatePacketLedAnswer(adapt(a,c),requireContext(c));return a;
}
export function packetPriorityView(a,c){validatePacketPriorityAnswer(a,c);return {...packetLedView(adapt(a,c),requireContext(c)),
  priority_policy:'one_model_priority_per_factor',semantic_acceptance:'unassessed'};}
export function packetPriorityMessages(c){
  const base=requireContext(c),messages=packetLedMessages(base),payload=JSON.parse(messages[1].content);
  payload.context_id=c.context_id;payload.response_schema=PACKET_PRIORITY_SCHEMA;
  return [{role:'system',content:messages[0].content.replaceAll(PACKET_LED_VERSION,PACKET_PRIORITY_VERSION)+
    '\n每项因素只有一个priority：primary（主要）、counter（需权衡）、background（背景）。没有major_factor_ids或counter_factor_ids数组，不输出这些字段。主要／需权衡列表由程序按priority生成；不能重复创建同一因素来绕过单选。明确方向及mixed的原有约束不变，unclear不强迫主次。'},
    {role:'user',content:stableOutputJson(payload)}];
}
