// Offline candidate only. Recognizes whole-factor, standalone primary-line assertions.
// Unmatched prose is unassessed, never a pass or an error.
export const EXPLICIT_FACTS_VERSION = 'explicit-primary-facts-dev-1';
const positions = new Map([...['1','2','3','4','5','6'], ...['一','二','三','四','五','六']].map((n,i)=>[n,i%6]));
const relativePattern = /^(?:本卦)?第([1-6一二三四五六])爻的六亲(?:为|是)(父母|兄弟|子孙|妻财|官鬼)$/;
const rolePattern = /^(?:本卦)?第([1-6一二三四五六])爻(不是|是|非|为)(世爻|应爻)$/;
function recognize(text) {
  if (typeof text !== 'string') return null;
  // Only one complete sentence; questions, quotations, conditions, changed/hidden
  // components and extra reasoning cannot match this anchored grammar.
  const statement = text.trim().replace(/[。.]$/, '').replace(/\s+/g, '');
  let match = relativePattern.exec(statement);
  if (match) return {id:`fact:/lines/${positions.get(match[1])}/relative`,asserted:match[2]};
  match = rolePattern.exec(statement);
  if (match) return {id:`fact:/lines/${positions.get(match[1])}/${match[3]==='世爻'?'is_shi':'is_ying'}`,
    asserted:match[2]==='是'||match[2]==='为'};
  return null;
}
export function checkExplicitPrimaryFacts(answer, registry) {
  if (!Array.isArray(answer?.factors) || !Array.isArray(registry)) throw Error('Missing factors/evidence');
  const evidence = new Map();
  for (const source of registry) {
    if (!source?.id || evidence.has(source.id)) throw Error('Duplicate or missing evidence ID');
    evidence.set(source.id, source);
  }
  const factors = answer.factors.map((factor,index)=>{
    if (typeof factor?.interpretation!=='string'||!Array.isArray(factor.evidence_ids)) throw Error('Invalid factor');
    const path=`/factors/${index}/interpretation`, claim=recognize(factor.interpretation);
    if (!claim) return {path,text:factor.interpretation,status:'unassessed',reason:'outside_supported_grammar'};
    const source=evidence.get(claim.id);
    if (!source || source.kind!=='program_fact' || !Object.hasOwn(source,'value'))
      return {path,text:factor.interpretation,status:'unassessed',reason:'source_missing',claim};
    if ((claim.id.endsWith('/relative') && !['父母','兄弟','子孙','妻财','官鬼'].includes(source.value)) ||
        (!claim.id.endsWith('/relative') && typeof source.value!=='boolean')) throw Error('Invalid source fact type');
    const cited=factor.evidence_ids.map(id=>evidence.get(id));
    const consistent=claim.asserted===source.value;
    return {path,text:factor.interpretation,status:'checked',claim,actual:source.value,consistent,
      direct_citation:factor.evidence_ids.includes(claim.id),
      rule_mentions_source:cited.some(e=>e?.kind==='rule_result'&&e.source_facts?.includes(claim.id)),
      unknown_citations:factor.evidence_ids.filter(id=>!evidence.has(id))};
  });
  const checked=factors.filter(f=>f.status==='checked');
  return {version:EXPLICIT_FACTS_VERSION,scope:'Whole-factor standalone primary-line assertions only',
    checked:checked.length,conflicts:checked.filter(f=>!f.consistent).length,
    missing_direct_citations:checked.filter(f=>!f.direct_citation).length,
    unassessed:factors.length-checked.length,factors};
}
