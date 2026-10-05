// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,serializeReadingSession,restoreReadingSession,readingExport} from '../../src/ai/output/session.js';
import {readingTask} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {parseSearchResponse} from '../../src/ai/background-search.js';
const fixture=JSON.parse(await readFile(new URL('../../experiments/reading-quality/grounded-exposed-reply.json',import.meta.url),'utf8'));
const q='我想知道“雾城对弈”能否冲高段位，但目前只有这个名称，没有提供玩法规则、版本、当前段位或联网资料。请先说明哪些内容无法判断，不套其他游戏机制。';
test('explicit object-data gap removes chart hypotheses from request and output schema',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(fixture.canonical),q);expect(readingTask(p.context)).toBe('background_needed');
 const data=JSON.parse(p.messages[1].content);expect(data.bases).toEqual([]);expect(data.conversation.initial_question).toBeUndefined();expect(data.conversation.history).toBeUndefined();
 expect(data.response_schema.properties.factors.maxItems).toBe(0);expect(data.response_schema.properties.main_choice.properties.basis_id.const).toBe('none');
 const a={schema_version:'structured-selection-2',context_id:p.context.context_id,answer:'仅有名称无法核对段位体系或个人冲段条件，需要补充规则、版本和当前段位。尚未检索，不把其他游戏规则套用在这里。',direction:'unclear',main_choice:{basis_id:'none',reason:'仅回应当前请求，不作趋势取用。'},factors:[],background_usage:[],timing_candidates:[],uncertainties:['玩法与实际状态未提供。']};
 expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('validated');
 a.factors=[{basis_id:'k1',assessment:'neutral',interpretation:'提示个人条件。'}];expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('fallback');
});
test('facts and advice stay prioritized; missing-data quotes do not become current instruction',async()=>{
 for(const [question,task]of [['只核对世应五行。目前只有这个名称，没有提供玩法规则。','facts'],['目前只有这个名称，没有提供玩法规则。请给两项建议。','advice'],['他说“目前只有这个名称，没有提供玩法规则”，能否成功？','interpretation'],['只有这个名称，但已经提供玩法规则，能否冲段？','interpretation'],['只有这个名称，但不是没有提供玩法规则，能否成功？','interpretation']]){
  const p=await prepareSelectedReadingTurn(createReadingSession(fixture.canonical),question);expect(readingTask(p.context)).toBe(task);
 }
});
test('candidate excerpts cannot automatically reopen inference; retain them for scoped review',async()=>{
 const bg=excerpt=>parseSearchResponse({stop_reason:'end_turn',content:[{type:'web_search_tool_result',content:[{type:'web_search_result',title:'对象规则',url:'https://example.org/rules'}]},{type:'text',citations:[{url:'https://example.org/rules',cited_text:excerpt}]}]},'雾城对弈');
 for(const excerpt of ['对象版本规则摘录，需模型核对适用性。','限时迷你玩法规则，不代表主对象。']){
  const p=await prepareSelectedReadingTurn(createReadingSession(fixture.canonical),q,{backgroundSearch:bg(excerpt)});expect(readingTask(p.context)).toBe('background_needed');
  const data=JSON.parse(p.messages[1].content);expect(data.bases).toEqual([]);
  expect(data.sources.length).toBe(excerpt.includes('限时')?0:1);
 }
});
test('old task 4 is preserved while new task 5 roundtrips focused pending export',async()=>{
 for(const version of [4,5]){
  const session=createReadingSession(fixture.canonical),p=await prepareSelectedReadingTurn(session,q,{taskPolicyVersion:version});
  expect(readingTask(p.context)).toBe(version===4?'interpretation':'background_needed');
  const restored=await restoreReadingSession(serializeReadingSession(session,q));expect(readingExport(restored.pending)).toBe(readingExport(p));
 }
});
