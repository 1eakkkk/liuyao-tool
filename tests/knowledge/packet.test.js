// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { literatureCards, buildLiteraturePacket } from '../../src/knowledge/packet.js';
import { stableJson, textHash } from '../../src/knowledge/validate.js';
import { checkLayeredOutput, LAYERED_OUTPUT_VERSION } from '../../experiments/reading-quality/layered-output.js';
const index = loadCorpus(undefined, { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION });
const decision = (knowledge_id, status = 'confirmed') => ({ knowledge_id, status, reason: '开发用显式条件复核，不代表真实问题验收' });
const makePacket = () => buildLiteraturePacket(index, [decision('zsby-shiying-scope-001')]).packet;
const registry = [{ id: 'fact:/lines/0/relative', kind: 'program_fact', value: '兄弟' },
  { id: 'rule:example', kind: 'rule_result', value: '兄弟' }];
function answer() {
  return { schema_version: LAYERED_OUTPUT_VERSION, conclusion: '还需结合问题判断。',
    facts: [{ evidence_id: registry[0].id, value: '兄弟' }],
    interpretations: [{ text: '世应方向需要结合彼此之事。', fact_ids: [registry[0].id],
      literature_ids: ['literature:zsby-shiying-scope-001'], applicability: '开发对照，检查彼此关系方向。', uncertainties: ['无法由引用确认成败。'] }],
    advice: [{ text: '可以先确认双方意愿。', basis: 'general_advice' }] };
}
describe('offline explicit literature packets', () => {
  it('preserves seven reviewed cards with original conditions and traceable locators', () => {
    const cards = literatureCards(index);
    expect(cards).toHaveLength(7);
    expect(cards.every(c => c.original_text && c.citation.locator.image_page && c.independent_evidence === false)).toBe(true);
    const card = cards.find(c => c.knowledge_id === 'zsby-shiying-scope-001');
    expect(card.exclusions.statements.join('')).toContain('非占彼此');
    expect(card.citation.segment_ref.span.unit).toBe('unicode_code_point');
    expect(cards.every(c => c.editorial_guidance?.kind === 'modern_editorial_guidance')).toBe(true);
    expect(card.editorial_guidance.overreach_example).toContain('必成');
  });
  it('defaults to no injection and excludes pending, unknown and uncertain selections', () => {
    expect(buildLiteraturePacket(index, []).packet.cards).toEqual([]);
    const result = buildLiteraturePacket(index, [decision('zsby-flying-hidden-context-001'), decision('unknown'), decision('zsby-shiying-scope-001', 'uncertain')]);
    expect(result.packet.cards).toEqual([]);
    expect(result.excluded.map(e => e.reason).sort()).toEqual(['not_admitted', 'not_admitted', 'uncertain']);
  });
  it('retains complete metadata without truncation under the Unicode budget', () => {
    const result = buildLiteraturePacket(index, [decision('zsby-shiying-scope-001')], { maxCodePoints: 512 });
    expect(result.packet.cards).toEqual([]);
    expect(result.excluded[0].reason).toBe('text_budget');
    const full = buildLiteraturePacket(index, [decision('zsby-shiying-scope-001')]);
    expect(full.code_points).toBe([...stableJson(full.packet)].length);
    expect(full.packet_hash).toBe(textHash(stableJson(full.packet)));
    expect(full.packet.cards[0].exclusions.statements).not.toHaveLength(0);
  });
  it('bounds count, is order independent, and does not mutate the index', () => {
    const selections = literatureCards(index).map(c => decision(c.knowledge_id));
    const a = buildLiteraturePacket(index, selections, { maxCodePoints: 20000 });
    const b = buildLiteraturePacket(index, selections.reverse(), { maxCodePoints: 20000 });
    expect(a).toEqual(b); expect(a.packet.cards).toHaveLength(4);
    a.packet.cards[0].exclusions.statements.push('mutated');
    expect(literatureCards(index)[0].exclusions.statements).not.toContain('mutated');
  });
  it.each(['missing', 'extra', 'duplicate', 'blank', 'status'])('rejects malformed decisions: %s', variant => {
    const s = decision('zsby-shiying-scope-001');
    const list = variant === 'duplicate' ? [s, s] : [s];
    if (variant === 'missing') delete s.reason;
    if (variant === 'extra') s.rule_id = 'irrelevant';
    if (variant === 'blank') s.reason = ' ';
    if (variant === 'status') s.status = 'keyword_match';
    expect(() => buildLiteraturePacket(index, list)).toThrow();
  });
});
describe('offline layered output contract', () => {
  it('checks explicit values but leaves interpretation, relevance, conclusion and advice unassessed', () => {
    const result = checkLayeredOutput(answer(), registry, makePacket());
    expect(result.mechanical_ok).toBe(true);
    expect(result.interpretations[0].semantic_support).toBe('unassessed');
    expect(result.interpretations[0].question_relevance).toBe('unassessed');
    expect(result.conclusion_support).toBe('unassessed');
    expect(result.acceptance).toBe('not_established');
  });
  it.each(['wrong_value', 'wrong_type', 'rule_as_fact', 'literature_as_fact', 'unknown_fact'])('does not accept %s as a consistent fact', kind => {
    const a = answer();
    if (kind === 'wrong_value') a.facts[0].value = '官鬼';
    if (kind === 'wrong_type') a.facts[0].value = ['兄弟'];
    if (kind === 'rule_as_fact') a.facts[0].evidence_id = 'rule:example';
    if (kind === 'literature_as_fact') a.facts[0].evidence_id = a.interpretations[0].literature_ids[0];
    if (kind === 'unknown_fact') a.facts[0].evidence_id = 'fact:missing';
    expect(checkLayeredOutput(a, registry, makePacket()).mechanical_ok).toBe(false);
  });
  it.each(['no_cast_fact', 'missing_fact', 'unknown_literature', 'unselected_literature'])('detects %s references', kind => {
    const a = answer(); let packet = makePacket();
    if (kind === 'no_cast_fact') a.interpretations[0].fact_ids = [];
    if (kind === 'missing_fact') a.interpretations[0].fact_ids = ['fact:missing'];
    if (kind === 'unknown_literature') a.interpretations[0].literature_ids = ['literature:missing'];
    if (kind === 'unselected_literature') packet = buildLiteraturePacket(index, []).packet;
    expect(checkLayeredOutput(a, registry, packet).mechanical_ok).toBe(false);
  });
  it('allows explanations without a literature citation', () => {
    const a = answer(); a.interpretations[0].literature_ids = [];
    expect(checkLayeredOutput(a, registry, buildLiteraturePacket(index, []).packet).mechanical_ok).toBe(true);
  });
  it('rejects pretending general advice is cited evidence', () => {
    const a = answer(); a.advice[0].basis = 'literature';
    expect(() => checkLayeredOutput(a, registry, makePacket())).toThrow();
    a.advice[0].basis = 'general_advice'; a.advice[0].evidence_ids = [registry[0].id];
    expect(() => checkLayeredOutput(a, registry, makePacket())).toThrow();
  });
  it('rejects duplicate evidence and stale protocol versions', () => {
    expect(() => checkLayeredOutput(answer(), [...registry, registry[0]], makePacket())).toThrow();
    const a = answer(); a.schema_version = 'future';
    expect(() => checkLayeredOutput(a, registry, makePacket())).toThrow();
  });
});
