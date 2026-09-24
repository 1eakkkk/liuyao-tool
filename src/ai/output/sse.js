import { createOutputCollector } from './parse.js';

const DEFAULT_MAX_EVENT_CHARS = 256 * 1024;
const DEFAULT_MAX_STREAM_BYTES = 8 * 1024 * 1024;

/** Consume an OpenAI-compatible SSE byte stream without depending on fetch or a client. */
export async function parseOutputSse(source, context, { signal, maxEventChars = DEFAULT_MAX_EVENT_CHARS,
  maxStreamBytes = DEFAULT_MAX_STREAM_BYTES } = {}) {
  if (![maxEventChars, maxStreamBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw new TypeError('Invalid SSE limits');
  const collector = createOutputCollector(context);
  let usage = null, finishReason = null, sawDone = false, errorCode = null;
  let dataLines = [], decoder = new TextDecoder('utf-8', { fatal: true });
  let lineBuffer = '', eventOverflow = false, eventChars = 0, totalBytes = 0;
  let reader = null, iterator = null;

  const fail = code => { errorCode ??= code; };
  const dispatch = () => {
    if (!dataLines.length) { eventChars = 0; eventOverflow = false; return; }
    const data = dataLines.join('\n'); dataLines = []; eventChars = 0; eventOverflow = false;
    if (data === '[DONE]') { sawDone = true; return; }
    if (sawDone) { fail('sse_after_done'); return; }
    let item;
    try { item = JSON.parse(data); } catch { fail('sse_malformed_event'); return; }
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.hasOwn(item, 'error')) { fail('sse_malformed_event'); return; }
    if (item.usage && typeof item.usage === 'object') usage = item.usage;
    const choice = item.choices?.[0];
    if (!choice) {
      if (Array.isArray(item.choices) && item.choices.length === 0 && item.usage) return;
      fail('sse_malformed_event'); return;
    }
    if (choice.finish_reason != null) {
      if (finishReason != null && finishReason !== choice.finish_reason) { fail('sse_conflicting_finish_reason'); return; }
      finishReason = choice.finish_reason;
    }
    const delta = choice.delta;
    if (delta != null && (typeof delta !== 'object' || Array.isArray(delta))) { fail('sse_malformed_event'); return; }
    const content = delta?.content;
    if (content != null && typeof content !== 'string') { fail('sse_malformed_event'); return; }
    if (typeof content === 'string' && content) collector.append(content);
    // reasoning_content is deliberately ignored; it is never copied to result metadata.
  };
  const line = value => {
    if (value === '') { dispatch(); return; }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    let val = colon < 0 ? '' : value.slice(colon + 1);
    if (val.startsWith(' ')) val = val.slice(1);
    if (field === 'data') {
      eventChars += val.length + 1;
      if (eventChars > maxEventChars) { eventOverflow = true; fail('sse_event_too_large'); }
      else if (!eventOverflow) dataLines.push(val);
    }
  };
  const textChunk = text => {
    if (errorCode) return;
    lineBuffer += text;
    let start = 0;
    for (let i = 0; i < lineBuffer.length; i++) {
      if (lineBuffer[i] === '\n' && i > 0 && lineBuffer[i - 1] === '\r') { start = i + 1; continue; }
      if (lineBuffer[i] !== '\n' && lineBuffer[i] !== '\r') continue;
      if (lineBuffer[i] === '\r' && i === lineBuffer.length - 1) break;
      const current = lineBuffer.slice(start, i);
      line(current);
      start = i + 1;
    }
    lineBuffer = lineBuffer.slice(start);
    if (lineBuffer.length > maxEventChars) { eventOverflow = true; fail('sse_event_too_large'); lineBuffer = ''; }
  };
  const bytes = chunk => {
    if (!(chunk instanceof Uint8Array)) throw new TypeError('sse_invalid_chunk');
    totalBytes += chunk.byteLength;
    if (totalBytes > maxStreamBytes) { fail('sse_stream_too_large'); return; }
    try { textChunk(decoder.decode(chunk, { stream: true })); }
    catch { throw Object.assign(new Error('sse_invalid_utf8'), { code: 'sse_invalid_utf8' }); }
  };
  let abortReject;
  const abortPromise = signal ? new Promise((_, reject) => {
    abortReject = () => reject(Object.assign(new Error('aborted'), { code: 'aborted' }));
    if (signal.aborted) abortReject(); else signal.addEventListener('abort', abortReject, { once: true });
  }) : null;
  const readNext = promise => abortPromise ? Promise.race([promise, abortPromise]) : promise;
  try {
    if (source?.getReader) {
      reader = source.getReader();
      while (true) {
        const { value, done } = await readNext(reader.read());
        if (done) break;
        bytes(value);
        if (errorCode) break;
      }
    } else if (source?.[Symbol.asyncIterator]) {
      iterator = source[Symbol.asyncIterator]();
      while (true) {
        const { value, done } = await readNext(iterator.next());
        if (done) break;
        bytes(value);
        if (errorCode) break;
      }
    } else throw new TypeError('sse_invalid_source');
    if (!errorCode) {
      let tail;
      try { tail = decoder.decode(); }
      catch { throw Object.assign(new Error('sse_invalid_utf8'), { code: 'sse_invalid_utf8' }); }
      textChunk(tail);
      if (lineBuffer.length) { line(lineBuffer); lineBuffer = ''; }
      if (dataLines.length) dispatch();
      if (signal?.aborted) fail('aborted');
    }
  } catch (error) {
    fail(signal?.aborted || error?.code === 'aborted' ? 'aborted' : error?.code === 'sse_invalid_utf8' ? 'sse_invalid_utf8' : error?.message === 'sse_invalid_chunk' ? 'sse_invalid_chunk' : 'sse_stream_error');
  } finally {
    if (abortReject) signal.removeEventListener('abort', abortReject);
    if (errorCode) {
      // Cancellation hooks belong to the source and may never settle.
      try { Promise.resolve(reader?.cancel()).catch(() => {}); } catch {}
      try { Promise.resolve(iterator?.return?.()).catch(() => {}); } catch {}
    }
    try { reader?.releaseLock(); } catch {}
  }
  let result = collector.finish({ finishReason, sawDone, interrupted: Boolean(errorCode || signal?.aborted) });
  if (errorCode) result = { ...result, issues: [{ code: errorCode, path: '$' }] };
  return { result, usage, finishReason, sawDone, error: errorCode };
}
