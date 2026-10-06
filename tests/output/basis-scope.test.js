// @vitest-environment node
import {test,expect,vi,afterEach} from 'vitest';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {createReadingSession,prepareReadingTurn,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession,readingExport} from '../../src/ai/output/session.js';
import {selectionCatalog} from '../../src/ai/output/selection.js';
import {basisScope,declaresUnresolvedLink} from '../../src/ai/output/basis-scope.js';
import fs from 'node:fs';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {strictReadingRequest,receiveStrictReading} from '../../src/ai/output/strict-transport.js';
const c=(await prepareJudgmentPlan()).cases[1];
afterEach(()=>vi.unstubAllEnvs());
const prepare=(s=createReadingSession(c.canonical),question=c.question,options={})=>prepareSelectedReadingTurn(s,question,{judgmentPolicyVersion:6,basisPolicyVersion:2,...options});
const answer=p=>({schema_version:'structured-selection-2',context_id:p.context.context_id,direction:'unclear',main_choice:{basis_id:'l1',perspective:'self',reason:'观察维护者与目标的关联。'},
 factors:[{basis_id:'k2',assessment:'conditional',role:{basis_id:'l1',perspective:'self',meaning:'仅提出个人维护这个分析角度。'},application:{origin:'model_hypothesis',state:'proposed',goal_link:'从个人持续维护这一目标提出对象与作用的分析假设，实际关联尚须独立审查。'},interpretation:'如果相关作用条件得到支持，才可能讨论对目标的影响；这里不把条件当成已成立。'}],
 judgment:{basis_ids:['k2'],reason:'当前作用条件未确认，不能判断目标能否达成。'},role_tradeoffs:[],general_advice:[],background_usage:[],timing_candidates:[],uncertainties:['目标关联与实际作用均未获程序验证。']});
const parse=(p,a)=>parseOutputAnswer(JSON.stringify(a),p.context,{completed:true});

test('input classifies actual records and carries dependency IDs without inventing interpretation sources',async()=>{
 const p=await prepare(),input=JSON.parse(p.messages[1].content),registry=new Map(p.context.evidence.map(e=>[e.id,e]));
 expect(input.conversation.basis_policy).toBe(2);
 expect(new Set(input.bases.map(e=>e.proof_scope.kind))).toEqual(new Set(['position_attributes','calculated_direction','rule_annotation']));
 expect(input.proof_scope_rules.origin).toBe('program_record');
 for(const entry of selectionCatalog(p.context).entries){
  const s=basisScope(entry,p.context);expect(s.origin).toBe('program_record');expect(s.explanation_origin).toBe('model_hypothesis');
  expect(s.does_not_confirm).toContain('target_applicability');expect(s.does_not_confirm).toContain('traditional_definition');
  for(const id of s.source_fact_ids)expect(registry.get(id).kind).toBe('program_fact');
  expect(s.dependency_use).toBe('same_record_chain_not_independent_support');
 }
 expect(()=>basisScope({ids:['invented'],target:null},p.context)).toThrow('Missing scope source');
 expect(readingExport(p)).toContain(p.messages[1].content);
 expect(strictReadingRequest(p).body.messages[1]).toEqual(p.messages[1]);
 expect(strictReadingRequest(p).body.tools[0].function.parameters.properties.factors.items.properties.application.properties.origin.enum).toEqual(['model_hypothesis']);
});

test('explicit missing target links cannot be selected even as proposed, while missing effect checks remain allowed',async()=>{
 const p=await prepare();
 for(const text of ['这一关联仍待落实。','映射尚未建立。','此处取法未成立。']){
  const a=answer(p);a.factors[0].application.goal_link=text;
  expect(parse(p,a).issues[0]).toEqual({code:'unresolved_factor_application',path:'$.factors[0].application.goal_link'});
 }
 for(const text of ['关联尚须独立审查，未经程序验证。','作用条件未核实，不能当作已发生。','不能说关联未成立，只是作用条件还未知。','并非映射尚未建立，而是作用效力未确定。','如果关联未建立，就不使用；这项是假设且待独立审查。']){
  const a=answer(p);a.factors[0].application.goal_link=text;expect(parse(p,a).status).toBe('validated');
 }
 const actual=JSON.parse(fs.readFileSync(new URL('../../docs/acceptance/basis-scope-live-20261006/private-project-response.txt',import.meta.url)));
 expect(actual.factors[3].application.state).toBe('proposed');expect(declaresUnresolvedLink(actual.factors[3].application.goal_link)).toBe(true);
});

test('policy 1 frozen request and saved answers are unchanged; compact policy 2 preserves schema with smaller payload',async()=>{
 const plan=JSON.parse(fs.readFileSync(new URL('../../docs/acceptance/basis-scope-live-20261006/plan.json',import.meta.url))),original=plan.cases[0];
 const fresh=()=>createReadingSession(original.canonical,{style:'brief',custom:''});
 const p1=await prepare(fresh(),original.question,{basisPolicyVersion:1});
 expect(JSON.stringify(strictReadingRequest(p1).body)).toBe(JSON.stringify(original.body));
 const p2=await prepare(fresh(),original.question);
 expect(p1.context.context_id).not.toBe(p2.context.context_id);
 expect(JSON.stringify(strictReadingRequest(p2).body).length).toBeLessThan(JSON.stringify(original.body).length);
 const oldSession=createReadingSession(c.canonical),legacy=await prepare(oldSession,c.question,{basisPolicyVersion:1}),a=answer(legacy);a.factors[0].application.goal_link='这一关联仍待落实。';
 expect(parse(legacy,a).status).toBe('validated');appendReadingTurn(oldSession,legacy,JSON.stringify(a),true,'external');
 const restored=await restoreReadingSession(serializeReadingSession(oldSession));expect(restored.session.basisPolicyVersion).toBe(1);expect(restored.session.turns[0].result.status).toBe('validated');
 await expect(prepare(oldSession)).rejects.toThrow('不能升级');
});

test('declared source cannot impersonate program verification, user report or literature',async()=>{
 const p=await prepare();
 for(const origin of ['program_record','user_report','classical_source']){
  const a=answer(p);a.factors[0].application.origin=origin;expect(parse(p,a).status).toBe('fallback');
 }
 const a=answer(p);a.factors[0].application.verified=true;expect(parse(p,a).issues[0].code).toBe('unknown_field');
 delete a.factors[0].application;expect(parse(p,a).status).toBe('fallback');
});

test.each(['support','oppose','neutral','conditional'])('unresolved %s is rejected without deleting a factor or recomputing direction',async assessment=>{
 const p=await prepare(),a=answer(p);a.factors[0].assessment=assessment;a.factors[0].application.state='unresolved';
 expect(parse(p,a).issues[0]).toEqual({code:'unresolved_factor_application',path:'$.factors[0].application.state'});
 expect(a.factors).toHaveLength(1);expect(a.direction).toBe('unclear');
});

test('target-link prose uses existing program and reality boundaries rather than a new bypass',async()=>{
 const p=await prepare(),a=answer(p);a.factors[0].application.goal_link='代码能跑。';
 expect(parse(p,a).issues[0]).toEqual({code:'unbacked_reality_assertion',path:'$.factors[0].application.goal_link'});
 a.factors[0].application.goal_link='月令旺说明可以继续。';expect(parse(p,a).issues[0].code).toBe('program_attribute_in_explanation');
});

test('program renders proof boundary and model-declared link without saying the hypothesis was verified',async()=>{
 const p=await prepare(),r=parse(p,answer(p));expect(r.status).toBe('validated');
 expect(r.answer.factors[0].interpretation).toContain('仅核对规则命中及其程序来源');
 expect(r.answer.factors[0].interpretation).toContain('模型假设，未经程序验证');
 const a=answer(p);a.main_choice={basis_id:'none',perspective:'none',reason:'缺少适用取法。'};a.factors=[];a.judgment.basis_ids=[];
 expect(parse(p,a).status).toBe('validated');
});

test('API packet, histories and pending prompts retain policy identity; old histories do not upgrade',async()=>{
 const s=createReadingSession(c.canonical),p=await prepare(s),raw=JSON.stringify(answer(p));
 const packet={choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'test',type:'function',function:{name:'submit_reading',arguments:raw}}]}}]};
 const received=await receiveStrictReading(new Response(JSON.stringify(packet)),p.context);
 appendReadingTurn(s,p,received.rawText,received.completed,'api',null,{completion:received.completion});
 const saved=serializeReadingSession(s,c.question),restored=await restoreReadingSession(saved);
 expect(restored.session.basisPolicyVersion).toBe(2);expect(restored.session.turns[0].raw).toBe(raw);
 expect(restored.session.turns[0].result.answer).toEqual(s.turns[0].result.answer);expect(restored.pending.context.conversation.basis_policy).toBe(2);
 await expect(prepare(s,c.question,{basisPolicyVersion:0})).rejects.toThrow('不能升级');
 const old=createReadingSession(c.canonical),oldP=await prepare(old,c.question,{basisPolicyVersion:0}),oldA=answer(oldP);delete oldA.factors[0].application;
 appendReadingTurn(old,oldP,JSON.stringify(oldA),true,'external');vi.stubEnv('VITE_READING_BASIS_POLICY','1');
 const oldRestored=await restoreReadingSession(serializeReadingSession(old));expect(oldRestored.session.basisPolicyVersion).toBe(0);
 expect(oldRestored.session.turns[0].context.context_id).toBe(oldP.context.context_id);expect(oldRestored.session.turns[0].result.status).toBe('validated');
 expect(oldP.context.context_id).not.toBe(p.context.context_id);
 expect(parse(p,oldA).status).toBe('fallback');
});

test('pending sessions cannot change boundaries and invalid or unsupported policy combinations reject',async()=>{
 const s=createReadingSession(c.canonical);await prepare(s);
 await expect(prepare(s,c.question,{basisPolicyVersion:0})).rejects.toThrow('不能升级');
 await expect(prepare(undefined,c.question,{basisPolicyVersion:99})).rejects.toThrow('依据边界版本');
 await expect(prepare(undefined,c.question,{judgmentPolicyVersion:2})).rejects.toThrow('必须使用判断策略6');
 const saved=JSON.parse(serializeReadingSession(s));saved.basisPolicyVersion=99;
 await expect(restoreReadingSession(JSON.stringify(saved))).rejects.toThrow('依据边界版本');
});

test('ordinary facts and advice keep empty factors rather than fabricating applicable cast evidence',async()=>{
 for(const q of ['只核对初爻六亲。','请给两项维护建议。']){
  const p=await prepare(undefined,q),input=JSON.parse(p.messages[1].content);
  expect(input.response_schema.properties.factors.maxItems).toBe(0);expect(input.response_schema.properties.factors.items.properties.application).toBeUndefined();
  expect(input.response_schema.properties.answer).toBeDefined();
 }
});

test('low-level preparation cannot bypass prerequisites or upgrade legacy history and pending state',async()=>{
 const fresh=()=>createReadingSession(c.canonical),valid={basisPolicyVersion:2,outputFormat:'selection-2',judgmentPolicyVersion:6,groundingPolicyVersion:2};
 for(const options of [{basisPolicyVersion:2},{...valid,judgmentPolicyVersion:2},{...valid,groundingPolicyVersion:0}]){
  await expect(prepareReadingTurn(fresh(),c.question,options)).rejects.toThrow('必须使用判断策略6');
 }
 const old=fresh(),p=await prepareReadingTurn(old,c.question);appendReadingTurn(old,p,'{}',true,'external');
 const restored=(await restoreReadingSession(serializeReadingSession(old))).session;
 expect(restored.outputFormat).toBeUndefined();
 await expect(prepare(restored,c.question,{groundingPolicyVersion:2})).rejects.toThrow('不能升级');
 await expect(prepareReadingTurn(restored,c.question,valid)).rejects.toThrow('不能升级');
 const pending=fresh();await prepareReadingTurn(pending,c.question);
 await expect(prepare(pending)).rejects.toThrow('不能升级');
 const candidate=fresh();await prepare(candidate);const saved=JSON.parse(serializeReadingSession(candidate));delete saved.outputFormat;
 await expect(restoreReadingSession(JSON.stringify(saved))).rejects.toThrow('依据边界与解读版本');
});
