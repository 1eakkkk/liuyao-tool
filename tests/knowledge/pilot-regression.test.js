// @vitest-environment node
import fs from 'node:fs';
import { it, expect } from 'vitest';
import { textHash } from '../../src/knowledge/validate.js';
import { checkLayeredOutput, layeredOutputInstructions, LAYERED_INSTRUCTIONS_VERSION } from '../../experiments/reading-quality/layered-output.js';
const report = JSON.parse(fs.readFileSync(new URL('../../docs/acceptance/knowledge-reading-pilot-20260930.json', import.meta.url), 'utf8'));
it('preserves the failed dev-1 call, raw seals, review quotations and bounded campaign accounting', () => {
  expect(report.entries).toHaveLength(3);
  expect(report.entries[0].output_version).toBe('layered-reading-dev-1');
  expect(report.entries[0].mechanical_result_as_executed.mechanical_ok).toBe(false);
  expect(report.entries[0].mechanical_result_as_executed.facts.some(f => f.status === 'invalid_fact_source')).toBe(true);
  for (const e of report.entries) {
    expect(textHash(e.raw)).toBe(e.raw_hash);
    expect(e.self_review.annotations.every(a => e.raw.includes(a.quote))).toBe(true);
  }
  expect(report.campaign_reserved_cny).toBeLessThanOrEqual(report.campaign_limit_cny);
  expect(report.conservative_peak_cost_cny).toBeCloseTo(0.05974, 6);
});
it('rechecks the actual dev-2 pair without pretending mechanical success fixes attribution', () => {
  for (const e of report.entries.slice(1)) {
    const result = checkLayeredOutput(JSON.parse(e.raw), e.evidence, e.literature_packet);
    expect(result).toEqual(e.mechanical_result_as_executed);
    expect(result.mechanical_ok).toBe(true);
    expect(result.conclusion_support).toBe('unassessed');
  }
  expect(report.entries[2].self_review.source_attribution).toBe('fail');
  expect(report.production_changes).toBe(false);
});
it('instructs the model to distinguish the observed attribution failure, without claiming a live fix', () => {
  const prompt = layeredOutputInstructions();
  expect(prompt).toContain(LAYERED_INSTRUCTIONS_VERSION);
  expect(prompt).toContain('只有 original_text 是原文转录');
  expect(prompt).toContain('不得将现代整理说成');
  expect(prompt).toContain('source_facts');
});
