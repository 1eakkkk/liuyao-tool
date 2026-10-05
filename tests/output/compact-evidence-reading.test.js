// @vitest-environment node
import {test,expect} from 'vitest';
import {prepareCompactEvidenceTurn} from '../../experiments/reading-quality/compact-evidence-reading.js';
import {prepareRelationReadingTurn} from '../../experiments/reading-quality/relation-reading.js';
import {createReadingSession,appendReadingTurn,readingExport} from '../../src/ai/output/session.js';
import {readingRequestBody} from '../../src/ai/output/client.js';
import {syntheticOutput} from '../../experiments/structured-output/example.js';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {parseSearchResponse} from '../../src/ai/background-search.js';
const spec=(await prepareJudgmentPlan()).cases[0];
test('evidence deduplication preserves every value/target/source, rule origin/version and original context',async()=>{
 const old=await prepareRelationReadingTurn(createReadingSession(spec.canonical),spec.question);
 const session=createReadingSession(spec.canonical),p=await prepareCompactEvidenceTurn(session,spec.question);
 const a=JSON.parse(old.messages[1].content),b=JSON.parse(p.messages[1].content);
 expect(p.context.context_id).toBe(old.context.context_id);
 expect(b.input.C_canonical_cast).toEqual(a.input.C_canonical_cast);
 expect(b.element_reference).toEqual(a.element_reference);
 expect(b.evidence.map(e=>e.id)).toEqual(a.evidence.map(e=>e.id));
 for(const [i,e] of b.evidence.entries()){
  if(e.kind==='program_fact')expect(e.value).toEqual(a.evidence[i].value);
  else {
   for(const key of ['rule_id','target','result','source_facts'])expect(e[key]).toEqual(a.evidence[i][key]);
   const hit=a.input.E_rule_results.hits.find(h=>h.rule_id===e.rule_id&&JSON.stringify(h.target)===JSON.stringify(e.target));
   expect(e.origin).toEqual(hit.origin);expect(e.rule_version).toEqual(hit.rule_version);
   for(const original of hit.evidence)expect(b.evidence.find(f=>f.id==='fact:'+original.path)?.value).toEqual(original.value);
  }
 }
 expect(b.input.E_rule_results.hits).toBeUndefined();expect(b.input.B_program_facts).toEqual(a.input.B_program_facts);
 for(const key of Object.keys(a.input.E_rule_results).filter(k=>k!=='hits'))expect(b.input.E_rule_results[key]).toEqual(a.input.E_rule_results[key]);
 expect(b.line_reference).toHaveLength(6);expect(b.line_reference[3]).toEqual({line:4,fact_prefix:'fact:/lines/3/'});
 expect(Buffer.byteLength(p.messages[1].content)).toBeLessThan(Buffer.byteLength(old.messages[1].content)*.7);
 expect(readingRequestBody(p).messages).toEqual(p.messages);expect(readingExport(p)).toContain(p.messages[1].content);
 expect(appendReadingTurn(session,p,JSON.stringify(syntheticOutput(p.context)),true,'external').result.status).toBe('validated');
});
test('question, response preferences, history and confirmed background survive projection; missing records stay null',async()=>{
 const background=parseSearchResponse({stop_reason:'end_turn',content:[{type:'web_search_tool_result',content:[{type:'web_search_result',title:'限时模式',url:'https://example.org/mode'}]},{type:'text',citations:[{url:'https://example.org/mode',cited_text:'限时模式，不代表主游戏。'}]}]},'某游戏');
 const session=createReadingSession(spec.canonical,{style:'brief',custom:''});
 const p=await prepareCompactEvidenceTurn(session,spec.question,{backgroundSearch:background});
 const b=JSON.parse(p.messages[1].content);expect(b.input.background_search).toEqual(background);
 expect(b.conversation.response_preferences.style).toBe('brief');
 expect(b.evidence.some(e=>e.value===null)).toBe(true);
 appendReadingTurn(session,p,JSON.stringify(syntheticOutput(p.context)),true,'external');
 const next=JSON.parse((await prepareCompactEvidenceTurn(session,'只核对第三爻的六亲')).messages[1].content);
 expect(next.conversation.history).toHaveLength(1);expect(next.input.A_user_question).toBe('只核对第三爻的六亲');
 expect(next.input.background_search).toBeUndefined();
});
