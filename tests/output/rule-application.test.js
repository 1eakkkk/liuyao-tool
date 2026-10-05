// @vitest-environment node
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,serializeReadingSession,restoreReadingSession,appendReadingTurn,readingExport} from '../../src/ai/output/session.js';
import {selectionCatalog,SELECTION_VERSION} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
const spec=(await prepareJudgmentPlan()).cases[1];
const prepare=(session=createReadingSession(spec.canonical))=>prepareSelectedReadingTurn(session,spec.question,{judgmentPolicyVersion:3});
const answer=context=>{const rule=selectionCatalog(context).entries.find(e=>e.id.startsWith('k')&&e.subject_ids.length);return {schema_version:SELECTION_VERSION,context_id:context.context_id,answer:'仅作条件观察，实际作用未确定。',direction:'unclear',main_choice:{basis_id:'l1',reason:'观察本人和项目目标的关联。'},factors:[{basis_id:rule.id,assessment:'conditional',role:{basis_id:rule.subject_ids[0],meaning:'作为项目相关条件的分析角度，不证明现实状态。'},interpretation:'是否作用于当前目标尚需核对，不直接推断投入或成效。'}],judgment:{basis_ids:[rule.id],reason:'当前条件不足以形成单向判断，具体作用仍未确认。'},background_usage:[],timing_candidates:[],uncertainties:['没有实际运行反馈。']};};

test('rules expose only their explicit subject positions, generated from trusted metadata',async()=>{
 const p=await prepare();const entries=selectionCatalog(p.context).entries;
 for(const e of entries.filter(e=>e.id.startsWith('k'))){
  const rule=p.context.evidence.find(r=>r.id===e.ids[0]);const targets=[rule.target,rule.result.from,rule.result.to].filter(Boolean);
  const ids=targets.map(t=>(t.component==='primary'?'l':t.component==='changed'?'c':'h')+t.line);
  expect(e.subject_ids).toEqual([...new Set(ids)]);
  expect(e.subject_ids.every(id=>entries.some(x=>x.id===id&&x.target))).toBe(true);
 }
 const raw=answer(p.context),bad=structuredClone(raw),rule=entries.find(e=>e.id===bad.factors[0].basis_id);
 const unrelated=entries.find(e=>e.target&&!rule.subject_ids.includes(e.id));expect(unrelated).toBeDefined();bad.factors[0].role.basis_id=unrelated.id;
 expect(parseOutputAnswer(JSON.stringify(bad),p.context,{completed:true}).issues[0].code).toBe('rule_subject_mismatch');
 const result=parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true});expect(result.status).toBe('validated');
 expect(result.answer.factors[0].interpretation).toContain('程序关联对象：');expect(result.answer.answer).toContain('AI取舍说明：');
});

test('conclusion uses listed factors and its decisive subset must contain the claimed effect',async()=>{
 const p=await prepare(),base=answer(p.context),entries=selectionCatalog(p.context).entries;
 const second=entries.find(e=>e.id.startsWith('k')&&e.id!==base.factors[0].basis_id&&e.subject_ids.length);
 const testCase=(mutate,code)=>{const raw=structuredClone(base);mutate(raw);const r=parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true});expect(r.issues[0]?.code).toBe(code);};
 testCase(a=>a.judgment.basis_ids=[second.id],'unselected_judgment_basis');
 testCase(a=>{a.direction='favorable';a.factors[0].assessment='support';a.judgment.basis_ids=[];},'missing_judgment_basis');
 const extended=structuredClone(base);extended.factors.push({basis_id:second.id,assessment:'support',role:{basis_id:second.subject_ids[0],meaning:'与项目条件相关的候选角度。'},interpretation:'仅作象意角度，不证明现实结果。'});extended.direction='favorable';
 expect(parseOutputAnswer(JSON.stringify(extended),p.context,{completed:true}).issues[0].code).toBe('judgment_basis_mismatch');
 extended.judgment.basis_ids.push(second.id);expect(parseOutputAnswer(JSON.stringify(extended),p.context,{completed:true}).status).toBe('validated');
 testCase(a=>a.factors[0].role.meaning='第1爻官鬼','model_fact_restatement');
 testCase(a=>a.judgment.reason='月令提示稳定','model_fact_restatement');
 testCase(a=>delete a.factors[0].role,'missing_field');
});

test('formal factors retain their limits and old policy 2 exports remain exact on restore',async()=>{
 const session=createReadingSession(spec.canonical),old=await prepareSelectedReadingTurn(session,spec.question,{judgmentPolicyVersion:2});
 expect(JSON.parse(old.messages[1].content).response_schema.properties.judgment).toBeUndefined();
 expect(selectionCatalog(old.context).entries.every(e=>!Object.hasOwn(e,'subject_ids'))).toBe(true);
 const saved=await restoreReadingSession(serializeReadingSession(session,old.question));expect(readingExport(saved.pending)).toBe(readingExport(old));
 const fresh=createReadingSession(spec.canonical),p=await prepare(fresh),raw=answer(p.context),formal=selectionCatalog(p.context).entries.find(e=>e.id.startsWith('e'));
 raw.factors=[{basis_id:formal.id,assessment:'support',role:{basis_id:formal.subject_ids[0],meaning:'仅观察对象关联。'},interpretation:'作用未知。'}];raw.judgment.basis_ids=[formal.id];
 expect(parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true}).issues[0].code).toBe('formal_relation_effect_overreach');
 appendReadingTurn(fresh,p,JSON.stringify(answer(p.context)),true,'external');
 const restored=await restoreReadingSession(serializeReadingSession(fresh));expect(restored.session.turns[0].result.status).toBe('validated');
 expect(restored.session.turns[0].context.context_id).toBe(p.context.context_id);
 const next=await prepareSelectedReadingTurn(restored.session,'项目能否继续？');expect(next.context.conversation.judgment_policy).toBe(3);
});

test('nonforecast tasks do not acquire decorative roles or judgments',async()=>{
 for(const q of ['只核对初爻六亲，不预测。','请给两项建议','只核对空亡，不预测。']){
 const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),q,{judgmentPolicyVersion:3}),schema=JSON.parse(p.messages[1].content).response_schema;
 expect(schema.properties.judgment).toBeUndefined();expect(schema.properties.factors.maxItems).toBe(0);
 }
});

test('returning relations accept either actual endpoint and reject unrelated subjects',async()=>{
 const p=await prepare(),entries=selectionCatalog(p.context).entries,returning=entries.filter(e=>e.id.startsWith('t'));expect(returning.length).toBeGreaterThan(0);
 for(const basis of returning){
 const line=Number(basis.id.slice(1));expect(basis.subject_ids).toEqual(['c'+line,'l'+line]);
 for(const subject of basis.subject_ids){const a=answer(p.context);a.factors=[{basis_id:basis.id,assessment:'conditional',role:{basis_id:subject,meaning:'仅作为相关对象的分析角度。'},interpretation:'基础方向尚不能证明有效作用。'}];a.judgment.basis_ids=[basis.id];expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('validated');}
 const a=answer(p.context);a.factors=[{basis_id:basis.id,assessment:'neutral',role:{basis_id:entries.find(e=>e.target&&!basis.subject_ids.includes(e.id)).id,meaning:'对象关联需要核对。'},interpretation:'不证明结果。'}];a.judgment.basis_ids=[basis.id];expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).issues[0].code).toBe('rule_subject_mismatch');
 }
});
