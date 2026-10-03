import {test,expect} from 'vitest';
import fs from 'node:fs';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createPacketLocalContext,validatePacketLocalAnswer} from '../../experiments/judgment-review/packet-led-local.js';
import {auditPacketLocalAnswer} from '../../experiments/judgment-review/packet-local-audit.js';
const dir='docs/acceptance/packet-local-live-20261003';
async function setup(){const p=JSON.parse(fs.readFileSync(dir+'/plan.json')),raw=fs.readFileSync(dir+'/trend-spare-key-response.txt','utf8');return {c:await createPacketLocalContext(await buildOutputContext(p.cases[0].canonical,{includeMissingRecords:true})),a:JSON.parse(raw),raw};}
test('first mixed error does not hide five independently discoverable reference namespace errors',async()=>{
  const {c,a,raw}=await setup(),before=JSON.stringify(a),r=auditPacketLocalAnswer(a,c);
  expect(r.first_error).toBe('Mixed requires explicit opposed major effects');expect(r.reference_findings).toHaveLength(5);
  expect(r.reference_findings.every(f=>f.kind==='packet_id_used_as_basis'&&!f.relation_packet_selected)).toBe(true);
  expect(r.semantic_acceptance).toBe('unassessed');expect(r.response_modified).toBe(false);expect(JSON.stringify(a)).toBe(before);
  expect(fs.readFileSync(dir+'/trend-spare-key-response.txt','utf8')).toBe(raw);
});
test('correcting only direction or rule prefixes still leaves the original reference scope invalid',async()=>{
  const {c,a}=await setup();a.conclusion.direction='unclear';expect(()=>validatePacketLocalAnswer(a,c)).toThrow('Basis absent');
  a.factors.forEach(f=>{f.basis_ids=f.basis_ids.map(id=>id.replace(/^rel:/,''));});
  expect(()=>validatePacketLocalAnswer(a,c)).toThrow('Basis absent');
  const r=auditPacketLocalAnswer(a,c);expect(r.reference_findings.filter(f=>f.kind==='basis_outside_factor_packets')).toHaveLength(5);
});
test('hidden role legitimately shares primary moving fact without supplying its six-relative identity',async()=>{
  const {c,a}=await setup();expect(c.packets.find(p=>p.id==='role:hidden:4').facts.some(f=>f.id==='fact:/lines/3/moving')).toBe(true);
  expect(auditPacketLocalAnswer(a,c).reference_findings.some(f=>f.kind==='unused_packet'&&f.id==='role:hidden:4')).toBe(false);
  expect(a.factors[2].basis_ids).not.toContain('fact:/lines/3/hidden/relative');
});
test('diagnostics cannot trust cloned contexts or certify valid-looking unsupported prose',async()=>{
  const {c,a}=await setup();expect(()=>auditPacketLocalAnswer(a,structuredClone(c))).toThrow('Untrusted');
  a.conclusion.direction='unclear';a.focus=[];a.factors=[];a.conclusion.answer='钥匙一定会找回。';
  const r=auditPacketLocalAnswer(a,c);expect(r.mechanical_status).toBe('validated');expect(r.semantic_acceptance).toBe('unassessed');
});
test('malformed, sparse and cyclic values stop diagnostic traversal safely',async()=>{
  const {c,a}=await setup();a.factors=new Array(1);expect(auditPacketLocalAnswer(a,c).reference_findings).toEqual([]);
  a.factors=[a];expect(auditPacketLocalAnswer(a,c).first_error).toContain('Cyclic');
  expect(auditPacketLocalAnswer(null,c).mechanical_status).toBe('rejected');
});
test('cross-context identity does not produce an invented local reference audit',async()=>{
  const {c,a}=await setup();a.context_id='foreign';const r=auditPacketLocalAnswer(a,c);expect(r.first_error).toContain('mismatch');expect(r.reference_findings).toEqual([]);
});
