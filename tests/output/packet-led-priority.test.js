import {test,expect} from 'vitest';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createPacketPriorityContext,validatePacketPriorityAnswer,packetPriorityView,packetPriorityMessages,PACKET_PRIORITY_VERSION} from '../../experiments/judgment-review/packet-led-priority.js';
import {PACKET_LED_SCHEMA} from '../../experiments/judgment-review/packet-led.js';
async function setup(){const s=await buildOutputContext((await prepareJudgmentPlan()).cases[0].canonical,{includeMissingRecords:true}),c=await createPacketPriorityContext(s);return {s,c,a:{schema_version:PACKET_PRIORITY_VERSION,context_id:c.context_id,task:'trend',conclusion:{direction:'unclear',answer:'结构样例，不确认实际结果。'},focus:[],tradeoff_reason:'没有确认取法，不强迫主次。',factors:[{id:'f1',effect:'conditional',priority:'counter',packet_ids:[c.packets[0].id],interpretation:'只展示结构，不解释现实。',assumption:'未认证取法。',limitation:'不能确认作用。'}],general_advice:[],uncertainties:['未验证内容。']}};}
test('single factor priority generates disjoint lists; no parallel arrays enter the request',async()=>{
  const {c,a}=await setup(),v=packetPriorityView(a,c);expect(v.factors[0].counter).toBe(true);expect(v.factors[0].major).toBe(false);
  a.factors[0].priority='primary';const w=packetPriorityView(a,c);expect(w.factors[0].major).toBe(true);expect(w.factors[0].counter).toBe(false);
  const schema=JSON.parse(packetPriorityMessages(c)[1].content).response_schema;expect(schema.properties.major_factor_ids).toBeUndefined();expect(schema.properties.counter_factor_ids).toBeUndefined();
});
test.each(['major_factor_ids','counter_factor_ids'])('rejects legacy conflicting array %s',async field=>{
  const {c,a}=await setup();a[field]=['f1'];expect(()=>validatePacketPriorityAnswer(a,c)).toThrow('unknown_field');
});
test('priority has exactly one valid value, duplicates and sparse arrays are rejected',async()=>{
  const {c,a}=await setup();a.factors[0].priority=['primary','counter'];expect(()=>validatePacketPriorityAnswer(a,c)).toThrow();
  a.factors[0].priority='primary';a.factors.push({...structuredClone(a.factors[0]),priority:'counter'});expect(()=>validatePacketPriorityAnswer(a,c)).toThrow(/duplicate/i);
  a.factors=new Array(1);expect(()=>validatePacketPriorityAnswer(a,c)).toThrow('Sparse');
});
test('a counter factor cannot supply focus for unrelated primary factors',async()=>{
  const {c,a}=await setup(),p=c.packets.find(p=>p.kind==='relation'&&p.participants.length===1),r=c.packets.find(r=>r.kind==='role_profile'&&!p.participants.includes(r.id));
  a.focus=[{packet_id:r.id,role_hypothesis:'无关角色'}];a.factors[0].packet_ids=[p.id];a.factors[0].priority='primary';a.factors[0].effect='support';
  a.factors.push({...structuredClone(a.factors[0]),id:'f2',priority:'counter',packet_ids:[r.id]});a.conclusion.direction='favorable';expect(()=>validatePacketPriorityAnswer(a,c)).toThrow('selected major');
});
test('same opposite factors do not compute mixed, and mixed still needs opposite primary effects',async()=>{
  const {c,a}=await setup();a.factors[0].effect='support';a.factors[0].priority='primary';a.factors.push({...structuredClone(a.factors[0]),id:'f2',effect:'oppose',priority:'counter'});
  expect(packetPriorityView(a,c).direction).toBe('unclear');a.focus=[{packet_id:c.packets[0].id,role_hypothesis:'结构样例角色'}];a.conclusion.direction='mixed';expect(()=>validatePacketPriorityAnswer(a,c)).toThrow('opposed major');
  a.factors[1].priority='primary';expect(packetPriorityView(a,c).direction).toBe('mixed');
});
test('cloned contexts and sources, foreign answer identities are not trusted',async()=>{
  const {s,c,a}=await setup();await expect(createPacketPriorityContext(structuredClone(s))).rejects.toThrow('Trusted');expect(()=>packetPriorityMessages(structuredClone(c))).toThrow('Untrusted');
  a.context_id+='x';expect(()=>validatePacketPriorityAnswer(a,c)).toThrow('mismatch');
});
test('schema and nested definitions cannot be mutated through trusted context',async()=>{
  const {c}=await setup();expect(c.response_schema.properties.conclusion).not.toBe(PACKET_LED_SCHEMA.properties.conclusion);expect(c.response_schema.properties.focus).not.toBe(PACKET_LED_SCHEMA.properties.focus);
  expect(Object.isFrozen(c.response_schema)).toBe(true);expect(Object.isFrozen(c.response_schema.properties.factors.items.properties.priority)).toBe(true);
  expect(()=>{c.response_schema.properties.factors.items.properties.priority.enum.push('both');}).toThrow();
});
