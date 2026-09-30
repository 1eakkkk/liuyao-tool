// @vitest-environment node
import fs from 'node:fs';
import {test,expect} from 'vitest';
import {prepareReviewPacket,reviewTemplate,validateReview,summarizeReviews,DIMENSIONS} from '../../experiments/reading-quality/semantic-review.js';
const archive=JSON.parse(fs.readFileSync(new URL('../../docs/acceptance/knowledge-reading-pilot-20260930.json',import.meta.url),'utf8'));
const packet=prepareReviewPacket(archive);
function complete(id='test-reviewer') {
  const review=reviewTemplate(packet);review.reviewer_id=id;
  review.reviews.forEach((r,i)=>DIMENSIONS.forEach(d=>{
    const c=packet.cases[i];
    r.attribution_claims=c.literature_packet.cards.length?'present':'none';
    r[d]={verdict:d==='attribution' && !c.literature_packet.cards.length?'not_applicable':'uncertain',reason:'Synthetic validation fixture; no semantic judgment.',
      quotes:[{start:0,end:20,text:c.raw.slice(0,20),evidence_ids:[],literature_ids:c.literature_packet.cards.map(c=>c.literature_id)}]};
  }));return review;
}
test('packet preserves original raw and mechanical failure but excludes the author judgments',()=>{
  expect(packet.cases).toHaveLength(3);expect(packet.cases[0].mechanical_result_as_executed.mechanical_ok).toBe(false);
  packet.cases.forEach((c,i)=>{expect(c.raw).toBe(archive.entries[i].raw);expect(c.evidence).toEqual(archive.entries[i].evidence);expect(c).not.toHaveProperty('self_review');});
  expect(new Set(packet.cases.map(c=>c.id)).size).toBe(3);
});
test('pending templates cannot be reported as completed',()=>expect(()=>validateReview(reviewTemplate(packet),packet)).toThrow());
test('review binds all raw/context data to sealed packet and never mutates archived materials',()=>{
  const before=JSON.stringify(archive);expect(validateReview(complete(),packet)).toBeTruthy();expect(JSON.stringify(archive)).toBe(before);
  for(const change of [p=>p.cases[0].raw+='x',p=>p.cases[0].question+='x',p=>p.cases[0].evidence[0].value='tampered']) {
    const p=structuredClone(packet);change(p);expect(()=>validateReview(complete(),p)).toThrow('packet changed');
  }
});
test('missing, duplicate and unknown responses or reviewers are rejected',()=>{
  for(const mutate of [r=>r.reviews.pop(),r=>r.reviews[1]=r.reviews[0],r=>r.reviews[0].id='unknown',r=>r.reviewer_id=' ']) {
    const r=complete();mutate(r);expect(()=>validateReview(r,packet)).toThrow();
  }
  expect(()=>summarizeReviews(packet,[complete(),complete()])).toThrow('Duplicate reviewer');
});
test('false raw quotations, offsets and unknown references are rejected',()=>{
  for(const mutate of [q=>q.text='invented',q=>q.start++,q=>q.end=999999,q=>q.evidence_ids=['unknown'],q=>q.literature_ids=['unknown'],q=>q.evidence_ids=[packet.cases[0].evidence[0].id,packet.cases[0].evidence[0].id]]) {
    const r=complete();mutate(r.reviews[0].facts.quotes[0]);expect(()=>validateReview(r,packet)).toThrow();
  }
});
test('all verdicts need supporting quotation and rationale; not-applicable cannot hide unknown support',()=>{
  for(const mutate of [a=>a.reason='',a=>a.quotes=[],a=>a.verdict='not_applicable']) {
    const r=complete();mutate(r.reviews[0].support);expect(()=>validateReview(r,packet)).toThrow();
  }
  const r=complete();r.reviews[2].attribution.quotes[0].literature_ids=[];
  expect(()=>validateReview(r,packet)).toThrow('supplied source reference');
});
test('uncertainty and reviewer disagreement are counted separately; even all-pass cannot establish production readiness',()=>{
  const a=complete('a'),b=complete('b');a.reviews[2].attribution.verdict='fail';b.reviews[2].attribution.verdict='pass';
  const report=summarizeReviews(packet,[a,b]);expect(report.dimensions.attribution).toEqual({pass:1,fail:1,uncertain:0,not_applicable:4});
  expect(report.disagreements).toEqual([{id:packet.cases[2].id,dimension:'attribution',verdicts:[{reviewer:'a',verdict:'fail'},{reviewer:'b',verdict:'pass'}]}]);
  expect(report.mechanical_failures).toEqual([packet.cases[0].id]);expect(report.production_ready).toBe(false);
  for(const r of [a,b]) r.reviews.forEach(x=>DIMENSIONS.forEach(d=>{if(x[d].verdict!=='not_applicable') x[d].verdict='pass';}));
  expect(summarizeReviews(packet,[a,b]).model_improvement_established).toBe(false);
});
test('damaged archives reject before creating reviewer work',()=>{
  for(const mutate of [a=>a.entries[0].raw+='x',a=>a.entries.push(a.entries[0]),a=>delete a.entries[0].mechanical_result_as_executed,a=>a.entries[0].evidence.push(a.entries[0].evidence[0])]) {
    const a=structuredClone(archive);mutate(a);expect(()=>prepareReviewPacket(a)).toThrow();
  }
});
test('no supplied literature cannot automatically exempt fabricated or uncertain output attribution',()=>{
  for(const claims of ['present','uncertain']) {
    const r=complete();r.reviews[0].attribution_claims=claims;
    expect(()=>validateReview(r,packet)).toThrow(claims==='present'?'explicit review':'cannot be marked passed');
    r.reviews[0].attribution.verdict=claims==='present'?'fail':'uncertain';
    expect(validateReview(r,packet)).toBeTruthy();
  }
});
test('uncertain existence of output attribution cannot be reported as passed',()=>{
  const r=complete();r.reviews[2].attribution_claims='uncertain';r.reviews[2].attribution.verdict='pass';
  expect(()=>validateReview(r,packet)).toThrow('cannot be marked passed');
  r.reviews[2].attribution.verdict='uncertain';expect(validateReview(r,packet)).toBeTruthy();
});

test('archived independent retrospective reviews reproduce failures and the unresolved attribution disagreement',()=>{
  const read=name=>JSON.parse(fs.readFileSync(new URL(`../../docs/acceptance/knowledge-semantic-review/${name}`,import.meta.url),'utf8'));
  const result=summarizeReviews(packet,[read('reviewer-a.json'),read('reviewer-b.json')]);
  expect(result).toEqual(read('summary.json'));
  expect(result.dimensions.support.fail).toBe(6);expect(result.dimensions.attribution.uncertain).toBe(1);
  expect(result.disagreements).toHaveLength(1);expect(result.production_ready).toBe(false);
});
