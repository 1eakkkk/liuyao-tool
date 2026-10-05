// @vitest-environment node
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,readingExport,serializeReadingSession,restoreReadingSession} from '../../src/ai/output/session.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {checkRealityStatements,selectionCatalog,SELECTION_VERSION} from '../../src/ai/output/selection.js';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
const spec=(await prepareJudgmentPlan()).cases[1];
const prepare=(question=spec.question,options={})=>prepareSelectedReadingTurn(createReadingSession(spec.canonical),question,{judgmentPolicyVersion:4,...options});
const check=(text,context)=>checkRealityStatements([{text,path:'$.answer'}],context);

test('observed reality assertions are rejected despite symbolic disclaimers or later negations',async()=>{
 const p=await prepare();
 for(const text of ['投入产出比合理。','代码能跑。','项目还在初期。','项目尚未定型。','我对项目有主导权。','象意上自身拥有主导权，不能证明项目成功。','项目周边存在一些推动因素，如免费部署和朋友反馈。','朋友反馈正在推动项目。','平台提供助力。','“我”对项目有主导权。','象意上可作为“项目尚未定型、还在构想或初期”的角度。'])
  expect(()=>check(text,p.context),text).toThrow(/unbacked_reality/);
});

test('questions, clear negative claims and unfulfilled conditions do not become assertions',async()=>{
 const p=await prepare();
 for(const text of ['投入产出比合理吗？','是否代码能跑？','不能证明代码能跑。','不能据此断定项目尚未定型。','没有证据说明平台提供助力。','不能证明“代码能跑”。','如果“代码能跑”，仍需评估使用情况。','如果代码能跑，再评估使用情况。','如果代码能跑，投入产出比合理。','假设项目还在初期，可以先做小范围试用。','代码能跑的话，仍需实际反馈。','代码能跑不等于维护成本低。','代码能跑与否需要核对。'])expect(()=>check(text,p.context),text).not.toThrow();
 expect(()=>check('如果代码能跑，再试用。投入产出比合理。',p.context)).toThrow('unbacked_reality_assertion');
});

test('risky quotations must be exact current-source spans, and do not license assertions outside quotes',async()=>{
 const p=await prepare('代码能跑。但尚未检查维护成本。');
 expect(()=>check('你原话：“代码能跑”。尚不能评价维护成本。',p.context)).not.toThrow();
 expect(()=>check('你原话：“投入产出比合理”。',p.context)).toThrow('unbacked_reality_quote');
 expect(()=>check('你原话：“代码能跑”。因此投入产出比合理。',p.context)).toThrow('unbacked_reality_assertion');
 for(const source of ['我不确定代码能跑。','代码能跑吗？','如果代码能跑，投入产出比合理。']){
  const q=await prepare(source);expect(()=>check('你原话：“代码能跑”。',q.context)).toThrow('unbacked_reality_quote');
 }
 // Presence in the input does not silently certify a model restatement as fact.
 expect(()=>check('代码能跑。',p.context)).toThrow('unbacked_reality_assertion');
});

test('policy 3 remains unchanged; policy 4 binds prompt/export and restoration without a new response field',async()=>{
 const old=await prepare(spec.question,{judgmentPolicyVersion:3});expect(()=>check('投入产出比合理。',old.context)).not.toThrow();
 const current=await prepare();expect(current.context.context_id).not.toBe(old.context.context_id);
 expect(current.messages[0].content).toContain('没有资料就明确未知');
 const session=createReadingSession(spec.canonical),pending=await prepareSelectedReadingTurn(session,spec.question,{judgmentPolicyVersion:4}),restored=await restoreReadingSession(serializeReadingSession(session,pending.question));
 expect(readingExport(restored.pending)).toBe(readingExport(pending));
 const schema=JSON.parse(pending.messages[1].content).response_schema;expect(schema.properties.factors_note).toBeUndefined();
});

test('parser checks each explanation slot and leaves the original failed text untouched',async()=>{
 const p=await prepare(),basis=selectionCatalog(p.context).entries.find(e=>e.id.startsWith('k')&&e.subject_ids.length);
 const safe=()=>({schema_version:SELECTION_VERSION,context_id:p.context.context_id,answer:'目前依据不足，无法确定有效作用。',direction:'unclear',main_choice:{basis_id:'l1',reason:'仅观察项目发起者与目标的关联。'},factors:[{basis_id:basis.id,assessment:'conditional',interpretation:'作用仍需核对，不证明现实结果。',role:{basis_id:basis.subject_ids[0],meaning:'与当前问题有关的分析角度。'}}],judgment:{basis_ids:[basis.id],reason:'条件尚未确认，保留依据不足。'},background_usage:[],timing_candidates:[],uncertainties:['现实条件尚未核对。']});
 expect(parseOutputAnswer(JSON.stringify(safe()),p.context,{completed:true}).status).toBe('validated');
 for(const [path,change] of [
 ['$.answer',a=>a.answer='投入产出比合理。'],
 ['$.main_choice.reason',a=>a.main_choice.reason='我对项目有主导权。'],
 ['$.factors[0].interpretation',a=>a.factors[0].interpretation='平台正在推动项目。'],
 ['$.factors[0].role.meaning',a=>a.factors[0].role.meaning='项目尚未定型。'],
 ['$.judgment.reason',a=>a.judgment.reason='代码能跑。'],
 ['$.uncertainties[0]',a=>a.uncertainties[0]='投入产出比合理，但其他情况未知。'],
 ]){const a=safe();change(a);const raw=JSON.stringify(a),r=parseOutputAnswer(raw,p.context,{completed:true});expect(r.status).toBe('fallback');expect(r.issues[0]).toEqual({code:'unbacked_reality_assertion',path});expect(r.display_text).toBe(raw);expect(r.answer).toBeNull();}
});
