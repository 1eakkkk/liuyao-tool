// @vitest-environment node
import {test,expect} from 'vitest';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession} from '../../src/ai/output/session.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {strictReadingRequest,receiveStrictReading} from '../../src/ai/output/strict-transport.js';
const c=(await prepareJudgmentPlan()).cases[1];
const question='我已部署免费网页，仅供自己与朋友娱乐。朋友实际使用反馈尚未确认，是否适合继续维护？';
const prepare=(s=createReadingSession(c.canonical))=>prepareSelectedReadingTurn(s,question,{judgmentPolicyVersion:6,basisPolicyVersion:3});
const answer=p=>({schema_version:'structured-selection-2',context_id:p.context.context_id,direction:'unclear',main_choice:{basis_id:'l1',perspective:'self',reason:'观察个人维护这个目标。'},
 factors:[{basis_id:'k2',assessment:'conditional',role:{basis_id:'l1',perspective:'self',meaning:'提出个人维护的观察角度。'},application:{origin:'model_hypothesis',state:'proposed',goal_link:'仅提出与持续维护有关的象意假设，关联仍需独立审查。',effect_scope:'requires_conditions',effect_conditions:[{condition:'实际使用能否带来娱乐反馈。',status:'unconfirmed',user_quotes:[]}]},interpretation:'若这个条件存在才讨论其影响，目前不能把条件当成已具备。'}],
 judgment:{basis_ids:['k2'],reason:'现有作用条件未知，不能判断目标能否达成。'},role_tradeoffs:[],general_advice:[],background_usage:[],timing_candidates:[],uncertainties:['象意关联未经验证。']});
const parse=(p,a)=>parseOutputAnswer(JSON.stringify(a),p.context,{completed:true});

test('unknown effect prerequisites cannot support either decisive direction',async()=>{
 const p=await prepare();
 for(const [assessment,direction] of [['support','favorable'],['oppose','unfavorable']]){
  const a=answer(p);a.factors[0].assessment=assessment;a.direction=direction;
  expect(parse(p,a).issues[0].code).toBe('unconfirmed_effect_as_decisive');
  expect(a.direction).toBe(direction);expect(a.factors).toHaveLength(1);
 }
 for(const assessment of ['conditional','neutral']){const a=answer(p);a.factors[0].assessment=assessment;expect(parse(p,a).status).toBe('validated');}
});
test('claimed user report needs an exact nonempty current-question quote',async()=>{
 const p=await prepare(),a=answer(p),condition=a.factors[0].application.effect_conditions[0];
 condition.status='user_report';condition.user_quotes=['朋友很喜欢'];expect(parse(p,a).issues[0].code).toBe('effect_condition_source_mismatch');
 condition.user_quotes=[];expect(parse(p,a).issues[0].code).toBe('effect_condition_source_mismatch');
 condition.user_quotes=['，'];expect(parse(p,a).issues[0].code).toBe('effect_condition_source_mismatch');
 condition.user_quotes=['仅供自己与朋友娱乐'];condition.condition='用途仅供自己与朋友娱乐。';
 const r=parse(p,a);expect(r.status).toBe('validated');expect(r.answer.factors[0].interpretation).toContain('用户原句仅核对存在');
 expect(r.answer.factors[0].interpretation).toContain('模型假设，未经程序验证');
});
test('missing prerequisites and ambiguous source states fail without silently dropping factors',async()=>{
 const p=await prepare(),a=answer(p),app=a.factors[0].application;
 app.effect_conditions=[];expect(parse(p,a).issues[0].code).toBe('missing_effect_conditions');
 app.effect_conditions=[{condition:'存在真实反馈。',status:'unconfirmed',user_quotes:['仅供自己与朋友娱乐']}];expect(parse(p,a).issues[0].code).toBe('unexpected_effect_source');
 app.effect_scope='symbolic_only';expect(parse(p,a).issues[0].code).toBe('unexpected_effect_conditions');
 app.effect_conditions=[];expect(parse(p,a).status).toBe('validated');
});
test('condition explanations share the fact-restatement and reality-source boundary',async()=>{
 const p=await prepare(),a=answer(p),condition=a.factors[0].application.effect_conditions[0];
 condition.condition='代码能跑。';expect(parse(p,a).issues[0].code).toBe('unbacked_reality_assertion');
 condition.condition='月令旺说明可以继续。';expect(parse(p,a).issues[0].code).toBe('program_attribute_in_explanation');
 condition.condition='若代码能跑，才讨论后续使用。';expect(parse(p,a).status).toBe('validated');
});
test('strict transport, export and saved history share policy three, without upgrading policy two',async()=>{
 const s=createReadingSession(c.canonical),p=await prepare(s),a=answer(p),packet=strictReadingRequest(p);
 expect(packet.body.tools[0].function.parameters.properties.factors.items.properties.application.required).toContain('effect_conditions');
 expect(p.messages[0].content).toContain('作用条件版本3');
 const raw=JSON.stringify(a),received=await receiveStrictReading(new Response(JSON.stringify({choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'test',type:'function',function:{name:'submit_reading',arguments:raw}}]}}]})),p.context);
 expect(received.rawText).toBe(raw);appendReadingTurn(s,p,raw,true,'api',null,{completion:received.completion});
 expect(s.turns[0].completion.transport).toBe('strict_tool');
 const restored=(await restoreReadingSession(serializeReadingSession(s))).session;expect(restored.basisPolicyVersion).toBe(3);expect(restored.turns[0].result.status).toBe('validated');
 const old=createReadingSession(c.canonical);await prepareSelectedReadingTurn(old,question,{judgmentPolicyVersion:6,basisPolicyVersion:2});await expect(prepare(old)).rejects.toThrow('不能升级');
});
test('ordinary advice remains free of chart factors and does not invent prerequisites',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(c.canonical),'请给两项维护建议。',{judgmentPolicyVersion:6,basisPolicyVersion:3});
 const schema=JSON.parse(p.messages[1].content).response_schema;expect(schema.properties.factors.maxItems).toBe(0);expect(schema.properties.factors.items.properties.application).toBeUndefined();
});
