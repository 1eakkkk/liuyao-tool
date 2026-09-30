// @vitest-environment node
import { it, expect } from 'vitest';
import { scopeReadingEvidence } from '../../experiments/reading-quality/scope-evidence.js';
import { prepareKnowledgePairs } from '../../experiments/reading-quality/knowledge-pairs.js';
import { literatureSourceViews } from '../../src/knowledge/source-view.js';
const registry = [
  { id: 'fact:branch', kind: 'program_fact', value: '卯' },
  { id: 'fact:month', kind: 'program_fact', value: '酉' },
  { id: 'fact:unrelated', kind: 'program_fact', value: false },
  { id: 'rule:clash', kind: 'rule_result', source_facts: ['fact:branch', 'fact:month'], result: { label: '月破' } }
];
const selection = () => ({ fact_ids: [], rule_ids: ['rule:clash'], reason: '仅核对月建相冲名称' });
it('includes the entire selected rule dependency closure and preserves values without unrelated evidence', () => {
  const result = scopeReadingEvidence(registry, selection());
  expect(result.evidence.map(e => e.id)).toEqual(['fact:branch', 'fact:month', 'rule:clash']);
  expect(result.audit.excluded_ids).toEqual(['fact:unrelated']);
  expect(result.audit.omitted_is_not_absent).toBe(true);
  expect(result.evidence.every(e => JSON.stringify(e) === JSON.stringify(registry.find(r => r.id === e.id)))).toBe(true);
  result.evidence[0].value = 'modified';
  expect(registry[0].value).toBe('卯');
  expect(scopeReadingEvidence([...registry].reverse(), selection()).evidence.map(e => e.id)).toEqual(['fact:branch', 'fact:month', 'rule:clash']);
});
it.each(['unknown_fact', 'rule_as_fact', 'fact_as_rule', 'duplicate_selection', 'blank_reason', 'empty_scope', 'duplicate_registry', 'missing_dependency', 'dependency_as_rule'])('rejects scope defect %s', kind => {
  const s = selection(); let input = structuredClone(registry);
  if (kind === 'unknown_fact') s.fact_ids = ['fact:missing'];
  if (kind === 'rule_as_fact') s.fact_ids = ['rule:clash'];
  if (kind === 'fact_as_rule') s.rule_ids = ['fact:branch'];
  if (kind === 'duplicate_selection') s.rule_ids.push(s.rule_ids[0]);
  if (kind === 'blank_reason') s.reason = ' ';
  if (kind === 'empty_scope') s.rule_ids = [];
  if (kind === 'duplicate_registry') input.push(input[0]);
  if (kind === 'missing_dependency') input = input.filter(e => e.id !== 'fact:month');
  if (kind === 'dependency_as_rule') input.at(-1).source_facts = ['rule:clash'];
  expect(() => scopeReadingEvidence(input, s)).toThrow();
});
it('restricts each real development request while retaining required facts in both arms', async () => {
  const plan = await prepareKnowledgePairs();
  expect(plan.cases.map(c => [c.scope_audit.original_count, c.scope_audit.selected_count])).toEqual([[106, 4], [129, 4], [106, 7]]);
  for (const c of plan.cases) for (const arm of c.arms) {
    const payload = JSON.parse(arm.body.messages[1].content);
    expect(payload.evidence).toEqual(c.evidence);
    expect(payload.evidence.some(e => /\/(relative|spirit|element|month_strength)$/.test(e.id))).toBe(false);
    expect(c.target_fact_ids.every(id => payload.evidence.some(e => e.id === id))).toBe(true);
    expect(payload.scope_note).toContain('不代表盘中不存在');
    expect(payload).not.toHaveProperty('scope_audit');
  }
  const voidCase = plan.cases.find(c => c.id === 'void');
  expect(voidCase.evidence.find(e => e.id === 'fact:/calendar/day_ganzhi').value).toBe('甲子');
});
it('generates clearly labeled original and editorial view data from a selected packet', async () => {
  const plan = await prepareKnowledgePairs({ profile: 'one-pair' });
  const packet = plan.cases[0].arms[1].material.packet, card = packet.cards[0];
  const [view] = literatureSourceViews(packet, [card.literature_id]);
  expect(view.source.text).toBe(card.original_text);
  expect(view.source.citation).toEqual(card.citation);
  expect(view.source).not.toHaveProperty('exclusions');
  expect(view.editorial.label).toContain('不是古籍原文');
  expect(view.editorial.exclusions).toEqual(card.exclusions);
  view.editorial.exclusions.statements.push('modified');
  expect(card.exclusions.statements).not.toContain('modified');
});
it.each(['unknown_reference', 'duplicate_reference', 'duplicate_card', 'ambiguous_origin', 'missing_quote', 'old_packet'])('rejects source display defect %s', async kind => {
  const plan = await prepareKnowledgePairs({ profile: 'one-pair' });
  const packet = structuredClone(plan.cases[0].arms[1].material.packet);
  let ids = [packet.cards[0].literature_id];
  if (kind === 'unknown_reference') ids = ['literature:unknown'];
  if (kind === 'duplicate_reference') ids.push(ids[0]);
  if (kind === 'duplicate_card') packet.cards.push(packet.cards[0]);
  if (kind === 'ambiguous_origin') packet.cards[0].field_origins.exclusions = 'source_transcription';
  if (kind === 'missing_quote') packet.cards[0].original_text = '';
  if (kind === 'old_packet') packet.version = 'old';
  expect(() => literatureSourceViews(packet, ids)).toThrow();
});
