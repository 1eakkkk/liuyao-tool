// @vitest-environment node
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession,readingExport} from '../../src/ai/output/session.js';
import {selectionCatalog,SELECTION_VERSION} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {outputIssueText} from '../../src/ai/output/view.js';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
const spec=(await prepareJudgmentPlan()).cases[0];
const raw=context=>({schema_version:SELECTION_VERSION,context_id:context.context_id,answer:'有效作用尚未确认，目前不宜断定结果。',direction:'unclear',main_choice:{basis_id:'l4',reason:'主要观察自身与目标的关联。'},factors:[{basis_id:'e3',assessment:'conditional',interpretation:'仅提供形式方向，作用需结合目标角色核对。'}],background_usage:[],timing_candidates:[],uncertainties:['现实条件未知。']});

test('new policy blocks definitive effects on each formal relation, even with an uncertainty disclaimer',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),spec.question);
 expect(p.context.conversation.judgment_policy).toBe(2);
 const formal=selectionCatalog(p.context).entries.filter(e=>/^[et][1-6]$/.test(e.id));expect(formal.length).toBeGreaterThan(0);
 for(const basis of formal)for(const assessment of ['support','oppose','neutral','conditional']){
  const a=raw(p.context);a.factors[0].basis_id=basis.id;a.factors[0].assessment=assessment;
  const r=parseOutputAnswer(JSON.stringify(a),p.context,{completed:true});
  if(['support','oppose'].includes(assessment)){expect(r.issues[0]).toEqual({code:'formal_relation_effect_overreach',path:'$.factors[0].assessment'});expect(r.answer).toBeNull();expect(outputIssueText(r)).toContain('不能直接标为支持或不利');}
  else expect(r.status).toBe('validated');
 }
 const payload=JSON.parse(p.messages[1].content);
 for(const b of payload.bases.filter(b=>/^[et][1-6]$/.test(b.id)))expect(b.allowed_assessments).toEqual(['neutral','conditional']);
 expect(p.messages[0].content).toContain('不要换选同义规则');
});

test('explicit rule selections are not automatically assigned a direction and prior direction checks still apply',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),spec.question),rule=selectionCatalog(p.context).entries.find(e=>e.id.startsWith('k'));
 expect(rule).toBeDefined();const a=raw(p.context);a.factors[0].basis_id=rule.id;
 a.direction='favorable';expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).issues[0].code).toBe('direction_basis_mismatch');
 a.factors[0].assessment='support';expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('validated');
 // Necessary checks cannot certify whether this natural-language role/effect explanation is valid.
 a.direction='unclear';a.factors[0].assessment='neutral';expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('validated');
});

test('published policy 1 remains exactly bound to old history and export; new policy survives restore',async()=>{
 const old=createReadingSession(spec.canonical),p=await prepareSelectedReadingTurn(old,spec.question,{judgmentPolicyVersion:1}),a=raw(p.context);a.factors[0].assessment='support';
 appendReadingTurn(old,p,JSON.stringify(a),true,'external');
 const restored=await restoreReadingSession(serializeReadingSession(old));expect(restored.session.turns[0].result.status).toBe('validated');expect(restored.session.turns[0].context.context_id).toBe(p.context.context_id);
 const next=await prepareSelectedReadingTurn(restored.session,spec.question);expect(next.context.conversation.judgment_policy).toBe(1);
 const pending=await restoreReadingSession(serializeReadingSession(restored.session,next.question));expect(readingExport(pending.pending)).toBe(readingExport(next));
 const fresh=createReadingSession(spec.canonical),current=await prepareSelectedReadingTurn(fresh,spec.question);
 expect(current.context.context_id).not.toBe(p.context.context_id);
 expect(parseOutputAnswer(JSON.stringify(a),current.context,{completed:true}).issues[0].code).toBe('context_mismatch');
 appendReadingTurn(fresh,current,JSON.stringify(raw(current.context)),true,'external');
 const saved=await restoreReadingSession(serializeReadingSession(fresh));expect(saved.session.turns[0].result.status).toBe('validated');expect(saved.session.judgmentPolicyVersion).toBe(2);
 const future=await prepareSelectedReadingTurn(saved.session,spec.question);const restoredPending=await restoreReadingSession(serializeReadingSession(saved.session,future.question));expect(readingExport(restoredPending.pending)).toBe(readingExport(future));
});
