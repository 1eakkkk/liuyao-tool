import {test,expect} from 'vitest';
import fs from 'node:fs';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {PACKET_PRIORITY_SCHEMA} from '../../experiments/judgment-review/packet-led-priority.js';
import {createPacketLocalContext,PACKET_LOCAL_VERSION,packetLocalMessages,validatePacketLocalAnswer,packetLocalView} from '../../experiments/judgment-review/packet-led-local.js';
import {renderPacketLocalPreview} from '../../experiments/judgment-review/packet-led-local-view.js';
async function setup(){
  // Exposed first development case only; neither the uncalled case nor protected holdout is used.
  const input=JSON.parse(fs.readFileSync('docs/acceptance/packet-led-20261003/plan.json','utf8')).cases[0].canonical;
  const s=await buildOutputContext(input,{includeMissingRecords:true}),c=await createPacketLocalContext(s);
  const p=c.packets.find(p=>p.id==='role:primary:3'),r=c.packets.find(p=>p.kind==='relation'&&p.rule.id.startsWith('rule:SHI-CONTROL-YING'));
  const a={schema_version:PACKET_LOCAL_VERSION,context_id:c.context_id,task:'trend',conclusion:{direction:'unclear',answer:'尚未建立取法与目标的可靠对应，不能确认能否成册。'},
    focus:[],tradeoff_reason:'仅有程序事实不能确定私人相册能否成型。',factors:[{id:'f1',priority:'background',effect:'conditional',packet_ids:[p.id,r.id],
      basis_ids:['fact:/lines/2/relative',r.rule.id],question_relevance:'若暂将此类角色用于观察约束，需要先确认这种取象适合私人相册；不能由此推得整理容易。',
      assumption:'取象仅作待核对假设。',limitation:'盘面无法确认筛选标准或实际进度。'}],general_advice:['可以先试选一小组照片，再观察整理是否顺手。'],uncertainties:['所选取法尚未认证。']};
  return {s,c,p,r,a};
}
test('only local choices, strict rule closure and participant identities are displayed',async()=>{
  const {c,r,a}=await setup(),f=packetLocalView(a,c).factors[0];
  expect(f.program_basis.rules[0].source_ids).toEqual(r.rule.source_ids);
  for(const id of r.rule.source_ids)expect(f.program_basis.facts.find(f=>f.id===id)?.rule_premise).toBe(true);
  const role=c.packets.find(p=>p.id===r.participants[0]);
  const identity=f.program_basis.facts.find(f=>f.id===role.relative_fact_id);
  expect(identity.identity_background).toBe(true);expect(identity.rule_premise).toBe(false);
  expect(f.program_basis.facts.some(f=>f.id==='fact:/lines/2/relations/month_strength')).toBe(false);
  expect(f.program_basis.facts.some(f=>f.id==='fact:/lines/3/relative')).toBe(false);
});
test('a true fourth-line attribute outside the selected packets is rejected; selecting its role covers it',async()=>{
  const {c,r,a}=await setup();a.factors[0].basis_ids.push('fact:/lines/3/relative');
  expect(()=>validatePacketLocalAnswer(a,c)).toThrow('Basis absent');
  a.factors[0].packet_ids=['role:primary:4',r.id];a.factors[0].basis_ids=['fact:/lines/3/relative',r.rule.id];
  expect(packetLocalView(a,c).factors[0].program_basis.facts.some(f=>f.id==='fact:/lines/3/relative')).toBe(true);
});
test('changed and hidden roles cannot supply the primary relative or flying relationship',async()=>{
  const {c,a}=await setup(),f=a.factors[0];f.packet_ids=['role:changed:2','role:hidden:2'];
  f.basis_ids=['fact:/lines/1/changed/relative','fact:/lines/1/hidden/relative','fact:/lines/1/relative'];
  expect(()=>validatePacketLocalAnswer(a,c)).toThrow('Basis absent');
  const r=c.packets.find(p=>p.kind==='relation'&&p.participants.includes('role:hidden:2'));
  f.basis_ids=['fact:/lines/1/changed/relative',r.rule.id];expect(()=>validatePacketLocalAnswer(a,c)).toThrow('Basis absent');
  f.packet_ids=['role:changed:2',r.id];expect(packetLocalView(a,c).factors[0].program_basis.rules[0].id).toBe(r.rule.id);
});
test('negative shi/ying flags in a source closure cannot supply unrelated focus',async()=>{
  const {c,r,a}=await setup();a.factors[0].packet_ids=[r.id];a.factors[0].basis_ids=[r.rule.id];
  a.focus=[{packet_id:'role:primary:4',role_hypothesis:'无关角色'}];expect(()=>validatePacketLocalAnswer(a,c)).toThrow('Focus absent');
  a.focus[0].packet_id=r.participants[0];expect(()=>validatePacketLocalAnswer(a,c)).not.toThrow();
});
test('a packet alone cannot supply focus when its local identity or relation was not selected',async()=>{
  const {c,a}=await setup();a.factors[0].packet_ids=['role:primary:3'];a.factors[0].basis_ids=['fact:/lines/2/element'];
  a.focus=[{packet_id:'role:primary:3',role_hypothesis:'待认证取用'}];expect(()=>validatePacketLocalAnswer(a,c)).toThrow('Focus absent from local');
  a.factors[0].basis_ids.push('fact:/lines/2/relative');expect(()=>validatePacketLocalAnswer(a,c)).not.toThrow();
});
test('primary local basis, not a counter basis, must cover asserted-direction focus',async()=>{
  const {c,a}=await setup(),f=a.factors[0];f.priority='primary';f.effect='support';f.packet_ids=['role:primary:3'];f.basis_ids=['fact:/lines/2/relative'];
  a.factors.push({...structuredClone(f),id:'f2',priority:'counter',packet_ids:['role:primary:4'],basis_ids:['fact:/lines/3/relative']});
  a.focus=[{packet_id:'role:primary:4',role_hypothesis:'待核对'}];a.conclusion.direction='favorable';expect(()=>validatePacketLocalAnswer(a,c)).toThrow('selected major');
});
test('zero factors is valid for insufficient interpretation, with no invented facts',async()=>{
  const {c,a}=await setup();a.factors=[];const v=packetLocalView(a,c);expect(v.factors).toEqual([]);expect(v.direction).toBe('unclear');
});
test('advice and unsupported free prose never acquire automatic semantic acceptance',async()=>{
  const {c,a}=await setup();a.factors[0].question_relevance='第4爻官鬼金旺，所以一定能够迅速成册。';
  a.general_advice=['必须每天筛选，否则一定无法成册。'];
  // Deliberate semantic counterexample: membership cannot parse or prove this free-text assertion.
  const v=packetLocalView(a,c);expect(v.semantic_acceptance).toBe('unassessed');expect(v.forecast_accuracy).toBe('unassessed');
  expect(v.factors[0].program_basis.facts.some(f=>f.id==='fact:/lines/3/relative')).toBe(false);
  expect(v.general_advice).toEqual(a.general_advice);expect(v.factors[0].question_interpretation.relevance).toContain('一定');
});
test.each(['fact_text','interpretation','source_ids'])('model cannot insert a program fact or legacy field %s',async field=>{
  const {c,a}=await setup();a.factors[0][field]='wrong';expect(()=>validatePacketLocalAnswer(a,c)).toThrow('unknown_field');
});
test('unknown, duplicate, excessive and sparse local references fail closed',async()=>{
  const {c,a}=await setup(),f=a.factors[0];f.basis_ids.push('fact:/invented');expect(()=>validatePacketLocalAnswer(a,c)).toThrow('Basis absent');
  f.basis_ids=[f.basis_ids[0],f.basis_ids[0]];expect(()=>validatePacketLocalAnswer(a,c)).toThrow('duplicate');
  f.basis_ids=['1','2','3','4','5'];expect(()=>validatePacketLocalAnswer(a,c)).toThrow('invalid_count');
  f.basis_ids=new Array(1);expect(()=>validatePacketLocalAnswer(a,c)).toThrow('Sparse');
});
test('context and schema are isolated; cloned contexts and foreign identities are rejected',async()=>{
  const {s,c,a}=await setup();expect(c.response_schema.properties.conclusion).not.toBe(PACKET_PRIORITY_SCHEMA.properties.conclusion);
  expect(()=>packetLocalMessages(structuredClone(c))).toThrow('Untrusted');await expect(createPacketLocalContext(structuredClone(s))).rejects.toThrow('Trusted');
  a.context_id+='x';expect(()=>validatePacketLocalAnswer(a,c)).toThrow('mismatch');
  const payload=JSON.parse(packetLocalMessages(c)[1].content);expect(payload.response_schema.properties.factors.items.properties.interpretation).toBeUndefined();
  expect(Object.isFrozen(c.response_schema.properties.factors.items.properties.basis_ids)).toBe(true);
});
test('display separates interpretation, program basis and advice; text stays inert and failure is atomic',async()=>{
  const {c,a}=await setup(),container=document.createElement('main');a.general_advice=['<img src=x onerror=alert(1)>'];
  renderPacketLocalPreview(container,a,c);expect(container.textContent).toContain('问题对应解释');expect(container.textContent).toContain('现实建议');
  expect(container.querySelectorAll('img')).toHaveLength(0);expect(container.querySelectorAll('details details')).toHaveLength(0);
  const before=container.innerHTML;a.factors[0].basis_ids=['fact:/invented'];expect(()=>renderPacketLocalPreview(container,a,c)).toThrow();expect(container.innerHTML).toBe(before);
});
