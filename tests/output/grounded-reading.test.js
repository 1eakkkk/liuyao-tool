// @vitest-environment node
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,serializeReadingSession,restoreReadingSession,readingExport,appendReadingTurn} from '../../src/ai/output/session.js';
import {checkRealityStatements,reportedDeployment,selectionSchema,SELECTION_VERSION} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
const spec=(await prepareJudgmentPlan()).cases[1];
const prepare=(question=spec.question,options={})=>prepareSelectedReadingTurn(createReadingSession(spec.canonical),question,{groundingPolicyVersion:1,...options});
const raw=c=>({schema_version:SELECTION_VERSION,context_id:c.context_id,answer:'按你的描述已经部署，当前可访问性与稳定性仍未核实。一般建议：记录使用反馈。',direction:'unclear',main_choice:{basis_id:'none',reason:'尚不能确定取用，保留资料限制。'},factors:[],background_usage:[],timing_candidates:[],uncertainties:['不能以程序记录验证现实状态。']});

test('stable schema gains source boundaries without experimental fields or treating user text as verified',async()=>{
 const p=await prepare();expect(p.context.conversation.judgment_policy).toBe(2);expect(p.context.conversation.grounding_policy).toBe(1);
 const payload=JSON.parse(p.messages[1].content);expect(payload.response_schema.properties.judgment).toBeUndefined();expect(payload.response_schema.properties.factors.items.properties.role).toBeUndefined();
 expect(payload.input_origins.reported_deployment).toContain('部署');
 const a=raw(p.context),r=parseOutputAnswer(JSON.stringify(a),p.context,{completed:true});expect(r.status).toBe('validated');expect(r.answer.uncertainties.join('')).toContain('这是用户陈述');
});

test('literal premise erasure and unrequested forecast windows are rejected without barring usage advice',async()=>{
 const p=await prepare();
 for(const [text,code] of [['未提供部署信息。','reported_premise_erased'],['无法判断这个项目目前是否已上线。','reported_premise_erased'],['短期结果可能中性。','unrequested_prediction_window'],['近期结果会有变化。','unrequested_prediction_window'],['投入产出比合理。','unbacked_reality_assertion']]){
 expect(()=>checkRealityStatements([{text,path:'$.answer'}],p.context)).toThrow(code);
 }
 for(const text of ['按你描述已部署，目前是否可访问尚未核实。','一般建议：短期试用并记录反馈。','如果短期结果不佳，再记录实际情况。'])expect(()=>checkRealityStatements([{text,path:'$.answer'}],p.context)).not.toThrow();
 const denial='目前没有任何资料或卦盘依据可以替你证明代码能跑、投入产出合理或平台正在推动。';
 expect(()=>checkRealityStatements([{text:denial,path:'$.answer'}],p.context)).not.toThrow();
 expect(()=>checkRealityStatements([{text:denial+'代码能跑。',path:'$.answer'}],p.context)).toThrow('unbacked_reality_assertion');
 for(const pivot of ['但','不过','然而'])expect(()=>checkRealityStatements([{text:'没有任何资料或卦盘依据可以替你证明代码能跑，'+pivot+'代码能跑。',path:'$.answer'}],p.context)).toThrow('unbacked_reality_assertion');
 const timed=await prepare('短期结果怎么样？');expect(()=>checkRealityStatements([{text:'短期结果可能中性。',path:'$.answer'}],timed.context)).not.toThrow();
 for(const question of ['不要预测短期结果，请给两项使用建议。','我不想预测短期结果。','我不希望预测近期结果。']){const refused=await prepare(question);expect(()=>checkRealityStatements([{text:'短期结果可能中性。',path:'$.answer'}],refused.context)).toThrow('unrequested_prediction_window');}
});

test('deployment extraction avoids future plans, questions and hypotheses',async()=>{
 for(const question of ['我准备部署在Cloudflare，如何准备？','如果部署在Cloudflare，情况如何？','部署在Cloudflare合适吗？','我计划部署到Cloudflare。','未部署到Cloudflare。','尚未部署在Cloudflare。','并没有部署到Cloudflare。','取消部署在Cloudflare。','如果测试通过，部署在Cloudflare。'])expect(reportedDeployment((await prepare(question)).context)).toBeNull();
 expect(reportedDeployment((await prepare('已经部署在Cloudflare，怎么样？')).context)).toBe('已经部署在Cloudflare');
 expect(reportedDeployment((await prepare('测试通过。已部署在Cloudflare。')).context)).toBe('已部署在Cloudflare');
 const clarified=await prepare('只核对空亡，已经部署在Cloudflare。');expect(selectionSchema(clarified.context).properties.uncertainties.maxItems).toBe(3);
});

test('previous stable sessions keep exact old contexts and new policy survives pending and completed history',async()=>{
 const oldSession=createReadingSession(spec.canonical),old=await prepareSelectedReadingTurn(oldSession,spec.question,{groundingPolicyVersion:0});
 expect(old.context.conversation.grounding_policy).toBeUndefined();const pending=await restoreReadingSession(serializeReadingSession(oldSession,old.question));expect(readingExport(pending.pending)).toBe(readingExport(old));
 const session=createReadingSession(spec.canonical),p=await prepareSelectedReadingTurn(session,spec.question,{groundingPolicyVersion:1});expect(p.context.context_id).not.toBe(old.context.context_id);
 const saved=await restoreReadingSession(serializeReadingSession(session,p.question));expect(readingExport(saved.pending)).toBe(readingExport(p));appendReadingTurn(session,p,JSON.stringify(raw(p.context)),true,'external');
 const restored=await restoreReadingSession(serializeReadingSession(session));expect(restored.session.turns[0].result.status).toBe('validated');expect(restored.session.turns[0].context.context_id).toBe(p.context.context_id);
 const next=await prepareSelectedReadingTurn(restored.session,'后续该如何观察？');expect(next.context.conversation.grounding_policy).toBe(1);
 const malformed=JSON.parse(serializeReadingSession(session));malformed.groundingPolicyVersion=99;await expect(restoreReadingSession(JSON.stringify(malformed))).rejects.toThrow('来源约束版本不兼容');
});
