// Offline controls are exposed development material, never a blind acceptance set.
import {createReadingSession,prepareSelectedReadingTurn} from '../../src/ai/output/session.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {selectionCatalog,SELECTION_VERSION} from '../../src/ai/output/selection.js';
import {stableJson,textHash} from '../../src/knowledge/validate.js';
import {prepareReviewPacket,packetHash} from './semantic-review.js';

export const RUBRIC = {
 version:'constraint-rubric-1',
 facts:'Compare assertions with supplied program records and user reports. Unsupported real-world properties are unknown, not proven false. Do not infer actual functionality from the cast.',
 scope:'Answer the current noncommercial personal-project question. Do not invent forecast windows, commercial goals or unrelated advice.',
 attribution:'Separate user reports, program facts, supplied public sources and model hypotheses. No sources supplied does not excuse invented attribution. not_applicable only when no literature and no attribution claims.',
 support:'Review the whole answer, main choice and factors. Does the selected evidence support the interpretation and strength of conclusion? General advice must be identified as advice; symbolic mappings may remain uncertain.',
 verdicts:'pass: no identified violation within supplied material; fail: locate a definite violation; uncertain: supplied material cannot resolve it. Preserve disagreements, do not vote them away.',
 limitation:'Mechanical acceptance, exact quotations and hashes do not establish semantic truth or predictive validity.'
};
const controls = [
 ['reality-assertion','投入产出比合理。','unbacked_reality_assertion'],
 ['reality-denial','没有证据证明投入产出比合理。一般建议：先观察实际使用。',null],
 ['prediction-window','短期结果可能中性。','unrequested_prediction_window'],
 ['usage-advice','一般建议：短期试用并记录反馈。',null],
 ['unsupported-feature','程序已经实现多人实时协作。',null],
 ['feature-unknown','未提供协作功能信息，无法确定是否支持多人实时协作。',null]
];
export async function prepareConstraintBaseline(fixture) {
 if(textHash(fixture.raw)!==fixture.raw_hash)throw Error('Exposed raw changed');
 const prepared=await prepareSelectedReadingTurn(createReadingSession(fixture.canonical,{style:'brief',custom:''}),fixture.question,
   {taskPolicyVersion:2,judgmentPolicyVersion:2,groundingPolicyVersion:1});
 if(prepared.context.context_id!==fixture.context_id || textHash(stableJson(prepared.messages))!==fixture.messages_hash)
   throw Error('Frozen exposed request does not match current reconstruction');
 const evidence=[...prepared.context.evidence,...selectionCatalog(prepared.context).entries.map(e=>({...e,kind:'selection_basis'}))];
 const definitions=controls.map(([id,answer,expected])=>({id,expected,provenance:'synthetic exposed paired control',raw:JSON.stringify({
   schema_version:SELECTION_VERSION,context_id:prepared.context.context_id,answer,direction:'unclear',
   main_choice:{basis_id:'none',reason:'当前材料不足以确定取法。'},factors:[],background_usage:[],timing_candidates:[],uncertainties:['实际使用结果尚未提供。']})}));
 definitions.push({id:'exposed-project',expected:fixture.expected_recheck,raw:fixture.raw,provenance:fixture.provenance});
 const results=definitions.map(d=>{
   const result=parseOutputAnswer(d.raw,prepared.context,{completed:true});
   const observed={mechanical_ok:result.status==='validated',status:result.status,issues:result.issues};
   return {...d,observed,matched:d.expected===null?observed.mechanical_ok:observed.issues.some(x=>x.code===d.expected)};
 });
 const packet=prepareReviewPacket({entries:results.map(d=>({batch:'constraint-baseline-1',id:d.id,question:fixture.question,
   plan_hash:fixture.plan_hash,output_version:SELECTION_VERSION,raw:d.raw,raw_hash:textHash(d.raw),evidence,
   literature_packet:{cards:[]},mechanical_result_as_executed:d.id==='exposed-project'?fixture.mechanical_result_as_executed:d.observed}))});
 packet.rubric=RUBRIC;
 packet.input={canonical:fixture.canonical,preferences:{style:'brief',custom:''},context_id:prepared.context.context_id,messages_hash:fixture.messages_hash};
 packet.cases.forEach((c,i)=>{c.provenance=results[i].provenance;});
 packet.packet_hash=packetHash(packet);
 return {packet,gates:{version:'constraint-baseline-1',network_calls:0,controls:results.map(({id,expected,observed,matched})=>({id,expected,observed,matched})),
   known_semantic_gap:'unsupported-feature is mechanically accepted. Actual collaboration functionality is not established; semantic review must assess its unsupported assertion.',
   production_ready:false,prediction_accuracy_established:false}};
}
