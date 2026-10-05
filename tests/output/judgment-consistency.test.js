// @vitest-environment node
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession,readingExport} from '../../src/ai/output/session.js';
import {outputIssueText} from '../../src/ai/output/view.js';
import {SELECTION_VERSION} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
const spec=(await prepareJudgmentPlan()).cases[0];
const answer=context=>({schema_version:SELECTION_VERSION,context_id:context.context_id,answer:'象意上目前依据不足，尚不确定有效作用。',direction:'unclear',main_choice:{basis_id:'l4',reason:'观察自身与目标的关联，不把类象视为现实事实。'},factors:[{basis_id:'e3',assessment:'conditional',interpretation:'形式帮助是否能有效作用于目标仍需核对。'},{basis_id:'t4',assessment:'oppose',interpretation:'作为自身这一角度的限制，不证明现实状态。'}],background_usage:[],timing_candidates:[],uncertainties:['现实进展尚未知。']});

test('direction needs matching declared effects, never votes by count or treats conditional as support',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),spec.question,{judgmentPolicyVersion:1});
 const cases=[
 ['favorable',['oppose','neutral'],false],['favorable',['conditional','neutral'],false],
 ['unfavorable',['support','conditional'],false],['mixed',['support','conditional'],false],
 ['mixed',['conditional','oppose'],false],['mixed',['support','oppose'],true],
 ['favorable',['support','oppose'],true],['unfavorable',['support','oppose'],true],
 ['unclear',['support','oppose'],true],['unclear',['conditional','neutral'],true],
 ['favorable',['support','neutral'],true],['unfavorable',['conditional','oppose'],true],
 ];
 for(const [direction,effects,valid] of cases){
  const raw=answer(p.context);raw.direction=direction;raw.factors.forEach((f,i)=>f.assessment=effects[i]);
  const r=parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true});
  expect(r.status,JSON.stringify([direction,effects])).toBe(valid?'validated':'fallback');
  if(!valid){expect(r.answer).toBeNull();expect(r.issues[0]).toEqual({code:'direction_basis_mismatch',path:'$.direction'});expect(r.display_text).toContain(direction);expect(outputIssueText(r)).toContain('不要只改标签');}
 }
 expect(p.messages[0].content).toContain('不为了通过校验改标签');
});

test('new judgment policy is bound to API/export context, history, pending restore and future turns',async()=>{
 const session=createReadingSession(spec.canonical),p=await prepareSelectedReadingTurn(session,spec.question,{judgmentPolicyVersion:1});
 expect(p.context.conversation.judgment_policy).toBe(1);
 const pending=await restoreReadingSession(serializeReadingSession(session,p.question));
 expect(readingExport(pending.pending)).toBe(readingExport(p));
 appendReadingTurn(session,p,JSON.stringify(answer(p.context)),true,'external');
 const restored=await restoreReadingSession(serializeReadingSession(session));
 expect(restored.session.turns[0].result.status).toBe('validated');
 expect(restored.session.turns[0].context.context_id).toBe(p.context.context_id);
 expect((await prepareSelectedReadingTurn(restored.session,'能否完成目标？')).context.conversation.judgment_policy).toBe(1);
});

test('published sessions are not retroactively rechecked or silently upgraded',async()=>{
 const session=createReadingSession(spec.canonical),p=await prepareSelectedReadingTurn(session,spec.question,{judgmentPolicyVersion:0});
 expect(p.context.conversation.judgment_policy).toBeUndefined();
 const raw=answer(p.context);raw.direction='mixed';raw.factors.forEach(f=>f.assessment='conditional');
 appendReadingTurn(session,p,JSON.stringify(raw),true,'external');
 const restored=await restoreReadingSession(serializeReadingSession(session));
 expect(restored.session.judgmentPolicyVersion).toBe(0);
 expect(restored.session.turns[0].result.status).toBe('validated');
 expect(restored.session.turns[0].context.context_id).toBe(p.context.context_id);
 const next=await prepareSelectedReadingTurn(restored.session,spec.question);
 expect(next.context.conversation.judgment_policy).toBeUndefined();
 const fresh=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),spec.question);
 expect(fresh.context.context_id).not.toBe(p.context.context_id);
 raw.context_id=fresh.context.context_id;
 expect(parseOutputAnswer(JSON.stringify(raw),fresh.context,{completed:true}).issues[0].code).toBe('direction_basis_mismatch');
 const saved=JSON.parse(serializeReadingSession(session));saved.judgmentPolicyVersion=3;
 await expect(restoreReadingSession(JSON.stringify(saved))).rejects.toThrow('判断约束版本不兼容');
});

test('pure facts, mixed facts/advice and clarification keep their fixed nonforecast behavior',async()=>{
 for(const question of ['只核对初爻六亲，不预测。','只核对初爻六亲，请给两项建议。','只核对初爻六神，请给两项建议。','请给两项建议']){
  const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),question),schema=JSON.parse(p.messages[1].content).response_schema,raw=answer(p.context);
  raw.main_choice={basis_id:'none',reason:schema.properties.main_choice.properties.reason.const};raw.factors=[];
  raw.answer=schema.properties.answer.const||'一般建议：先核对现实条件，再记录结果。';
  raw.uncertainties=schema.properties.uncertainties.items.const?[schema.properties.uncertainties.items.const]:['仅作一般建议。'];
  expect(parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true}).status).toBe('validated');
 }
});
