// @vitest-environment node
import { it, expect } from 'vitest';
import { prepareKnowledgePairs, sealPlan } from '../../experiments/reading-quality/knowledge-pairs.js';
it('pairs differ only by explicit literature while preserving target facts, budgets and deterministic seals', async () => {
  const plan = await prepareKnowledgePairs();
  expect(plan.cases).toHaveLength(3);
  expect(plan.reserve_cny).toBeCloseTo(1.14576, 6);
  expect(sealPlan(plan)).toBe(sealPlan(await prepareKnowledgePairs()));
  for (const c of plan.cases) {
    const [a, b] = c.arms;
    expect(a.material.packet.cards).toHaveLength(0); expect(b.material.packet.cards).toHaveLength(1);
    expect(a.body.messages[0]).toEqual(b.body.messages[0]);
    const first = JSON.parse(a.body.messages[1].content), second = JSON.parse(b.body.messages[1].content);
    delete first.literature_packet; delete second.literature_packet;
    expect(first).toEqual(second);
    expect(c.target_fact_ids.length).toBeGreaterThan(0);
    expect(c.target_fact_ids.every(id => c.evidence.some(e => e.id === id && e.kind === 'program_fact'))).toBe(true);
    expect(a.input_bytes_with_allowance).toBeLessThanOrEqual(plan.input_token_allowance);
    expect(b.input_bytes_with_allowance).toBeLessThanOrEqual(plan.input_token_allowance);
  }
});
it('small revised-protocol pilot stays within the remaining original campaign authorization', async () => {
  const plan = await prepareKnowledgePairs({ profile: 'one-pair' });
  expect(plan.cases).toHaveLength(1);
  expect(plan.reserve_cny).toBeCloseTo(0.185536, 6);
  expect(plan.reserve_cny).toBeLessThan(0.204602);
  expect(plan.cases[0].arms.every(a => a.input_bytes_with_allowance <= plan.input_token_allowance)).toBe(true);
  await expect(prepareKnowledgePairs({ profile: 'unbounded' })).rejects.toThrow();
});
