// @vitest-environment node
import {test,expect} from 'vitest';
import {prepareKnowledgePairs} from '../../experiments/reading-quality/knowledge-pairs.js';
import {checkLayeredOutput,LAYERED_OUTPUT_VERSION} from '../../experiments/reading-quality/layered-output.js';
import {checkSourcedOutput,SOURCED_OUTPUT_VERSION,sourcedOutputInstructions} from '../../experiments/reading-quality/sourced-output.js';
const plan=await prepareKnowledgePairs();
function answer(c=plan.cases[0],withLiterature=true) {
  const card=c.arms[1].material.packet.cards[0];
  return {schema_version:SOURCED_OUTPUT_VERSION,conclusion:'仅解释名称，不由此判断个案结果。',
    facts:c.evidence.filter(e=>e.kind==='program_fact').map(e=>({evidence_id:e.id,value:structuredClone(e.value)})),
    rules:c.evidence.filter(e=>e.kind==='rule_result').map(e=>({evidence_id:e.id,result:structuredClone(e.result)})),
    interpretations:[{text:'原文用于解释名称，现代整理限制本次引用范围。',fact_ids:c.evidence.filter(e=>e.kind==='program_fact').map(e=>e.id),
      rule_ids:c.evidence.filter(e=>e.kind==='rule_result').map(e=>e.id),literature_ids:withLiterature?[card.literature_id]:[],
      applicability:c.selections[0].reason,uncertainties:['尚未证明个案结果。'],
      source_claims:withLiterature?[{literature_id:card.literature_id,field:'/original_text',origin:'source_transcription',quote:card.original_text},
        {literature_id:card.literature_id,field:'/exclusions/statements/0',origin:'modern_editorial',quote:card.exclusions.statements[0]}]:[]}],advice:[]};
}
const c=plan.cases[0],packet=c.arms[1].material.packet;
test.each(plan.cases)('links original and editorial quotes without changing facts: $id',c=>{
  const a=answer(c),before=JSON.stringify(a),p=c.arms[1].material.packet;
  const result=checkSourcedOutput(a,c.evidence,p);
  expect(result.mechanical_ok).toBe(true);expect(result.sources[0].claims.map(c=>c.origin)).toEqual(['source_transcription','modern_editorial']);
  expect(result.production_ready).toBe(false);expect(result.acceptance).toBe('not_established');expect(JSON.stringify(a)).toBe(before);
});
test.each(['wrong_origin','invented_quote','wrong_field','unlinked_card','missing_claim','error_example','prototype_path','invalid_index'])('rejects linkage defect: %s',kind=>{
  const a=answer(),claim=a.interpretations[0].source_claims[0];
  if(kind==='wrong_origin') a.interpretations[0].source_claims[1].origin='source_transcription';
  if(kind==='invented_quote') claim.quote='该段也明确不推定无用、永久失效或吉凶';
  if(kind==='wrong_field') claim.field='/editorial_summary';
  if(kind==='unlinked_card') claim.literature_id='literature:unknown';
  if(kind==='missing_claim') a.interpretations[0].source_claims=[];
  if(kind==='error_example') claim.field='/editorial_guidance/overreach_example';
  if(kind==='prototype_path') claim.field='/__proto__/polluted';
  if(kind==='invalid_index') a.interpretations[0].source_claims[1].field='/exclusions/statements/01';
  expect(checkSourcedOutput(a,c.evidence,packet).mechanical_ok).toBe(false);
});
test('every cited literature ID must have a correctly connected quote',()=>{
  const a=answer();a.interpretations[0].source_claims[0].quote='伪造';a.interpretations[0].source_claims.pop();
  const result=checkSourcedOutput(a,c.evidence,packet);
  expect(result.sources[0].missing_literature_claims).toEqual(a.interpretations[0].literature_ids);
});
test('no literature is a valid control arm, not a requirement to invent a quotation',()=>{
  expect(checkSourcedOutput(answer(c,false),c.evidence,c.arms[0].material.packet).mechanical_ok).toBe(true);
  const a=answer();a.interpretations[0].literature_ids=[];
  expect(checkSourcedOutput(a,c.evidence,packet).mechanical_ok).toBe(false);
});
test('wrong fact values and missing rule dependencies remain failures',()=>{
  const a=answer();a.facts[0].value='伪造';expect(checkSourcedOutput(a,c.evidence,packet).mechanical_ok).toBe(false);
  const b=answer(),required=c.evidence.find(e=>e.kind==='rule_result').source_facts[0];
  b.interpretations[0].fact_ids=b.interpretations[0].fact_ids.filter(id=>id!==required);
  expect(checkSourcedOutput(b,c.evidence,packet).mechanical_ok).toBe(false);
});
test.each(['missing','duplicate','extra','wrong_version','ambiguous_packet'])('rejects malformed candidate: %s',kind=>{
  const a=answer(),p=structuredClone(packet);
  if(kind==='missing') delete a.interpretations[0].source_claims;
  if(kind==='duplicate') a.interpretations[0].source_claims.push(a.interpretations[0].source_claims[0]);
  if(kind==='extra') a.interpretations[0].source_claims[0].independent_evidence=true;
  if(kind==='wrong_version') a.schema_version=LAYERED_OUTPUT_VERSION;
  if(kind==='ambiguous_packet') p.cards[0].field_origins.exclusions='source_transcription';
  expect(()=>checkSourcedOutput(a,c.evidence,p)).toThrow();
});
test('valid linkage cannot prove free text attribution or semantics',()=>{
  const a=answer();a.interpretations[0].text='古籍原文明确说现代编辑的所有限制，事情必成。';
  const result=checkSourcedOutput(a,c.evidence,packet);
  expect(result.mechanical_ok).toBe(true);expect(result.sources[0].free_text_attribution).toBe('unassessed');
  expect(result.sources[0].semantic_support).toBe('unassessed');expect(result.production_ready).toBe(false);
});
test('old dev-2 contract remains separate and candidate prompt declares its own version',()=>{
  const a=answer();a.schema_version=LAYERED_OUTPUT_VERSION;delete a.interpretations[0].source_claims;
  expect(checkLayeredOutput(a,c.evidence,packet).mechanical_ok).toBe(true);
  expect(()=>checkSourcedOutput(a,c.evidence,packet)).toThrow();
  expect(sourcedOutputInstructions()).toContain(SOURCED_OUTPUT_VERSION);
  expect(sourcedOutputInstructions()).not.toContain(`"schema_version":"${LAYERED_OUTPUT_VERSION}"`);
  const example=JSON.parse(sourcedOutputInstructions().split('返回 JSON：\n')[1].split('\n文献是')[0]);
  expect(example.schema_version).toBe(SOURCED_OUTPUT_VERSION);expect(example.interpretations[0].source_claims).toHaveLength(1);
});
