// Registry-backed proof boundaries, not a verifier of symbolic applicability.
export const hasBasisScope=context=>[1,2,3,4].includes(context.conversation?.basis_policy);
export const hasTightBasisScope=context=>[2,3,4].includes(context.conversation?.basis_policy);
export const hasEffectConditions=context=>[3,4].includes(context.conversation?.basis_policy);
export const PROOF_SCOPE_RULES=Object.freeze({origin:'program_record',
 does_not_confirm:Object.freeze(['traditional_definition','target_applicability','effective_influence','real_world_state','prediction']),
 dependency_use:'same_record_chain_not_independent_support',explanation_origin:'model_hypothesis'});
export const PROOF_SCOPE_DEFINITIONS=Object.freeze({position_attributes:'recorded_attributes',rule_annotation:'rule_match',calculated_direction:'element_direction'});
export function basisScope(entry,context){
 const records=entry.ids.map(id=>context.evidence.find(e=>e.id===id));
 if(records.some(r=>!r))throw Error('Missing scope source');
 const kind=entry.target?'position_attributes':records.some(r=>r.kind==='rule_result')?'rule_annotation':'calculated_direction';
 return {kind,origin:PROOF_SCOPE_RULES.origin,confirms:PROOF_SCOPE_DEFINITIONS[kind],does_not_confirm:PROOF_SCOPE_RULES.does_not_confirm,
  supporting_record_ids:[...entry.ids],source_fact_ids:[...new Set(records.flatMap(r=>r.kind==='rule_result'?r.source_facts:[r.id]))],
  dependency_use:PROOF_SCOPE_RULES.dependency_use,explanation_origin:PROOF_SCOPE_RULES.explanation_origin};
}
export const scopeLabel=scope=>({position_attributes:'仅核对所列位置属性',rule_annotation:'仅核对规则命中及其程序来源',calculated_direction:'仅核对基础五行方向'})[scope.kind];

// Literal declarations only; a missing link differs from an unverified hypothesis/effect.
export function declaresUnresolvedLink(text){
 const pattern=/(?:关联|映射|取象|取法)(?:仍|尚|还)?(?:尚未建立|未建立|未成立|待建立|待落实|未能成立)/g;
 for(const match of text.matchAll(pattern)){
  const before=text.slice(0,match.index).split(/[，,。；;！？!?\n]/).at(-1);
  if(/(?:不能说|不能认定|并非|不是|不代表|不等于)\s*$/.test(before))continue;
  if(/(?:^|[：:])\s*(?:如果|假设|假如|若)/.test(before))continue;
  return true;
 }
 return false;
}

// Quote existence is provenance, not verification of truth or semantic entailment.
export function effectConditionIssue(application,assessment,question){
 if(application.effect_scope==='symbolic_only')return application.effect_conditions.length?'unexpected_effect_conditions':null;
 if(!application.effect_conditions.length)return 'missing_effect_conditions';
 for(const c of application.effect_conditions){
  if(c.status==='user_report'){
   if(c.user_quotes.length!==1||!/[\p{L}\p{N}]/u.test(c.user_quotes[0])||!question.includes(c.user_quotes[0]))return 'effect_condition_source_mismatch';
  }else if(c.user_quotes.length!==0)return 'unexpected_effect_source';
 }
 if(application.effect_conditions.some(c=>c.status==='unconfirmed')&&['support','oppose'].includes(assessment))return 'unconfirmed_effect_as_decisive';
 return null;
}
export function effectConditionLabel(application){
 if(application.effect_scope==='symbolic_only')return '作用范围：仅为象意推论，不确认现实条件。';
 return application.effect_conditions.map(c=>c.status==='user_report'
  ?`作用条件（AI整理，用户原句仅核对存在）：${c.condition}。原句：${c.user_quotes[0]}`
  :`作用条件（待核实）：${c.condition}`).join('\n');
}
