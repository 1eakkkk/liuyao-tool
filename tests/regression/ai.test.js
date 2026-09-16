import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { callDeepSeekRaw } from '../../src/ai/client.js';
import { buildSystemPrompt } from '../../src/ai/prompt-builder.js';
import { ROLE_PRESETS } from '../../src/ai/config.js';
import { castStore } from '../../src/app/cast-store.js';
import fixtures from './fixtures/casts.json';
const require = createRequire(import.meta.url);
const { baseline, EPOCH } = require('./harness.cjs');
const json = value => JSON.parse(JSON.stringify(value));
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(EPOCH); localStorage.clear();
  localStorage.setItem('liuyao_deepseek_api_key', 'synthetic-test-key');
  castStore.legacy = fixtures[0].expected.cast;
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function responseFor(mode) {
  const chunks = [
    { choices: [{ delta: { reasoning_content: '思考内容' } }] },
    { choices: [{ delta: { content: '**参考**甲子日，子时。' } }] },
  ];
  if (mode === 'complete' || mode === 'limit') chunks.push({
    choices: [{ delta: {}, finish_reason: mode === 'limit' ? 'length' : 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130, prompt_cache_hit_tokens: 20, prompt_cache_miss_tokens: 80 },
  });
  const encoded = new TextEncoder().encode(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + (mode === 'complete' ? 'data: [DONE]\n\n' : ''));
  let offset = 0;
  return { ok: true, body: { getReader: () => ({ read: async () => {
    if (offset < encoded.length) { const value = encoded.slice(offset, offset += 11); return { done: false, value }; }
    if (mode === 'network') throw new Error('synthetic disconnect');
    return { done: true };
  } }) } };
}
test.each(['complete', 'limit', 'network', 'unfinished'])('SSE %s matches original payload, text, interruption and usage', async mode => {
  const original = baseline({ liuyao_deepseek_api_key: 'synthetic-test-key' });
  original.window.TextDecoder = TextDecoder;
  original.window.lastCastData = fixtures[0].expected.cast;
  const requests = [];
  const fetcher = async (url, options) => { requests.push({ url, ...options, body: JSON.parse(options.body) }); return responseFor(mode); };
  original.window.fetch = fetcher;
  vi.stubGlobal('fetch', fetcher);
  const messages = [{ role: 'user', content: '固定问题' }];
  const oldDeltas = [], newDeltas = [];
  try {
    const old = await original.window.callDeepSeekRaw(messages, (...args) => oldDeltas.push(args));
    const current = await callDeepSeekRaw(messages, (...args) => newDeltas.push(args));
    expect(json(current)).toEqual(json(old));
    expect(newDeltas).toEqual(oldDeltas);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[1].url).toBe('https://api.deepseek.com/chat/completions');
  } finally { original.window.close(); }
});
test.each([401, 429, 500])('API error %i preserves original user message', async status => {
  const original = baseline({ liuyao_deepseek_api_key: 'synthetic-test-key' });
  const fetcher = async () => ({ ok: false, status, json: async () => ({ error: { message: 'synthetic error' } }) });
  original.window.fetch = fetcher; vi.stubGlobal('fetch', fetcher);
  try {
    const old = await original.window.callDeepSeekRaw([]).catch(error => error.message);
    await expect(callDeepSeekRaw([])).rejects.toThrow(old);
  } finally { original.window.close(); }
});
test('abort before response preserves original interruption result', async () => {
  const original = baseline({ liuyao_deepseek_api_key: 'synthetic-test-key' });
  const fetcher = async () => { throw new DOMException('aborted', 'AbortError'); };
  original.window.fetch = fetcher; vi.stubGlobal('fetch', fetcher);
  try { expect(json(await callDeepSeekRaw([]))).toEqual(json(await original.window.callDeepSeekRaw([]))); }
  finally { original.window.close(); }
});
test('all role/style combinations retain exact full system prompt', () => {
  const original = baseline();
  try {
    for (const role of [...Object.keys(ROLE_PRESETS), 'custom']) for (const style of ['brief', 'deep', 'custom']) {
      for (const storage of [localStorage, original.window.localStorage]) {
        storage.setItem('liuyao_role_choice', role); storage.setItem('liuyao_reply_style', style);
        storage.setItem('liuyao_custom_role', '固定自定义人设'); storage.setItem('liuyao_custom_style', '固定自定义风格');
      }
      expect(buildSystemPrompt()).toBe(original.window.buildSystemPrompt());
    }
  } finally { original.window.close(); }
});
