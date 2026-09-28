// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { auditReading } from '../../experiments/reading-quality/audit.js';
const source=JSON.parse(fs.readFileSync(new URL('../../docs/acceptance/reading-v3-live-review.json',import.meta.url)));
const {reviews}=JSON.parse(fs.readFileSync(new URL('../../experiments/reading-quality/reviews.json',import.meta.url)));
test('offline audit keeps mechanical, factual, scope and citation findings separate',()=>{
  const rows=source.entries.map((e,i)=>auditReading(e,reviews[i]));
  expect(rows.map(r=>r.annotated_facts.conflicts)).toEqual([0,0,0,1]);
  expect(rows.map(r=>r.annotated_facts.missing_direct_citations)).toEqual([0,1,2,0]);
  expect(rows[1].mechanical.status).toBe('validated');
  expect(rows[1].support.rating).toBe('fail');
});
test('offline reviews cannot silently outlive edited raw replies or unmatched annotations',()=>{
  const e=structuredClone(source.entries[0]);e.raw+=' ';
  expect(()=>auditReading(e,reviews[0])).toThrow('source mismatch');
  const changed=structuredClone(source.entries[0]);changed.quoted_evidence[0].value=true;
  expect(()=>auditReading(changed,reviews[0])).toThrow('evidence mismatch');
  const r=structuredClone(reviews[0]);r.claims[0].quote='不存在的原文';
  expect(()=>auditReading(source.entries[0],r)).toThrow('quote');
  const missing=structuredClone(reviews[0]);missing.claims[0].facts[0].id='fact:missing';
  expect(()=>auditReading(source.entries[0],missing)).toThrow('annotated fact');
});
