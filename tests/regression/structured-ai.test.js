import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import fixtures from './fixtures/casts.json';
import staticFixtures from './fixtures/static-casts.json';
import { normalizeLegacyCast } from '../../src/core/normalize.js';
import { buildStructuredAiInput, buildStructuredMessages, selectedAiInputMode } from '../../src/ai/structured-input.js';
import { AI_INPUT_SCHEMA, validateAiValue } from '../../src/ai/schemas.js';
import { interpretWithDeepSeek, followUpWithDeepSeek } from '../../src/ai/interpreter.js';
import { formatCastDataForAI } from '../../src/ai/formatter.js';
import { buildSystemPrompt } from '../../src/ai/prompt-builder.js';
import { state } from '../../src/app/state.js';
import { castStore } from '../../src/app/cast-store.js';
import { loadActiveConversationFromStorage } from '../../src/storage/conversation.js';
import { callDeepSeekRaw } from '../../src/ai/client.js';
vi.mock('../../src/ai/client.js', () => ({ callDeepSeekRaw: vi.fn(async () => ({ text: '固定回复', totalTokens: 10, costYuan: 0.01 })) }));
const canonical = () => normalizeLegacyCast(fixtures[0].expected.cast, { question: '同一个问题', createdAt: 0 });
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); state.currentConversation = null; castStore.canonical = canonical(); });
afterEach(() => { state.currentConversation = null; castStore.canonical = null; });

test('88 casts preserve every whitelisted fact without mutation or legacy-derived summaries', () => {
  const all = [...fixtures.map(f => f.expected.cast), ...staticFixtures.cases.map(f => f.expected)];
  for (const raw of all) {
    const cast = normalizeLegacyCast(raw, { question: '固定问题', createdAt: 0 });
    cast.compatibility.extensions.secret = 'MUST_NOT_SEND';
    cast.display.unknown = 'MUST_NOT_SEND';
    cast.display.overall_trend_text = 'MUST_NOT_SEND';
    cast.lines[0].changed && (cast.lines[0].changed.unknown = 'MUST_NOT_SEND');
    cast.lines[0].relations.unknown = 'MUST_NOT_SEND';
    cast.calendar.anchor && (cast.calendar.anchor.unknown = 'MUST_NOT_SEND');
    cast.meta.unknown = 'MUST_NOT_SEND';
    const before = structuredClone(cast);
    const input = buildStructuredAiInput(cast), c = input.C_canonical_cast;
    expect(JSON.stringify(input)).not.toContain('MUST_NOT_SEND');
    expect(input.A_user_question).toBe(cast.question.text);
    expect(c.hexagram).toEqual(cast.hexagram);
    for (const key of ['year_ganzhi', 'month_ganzhi', 'day_ganzhi', 'hour_ganzhi', 'kongwang', 'day_branch', 'month_branch']) expect(c.calendar[key]).toEqual(cast.calendar[key]);
    expect(Object.keys(c.display).sort()).toEqual(['date_text', 'palace_text']);
    for (let i = 0; i < 6; i++) {
      for (const key of ['position', 'yin_yang', 'moving', 'ganzhi', 'branch', 'element', 'relative', 'spirit', 'state_text', 'is_shi', 'is_ying', 'is_kongwang']) expect(c.lines[i][key]).toEqual(cast.lines[i][key]);
      for (const group of ['changed', 'hidden']) {
        if (cast.lines[i][group] === null) expect(c.lines[i][group]).toBeNull();
        else for (const key of ['ganzhi', 'branch', 'element', 'relative']) expect(c.lines[i][group][key]).toEqual(cast.lines[i][group][key]);
      }
      for (const key of ['month_strength', 'day_relation', 'return_relation', 'advance_retreat', 'hidden_relation']) expect(c.lines[i].relations[key]).toEqual(cast.lines[i].relations[key]);
      expect(c.lines[i]).not.toHaveProperty('compatibility');
    }
    expect(JSON.stringify(buildStructuredAiInput(cast))).toBe(JSON.stringify(input));
    expect(cast).toEqual(before);
  }
});

test('AI schema rejects invalid transport and preserves missing, empty and null values', () => {
  const cast = canonical();
  delete cast.calendar.year_ganzhi;
  cast.calendar.month_ganzhi = '';
  cast.calendar.hour_ganzhi = null;
  const input = buildStructuredAiInput(cast);
  expect(input.C_canonical_cast.calendar).not.toHaveProperty('year_ganzhi');
  expect(input.C_canonical_cast.calendar.month_ganzhi).toBe('');
  expect(input.C_canonical_cast.calendar.hour_ganzhi).toBeNull();
  for (const mutate of [v => v.C_canonical_cast.lines.pop(), v => v.C_canonical_cast.lines[0].relative = {},
    v => v.C_canonical_cast.compatibility = {}, v => v.ai_input_schema_version = '99', v => delete v.A_user_question]) {
    const bad = structuredClone(input); mutate(bad);
    expect(() => validateAiValue(bad, AI_INPUT_SCHEMA)).toThrow();
  }
  expect(() => buildStructuredMessages('另一个问题', cast)).toThrow(/不一致/);
});

test('paired requests keep legacy messages exact and structured JSON complete with shared transport', async () => {
  const cast = canonical(), question = cast.question.text;
  const text = formatCastDataForAI(cast);
  await interpretWithDeepSeek(question, text);
  const legacy = callDeepSeekRaw.mock.calls[0][0];
  expect(legacy).toEqual([{ role: 'system', content: buildSystemPrompt() }, { role: 'user', content: `排盘数据：\n${text}\n\n提问者的问题是：${question}\n\n请结合以上排盘数据给出解卦回复。` }]);
  expect(state.currentConversation).not.toHaveProperty('input_mode');
  await interpretWithDeepSeek(question, null, undefined, undefined, cast);
  const structured = callDeepSeekRaw.mock.calls[1][0];
  expect(JSON.parse(structured[1].content)).toEqual(buildStructuredAiInput(cast));
  expect(structured[0].content).toContain('没有规则引擎');
  expect(structured[0].content).toContain('信息不足');
  expect(state.currentConversation.input_mode).toBe('structured');
});

test('structured follow-up survives restore and updates style without changing initial facts', async () => {
  const cast = canonical();
  await interpretWithDeepSeek(cast.question.text, null, undefined, undefined, cast);
  const original = state.currentConversation.messages[1];
  state.currentConversation = loadActiveConversationFromStorage().conversation;
  localStorage.setItem('liuyao_reply_style', 'custom');
  localStorage.setItem('liuyao_custom_style', '新的表达风格');
  await followUpWithDeepSeek('你是不是看错了世爻？');
  const messages = callDeepSeekRaw.mock.calls[1][0];
  expect(messages[0].content).toContain('新的表达风格');
  expect(messages[0].content).toContain('不得重新排盘');
  expect(messages[1]).toEqual(original);
  state.currentConversation.ai_input_schema_version = '99';
  await expect(followUpWithDeepSeek('继续')).rejects.toThrow(/协议已变化/);
  expect(callDeepSeekRaw).toHaveBeenCalledTimes(2);
});

test('legacy restored sessions retain exact follow-up system and debug requires explicit opt-in', async () => {
  const cast = canonical();
  await interpretWithDeepSeek(cast.question.text, formatCastDataForAI(cast));
  state.currentConversation = loadActiveConversationFromStorage().conversation;
  await followUpWithDeepSeek('继续');
  expect(callDeepSeekRaw.mock.calls[1][0][0]).toEqual({ role: 'system', content: buildSystemPrompt() });
  for (const search of ['', '?ai_input=structured', '?debug=1', '?debug=1&ai_input=unknown']) expect(selectedAiInputMode(search)).toBe('legacy');
  expect(selectedAiInputMode('?debug=1&ai_input=structured')).toBe('structured');
});

// Export and experiment metadata are separate from the existing API/UI response contract.
test('paired full exports preserve legacy and structured follow-up keeps the captured JSON', async () => {
  const { buildPairedPromptExports, buildStructuredExportPrompt } = await import('../../src/ai/exports.js');
  const { buildExportPromptText } = await import('../../src/ai/prompt-builder.js');
  const cast = canonical(), pair = buildPairedPromptExports(cast);
  expect(pair.legacy).toBe(buildExportPromptText(cast.question.text, formatCastDataForAI(cast)));
  expect(pair.structured).toContain(JSON.stringify(buildStructuredAiInput(cast), null, 2));
  expect(pair.structured).toContain('本站不会自动处理');
  expect(pair.structured).not.toContain('overall_trend_text');
  const follow = buildStructuredExportPrompt(pair.structuredInput, '之前的回答', '为什么？');
  expect(follow).toContain(JSON.stringify(pair.structuredInput, null, 2));
  expect(follow).toContain('之前的回答');
  expect(follow).toContain('为什么？');
});

test('A/B metadata hashes exact payload and response and leaves unavailable usage unknown', async () => {
  const { webcrypto } = await import('node:crypto');
  vi.stubGlobal('crypto', webcrypto);
  try {
    const { buildAbRecord } = await import('../../src/ai/exports.js');
    const record = await buildAbRecord({ input_mode: 'structured', model: 'test-model', payload: 'abc', response: 'abc' });
    expect(record.payload_hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(record.response_hash).toBe(record.payload_hash);
    expect(record).toMatchObject({ input_mode: 'structured', model: 'test-model', prompt_version: 'structured-p1', ai_input_schema_version: '1.0', usage: null, latency: null });
    const legacy = await buildAbRecord({ input_mode: 'legacy', model: 'test-model', payload: 'abc' });
    expect(legacy.ai_input_schema_version).toBeNull();
    expect(legacy.response_hash).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});
