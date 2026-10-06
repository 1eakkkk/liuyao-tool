// @vitest-environment node
import {test,expect} from 'vitest';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {createReadingSession,prepareSelectedReadingTurn,readingExport,appendReadingTurn,serializeReadingSession,restoreReadingSession} from '../../src/ai/output/session.js';
import {selectionCatalog} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {readingRequestBody} from '../../src/ai/output/client.js';
import {DIRECTION_OPENINGS} from '../../src/ai/output/perspective.js';
const c=(await prepareJudgmentPlan()).cases[1];
const prepare=(s=createReadingSession(c.canonical),q=c.question)=>prepareSelectedReadingTurn(s,q,{judgmentPolicyVersion:6});
const reply=p=>({schema_version:'structured-selection-2',context_id:p.context.context_id,direction:'unclear',
 main_choice:{basis_id:'l1',perspective:'self',reason:'从维护者与项目目标的关联观察。'},
 factors:[{basis_id:'k2',assessment:'conditional',role:{basis_id:'l1',perspective:'self',meaning:'仅观察维护意愿与目标的关联，不证明现实投入。'},interpretation:'有效作用还需核对，当前不能把这项条件当作已成立的支持或阻碍。'}],
 judgment:{basis_ids:['k2'],reason:'当前只有待核条件，没有确定的支持或阻碍，不能据此判断继续维护是否适合。'},
 role_tradeoffs:[],general_advice:['如果准备继续维护，先记录实际使用反馈；这只是一般建议。'],background_usage:[],timing_candidates:[],uncertainties:['实际运行与使用情况未知。']});
const parse=(p,a)=>parseOutputAnswer(JSON.stringify(a),p.context,{completed:true});
test('one judgment feeds the displayed conclusion; independent prose answer is rejected, not repaired',async()=>{
 const p=await prepare(),a=reply(p),r=parse(p,a);expect(r.status).toBe('validated');
 expect(r.answer.answer).toBe(`${DIRECTION_OPENINGS.unclear}\n\n${a.judgment.reason}\n\n一般建议：\n1. ${a.general_advice[0]}`);
 expect(r.answer.yongshen_candidates[0].reason).toContain('自身观察角度');
 a.answer='可以继续。';expect(parse(p,a).issues[0]).toEqual({code:'unknown_field',path:'$.answer'});
 delete a.answer;a.judgment.basis_ids_note='';expect(parse(p,a).issues[0]).toEqual({code:'unknown_field',path:'$.judgment.basis_ids_note'});
});
test('program self and counterpart anchors cannot be assigned to other or changed positions',async()=>{
 const p=await prepare(),a=reply(p);a.main_choice={basis_id:'l6',perspective:'self',reason:'从这个角度观察。'};
 expect(parse(p,a).issues[0]).toEqual({code:'role_perspective_mismatch',path:'$.main_choice.perspective'});
 a.main_choice.perspective='symbolic';expect(parse(p,a).status).toBe('validated');
 a.main_choice={basis_id:'l4',perspective:'counterpart',reason:'作为对应方的观察角度。'};expect(parse(p,a).status).toBe('validated');
 a.main_choice.perspective='self';expect(parse(p,a).issues[0].code).toBe('role_perspective_mismatch');
 const e=selectionCatalog(p.context).entries.find(e=>e.target?.component==='changed');
 a.main_choice={basis_id:e.id,perspective:'self',reason:'观察变化结果。'};expect(parse(p,a).issues[0].code).toBe('role_perspective_mismatch');
});
test('each factor checks both actual rule subject and declared perspective',async()=>{
 const p=await prepare(),a=reply(p);a.factors[0].role.perspective='counterpart';
 expect(parse(p,a).issues[0]).toEqual({code:'role_perspective_mismatch',path:'$.factors[0].role.perspective'});
 a.factors[0].role={basis_id:'l4',perspective:'counterpart',meaning:'仅作关联观察。'};
 expect(parse(p,a).issues[0].code).toBe('rule_subject_mismatch');
});
test.each(['favorable','unfavorable','mixed'])('conditional factors do not support %s even with a general recommendation',async direction=>{
 const p=await prepare(),a=reply(p);a.direction=direction;
 expect(parse(p,a).issues[0].code).toBe('direction_basis_mismatch');
 expect(parse(p,a).answer).toBeNull();
});
test('one-sided and both-sided declarations keep full opposing consideration, without counting weights',async()=>{
 const p=await prepare();for(const direction of ['favorable','unfavorable','mixed','unclear']){
  const a=reply(p);a.direction=direction;a.factors[0].assessment='support';
  a.factors.push({basis_id:'k3',assessment:'oppose',role:{basis_id:'l6',perspective:'symbolic',meaning:'仅作有关约束的分析角度。'},interpretation:'只在所述假设下观察限制，不证明现实障碍已经发生。'});
  a.judgment.basis_ids=['k2','k3'];expect(parse(p,a).status).toBe('validated');
  // Structural declarations only; validity of these interpretations is not certified here.
  a.judgment.basis_ids=[direction==='unfavorable'?'k3':'k2'];expect(parse(p,a).status).toBe('fallback');
 }
});
test('general suggestions share reality and program-prose checks rather than bypassing them',async()=>{
 const p=await prepare(),a=reply(p);a.general_advice=['代码能跑。'];expect(parse(p,a).issues[0].code).toBe('unbacked_reality_assertion');
 a.general_advice=['世爻的投入会推动项目。'];expect(parse(p,a).issues[0]).toEqual({code:'program_attribute_in_explanation',path:'$.general_advice[0]'});
 a.general_advice=['如果实际运行已核实，再按反馈决定维护范围。'];expect(parse(p,a).status).toBe('validated');
});
test('API/export carry identical typed catalog and single judgment schema with length preferences',async()=>{
 const p=await prepare(createReadingSession(c.canonical,{style:'deep',custom:''})),d=JSON.parse(p.messages[1].content);
 expect(d.response_schema.properties.answer).toBeUndefined();expect(d.response_schema.required).toContain('general_advice');
 expect(d.bases.find(e=>e.id==='l1').available_perspectives).toEqual(['self','symbolic']);
 expect(d.bases.find(e=>e.id==='l6').available_perspectives).toEqual(['symbolic']);
 expect(p.messages[0].content).toContain('700–800 字');expect(readingRequestBody(p).messages).toEqual(p.messages);expect(readingExport(p)).toContain(p.messages[1].content);
});
test('candidate histories and pending exports restore exactly; ordinary tasks retain their published shape',async()=>{
 const s=createReadingSession(c.canonical),p=await prepare(s),pending=await restoreReadingSession(serializeReadingSession(s,p.question));
 expect(readingExport(pending.pending)).toBe(readingExport(p));appendReadingTurn(s,p,JSON.stringify(reply(p)),true,'external');
 const restored=await restoreReadingSession(serializeReadingSession(s));expect(restored.session.turns[0].result.answer).toEqual(s.turns[0].result.answer);
 for(const q of ['只核对初爻六亲。','请给两项维护建议。','能否冲段？目前只有名称，没有提供玩法规则。']){
  const n=await prepare(restored.session,q),schema=JSON.parse(n.messages[1].content).response_schema;
  expect(schema.properties.answer).toBeDefined();expect(schema.properties.general_advice).toBeUndefined();expect(schema.properties.factors.maxItems).toBe(0);
 }
});

test('JSON layout preserves nested allowed keys without choosing a direction or role, and API/export share it',async()=>{
 const p=await prepare(),input=JSON.parse(p.messages[1].content),layout=input.output_layout;
 const keys=(schema,value)=>{if(schema.type==='object'){expect(Object.keys(value)).toEqual(Object.keys(schema.properties));for(const [k,s] of Object.entries(schema.properties))keys(s,value[k]);}else if(schema.type==='array'){expect(Array.isArray(value)).toBe(true);for(const item of value)keys(schema.items,item);}};
 keys(input.response_schema,layout);expect(layout.context_id).toBe(input.context_id);expect(layout.direction).toContain('<');expect(layout.main_choice.perspective).toContain('<');
 expect(Object.keys(layout.judgment)).toEqual(['basis_ids','reason']);expect(layout.background_usage).toEqual([]);
 expect(p.messages[0].content).toContain('factors最多4项');expect(p.messages[0].content).toContain('不是答案');
 expect(readingRequestBody(p).messages[1]).toEqual(p.messages[1]);expect(readingExport(p)).toContain(p.messages[1].content);
});

test('judgment policy 6 does not authorize an unimplemented task policy 6',async()=>{
 await expect(prepareSelectedReadingTurn(createReadingSession(c.canonical),c.question,{taskPolicyVersion:6,judgmentPolicyVersion:6})).rejects.toThrow('任务分流版本不兼容');
});

test('candidate rejects rule narration even when it is padded with hypothetical disclaimers',async()=>{
 const p=await prepare();
 for(const text of ['月破说明基础条件不完整，仍需现实核对。','旬空表示作用前提未落实，但不证明现实投入。','世克应意味着自身有主导权，实际情况仍待核对。']){
  const a=reply(p);a.factors[0].interpretation=text;
  expect(parse(p,a).issues[0]).toEqual({code:'program_attribute_in_explanation',path:'$.factors[0].interpretation'});
 }
 const a=reply(p);a.judgment.reason='月破进一步说明基础条件不完整，因此当前只能先核对。';
 expect(parse(p,a).issues[0]).toEqual({code:'program_attribute_in_explanation',path:'$.judgment.reason'});
 for(const text of ['程序不能证明实际可用性，关联缺口尚未解决。','月破不等于项目会中断。','世克应不等于你掌握现实主导权。','程序标为月破，但不代表现实受阻。']){
  a.judgment.reason=text;expect(parse(p,a).status).toBe('validated');
 }
 // Older sessions retain their original boundary, rather than being silently rejudged.
 const old=await prepareSelectedReadingTurn(createReadingSession(c.canonical),c.question,{judgmentPolicyVersion:5});
 const legacy=reply(old);delete legacy.general_advice;delete legacy.main_choice.perspective;delete legacy.factors[0].role.perspective;legacy.answer='当前依据不足。';legacy.factors[0].interpretation='旬空只作待核条件，不证明现实投入。';
 expect(parse(old,legacy).status).toBe('validated');
 expect(p.messages[0].content).toContain('前者不进入factors');
 expect(readingExport(p)).toContain('具体条件如何改变当前目标');
});
