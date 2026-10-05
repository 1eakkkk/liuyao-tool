// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession,readingExport} from '../../src/ai/output/session.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {readingRequestBody} from '../../src/ai/output/client.js';
const fixture=JSON.parse(await readFile(new URL('../../experiments/reading-quality/grounded-exposed-reply.json',import.meta.url),'utf8'));
const q='我已部署到Cloudflare，仅供朋友免费使用。请给两项具体建议，不预测热度。';
const answer=context=>({schema_version:'structured-selection-2',context_id:context.context_id,answer:'一般建议：先记录入口并保留可回滚版本；再实际打开页面核对关键操作。如果确实有外部数据接口，再检查对应请求。',direction:'unclear',main_choice:{basis_id:'none',reason:'仅回应当前请求，不作趋势取用。'},factors:[],background_usage:[],timing_candidates:[],uncertainties:['当前是否可运行与是否有接口尚未核实。']});
test('advice request carries current question but not chart, initial question or historical inference',async()=>{
 const s=createReadingSession(fixture.canonical),old=await prepareSelectedReadingTurn(s,fixture.question,{groundingPolicyVersion:1});
 appendReadingTurn(s,old,fixture.raw,true,'external');
 const p=await prepareSelectedReadingTurn(s,q,{groundingPolicyVersion:2});const data=JSON.parse(p.messages[1].content);
 expect(data.question).toBe(q);expect(data.bases).toEqual([]);expect(data.conversation.history).toBeUndefined();expect(data.conversation.initial_question).toBeUndefined();
 expect(data.input_origins.reported_deployment).toContain('部署');expect(p.messages[1].content).not.toContain('Codex');
 expect(data.response_schema.properties.factors.maxItems).toBe(0);expect(data.response_schema.properties.main_choice.properties.basis_id.const).toBe('none');
 expect(readingRequestBody(p).messages).toEqual(p.messages);expect(readingExport(p)).toContain(p.messages[1].content);
 expect(parseOutputAnswer(JSON.stringify(answer(p.context)),p.context,{completed:true}).status).toBe('validated');
});
test('attribute prose is precisely located and classified as contract violation, not proven false',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(fixture.canonical),q);
 const a=answer(p.context);a.uncertainties=['动爻为是。'];const r=parseOutputAnswer(JSON.stringify(a),p.context,{completed:true});
 expect(r.issues).toEqual([{code:'program_attribute_in_explanation',path:'$.uncertainties[0]'}]);expect(r.answer).toBeNull();
 const old=await prepareSelectedReadingTurn(createReadingSession(fixture.canonical),q,{groundingPolicyVersion:1});a.context_id=old.context.context_id;
 expect(parseOutputAnswer(JSON.stringify(a),old.context,{completed:true}).issues).toEqual([{code:'model_fact_restatement',path:'$'}]);
});
test('reality assertion gate remains strict; conditional instructions do not become facts',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(fixture.canonical),q),a=answer(p.context);
 a.answer='代码能跑。';expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).issues[0].code).toBe('unbacked_reality_assertion');
 a.answer='一般建议：如果代码能跑，再记录实际使用。';expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('validated');
 a.answer+='代码能跑。';expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).issues[0].code).toBe('unbacked_reality_assertion');
});
test('old policy 1 and new policy 2 preserve exact pending exports and completed answers',async()=>{
 for(const version of [1,2]){
  const s=createReadingSession(fixture.canonical),p=await prepareSelectedReadingTurn(s,q,{groundingPolicyVersion:version});
  const pending=await restoreReadingSession(serializeReadingSession(s,q));expect(readingExport(pending.pending)).toBe(readingExport(p));
  appendReadingTurn(s,p,JSON.stringify(answer(p.context)),true,'external');const saved=await restoreReadingSession(serializeReadingSession(s));
  expect(saved.session.groundingPolicyVersion).toBe(version);expect(saved.session.turns[0].result.status).toBe('validated');
  expect(saved.session.turns[0].context.context_id).toBe(p.context.context_id);
 }
});
