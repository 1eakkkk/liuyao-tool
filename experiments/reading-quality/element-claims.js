import {buildElementReference} from '../../src/ai/output/relation-reference.js';
const digits={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'两':2};
const n=s=>digits[s]||Number(s);
// Audit warnings only. Unmatched/conditional prose is unassessed, never a pass.
export function auditElementClaims(answer,context){
 const reference=buildElementReference(context),results=[];
 for(const [index,factor] of (answer.factors||[]).entries()){
  const unassessed=reason=>results.push({path:`/factors/${index}`,status:'unassessed',reason});
  const text=factor.interpretation;
  if(typeof text!=='string'||!Array.isArray(factor.evidence_ids))throw Error('Invalid factor');
  if(/[“”"‘’？?]|如果|假如|假设|是否|未必|可能|若|实际|有效|伏神|变爻|变卦/.test(text)){unassessed('outside_literal_scope');continue;}
  let matched=false;
  for(const clause of text.split(/[，,。；;\n]/)){
   const direct=/^(?:但|而)?第([1-6一二三四五六])爻(?:本爻)?(不生|生|不克|克)世爻$/.exec(clause.trim());
   const group=/^(?:但|而)?第([1-6一二三四五六])爻(?:本爻)?(?:与|和)第([1-6一二三四五六])爻(?:本爻)?(?:均|都)?(没有直接生扶|不生|生|不克|克)世爻$/.exec(clause.trim());
   if(!direct&&!group)continue;
   matched=true;
   let rows;
   if(direct)rows=[reference.to_shi[n(direct[1])-1]];
   else{
    // Named lines within the actual clause bind the group. Never infer pronouns
    // from a factor's other citations, even when their count happens to match.
    const sourceLines=[...new Set([n(group[1]),n(group[2])])];
    if(sourceLines.length!==2){unassessed('duplicate_group_sources');continue;}
    rows=sourceLines.map(line=>reference.to_shi[line-1]);
   }
   const assertion=direct?direct[2]:group[3];
   const expected=assertion.includes('克')?'controls':'generates';
   const negative=/^(?:不|没有)/.test(assertion);
   const consistent=rows.every(row=>negative?row.direction!==expected:row.direction===expected);
   const required=[...new Set(rows.flatMap(row=>row.source_fact_ids))];
   const missing=required.filter(id=>!factor.evidence_ids.includes(id));
   results.push({path:`/factors/${index}`,status:missing.length?'incomplete_citations':'checked',clause,direction_consistent:consistent,relations:rows,missing_direct_citations:missing});
  }
  if(!matched)unassessed('outside_supported_grammar');
 }
 return {version:'element-claims-dev-1',scope:'本爻对世爻的明确命名直述；不判断有效作用或全文正确',checked:results.filter(r=>r.status==='checked').length,
  incomplete_citations:results.filter(r=>r.status==='incomplete_citations').length,
  conflicts:results.filter(r=>r.direction_consistent===false).length,unassessed:results.filter(r=>r.status==='unassessed').length,results};
}
