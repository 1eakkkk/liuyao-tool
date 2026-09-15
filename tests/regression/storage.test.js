import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import fixtures from './fixtures/casts.json';
import { migrateStorage, migrateCastSnapshot } from '../../src/storage/versions.js';
import { loadHistory, saveHistory, historyTurnsOf } from '../../src/storage/history.js';
import { saveActiveConversation, clearActiveConversationStorage } from '../../src/storage/conversation.js';
import { configureStorageNotifications, safeSetItem } from '../../src/storage/local.js';
import { state } from '../../src/app/state.js';
import { castStore } from '../../src/app/cast-store.js';
import { toLegacyCast } from '../../src/core/normalize.js';

beforeEach(() => { localStorage.clear(); state.currentConversation = null; castStore.canonical = null; });
afterEach(() => vi.restoreAllMocks());
test('lazy migration preserves keys and original bytes; old flat/prompt/multi-turn histories survive', () => {
  const records = [
    { question: '旧问题', text: '旧回答', ts: 1 },
    { type: 'prompt', question: '导出', ts: 2, cast: fixtures[0].expected.history },
    { type: 'ai', question: '多轮', ts: 3, turns: [{ role: 'user', text: '问' }, { role: 'assistant', text: '答' }], cast: fixtures[1].expected.history },
  ];
  const raw = JSON.stringify(records);
  localStorage.setItem('liuyao_interpret_history', raw);
  localStorage.setItem('liuyao_deepseek_api_key', 'synthetic-test-key');
  localStorage.setItem('liuyao_role_choice', 'custom');
  const result = migrateStorage();
  expect(result.errors).toEqual([]);
  expect(localStorage.getItem('liuyao_interpret_history')).toBe(raw);
  expect(localStorage.length).toBe(3);
  expect(result.history[1].cast.canonical.schema_version).toBe('1.0');
  expect(toLegacyCast(result.history[1].cast)).toEqual(records[1].cast);
  expect(historyTurnsOf(result.history[0])).toHaveLength(2);
  expect(historyTurnsOf(result.history[1])).toHaveLength(1);
  saveHistory(result.history);
  const disk = JSON.parse(localStorage.getItem('liuyao_interpret_history'));
  expect(disk[1].cast.guaName).toBe(records[1].cast.guaName); // old client still reads it
  expect(localStorage.getItem('liuyao_deepseek_api_key')).toBe('synthetic-test-key');
  expect(localStorage.getItem('liuyao_role_choice')).toBe('custom');
  expect(migrateStorage().history).toEqual(result.history);
});
test.each(['{broken', '{"wrong":"shape"}'])('corrupt history is never overwritten: %s', raw => {
  localStorage.setItem('liuyao_interpret_history', raw);
  expect(loadHistory()).toEqual([]);
  expect(saveHistory([{ question: 'new' }])).toBe(false);
  expect(localStorage.getItem('liuyao_interpret_history')).toBe(raw);
});
test('future cast schemas and incomplete records remain untouched', () => {
  const future = { cast: { canonical: { schema_version: '99' }, custom: 'keep' } };
  localStorage.setItem('liuyao_interpret_history', JSON.stringify([future, { cast: { lines: [] } }]));
  expect(loadHistory()).toEqual([future, { cast: { lines: [] } }]);
  const active = JSON.stringify({ castData: future.cast, conversation: { messages: [] } });
  localStorage.setItem('liuyao_active_conversation', active);
  state.currentConversation = { messages: [] };
  saveActiveConversation(); clearActiveConversationStorage();
  expect(localStorage.getItem('liuyao_active_conversation')).toBe(active);
});
test('current conversation persists canonical and rollback-compatible fields', () => {
  castStore.legacy = fixtures[0].expected.cast;
  castStore.question = '会话问题'; castStore.time = 1000;
  state.currentConversation = { messages: [{ role: 'user', content: '问题' }], turns: [] };
  saveActiveConversation();
  const saved = migrateStorage().active;
  expect(saved.castData.canonical.question.text).toBe('会话问题');
  expect(saved.castQuestion).toBe('会话问题');
  expect(saved.castTime).toBe(1000);
  expect(toLegacyCast(saved.castData)).toEqual(fixtures[0].expected.cast);
});
test('quota failures preserve original storage; settings notify, automatic session save stays silent', () => {
  localStorage.setItem('liuyao_interpret_history', '[]');
  const notify = vi.fn(); configureStorageNotifications(notify);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  expect(safeSetItem('liuyao_deepseek_api_key', 'synthetic')).toBe(false);
  expect(notify).toHaveBeenCalledTimes(1);
  state.currentConversation = { messages: [] };
  saveActiveConversation();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('liuyao_interpret_history')).toBe('[]');
});
test('legacy snapshot conversion does not mutate caller data', () => {
  const snapshot = structuredClone(fixtures[0].expected.history);
  const original = JSON.stringify(snapshot);
  migrateCastSnapshot(snapshot);
  expect(JSON.stringify(snapshot)).toBe(original);
});
test('disabled storage reads fail closed without crashing migration', () => {
  const denied = { getItem() { throw new DOMException('blocked', 'SecurityError'); } };
  expect(migrateStorage(denied)).toEqual({ history: [], active: null, errors: ['liuyao_interpret_history', 'liuyao_active_conversation'] });
});
