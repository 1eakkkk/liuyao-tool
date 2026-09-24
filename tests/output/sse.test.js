// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { buildOutputContext } from '../../src/ai/output/context.js';
import { syntheticOutput } from '../../experiments/structured-output/example.js';
import { parseOutputSse } from '../../src/ai/output/sse.js';

const canonical = JSON.parse(fs.readFileSync(new URL('../../experiments/phase7/fixtures/compat-1.json', import.meta.url), 'utf8'));
const context = await buildOutputContext(canonical);
const answer = JSON.stringify(syntheticOutput(context));
const enc = new TextEncoder();
const frame = (delta, extra = {}) => `data: ${JSON.stringify({ choices: [{ delta, ...extra }] })}\r\n\r\n`;
const streamOf = chunks => new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } });

test('invalid UTF-8 fails closed and completed streams release their reader lock', async () => {
  const bad = await parseOutputSse(streamOf([enc.encode(frame({ content: 'preserved' })), new Uint8Array([0xff])]), context);
  expect(bad.error).toBe('sse_invalid_utf8'); expect(bad.result.display_text).toBe('preserved');
  const source = streamOf([enc.encode(frame({ content: answer }, { finish_reason: 'stop' }) + 'data: [DONE]\n\n')]);
  expect((await parseOutputSse(source, context)).result.status).toBe('validated');
  expect(source.locked).toBe(false);
});

test('abort does not wait forever for a source cancellation hook', async () => {
  const abort = new AbortController();
  const source = new ReadableStream({ cancel() { return new Promise(() => {}); } });
  const pending = parseOutputSse(source, context, { signal: abort.signal });
  abort.abort();
  expect((await pending).error).toBe('aborted');
  expect(source.locked).toBe(false);
});

test('decodes split UTF-8 and CRLF SSE, joins data events and ignores reasoning', async () => {
  const frames = answer.match(/.{1,13}/gs).map(part => frame({ content: part, reasoning_content: 'PRIVATE_REASONING' }));
  const bytes = enc.encode(frames.join('') + frame({}, { finish_reason: 'stop' }) + 'data: [DONE]\r\n\r\n');
  const chunks = Array.from(bytes, (_, i) => bytes.slice(i, i + 1));
  const result = await parseOutputSse(streamOf(chunks), context);
  expect(result.result.status).toBe('validated');
  expect(result.result.display_text).toBe(syntheticOutput(context).answer);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_REASONING');
});

test('missing DONE, length finish and malformed event preserve received body as fallback', async () => {
  const missing = await parseOutputSse(streamOf([enc.encode(frame({ content: answer }))]), context);
  expect(missing.result.status).toBe('fallback');
  expect(missing.result.display_text).toBe(answer);
  const length = await parseOutputSse(streamOf([enc.encode(frame({ content: answer }, { finish_reason: 'length' }) + 'data: [DONE]\n\n')]), context);
  expect(length.result.status).toBe('fallback');
  const malformed = await parseOutputSse(streamOf([enc.encode(frame({ content: 'partial' }) + 'data: {bad}\n\n' + 'data: [DONE]\n\n')]), context);
  expect(malformed.error).toBe('sse_malformed_event');
  expect(malformed.result.display_text).toBe('partial');
});

test('network errors and event buffer limits return explicit fallback with collected content', async () => {
  const chunks = { async *[Symbol.asyncIterator]() { yield enc.encode(frame({ content: 'before disconnect' })); throw new Error('offline'); } };
  const broken = await parseOutputSse(chunks, context);
  expect(broken.error).toBe('sse_stream_error');
  expect(broken.result.display_text).toBe('before disconnect');
  const limited = await parseOutputSse(streamOf([enc.encode('data: ' + 'x'.repeat(40) + '\n\n')]), context, { maxEventChars: 32 });
  expect(limited.error).toBe('sse_event_too_large');
  expect(limited.result.status).toBe('fallback');
  const streamLimited = await parseOutputSse(streamOf([enc.encode(frame({ content: 'keep' })), enc.encode('x'.repeat(200))]), context, { maxStreamBytes: 120 });
  expect(streamLimited.error).toBe('sse_stream_too_large');
  expect(streamLimited.result.display_text).toBe('keep');
});

test('rejects malformed choice data and content after DONE', async () => {
  const malformed = await parseOutputSse(streamOf([enc.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 2 } }] }) + '\n\n')]), context);
  expect(malformed.error).toBe('sse_malformed_event');
  const afterDone = await parseOutputSse(streamOf([enc.encode('data: [DONE]\n\n' + frame({ content: answer }))]), context);
  expect(afterDone.error).toBe('sse_after_done');
  expect(afterDone.result.status).toBe('fallback');
  const apiError = await parseOutputSse(streamOf([enc.encode('data: ' + JSON.stringify({ error: { message: 'failed' }, choices: [] }) + '\n\n')]), context);
  expect(apiError.error).toBe('sse_malformed_event');
  const invalidUtf8 = await parseOutputSse(streamOf([new Uint8Array([0xff, 0xfe])]), context);
  expect(invalidUtf8.error).toBe('sse_invalid_utf8');
});

test('abort interrupts a pending ReadableStream read and returns fallback', async () => {
  const controller = new AbortController();
  let streamController;
  const source = new ReadableStream({ start(c) { streamController = c; c.enqueue(enc.encode(frame({ content: 'before abort' }))); } });
  const pending = parseOutputSse(source, context, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  const result = await pending;
  streamController.error(new Error('closed'));
  expect(result.error).toBe('aborted');
  expect(result.result.display_text).toBe('before abort');
});

test('accepts async iterable bytes and returns usage and completion metadata', async () => {
  const usage = { prompt_tokens: 3, completion_tokens: 8 };
  const events = frame({ content: answer }, { finish_reason: 'stop' }) + `data: ${JSON.stringify({ choices: [], usage })}\n\n` + 'data: [DONE]\n\n';
  const result = await parseOutputSse({ async *[Symbol.asyncIterator]() { yield enc.encode(events); } }, context);
  expect(result.result.status).toBe('validated');
  expect(result).toMatchObject({ usage, finishReason: 'stop', sawDone: true, error: null });
});
