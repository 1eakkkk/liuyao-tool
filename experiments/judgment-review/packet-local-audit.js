// Diagnostic only. Never repairs a response or promotes it to semantic acceptance.
import {PACKET_LOCAL_SCHEMA,packetLocalMessages,validatePacketLocalAnswer} from './packet-led-local.js';
import {validateOutputShape} from '../../src/ai/output/contract.js';
const members=p=>p.kind==='role_profile'?p.facts.map(f=>f.id):[p.rule.id,...p.premises.map(f=>f.id),...p.identity_facts.map(f=>f.id)];
export function auditPacketLocalAnswer(answer,context){
  packetLocalMessages(context); // Require original trusted context, not a cloned catalog.
  let first_error=null;try{validatePacketLocalAnswer(answer,context);}catch(e){first_error=e.message;}
  const result={mechanical_status:first_error?'rejected':'validated',first_error,reference_findings:[],semantic_acceptance:'unassessed',forecast_accuracy:'unassessed',response_modified:false};
  if(first_error&&/Cyclic|Sparse/.test(first_error))return result;
  try{validateOutputShape(answer,PACKET_LOCAL_SCHEMA);}catch{return result;}
  if(answer.context_id!==context.context_id)return result;
  const packets=new Map(context.packets.map(p=>[p.id,p])),all=new Set(context.packets.flatMap(members));
  for(const f of answer.factors){
    const chosen=f.packet_ids.map(id=>packets.get(id));
    for(const id of f.packet_ids)if(!packets.has(id))result.reference_findings.push({factor_id:f.id,kind:'unknown_packet',id});
    const allowed=new Set(chosen.filter(Boolean).flatMap(members));
    for(const id of f.basis_ids){
      if(allowed.has(id))continue;
      const p=packets.get(id);
      if(p?.kind==='relation')result.reference_findings.push({factor_id:f.id,kind:'packet_id_used_as_basis',id,rule_id:p.rule.id,relation_packet_selected:f.packet_ids.includes(id)});
      else result.reference_findings.push({factor_id:f.id,kind:all.has(id)?'basis_outside_factor_packets':'unknown_basis',id});
    }
    for(const p of chosen.filter(Boolean))if(!members(p).some(id=>f.basis_ids.includes(id)))result.reference_findings.push({factor_id:f.id,kind:'unused_packet',id:p.id});
  }
  return result;
}
