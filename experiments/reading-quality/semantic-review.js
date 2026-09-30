// Offline retrospective review. Valid quotations do not prove a reviewer's judgment.
import { validateAiValue } from '../../src/ai/schemas.js';
import { stableJson, textHash } from '../../src/knowledge/validate.js';

export const REVIEW_VERSION = 'knowledge-semantic-review-dev-1';
export const DIMENSIONS = ['facts', 'scope', 'support', 'attribution'];
const object = properties => ({type:'object', properties, required:Object.keys(properties), additionalProperties:false});
const string = {type:'string'};
const array = items => ({type:'array',items});
const quote = object({start:{type:'integer',minimum:0},end:{type:'integer',minimum:1},text:string,
  evidence_ids:array(string),literature_ids:array(string)});
const assessment = object({verdict:{enum:['pass','fail','uncertain','not_applicable']},reason:string,quotes:array(quote)});
const schema = object({version:{const:REVIEW_VERSION},packet_hash:string,reviewer_id:string,
  review_kind:{const:'retrospective_nonblind'},reviews:array(object({id:string,attribution_claims:{enum:['none','present','uncertain']},
    ...Object.fromEntries(DIMENSIONS.map(d=>[d,assessment]))}))});
const require = (ok,message) => {if(!ok) throw Error(message);};
export function packetHash(packet) {
  const {packet_hash: ignored,...payload}=packet;
  return textHash(stableJson(payload));
}
export function prepareReviewPacket(archive) {
  require(Array.isArray(archive.entries) && archive.entries.length>0,'No archived responses');
  const cases=archive.entries.map(e=>{
    require(typeof e.raw==='string' && e.raw.trim() && textHash(e.raw)===e.raw_hash,'Archived raw hash mismatch');
    require(typeof e.plan_hash==='string' && /^sha256:[a-f0-9]{64}$/.test(e.plan_hash) &&
      typeof e.batch==='string' && e.batch.trim() && typeof e.id==='string' && e.id.trim() &&
      typeof e.output_version==='string' && typeof e.mechanical_result_as_executed?.mechanical_ok==='boolean' &&
      typeof e.question==='string' && Array.isArray(e.evidence) && Array.isArray(e.literature_packet?.cards), 'Incomplete archived context');
    const ids=e.evidence.map(x=>x.id), literature=e.literature_packet.cards.map(x=>x.literature_id);
    require([...ids,...literature].every(id=>typeof id==='string' && id.trim()) &&
      new Set(ids).size===ids.length && new Set(literature).size===literature.length,'Invalid or duplicate context reference');
    return {id:`${e.batch}/${e.id}`,question:e.question,plan_hash:e.plan_hash,output_version:e.output_version,
      raw_hash:e.raw_hash,raw:e.raw,evidence:structuredClone(e.evidence),literature_packet:structuredClone(e.literature_packet),
      mechanical_result_as_executed:structuredClone(e.mechanical_result_as_executed)};
  });
  require(new Set(cases.map(c=>c.id)).size===cases.length,'Duplicate archived response');
  const packet={version:REVIEW_VERSION,review_kind:'retrospective_nonblind',
    limitation:'Exposed development responses; independent reviewers do not make this a blind or prospective acceptance.',cases};
  return {...packet,packet_hash:packetHash(packet)};
}
function validatePacket(packet) {
  require(packet.version===REVIEW_VERSION && packet.review_kind==='retrospective_nonblind' &&
    packet.packet_hash===packetHash(packet),'Review packet changed');
  require(packet.cases.length>0 && new Set(packet.cases.map(c=>c.id)).size===packet.cases.length,'Invalid packet cases');
  for(const c of packet.cases) require(textHash(c.raw)===c.raw_hash,'Raw response changed');
}
export function reviewTemplate(packet) {
  validatePacket(packet);
  return {version:REVIEW_VERSION,packet_hash:packet.packet_hash,reviewer_id:'',review_kind:'retrospective_nonblind',
    reviews:packet.cases.map(c=>({id:c.id,attribution_claims:'uncertain',...Object.fromEntries(DIMENSIONS.map(d=>[d,{verdict:'uncertain',reason:'',quotes:[]}]))}))};
}
export function validateReview(review,packet) {
  validatePacket(packet);validateAiValue(review,schema);
  require(review.packet_hash===packet.packet_hash && review.reviewer_id.trim(),'Review context or reviewer missing');
  require(review.reviews.length===packet.cases.length,'Every archived response needs review');
  const seen=new Set();
  for(const r of review.reviews) {
    const c=packet.cases.find(c=>c.id===r.id);
    require(c && !seen.has(r.id),'Unknown or duplicate response');seen.add(r.id);
    require(r.attribution_claims!=='uncertain' || ['fail','uncertain'].includes(r.attribution.verdict),
      'Uncertain output attribution claims cannot be marked passed or not applicable');
    const facts=new Set(c.evidence.map(e=>e.id)), sources=new Set(c.literature_packet.cards.map(e=>e.literature_id));
    for(const d of DIMENSIONS) {
      const a=r[d];require(a.reason.trim() && a.quotes.length>0,'Assessment needs reason and exact raw quotation');
      require(a.verdict!=='not_applicable' || (d==='attribution' && !sources.size && r.attribution_claims==='none'),
        'Not applicable requires no supplied literature and an explicit review of absent output attribution claims');
      for(const q of a.quotes) {
        require(q.text.length>0 && q.end>q.start && q.end<=c.raw.length && c.raw.slice(q.start,q.end)===q.text,'Quote offsets must match raw UTF-16 text');
        require(new Set(q.evidence_ids).size===q.evidence_ids.length && q.evidence_ids.every(id=>facts.has(id)), 'Unknown or duplicate evidence reference');
        require(new Set(q.literature_ids).size===q.literature_ids.length && q.literature_ids.every(id=>sources.has(id)), 'Unknown or duplicate literature reference');
      }
      require(d!=='attribution' || !sources.size || a.quotes.some(q=>q.literature_ids.length),'Attribution review needs the supplied source reference');
    }
  }
  return review;
}
export function summarizeReviews(packet,reviews) {
  require(reviews.length>0,'No completed reviews');
  const reviewers=new Set();
  for(const r of reviews){validateReview(r,packet);require(!reviewers.has(r.reviewer_id.trim()),'Duplicate reviewer');reviewers.add(r.reviewer_id.trim());}
  const dimensions=Object.fromEntries(DIMENSIONS.map(d=>[d,Object.fromEntries(['pass','fail','uncertain','not_applicable'].map(v=>[v,0]))]));
  const disagreements=[];
  for(const c of packet.cases) for(const d of DIMENSIONS) {
    const verdicts=reviews.map(r=>({reviewer:r.reviewer_id,verdict:r.reviews.find(x=>x.id===c.id)[d].verdict}));
    for(const v of verdicts) dimensions[d][v.verdict]++;
    if(new Set(verdicts.map(v=>v.verdict)).size>1) disagreements.push({id:c.id,dimension:d,verdicts});
  }
  return {version:REVIEW_VERSION,packet_hash:packet.packet_hash,review_kind:packet.review_kind,
    responses:packet.cases.length,reviewers:[...reviewers],dimensions,disagreements,
    mechanical_failures:packet.cases.filter(c=>c.mechanical_result_as_executed?.mechanical_ok!==true).map(c=>c.id),
    production_ready:false,model_improvement_established:false,network_calls:0,
    limitation:'Counts are retrospective human/agent judgments, not prediction accuracy or independent unseen-case acceptance.'};
}
