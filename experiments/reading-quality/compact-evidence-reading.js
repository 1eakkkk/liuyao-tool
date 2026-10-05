import {prepareRelationReadingTurn} from './relation-reading.js';
// Evidence content deduplication candidate; no automatic network request.
// Keep the trusted context for parsing/history. Only remove duplicated request data.
export async function prepareCompactEvidenceTurn(session,question,options={}){
 const prepared=await prepareRelationReadingTurn(session,question,options);
 const payload=JSON.parse(prepared.messages[1].content),source=payload.input;
 const {hits,...ruleMetadata}=source.E_rule_results;
 payload.input={ai_input_schema_version:source.ai_input_schema_version,A_user_question:source.A_user_question,
  B_program_facts:source.B_program_facts,E_rule_results:{...ruleMetadata,hits_location:'evidence'},
  C_canonical_cast:source.C_canonical_cast,D_ai_task:source.D_ai_task,
  ...(source.background_search?{background_search:source.background_search}:{})};
 payload.evidence=prepared.context.evidence.map(e=>{
  if(e.kind==='program_fact')return {id:e.id,kind:e.kind,value:e.value};
  const hit=hits.find(h=>h.rule_id===e.rule_id&&JSON.stringify(h.target)===JSON.stringify(e.target));
  if(!hit)throw Error('Original rule metadata missing');
  return {id:e.id,kind:e.kind,rule_id:e.rule_id,target:e.target,result:e.result,source_facts:e.source_facts,
   origin:hit.origin,rule_version:hit.rule_version};
 });
 // All row attributes remain in C_canonical_cast; anchors only avoid index confusion.
 payload.line_reference=payload.line_reference.map(({line,fact_prefix})=>({line,fact_prefix}));
 payload.input_projection='compact-evidence-dev-1';
 prepared.messages[1].content=JSON.stringify(payload);
 prepared.messages[0].content+='\n本轮数据已去除重复展示：完整卦盘仍在 C_canonical_cast，evidence 保留全部事实值与规则的方向、目标及来源编号；label/path 和另一份重复规则列表仅是展示元数据。line_reference 只提供爻位到编号的对应。不得因没有重复副本而认为事实缺失，也不能补造或改变编号。';
 return prepared;
}
