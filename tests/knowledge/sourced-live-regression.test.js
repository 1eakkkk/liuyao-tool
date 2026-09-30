// @vitest-environment node
import fs from 'node:fs';
import {it, expect} from 'vitest';
import {textHash} from '../../src/knowledge/validate.js';
import {sealPlan} from '../../experiments/reading-quality/knowledge-pairs.js';
import {checkSourcedOutput} from '../../experiments/reading-quality/sourced-output.js';
import {prepareReviewPacket, summarizeReviews} from '../../experiments/reading-quality/semantic-review.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../../docs/acceptance/sourced-reading-live-20260930/${name}`,import.meta.url),'utf8'));
const readClarity=name=>JSON.parse(fs.readFileSync(new URL(`../../docs/acceptance/clarity-live-20261001/${name}`,import.meta.url),'utf8'));
it('replays the actual sourced pair with intact inputs and raw replies without promoting semantic acceptance',()=>{
  const archive=read('archive.json'), plan=read('plan.json'), seal=read('seal.json');
  expect(sealPlan(plan)).toBe(seal.hash);
  expect(archive.entries).toHaveLength(2);
  for(const entry of archive.entries){
    expect(entry.plan_hash).toBe(seal.hash);
    expect(textHash(entry.raw)).toBe(entry.raw_hash);
    const result=checkSourcedOutput(JSON.parse(entry.raw),entry.evidence,entry.literature_packet);
    expect(result).toEqual(entry.mechanical_result_as_executed);
    expect(result.mechanical_ok).toBe(true);
    expect(result.production_ready).toBe(false);
    expect(result.sources.every(s=>s.free_text_attribution==='unassessed')).toBe(true);
  }
});
it('reproduces independent review judgments and retains the nonblind production gate',()=>{
  const packet=prepareReviewPacket(read('archive.json'));
  const summary=summarizeReviews(packet,[read('reviewer-a.json'),read('reviewer-b.json')]);
  expect(summary).toEqual(read('semantic-summary.json'));
  expect(summary.review_kind).toBe('retrospective_nonblind');
  expect(summary.production_ready).toBe(false);
  expect(summary.model_improvement_established).toBe(false);
});
it('preserves all four actual clarity replies without treating prompt revisions as semantic validation',()=>{
  const archive=readClarity('archive.json'),plan=readClarity('plan.json'),seal=readClarity('seal.json');
  expect(sealPlan(plan)).toBe(seal.hash);expect(plan.instructions_version).toBe('sourced-instructions-dev-2');
  expect(plan.cases.map(c=>c.id)).toEqual(['month-combine','void']);
  expect(archive.entries).toHaveLength(4);
  for(const entry of archive.entries){
    expect(textHash(entry.raw)).toBe(entry.raw_hash);expect(entry.plan_hash).toBe(seal.hash);
    const result=checkSourcedOutput(JSON.parse(entry.raw),entry.evidence,entry.literature_packet);
    expect(result).toEqual(entry.mechanical_result_as_executed);
    expect(result.mechanical_ok).toBe(true);expect(result.production_ready).toBe(false);
    expect(result.conclusion_support).toBe('unassessed');
  }
});
it('keeps the complete clarity review including disagreement and uncertainty reproducible',()=>{
  const packet=prepareReviewPacket(readClarity('archive.json'));
  const summary=summarizeReviews(packet,[readClarity('reviewer-a.json'),readClarity('reviewer-b.json')]);
  expect(summary).toEqual(readClarity('semantic-summary.json'));
  expect(summary.production_ready).toBe(false);expect(summary.model_improvement_established).toBe(false);
});
