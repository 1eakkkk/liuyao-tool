import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import legacy from '../regression/fixtures/casts.json';
import { normalizeLegacyCast } from '../../src/core/normalize.js';
import { buildStructuredAiInput, buildStructuredMessages } from '../../src/ai/structured-input.js';
import { AI_INPUT_SCHEMA, validateAiValue } from '../../src/ai/schemas.js';
import { buildRulesAiInput, buildRulesMessages, buildRulesPair, buildRulesExportPrompt, selectedRulesMode, buildRulesAbRecord } from '../../src/ai/rules-input.js';
import { evaluateRules, readEvidencePath } from '../../src/rules/engine.js';
import { interpretWithDeepSeek, followUpWithDeepSeek } from '../../src/ai/interpreter.js';
import { callDeepSeekRaw } from '../../src/ai/client.js';
import { state } from '../../src/app/state.js';
import { castStore } from '../../src/app/cast-store.js';
import { loadActiveConversationFromStorage } from '../../src/storage/conversation.js';
vi.mock('../../src/ai/client.js', () => ({ callDeepSeekRaw: vi.fn(async () => ({ text: 'mock 回复', totalTokens: 10, costYuan: 0.01 })) }));
const cast = () => normalizeLegacyCast(legacy[0].expected.cast, { question: '固定问题', createdAt: 0 });
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); castStore.canonical = cast(); state.currentConversation = null; });
afterEach(() => { state.currentConversation = null; castStore.canonical = null; vi.unstubAllGlobals(); });

test('strict 1.1 A/B differs only at enabled and hits; 1.0 contract remains intact', () => {
  const c = cast(), before = JSON.stringify(c), off = buildRulesMessages(c.question.text, c, 'off'), on = buildRulesMessages(c.question.text, c, 'on');
  expect(off[0]).toEqual(on[0]);
  const a = JSON.parse(off[1].content), b = JSON.parse(on[1].content);
  expect(a.ai_input_schema_version).toBe('1.1');
  expect(a.E_rule_results.enabled).toBe(false); expect(a.E_rule_results.hits).toEqual([]);
  expect(b.E_rule_results.hits).toEqual(evaluateRules(c).hits);
  b.E_rule_results.enabled = false; b.E_rule_results.hits = [];
  expect(b).toEqual(a);
  const original = buildStructuredAiInput(c);
  expect(original.ai_input_schema_version).toBe('1.0'); expect(original).not.toHaveProperty('E_rule_results');
  validateAiValue(original, AI_INPUT_SCHEMA);
  expect(buildStructuredMessages(c.question.text, c)[0].content).toContain('没有规则引擎');
  expect(on[0].content).toContain('不是第二份独立证据，不得重复加权');
  expect(a.C_canonical_cast).toEqual(original.C_canonical_cast);
  expect(JSON.stringify(c)).toBe(before);
});

test('rules evidence resolves against the transmitted whitelist, not excluded display or extensions', () => {
  for (const f of legacy) {
    const c = normalizeLegacyCast(f.expected.cast);
    c.compatibility.extensions.injected = 'MUST_NOT_SEND'; c.display.overall_trend_text = 'MUST_NOT_SEND';
    const input = buildRulesAiInput(c, 'on');
    expect(JSON.stringify(input)).not.toContain('MUST_NOT_SEND');
    for (const hit of input.E_rule_results.hits) for (const e of hit.evidence) expect(readEvidencePath(input.C_canonical_cast, e.path)).toEqual(e.value);
  }
});

test.each(['off', 'on'])('1.1 %s persists mode and original results through restore and follow-up', async mode => {
  const c = cast();
  await interpretWithDeepSeek(c.question.text, null, undefined, undefined, c, mode);
  const initial = state.currentConversation.messages[1];
  state.currentConversation = loadActiveConversationFromStorage().conversation;
  castStore.canonical.lines[0].branch = '酉'; // follow-up must retain its original request snapshot
  localStorage.setItem('liuyao_reply_style', 'custom'); localStorage.setItem('liuyao_custom_style', '固定新风格');
  await followUpWithDeepSeek('请说明依据');
  const request = callDeepSeekRaw.mock.calls[1][0];
  expect(request[1]).toEqual(initial); expect(request[0].content).toContain('固定新风格');
  expect(state.currentConversation).toMatchObject({ rules_mode: mode, ai_input_schema_version: '1.1', prompt_version: 'structured-rules-p1', ruleset_version: 'r1' });
  state.currentConversation.ruleset_version = 'future';
  await expect(followUpWithDeepSeek('继续')).rejects.toThrow(/版本不支持/);
  expect(callDeepSeekRaw).toHaveBeenCalledTimes(2);
});

test('rules exports are complete, maintain paired prompt identity, and preserve follow-up facts', () => {
  const pair = buildRulesPair(cast());
  expect(pair.off.text.split('======== A / B / C / D / E')[0]).toBe(pair.on.text.split('======== A / B / C / D / E')[0]);
  for (const mode of ['off', 'on']) {
    expect(pair[mode].text).toContain(JSON.stringify(pair[mode].input, null, 2));
    const text = buildRulesExportPrompt(pair[mode].input, '上次回答', '同一问题追问');
    expect(text).toContain('上次回答'); expect(text).toContain('同一问题追问');
    expect(text).toContain(JSON.stringify(pair[mode].input, null, 2));
  }
});

test('rules require explicit structured opt-in and metadata records distinguish both arms', async () => {
  for (const search of ['', '?ai_rules=on', '?debug=1&ai_rules=on', '?debug=1&ai_input=structured', '?debug=1&ai_input=structured&ai_rules=typo']) expect(selectedRulesMode(search)).toBeNull();
  expect(selectedRulesMode('?debug=1&ai_input=structured&ai_rules=off')).toBe('off');
  expect(selectedRulesMode('?debug=1&ai_input=structured&ai_rules=on')).toBe('on');
  const { webcrypto } = await import('node:crypto'); vi.stubGlobal('crypto', webcrypto);
  const pair = buildRulesPair(cast());
  const records = await Promise.all(['off', 'on'].map(mode => buildRulesAbRecord({ mode, model: 'mock-model', input: pair[mode].input, payload: pair[mode].text })));
  expect(records[0].prompt_version).toBe(records[1].prompt_version);
  expect(records[0].ai_input_schema_version).toBe('1.1');
  expect(records[0].rule_result_hash).not.toBe(records[1].rule_result_hash);
  expect(records[0].usage).toBeNull(); expect(records[0].response_hash).toBeNull();
});

test('corrupt rules transport rejects changed evidence, duplicate hits and disabled hits', async () => {
  const { assertRulesAiInput } = await import('../../src/ai/rules-input.js');
  const valid = buildRulesAiInput(cast(), 'on');
  for (const mutate of [
    input => input.E_rule_results.hits[0].evidence[0].value = 'corrupt',
    input => input.E_rule_results.hits.push(structuredClone(input.E_rule_results.hits[0])),
    input => input.E_rule_results.enabled = false,
    input => input.E_rule_results.hits[0].result.label = '必成',
    input => input.E_rule_results.hits[0].score = 3,
  ]) {
    const broken = structuredClone(valid); mutate(broken);
    expect(() => assertRulesAiInput(broken)).toThrow();
  }
});
