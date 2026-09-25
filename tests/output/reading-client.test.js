// @vitest-environment node
import { test, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { createReadingSession, prepareReadingTurn } from '../../src/ai/output/session.js';
import { callReading } from '../../src/ai/output/client.js';
import { syntheticOutput } from '../../experiments/structured-output/example.js';
const canonical = JSON.parse(fs.readFileSync(new URL('../../experiments/phase7/fixtures/compat-1.json', import.meta.url)));
const prepare = () => prepareReadingTurn(createReadingSession(canonical), '说明依据');
afterEach(() => vi.unstubAllGlobals());
function storage() {
  const data = new Map([['liuyao_deepseek_api_key', 'TEST_ONLY']]);
  vi.stubGlobal('localStorage', { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) });
}
test('keeps byte-equivalent raw JSON, known usage and one request', async () => {
  storage(); const p = await prepare(), raw = JSON.stringify(syntheticOutput(p.context), null, 2);
  const data = `data: ${JSON.stringify({ choices: [{ delta: { content: raw }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`;
  const fetch = vi.fn(async () => new Response(data, { headers: { 'Content-Type': 'text/event-stream' } })); vi.stubGlobal('fetch', fetch);
  const response = await callReading(p);
  expect(response.raw).toBe(raw); expect(response.completed).toBe(true); expect(response.usage.total).toBe(30); expect(fetch).toHaveBeenCalledTimes(1);
});
test('HTTP errors do not retry or expose provider body', async () => {
  storage(); const fetch = vi.fn(async () => new Response('provider body', { status: 401 })); vi.stubGlobal('fetch', fetch);
  await expect(callReading(await prepare())).rejects.toThrow('Key'); expect(fetch).toHaveBeenCalledTimes(1);
});
test('abort before headers yields incomplete result and unknown cost', async () => {
  storage(); const controller = new AbortController(); controller.abort();
  vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('aborted', 'AbortError'); }));
  const response = await callReading(await prepare(), controller.signal);
  expect(response.completed).toBe(false); expect(response.usage.cost).toBeNull(); expect(response.raw).toBe('');
});
