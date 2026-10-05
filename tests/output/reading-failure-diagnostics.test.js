// @vitest-environment node
import {test,expect,vi,afterEach} from 'vitest';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession} from '../../src/ai/output/session.js';
import {callReading} from '../../src/ai/output/client.js';
import {outputIssueText,outputFailureSummary} from '../../src/ai/output/view.js';
const c=(await prepareJudgmentPlan()).cases[1];
const prepare=s=>prepareSelectedReadingTurn(s,c.question,{judgmentPolicyVersion:2});
const answer=p=>({schema_version:'structured-selection-2',context_id:p.context.context_id,answer:'目前仅作为条件观察，不能判断实际结果。',direction:'unclear',main_choice:{basis_id:'none',reason:'取用尚未确认。'},factors:[],background_usage:[],timing_candidates:[],uncertainties:['实际情况未知。']});
afterEach(()=>vi.unstubAllGlobals());
function storage(){const data=new Map([['liuyao_deepseek_api_key','TEST_ONLY']]);vi.stubGlobal('localStorage',{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});}
function stream(raw,{finish='stop',done=true,bad=false}={}){
 return `data: ${JSON.stringify({choices:[{delta:{content:raw},finish_reason:finish}],usage:{prompt_tokens:10,completion_tokens:20}})}\n\n${bad?'data: invalid event\n\n':''}${done?'data: [DONE]\n\n':''}`;
}
test.each([
 [{finish:'length'},'response_token_limit'],
 [{done:false},'stream_not_finished'],
 [{bad:true},'sse_malformed_event'],
])('API failure survives UI append and historical restoration: %s',async(options,code)=>{
 storage();const s=createReadingSession(c.canonical),p=await prepare(s),raw=JSON.stringify(answer(p));
 const fetch=vi.fn(async()=>new Response(stream(raw,options),{headers:{'Content-Type':'text/event-stream'}}));vi.stubGlobal('fetch',fetch);
 const api=await callReading(p);expect(api.completed).toBe(false);
 const t=appendReadingTurn(s,p,api.raw,api.completed,'api',api.usage,{completion:api.completion});
 expect(t.result.status).toBe('fallback');expect(t.result.issues[0].code).toBe(code);expect(t.raw).toBe(raw);
 expect(outputFailureSummary(t.result)).toContain('未完整接收');
 const restored=await restoreReadingSession(serializeReadingSession(s));expect(restored.session.turns[0].result.issues).toEqual(t.result.issues);
 const next=await prepareSelectedReadingTurn(restored.session,'继续核对');expect(next.context.conversation.history[0].answer).toBeNull();
 expect(fetch).toHaveBeenCalledTimes(1);
});
test('valid JSON with an extra field remains a contract failure with exact path, rather than a connection failure',async()=>{
 storage();const s=createReadingSession(c.canonical),p=await prepare(s),a=answer(p);a.extra_note='';const raw=JSON.stringify(a);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(stream(raw))));const api=await callReading(p);
 const t=appendReadingTurn(s,p,api.raw,api.completed,'api',api.usage,{completion:api.completion});
 expect(t.result.issues[0]).toEqual({code:'unknown_field',path:'$.extra_note'});expect(outputIssueText(t.result)).toContain('extra_note');
 expect(outputFailureSummary(t.result)).toContain('字段');expect(t.raw).toBe(raw);
});
test.each([['reading_timeout','request_timeout'],[undefined,'aborted']])('timeout and manual stop have distinct persisted explanations: %s',async(reason,code)=>{
 storage();const s=createReadingSession(c.canonical),p=await prepare(s),controller=new AbortController();controller.abort(reason);
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new DOMException('aborted','AbortError');}));
 const api=await callReading(p,controller.signal),t=appendReadingTurn(s,p,api.raw,api.completed,'api',api.usage,{completion:api.completion});
 expect(t.result.issues[0].code).toBe(code);expect(t.completed).toBe(false);
});
test('diagnostics cannot promote incomplete content or smuggle arbitrary provider data into history',async()=>{
 const s=createReadingSession(c.canonical),p=await prepare(s),raw=JSON.stringify(answer(p));
 const t=appendReadingTurn(s,p,raw,true,'api',null,{completion:{error:null,finishReason:'length',sawDone:true}});
 expect(t.completed).toBe(false);expect(t.result.answer).toBeNull();
 expect(()=>appendReadingTurn(s,p,raw,true,'api',null,{completion:{error:null,finishReason:'stop',sawDone:true,headers:'SECRET'}})).toThrow('传输完成');
 const saved=JSON.parse(serializeReadingSession(s));saved.turns[0].completion.error='invented_provider_error';
 await expect(restoreReadingSession(JSON.stringify(saved))).rejects.toThrow('传输完成');
});
test('only new external imports accept a whole JSON wrapper; original text and import policy survive restore',async()=>{
 const s=createReadingSession(c.canonical),p=await prepare(s),raw='\uFEFF```json\n'+JSON.stringify(answer(p))+'\n```';
 const t=appendReadingTurn(s,p,raw,true,'external',null,{allowEnvelope:true});
 expect(t.result.status).toBe('validated');expect(t.result.inputNormalization).toBe('outer_json_fence');expect(t.raw).toBe(raw);
 const restored=await restoreReadingSession(serializeReadingSession(s));expect(restored.session.turns[0].result.answer).toEqual(t.result.answer);expect(restored.session.turns[0].raw).toBe(raw);
 const saved=JSON.parse(serializeReadingSession(s));delete saved.turns[0].inputEnvelopeVersion;
 const old=await restoreReadingSession(JSON.stringify(saved));expect(old.session.turns[0].result.issues[0].code).toBe('invalid_json');
 const api=appendReadingTurn(createReadingSession(c.canonical),p,raw,true,'api',null,{allowEnvelope:true});expect(api.result.issues[0].code).toBe('invalid_json');
});
test('external wrapper tolerance never extracts embedded JSON, removes fields, or bypasses duplicate key checks',async()=>{
 const p=await prepare(createReadingSession(c.canonical)),a=answer(p),valid=JSON.stringify(a);
 for(const raw of [`这是你的回答：\n\`\`\`json\n${valid}\n\`\`\``,`\`\`\`json\n${valid}\n\`\`\`\n说明`,`${valid}\n${valid}`,`\`\`\`json\n${valid}\n\`\`\`\n\`\`\`json\n${valid}\n\`\`\``]){
  const t=appendReadingTurn(createReadingSession(c.canonical),p,raw,true,'external',null,{allowEnvelope:true});expect(t.result.issues[0].code).toBe('invalid_json');expect(t.raw).toBe(raw);
 }
 a.note='';const unknown=appendReadingTurn(createReadingSession(c.canonical),p,'```json\n'+JSON.stringify(a)+'\n```',true,'external',null,{allowEnvelope:true});expect(unknown.result.issues[0].code).toBe('unknown_field');
 const duplicate=valid.replace('"direction":"unclear"','"direction":"unclear","direction":"mixed"');
 const t=appendReadingTurn(createReadingSession(c.canonical),p,'```json\n'+duplicate+'\n```',true,'external',null,{allowEnvelope:true});expect(t.result.issues[0].code).toBe('duplicate_field');
});
