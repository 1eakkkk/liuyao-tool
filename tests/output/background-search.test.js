// @vitest-environment node
import { test, expect, vi } from 'vitest';
import { searchBody, parseSearchResponse, searchBackground, pendingSearch, validateSearchBackground, SEARCH_ENDPOINT } from '../../src/ai/background-search.js';
import fs from 'node:fs';
import { createReadingSession, prepareCompactReadingTurn, appendReadingTurn, serializeReadingSession, restoreReadingSession, readingExport } from '../../src/ai/output/session.js';
import { readingRequestBody } from '../../src/ai/output/client.js';
import { syntheticOutput } from '../../experiments/structured-output/example.js';
const payload = () => ({ stop_reason: 'end_turn', content: [
  { type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: '官方规则', url: 'https://example.org/rules', page_age: '2026-10-01' }] },
  { type: 'text', text: 'Untrusted model explanation', citations: [{ url: 'https://example.org/rules', cited_text: '公开规则摘录' }] }
], usage: { input_tokens: 500, output_tokens: 100, server_tool_use:{web_search_requests:1} } });
test('actual search blocks determine status and source-bound excerpts; prose never creates sources', () => {
  const p=payload(); p.content[0].content.push({...p.content[0].content[0]});
  const b=parseSearchResponse(p,'某游戏','2026-10-04T10:00:00Z');
  expect(b.search_status).toBe('retrieved'); expect(b.web_sources).toHaveLength(1);
  expect(b.background_claims).toEqual([{text:'公开规则摘录',source_ids:['web:1']}]);
  expect(JSON.stringify(b)).not.toContain('Untrusted model explanation');
  p.content[1].citations=[]; expect(parseSearchResponse(p,'某游戏').background_claims).toEqual([]);
});
test('missing, errored, truncated or unsafe sources cannot claim searched; genuine empty results remain empty', () => {
  for (const p of [ {stop_reason:'end_turn',content:[{type:'text',text:'已搜索 https://example.org'}]},
    {...payload(),stop_reason:'max_tokens'}, {stop_reason:'end_turn',content:[{type:'web_search_tool_result',content:{type:'web_search_tool_result_error',error_code:'unavailable'}}]} ])
    expect(()=>parseSearchResponse(p,'某游戏')).toThrow();
  for (const url of ['javascript:alert(1)','https://secret@evil.test','invalid']) {const p=payload();p.content[0].content[0].url=url; expect(()=>parseSearchResponse(p,'某游戏')).toThrow();}
  const p=payload();p.content[0].content=[]; expect(parseSearchResponse(p,'某游戏').search_status).toBe('no_results');
});
test('one bounded native call reuses caller key, obeys cancellation and redirects, accounts separately, never retries', async () => {
  const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(payload()))), controller=new AbortController();
  const r=await searchBackground('某游戏',{key:'test-only',signal:controller.signal,fetchImpl});
  expect(fetchImpl).toHaveBeenCalledTimes(1); const [url,options]=fetchImpl.mock.calls[0];
  expect(url).toBe(SEARCH_ENDPOINT);expect(options.redirect).toBe('error');expect(options.signal).toBe(controller.signal);
  const body=JSON.parse(options.body); expect(body.tools[0].max_uses).toBe(1);expect(body.max_tokens).toBe(2048);
  expect(r.usage).toEqual({input:500,output:100,total:600,cost_upper:0.0018}); expect(JSON.stringify(r)).not.toContain('test-only');
  const fail=vi.fn(async()=>new Response('{}',{status:429})); await expect(searchBackground('某游戏',{key:'test-only',fetchImpl:fail})).rejects.toThrow('429');expect(fail).toHaveBeenCalledTimes(1);
  const large=vi.fn(async()=>new Response('x'.repeat(129000)));await expect(searchBackground('某游戏',{key:'test-only',fetchImpl:large})).rejects.toThrow('过长');
  const untouched=vi.fn();await expect(searchBackground('x'.repeat(121),{key:'test-only',fetchImpl:untouched})).rejects.toThrow();expect(untouched).not.toHaveBeenCalled();
  expect(()=>searchBody(' ')).toThrow();
});

test('provider overruns or unknown usage fail with accountable usage, not a false one-search guarantee', async()=>{
  for(const modify of [p=>{p.usage.server_tool_use.web_search_requests=2;},p=>{p.usage.output_tokens=2163;},p=>{delete p.usage.server_tool_use;}]){
    const p=payload();modify(p);const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(p)));
    try{await searchBackground('某游戏',{key:'test-only',fetchImpl});throw Error('Should reject');}
    catch(e){expect(e.message).toContain('限制');expect(e.usage.total).toBe(p.usage.input_tokens+p.usage.output_tokens);expect(fetchImpl).toHaveBeenCalledTimes(1);}
  }
});

test('input snapshot rejects invented excerpts, unsafe sources and mismatched search states',()=>{
  const valid=parseSearchResponse(payload(),'某游戏');expect(validateSearchBackground(valid)).toEqual(valid);
  expect(validateSearchBackground(pendingSearch('某游戏')).search_status).toBe('pending');
  for(const [search_status,provenance] of [['pending','provider_search_blocks'],['no_results','not_executed'],['failed','not_executed']]) expect(()=>validateSearchBackground({...pendingSearch('某游戏'),search_status,provenance})).toThrow();
  for(const modify of [b=>{b.background_claims[0].text='invented';},b=>{b.web_sources[0].url='javascript:alert(1)';},b=>{b.search_status='failed';},b=>{b.background_claims[0].source_ids=['web:9'];}]){const b=structuredClone(valid);modify(b);expect(()=>validateSearchBackground(b)).toThrow();}
});

test('API and export share hash-bound search input; restore preserves it and new turns do not reuse stale background',async()=>{
  const canonical=JSON.parse(fs.readFileSync(new URL('../../experiments/phase7/fixtures/compat-1.json',import.meta.url)));
  const s=createReadingSession(canonical), query='某游戏';
  const plain=await prepareCompactReadingTurn(s,'能达到目标吗？');
  const pending=await prepareCompactReadingTurn(s,'能达到目标吗？',{backgroundSearch:pendingSearch(query)});
  expect(pending.context.context_id).not.toBe(plain.context.context_id);
  expect(JSON.parse(readingRequestBody(pending).messages[1].content).input.background_search.search_status).toBe('pending');
  expect(readingExport(pending)).toContain('background_search');
  expect(JSON.parse(serializeReadingSession(s,'不同问题')).pendingBackgroundSearch).toBeUndefined();
  expect((await restoreReadingSession(serializeReadingSession(s,pending.question))).pending.messages).toEqual(pending.messages);
  const ready=await prepareCompactReadingTurn(s,pending.question,{backgroundSearch:parseSearchResponse(payload(),query)});
  expect(ready.context.context_id).not.toBe(pending.context.context_id);
  expect(ready.context.evidence.some(e=>e.id.startsWith('web:'))).toBe(false);
  const reply=JSON.stringify(syntheticOutput(ready.context));appendReadingTurn(s,ready,reply,true,'external');
  expect(s.pendingBackgroundSearch).toBeUndefined();
  expect(JSON.parse(serializeReadingSession(s,'另一个待回复')).pendingBackgroundSearch).toBeUndefined();
  const restored=await restoreReadingSession(serializeReadingSession(s));
  expect(restored.session.turns[0].context.context_id).toBe(ready.context.context_id);
  expect(restored.session.turns[0].backgroundSearch).toEqual(ready.backgroundSearch);
  expect(restored.session.pendingBackgroundSearch).toBeUndefined();
  expect(JSON.parse(serializeReadingSession(restored.session,ready.question)).pendingBackgroundSearch).toBeUndefined();
  const next=await prepareCompactReadingTurn(restored.session,'新问题');
  expect(next.context.input.background_search).toBeUndefined();
  expect(JSON.parse(serializeReadingSession(restored.session,next.question)).pendingBackgroundSearch).toBeUndefined();
});
