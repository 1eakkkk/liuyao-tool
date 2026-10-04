// Background retrieval only. A model's prose is never proof that a search ran.
export const SEARCH_ENDPOINT = 'https://api.deepseek.com/anthropic/v1/messages';
export const SEARCH_LIMITS = Object.freeze({ queries: 1, uses: 1, maxTokens: 2048, sources: 5, bodyChars: 128000 });

export function pendingSearch(query) {
  return { search_request: searchRequest(query), search_status: 'pending', provenance: 'not_executed', web_sources: [], background_claims: [] };
}

// Recheck persisted input; provenance labels describe origin, never certify page truth.
export function validateSearchBackground(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'background_claims,provenance,search_request,search_status,web_sources') throw Error('搜索背景字段无效。');
  const request=searchRequest(value.search_request?.query);
  if (Object.keys(value.search_request).join(',') !== 'query' || !['pending','retrieved','no_results','failed'].includes(value.search_status) || !Array.isArray(value.web_sources) || value.web_sources.length>5 || !Array.isArray(value.background_claims) || value.background_claims.length>5) throw Error('搜索背景结构无效。');
  const retrieved=value.search_status==='retrieved';
  const origins={pending:'not_executed',retrieved:'provider_search_blocks',no_results:'provider_search_blocks',failed:'request_failed'};
  if (value.provenance!==origins[value.search_status] || (retrieved ? !value.web_sources.length : value.web_sources.length||value.background_claims.length)) throw Error('搜索状态与来源不一致。');
  const sources=value.web_sources.map((s,i)=>{
    if(s.id!==`web:${i+1}` || !safeUrl(s.url) || typeof s.title!=='string'||!s.title.trim()||s.title.length>240 || typeof s.excerpt!=='string'||s.excerpt.length>1200 || typeof s.retrieved_at!=='string'||!Number.isFinite(Date.parse(s.retrieved_at)) || !(s.published_at===null||typeof s.published_at==='string'&&s.published_at.length<=80)) throw Error('搜索来源无效。');
    return {id:s.id,title:s.title,url:safeUrl(s.url),retrieved_at:s.retrieved_at,excerpt:s.excerpt,published_at:s.published_at};
  });
  if(new Set(sources.map(s=>s.url)).size!==sources.length)throw Error('搜索来源重复。');
  const claims=value.background_claims.map(c=>{
    if(typeof c.text!=='string'||!c.text.trim()||c.text.length>1200||!Array.isArray(c.source_ids)||c.source_ids.length!==1 || !sources.some(s=>s.id===c.source_ids[0]&&s.excerpt===c.text))throw Error('背景摘录缺少对应来源。');
    return {text:c.text,source_ids:[...c.source_ids]};
  });
  return {search_request:request,search_status:value.search_status,provenance:value.provenance,web_sources:sources,background_claims:claims};
}

export function searchRequest(query) {
  if (typeof query !== 'string' || !query.trim() || query.trim().length > 120) throw Error('请填写 1～120 字的待核实名称或背景。');
  return { query: query.trim() };
}

export function searchBody(query) {
  const request = searchRequest(query);
  return { model: 'deepseek-flash', max_tokens: SEARCH_LIMITS.maxTokens, thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: [{ type: 'text', text: `Perform one web search for this exact query: ${request.query}. Do not split or expand the query. Return at most three short cited excerpts from relevant sources, prioritizing official pages; keep the final text under 200 Chinese characters. No guide, comparison, table, prediction or divination. Use native source citations, not self-written source URLs.` }] }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: SEARCH_LIMITS.uses }] };
}

function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export function parseSearchResponse(payload, query, retrievedAt = new Date().toISOString()) {
  const request = searchRequest(query);
  if (!Number.isFinite(Date.parse(retrievedAt))) throw Error('检索时间无效。');
  if (!Array.isArray(payload?.content) || payload.stop_reason !== 'end_turn') throw Error('联网核实未完整完成；不使用部分结果。');
  const blocks = payload.content.filter(b => b.type === 'web_search_tool_result');
  if (!blocks.length || blocks.some(b => !Array.isArray(b.content))) throw Error('接口没有返回真实搜索结果；不把模型文字当成检索。');
  const snippets = new Map();
  for (const b of payload.content.filter(b => b.type === 'text')) for (const c of b.citations ?? []) {
    const url = safeUrl(c.url);
    if (url && typeof c.cited_text === 'string' && c.cited_text.trim() && !snippets.has(url)) snippets.set(url, c.cited_text.slice(0, 1200));
  }
  const seen = new Set(), sources = [];
  for (const block of blocks) for (const item of block.content) {
    if (item.type !== 'web_search_result') throw Error('搜索服务返回错误或未知结果；请稍后再试。');
    const url = safeUrl(item.url);
    if (!url || typeof item.title !== 'string' || !item.title.trim()) throw Error('搜索来源格式无效。');
    if (seen.has(url)) continue;
    seen.add(url);
    if (sources.length < SEARCH_LIMITS.sources) sources.push({ id: `web:${sources.length + 1}`, title: item.title.slice(0, 240), url,
      retrieved_at: retrievedAt, excerpt: snippets.get(url) ?? '', published_at: typeof item.page_age === 'string' ? item.page_age.slice(0, 80) : null });
  }
  return { search_request: request, search_status: sources.length ? 'retrieved' : 'no_results',
    provenance: 'provider_search_blocks', web_sources: sources,
    // Excerpts are third-party content, not program facts or independently verified claims.
    background_claims: sources.filter(s => s.excerpt).map(s => ({ text: s.excerpt, source_ids: [s.id] })) };
}

export async function searchBackground(query, { key, signal, fetchImpl = globalThis.fetch } = {}) {
  const body = searchBody(query);
  if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key)) throw Error('请先填写有效的 DeepSeek Key。');
  signal?.throwIfAborted();
  const response = await fetchImpl(SEARCH_ENDPOINT, { method: 'POST', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key.trim(), 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  if (!response.ok) throw Error(`联网核实失败（${response.status}），未自动重试。`);
  // Bound streaming reads before JSON parsing; never log raw responses or credentials here.
  const reader = response.body.getReader(), decoder = new TextDecoder(); let raw = '';
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; raw += decoder.decode(value, { stream: true });
    if (raw.length > SEARCH_LIMITS.bodyChars) { await reader.cancel(); throw Error('联网结果过长，未使用。'); } }
    raw += decoder.decode();
  } finally { reader.releaseLock(); }
  const payload = JSON.parse(raw);
  const u = payload.usage;
  const usage = Number.isSafeInteger(u?.input_tokens) && u.input_tokens >= 0 && Number.isSafeInteger(u?.output_tokens) && u.output_tokens >= 0
    ? { input: u.input_tokens, output: u.output_tokens, total: u.input_tokens + u.output_tokens,
      cost_upper: (u.input_tokens * 2 + u.output_tokens * 8) / 1e6 } : null;
  // Provider limits are requests, not proven hard caps. Reject overruns and preserve usage for the caller.
  try {
    if (!usage || usage.output > SEARCH_LIMITS.maxTokens || !Number.isSafeInteger(u?.server_tool_use?.web_search_requests) || u.server_tool_use.web_search_requests < 1 || u.server_tool_use.web_search_requests > SEARCH_LIMITS.uses) throw Error('检索用量未知或超过本次请求限制，未使用结果。');
    const background = parseSearchResponse(payload, query);
    if (background.search_status === 'retrieved' && !background.background_claims.length) throw Error('搜索只返回链接，缺少可追溯摘录；不用于解读。');
    return { background, usage };
  } catch (error) { error.usage = usage; throw error; }
}
