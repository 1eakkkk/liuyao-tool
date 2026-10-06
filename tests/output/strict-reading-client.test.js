// @vitest-environment node
import {test,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession} from '../../src/ai/output/session.js';
import {callReading} from '../../src/ai/output/client.js';
import {receiveStrictReading,strictReadingRequest} from '../../src/ai/output/strict-transport.js';
import {completionIssue,normalizeCompletion} from '../../src/ai/output/completion.js';
const c=(await prepareJudgmentPlan()).cases[1];
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const prepare=s=>prepareSelectedReadingTurn(s,c.question,{judgmentPolicyVersion:6});
function storage(){vi.stubEnv('VITE_READING_STRICT_TRANSPORT','1');const data=new Map([['liuyao_deepseek_api_key','TEST_ONLY']]);vi.stubGlobal('localStorage',{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});}
const answer=p=>({schema_version:'structured-selection-2',context_id:p.context.context_id,direction:'unclear',main_choice:{basis_id:'none',reason:'关联取法未确认。',perspective:'none'},factors:[],judgment:{basis_ids:[],reason:'尚无可确认的关联，不能判断目标能否达成。'},role_tradeoffs:[],general_advice:[],background_usage:[],timing_candidates:[],uncertainties:['实际取法尚未确认。']});
const packet=raw=>({choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'test-1',type:'function',function:{name:'submit_reading',arguments:raw}}]}}],usage:{prompt_tokens:12,completion_tokens:20}});
test('one strict API request preserves actual finish reason and reproduces a valid historical reading',async()=>{
 storage();const s=createReadingSession(c.canonical),p=await prepare(s),raw=JSON.stringify(answer(p));
 const fetch=vi.fn(async(url,options)=>{expect(url).toBe('https://api.deepseek.com/beta/chat/completions');const b=JSON.parse(options.body);expect(b.stream).toBe(false);expect(b.tools[0].function.strict).toBe(true);expect(b.tools[0].function.parameters.properties.context_id.enum).toEqual([p.context.context_id]);return new Response(JSON.stringify(packet(raw)));});vi.stubGlobal('fetch',fetch);
 const api=await callReading(p,undefined,{transport:'strict_tool'}),t=appendReadingTurn(s,p,api.raw,api.completed,'api',api.usage,{completion:api.completion});
 expect(t.result.status).toBe('validated');expect(t.raw).toBe(raw);expect(t.completion.finishReason).toBe('tool_calls');expect(t.completion.sawDone).toBeUndefined();
 const restored=await restoreReadingSession(serializeReadingSession(s));expect(restored.session.turns[0].result.answer).toEqual(t.result.answer);expect(restored.session.turns[0].completion).toEqual(t.completion);expect(fetch).toHaveBeenCalledTimes(1);
});
test.each([['length','response_token_limit'],['stop','unexpected_finish_reason']])('strict finish %s is rejected even when arguments form a valid answer',async(finish,code)=>{
 storage();const s=createReadingSession(c.canonical),p=await prepare(s),body=packet(JSON.stringify(answer(p)));body.choices[0].finish_reason=finish;vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(body))));
 const api=await callReading(p,undefined,{transport:'strict_tool'}),t=appendReadingTurn(s,p,api.raw,api.completed,'api',api.usage,{completion:api.completion});expect(t.result.status).toBe('fallback');expect(t.result.issues[0].code).toBe(code);expect(api.raw).toContain('submit_reading');
 const restored=await restoreReadingSession(serializeReadingSession(s));expect(restored.session.turns[0].result.issues).toEqual(t.result.issues);
});
test('wrong tool and extra text are preserved as an envelope without execution or automatic retry',async()=>{
 storage();const s=createReadingSession(c.canonical),p=await prepare(s),body=packet(JSON.stringify(answer(p)));body.choices[0].message.tool_calls[0].function.name='delete_file';
 const fetch=vi.fn(async()=>new Response(JSON.stringify(body)));vi.stubGlobal('fetch',fetch);const api=await callReading(p,undefined,{transport:'strict_tool'});expect(api.completed).toBe(false);expect(api.raw).toContain('delete_file');expect(completionIssue(api.completion)).toBe('strict_tool_identity');expect(fetch).toHaveBeenCalledTimes(1);
 body.choices[0].message.tool_calls[0].function.name='submit_reading';body.choices[0].message.content='另一结论';expect((await receiveStrictReading(new Response(JSON.stringify(body)),p.context)).completion.error).toBe('strict_unexpected_text');
});
test('complete tool arguments still fail the original site contract, with unchanged raw text',async()=>{
 storage();const s=createReadingSession(c.canonical),p=await prepare(s),a=answer(p);a.extra='unexpected';const raw=JSON.stringify(a);vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(packet(raw)))));
 const api=await callReading(p,undefined,{transport:'strict_tool'}),t=appendReadingTurn(s,p,api.raw,api.completed,'api',api.usage,{completion:api.completion});expect(t.raw).toBe(raw);expect(t.result.issues[0]).toEqual({code:'unknown_field',path:'$.extra'});
});
test('bounded UTF-8 body receiving and abort cannot promote partial packets or hang on cancellation',async()=>{
 const p=await prepare(createReadingSession(c.canonical));const limit=await receiveStrictReading(new Response('x'.repeat(100)),p.context,undefined,{maxBytes:20});expect(limit.completed).toBe(false);expect(limit.completion.error).toBe('strict_response_too_large');
 const controller=new AbortController(),body=new ReadableStream({cancel(){return new Promise(()=>{});}});const pending=receiveStrictReading(new Response(body),p.context,controller.signal);controller.abort('reading_timeout');const stopped=await pending;expect(stopped.completion.error).toBe('request_timeout');expect(body.locked).toBe(false);
 const broken=await receiveStrictReading(new Response('{"choices":'),p.context);expect(broken.rawText).toBe('{"choices":');expect(broken.completion.error).toBe('strict_invalid_json');
});
test('strict diagnostics cannot legitimize absent envelopes or store arbitrary metadata',()=>{
 expect(completionIssue({transport:'strict_tool',error:null,finishReason:'tool_calls',bodyComplete:true,envelopeValid:false})).toBe('strict_invalid_envelope');
 expect(()=>normalizeCompletion({transport:'strict_tool',error:null,finishReason:'tool_calls',bodyComplete:true,envelopeValid:true,headers:'SECRET'})).toThrow();
 expect(completionIssue({error:null,finishReason:'tool_calls',sawDone:true})).toBe('unexpected_finish_reason');
});

test('explicit strict selection cannot bypass the production switch or legacy session policy',async()=>{
 const s=createReadingSession(c.canonical),p=await prepare(s);vi.stubEnv('VITE_READING_STRICT_TRANSPORT','0');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(callReading(p,undefined,{transport:'strict_tool'})).rejects.toThrow('尚未启用');expect(fetch).not.toHaveBeenCalled();
 vi.stubEnv('VITE_READING_STRICT_TRANSPORT','1');const old=await prepareSelectedReadingTurn(createReadingSession(c.canonical),c.question,{judgmentPolicyVersion:2});
 await expect(callReading(old,undefined,{transport:'strict_tool'})).rejects.toThrow('版本不兼容');expect(fetch).not.toHaveBeenCalled();
});

test('observed complete provider response remains rejected and survives history without a paid retry',async()=>{
 const dir=new URL('../../docs/acceptance/strict-reading-20261006/',import.meta.url);
 const read=name=>fs.readFileSync(new URL(name,dir));
 const hash=data=>createHash('sha256').update(data).digest('hex');
 const planBytes=read('plan.json'),plan=JSON.parse(planBytes),c=plan.cases[0];
 expect(hash(planBytes)).toBe(read('plan.sha256').toString().trim());
 const original=JSON.parse(read('private-project-check.json')),archive=JSON.parse(read('private-project-archive.json'));
 const provider=read('private-project-provider.json'),raw=read('private-project-response.txt').toString();
 expect(hash(provider)).toBe(archive.sha256);expect(hash(raw)).toBe(original.rawSha256);
 const fetch=vi.fn(()=>{throw Error('No network in replay');});vi.stubGlobal('fetch',fetch);
 const s=createReadingSession(c.canonical,{style:'brief',custom:''}),p=await prepareSelectedReadingTurn(s,c.question,{judgmentPolicyVersion:6,groundingPolicyVersion:2});
 expect(p.context.context_id).toBe(c.context.context_id);
 const api=await receiveStrictReading(new Response(provider),p.context);
 expect(api.rawText).toBe(raw);expect(api.completed).toBe(true);expect(api.completion).toEqual(original.completion);
 const t=appendReadingTurn(s,p,api.rawText,api.completed,'api',api.usage,{completion:api.completion});
 expect(t.result.status).toBe('fallback');expect(t.result.issues[0]).toEqual({code:'program_attribute_in_explanation',path:'$.factors[1].interpretation'});
 const restored=await restoreReadingSession(serializeReadingSession(s));
 expect(restored.session.turns[0].raw).toBe(raw);expect(restored.session.turns[0].result.status).toBe('fallback');expect(restored.session.turns[0].completion).toEqual(api.completion);
 expect(fetch).not.toHaveBeenCalled();
 // The recorded earlier verdict is preserved; it is not rewritten after stronger checks.
 expect(original.issues[0].path).toBe('$.factors[1].interpretation');
});
