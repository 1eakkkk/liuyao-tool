// @vitest-environment node
import {test,expect,vi} from 'vitest';
import {publicReaderUrl,pageExcerpt,readPublicSource} from '../../src/ai/public-source-reader.js';
import {searchWithPublicExcerpt,validateSearchBackground} from '../../src/ai/background-search.js';
const url='https://example.org/news?id=3';
const page=()=>({code:200,data:{url,content:'导航\n\n## 限时玩法：某游戏·迷你模式\n\n仅此模式采用卡牌。\n\n主游戏仍待核实。\n\n## 无关活动\n\n不要加入摘录'}});
const native=()=>({stop_reason:'end_turn',content:[{type:'web_search_tool_result',content:[{type:'web_search_result',title:'活动公告',url}]}],usage:{input_tokens:200,output_tokens:20,server_tool_use:{web_search_requests:1}}});
test('public reader forbids local/credential URLs and preserves source identity and qualifications',()=>{
  for(const u of ['http://example.org','https://localhost/a','https://localhost./a','https://printer.local./a','https://127.1/a','https://2130706433/a','https://10.0.0.1/a','https://user:pass@example.org','https://example.internal/a'])expect(()=>publicReaderUrl(u)).toThrow();
  expect(publicReaderUrl(url+'#part')).toBe('https://r.jina.ai/'+url);
  const excerpt=pageExcerpt(page(),url,'某游戏');expect(excerpt).toContain('限时玩法');expect(excerpt).toContain('主游戏仍待核实');expect(excerpt).not.toContain('无关活动');
  const intro=page();intro.data.content='先提到某游戏的更新预告。\n\n'+intro.data.content;
  expect(pageExcerpt(intro,url,'某游戏')).toBe(excerpt);
  const qualifier=page();qualifier.data.content=qualifier.data.content.replace('导航','仅限限时活动，不代表主游戏');
  expect(pageExcerpt(qualifier,url,'某游戏')).toContain('不代表主游戏');
  const long=page();long.data.content=long.data.content.replace('仅此模式采用卡牌。','仅此模式采用卡牌。'+ '长说明'.repeat(450)+'仅限本模式');
  expect(()=>pageExcerpt(long,url,'某游戏')).toThrow('过长');
  expect(()=>pageExcerpt({...page(),data:{...page().data,url:'https://evil.org'}},url,'某游戏')).toThrow('不一致');
  expect(()=>pageExcerpt(page(),url,'另一游戏')).toThrow('未找到');
});
test('one read sends only public URL, no key or question, respects cancellation and bounds',async()=>{
  const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(page()))),c=new AbortController();
  expect((await readPublicSource(url,'某游戏',{fetchImpl,signal:c.signal})).excerpt_origin).toBe('public_reader');
  expect(fetchImpl).toHaveBeenCalledTimes(1);const [,options]=fetchImpl.mock.calls[0];
  expect(options.headers).toEqual({Accept:'application/json'});expect(options.credentials).toBe('omit');expect(options.referrerPolicy).toBe('no-referrer');expect(options.signal).toBe(c.signal);
  c.abort();await expect(readPublicSource(url,'某游戏',{fetchImpl,signal:c.signal})).rejects.toThrow();expect(fetchImpl).toHaveBeenCalledTimes(1);
  await expect(readPublicSource(url,'某游戏',{fetchImpl:async()=>new Response('x'.repeat(128001))})).rejects.toThrow('过长');
});
test('pipeline uses one native request then one selected reader, keeps usage on failure and never retries paid search',async()=>{
  const fetchImpl=vi.fn(async(endpoint)=>new Response(JSON.stringify(endpoint.startsWith('https://r.jina.ai/')?page():native())));
  const r=await searchWithPublicExcerpt('某游戏 官方','某游戏',{key:'test-only',fetchImpl});
  expect(fetchImpl).toHaveBeenCalledTimes(2);expect(validateSearchBackground(r.background)).toEqual(r.background);
  expect(r.background.background_claims[0].source_ids).toEqual(['web:1']);expect(r.usage.total).toBe(220);
  expect(JSON.stringify(fetchImpl.mock.calls[1])).not.toContain('test-only');
  const fail=vi.fn(async(endpoint)=>endpoint.startsWith('https://r.jina.ai/')?new Response('{}',{status:429}):new Response(JSON.stringify(native())));
  try{await searchWithPublicExcerpt('某游戏 官方','某游戏',{key:'test-only',fetchImpl:fail});throw Error('Expected failure');}catch(e){expect(e.message).toContain('429');expect(e.usage.total).toBe(220);}
  expect(fail).toHaveBeenCalledTimes(2);
  const over=native();over.usage.server_tool_use.web_search_requests=2;const blocked=vi.fn(async()=>new Response(JSON.stringify(over)));
  await expect(searchWithPublicExcerpt('某游戏 官方','某游戏',{key:'test-only',fetchImpl:blocked})).rejects.toThrow('限制');expect(blocked).toHaveBeenCalledTimes(1);
});
