import { parseOutputSse } from './sse.js';
import { parseOutputAnswer } from './parse.js';
import { DEEPSEEK_BASE_URL } from '../config.js';
import { loadApiKey, loadModelChoice } from '../../storage/settings.js';
import { effectivePriceTable, isBeijingPeakHour } from '../preferences.js';
import { addLifetimeUsage } from '../../storage/history.js';

export function readingRequestBody(prepared, model = 'deepseek-flash') {
  return { model, messages: prepared.messages, thinking: { type: 'disabled' }, max_tokens: 8192,
    response_format: { type: 'json_object' }, stream: true, stream_options: { include_usage: true } };
}
export async function callReading(prepared, signal) {
  const key = loadApiKey();
  if (!key) throw Error('请先在设置中填写 DeepSeek API Key。');
  const start = Date.now(), peak = isBeijingPeakHour();
  const price = { ...(peak ? effectivePriceTable().peak : effectivePriceTable().offpeak) };
  let parsed;
  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(readingRequestBody(prepared, loadModelChoice())),
    });
    if (!response.ok) throw Error(response.status === 401 ? 'DeepSeek Key 无效，请检查设置。' : `DeepSeek 请求失败（${response.status}），请检查余额或稍后重试。`);
    parsed = await parseOutputSse(response.body, prepared.context, { signal });
  } catch (error) {
    if (!signal?.aborted) throw error;
    parsed = { result: parseOutputAnswer('', prepared.context), rawText: '', usage: null, finishReason: null, sawDone: false, error: 'aborted' };
  }
  const u = parsed.usage;
  const known = Number.isSafeInteger(u?.prompt_tokens) && u.prompt_tokens >= 0 && Number.isSafeInteger(u?.completion_tokens) && u.completion_tokens >= 0;
  const hit = known && Number.isSafeInteger(u.prompt_cache_hit_tokens) ? Math.min(u.prompt_tokens, Math.max(0, u.prompt_cache_hit_tokens)) : 0;
  const total = known ? u.prompt_tokens + u.completion_tokens : null;
  const cost = known ? (hit * price.hit + (u.prompt_tokens - hit) * price.miss + u.completion_tokens * price.output) / 1e6 : null;
  if (known) addLifetimeUsage(cost, total);
  return { raw: parsed.rawText,
    completed: !parsed.error && parsed.sawDone && parsed.finishReason === 'stop',
    usage: { total, cost, seconds: (Date.now() - start) / 1000 }, error: parsed.error };
}
