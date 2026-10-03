import {test,expect} from 'vitest';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createPacketLedContext,validatePacketLedAnswer,packetLedView,packetLedMessages,PACKET_LED_VERSION} from '../../experiments/judgment-review/packet-led.js';
import {renderPacketLedPreview} from '../../experiments/judgment-review/packet-led-view.js';
async function setup(){const source=await buildOutputContext((await prepareJudgmentPlan()).cases[0].canonical,{includeMissingRecords:true});return {source,context:await createPacketLedContext(source)};}
function answer(c){return {schema_version:PACKET_LED_VERSION,context_id:c.context_id,task:'trend',conclusion:{direction:'unclear',answer:'这是离线结构样例，没有确认与当前目标有关的取法。'},focus:[],major_factor_ids:[],counter_factor_ids:[],tradeoff_reason:'未确认取法，不作优先判断。',factors:[],general_advice:[],uncertainties:['解释相关性与预测效果仍未验证。']};}
const factor=(packet_ids,id='f1',effect='conditional')=>({id,effect,packet_ids,interpretation:'仅展示程序依据的引用，不代表实际作用。',assumption:'没有认证取法。',limitation:'不能确认现实状态。'});
test('packets preserve exact program values and strict rule sources, with identity background separate',async()=>{
  const {source,context:c}=await setup(),p=c.packets.find(p=>p.kind==='relation'&&p.rule.id.includes('MONTH-STATE'));
  const e=source.evidence.find(e=>e.id===p.rule.id),a=answer(c);a.factors=[factor([p.id])];
  const f=packetLedView(a,c).factors[0];expect(f.rules[0].source_ids).toEqual(e.source_facts);
  expect(f.facts.filter(v=>v.rule_premise).map(v=>v.id).sort()).toEqual([...e.source_facts].sort());
  expect(f.facts.find(v=>v.id===`fact:/lines/${e.target.line-1}/relative`).rule_premise).toBe(false);
  expect(f.facts.find(v=>v.id===`fact:/lines/${e.target.line-1}/is_shi`)).toBeTruthy();
  f.facts[0].text='wrong';expect(packetLedView(a,c).factors[0].facts[0].text).not.toBe('wrong');
});
test('same rule/role selected twice in different forms is expanded and deduplicated, never counted as extra support',async()=>{
  const {context:c}=await setup(),p=c.packets.find(p=>p.kind==='relation'),a=answer(c);a.factors=[factor([p.id,p.participants[0]])];
  const v=packetLedView(a,c);expect(new Set(v.factors[0].facts.map(e=>e.id)).size).toBe(v.factors[0].facts.length);
  expect(v.distinct_relation_ids).toEqual([p.rule.id]);expect(v.direction).toBe('unclear');expect(v.semantic_acceptance).toBe('unassessed');
});
test('a relation participant can supply the role identity without redundant model IDs',async()=>{
  const {context:c}=await setup(),p=c.packets.find(p=>p.kind==='relation'&&p.participants.length===1),a=answer(c);
  a.focus=[{packet_id:p.participants[0],role_hypothesis:'只作结构关联测试。'}];a.factors=[factor([p.id],'f1','support')];a.major_factor_ids=['f1'];a.conclusion.direction='favorable';
  expect(validatePacketLedAnswer(a,c)).toBe(a);expect(packetLedView(a,c).focus[0].fact).toContain('六亲');
});
test('shi-ying negative flag source closure cannot lend focus to an unrelated third line',async()=>{
  const {context:c}=await setup(),p=c.packets.find(p=>p.kind==='relation'&&p.rule.id.includes('SHI-'))??c.packets.find(p=>p.kind==='relation'&&p.rule.id.includes('YING-'));
  expect(p).toBeTruthy();const unrelated=c.packets.find(r=>r.kind==='role_profile'&&r.target.component==='primary'&&!p.participants.includes(r.id));
  const a=answer(c);a.focus=[{packet_id:unrelated.id,role_hypothesis:'这个角色不是该关系参与者。'}];a.factors=[factor([p.id],'f1','support')];a.major_factor_ids=['f1'];a.conclusion.direction='favorable';
  expect(()=>validatePacketLedAnswer(a,c)).toThrow('Focus absent');
});
test('hidden, changed and primary profiles stay distinct; direction names and endpoints preserved',async()=>{
  const {source,context:c}=await setup();
  for(const p of c.packets.filter(p=>p.kind==='relation')){
    const original=source.evidence.find(e=>e.id===p.rule.id);expect(p.rule.source_ids).toEqual(original.source_facts);
    if(original.result.from){expect(p.participants).toContain(`role:${original.result.from.component}:${original.result.from.line}`);expect(p.participants).toContain(`role:${original.result.to.component}:${original.result.to.line}`);}
  }
  const role=c.packets.find(p=>p.kind==='role_profile'&&p.target.component==='primary');
  expect(role.facts.every(f=>!f.id.includes('/changed/relative')&&!f.id.includes('/hidden/relative'))).toBe(true);
});
test.each(['unknown','extra_value','three_packets','duplicate_factor','wrong_context','major_overlap','missing_major','bad_focus','wrong_task'])('rejects malformed answer: %s',async kind=>{
  const {context:c}=await setup(),a=answer(c);a.factors=[factor([c.packets[0].id])];
  if(kind==='unknown')a.factors[0].packet_ids=['fact:/lines/0/relative'];
  if(kind==='extra_value')a.factors[0].facts=[{value:'wrong'}];
  if(kind==='three_packets')a.factors[0].packet_ids=c.packets.slice(0,3).map(p=>p.id);
  if(kind==='duplicate_factor')a.factors.push({...structuredClone(a.factors[0]),effect:'neutral'});
  if(kind==='wrong_context')a.context_id+='x';
  if(kind==='major_overlap'){a.major_factor_ids=['f1'];a.counter_factor_ids=['f1'];}
  if(kind==='missing_major')a.major_factor_ids=['f2'];
  if(kind==='bad_focus')a.focus=[{packet_id:c.packets.find(p=>p.kind==='relation').id,role_hypothesis:'不能用关系冒充角色。'}];
  if(kind==='wrong_task')a.task='advice';
  expect(()=>validatePacketLedAnswer(a,c)).toThrow();
});
test('focus in an unselected neutral factor cannot lend identity to an unrelated major relation',async()=>{
  const {context:c}=await setup(),p=c.packets.find(p=>p.kind==='relation'&&p.participants.length===1),other=c.packets.find(p2=>p2.kind==='role_profile'&&!p.participants.includes(p2.id));
  const a=answer(c);a.factors=[factor([p.id],'f1','support'),factor([other.id],'f2','neutral')];a.focus=[{packet_id:other.id,role_hypothesis:'无关焦点'}];a.major_factor_ids=['f1'];a.conclusion.direction='favorable';
  expect(()=>validatePacketLedAnswer(a,c)).toThrow('selected major');
});
test('mixed requires opposite major effects; factor counts never choose direction',async()=>{
  const {context:c}=await setup(),a=answer(c);a.factors=[factor([c.packets[0].id],'f1','support'),factor([c.packets[1].id],'f2','oppose')];
  expect(packetLedView(a,c).direction).toBe('unclear');a.conclusion.direction='mixed';a.focus=[{packet_id:c.packets[0].id,role_hypothesis:'仅结构测试'}];a.major_factor_ids=['f1'];
  expect(()=>validatePacketLedAnswer(a,c)).toThrow('opposed major');a.major_factor_ids=['f1','f2'];expect(packetLedView(a,c).direction).toBe('mixed');
});
test('untrusted cloned source and cloned context, sparse arrays and cycles are rejected',async()=>{
  const {source,context:c}=await setup();await expect(createPacketLedContext(structuredClone(source))).rejects.toThrow('Trusted');
  expect(()=>packetLedMessages(structuredClone(c))).toThrow('Untrusted');const a=answer(c);a.factors=new Array(1);expect(()=>validatePacketLedAnswer(a,c)).toThrow('Sparse');
  a.factors=[];a.loop=a;expect(()=>validatePacketLedAnswer(a,c)).toThrow('Cyclic');
});
test('messages link participant profiles rather than duplicate background; DOM is safe and validation atomic',async()=>{
  const {context:c}=await setup(),payload=JSON.parse(packetLedMessages(c)[1].content),a=answer(c),el=document.createElement('div');
  expect(payload.packets.filter(p=>p.kind==='relation').every(p=>!Object.hasOwn(p,'identity_facts'))).toBe(true);
  expect(payload.packets.some(p=>p.kind==='role_profile')).toBe(true);
  a.conclusion.answer='<img src=x onerror=alert(1)>';renderPacketLedPreview(el,a,c);expect(el.querySelector('img')).toBeNull();expect(el.textContent).toContain('<img');
  const previous=el.innerHTML;a.context_id='bad';expect(()=>renderPacketLedPreview(el,a,c)).toThrow();expect(el.innerHTML).toBe(previous);expect(el.querySelector('details details')).toBeNull();
});
