// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,serializeReadingSession,restoreReadingSession,readingExport} from '../../src/ai/output/session.js';
import {readingTask} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
const fixture=JSON.parse(await readFile(new URL('../../experiments/reading-quality/grounded-exposed-reply.json',import.meta.url),'utf8'));
test('specific actionable numbered advice restricts both API and exported prompt schema',async()=>{
 for(const wording of ['请先给两项具体建议','给两条可执行的建议','请给一项可操作建议']){
  const p=await prepareSelectedReadingTurn(createReadingSession(fixture.canonical),`如何安排维护？${wording}，不预测收益、热度或时间。`);
  expect(readingTask(p.context)).toBe('advice');expect(p.context.conversation.task_policy).toBe(3);
  const schema=JSON.parse(p.messages[1].content).response_schema;
  expect(schema.properties.factors.maxItems).toBe(0);expect(schema.properties.direction.const).toBe('unclear');
  expect(readingExport(p)).toContain('一般筹备建议');
  const raw={schema_version:'structured-selection-2',context_id:p.context.context_id,answer:'一般建议：保存可回滚版本；定期检查实际可访问性。',direction:'unclear',main_choice:{basis_id:'none',reason:'仅回应当前请求，不作趋势取用。'},factors:[],background_usage:[],timing_candidates:[],uncertainties:['实际运行状态需自行检查。']};
  expect(parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true}).status).toBe('validated');
  raw.factors=[{basis_id:'l1',assessment:'neutral',interpretation:'保持现状。'}];
  expect(parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true}).status).toBe('fallback');
 }
});
test('trend requests and quoted requests cannot be narrowed into advice',async()=>{
 for(const q of ['能不能成功？请给两项具体建议。','他说“请给两项具体建议”，我问项目前景怎么样？']){
  const p=await prepareSelectedReadingTurn(createReadingSession(fixture.canonical),q);expect(readingTask(p.context)).toBe('interpretation');
 }
});
test('saved task 2 keeps old identity while task 3 exports restore exactly',async()=>{
 const q='如何安排维护？请先给两项具体建议，不预测收益、热度或时间。';
 for(const version of [2,3]){
  const session=createReadingSession(fixture.canonical),p=await prepareSelectedReadingTurn(session,q,{taskPolicyVersion:version});
  expect(readingTask(p.context)).toBe(version===2?'interpretation':'advice');
  const saved=await restoreReadingSession(serializeReadingSession(session,q));
  expect(saved.session.taskPolicyVersion).toBe(version);expect(readingExport(saved.pending)).toBe(readingExport(p));
 }
});
