// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import {createReadingSession,prepareSelectedReadingTurn} from '../../src/ai/output/session.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {buildCanonicalCast} from '../../src/core/normalize.js';
import {lineFromSum} from '../../src/core/physics.js';
import {JIAZI60} from '../../src/core/constants.js';
import {selectionCatalog,selectionSchema,readingTask} from '../../src/ai/output/selection.js';
import {readingAvailability} from '../../src/ai/output/availability.js';
import {admittedMappings,reviewedGoal} from '../../src/ai/output/mapping-admission.js';
import {admittedPlanMappings,planGoal,PLAN_MECHANISMS,pendingConfirmation} from '../../src/ai/output/plan-admission.js';
const old=JSON.parse(fs.readFileSync('docs/acceptance/strict-reading-20261006/plan.json'));
const prepare=(canonical,question,basis=4)=>prepareSelectedReadingTurn(createReadingSession(canonical),question,{judgmentPolicyVersion:6,basisPolicyVersion:basis});
const parse=(p,a)=>parseOutputAnswer(JSON.stringify(a),p.context,{completed:true});
const covered=()=>prepare(old.cases[1].canonical,old.cases[1].question);
// A chart whose 世爻 is 静, 月旺 and neither 合 nor 冲, so no reviewed mechanism can bind.
// (The earlier private-project chart is not such a case: its 世爻 is 月破.)
const lackingChart=(question,castId='plan-admission-gap-fixture')=>buildCanonicalCast({
 lines:[6,6,6,6,6,8].map(value=>lineFromSum(value)),source:'manual',question,
 createdAt:new Date('2026-10-01T22:00:00+08:00').getTime(),castId,
 calendar:{now:new Date('2026-10-01T22:00:00+08:00'),day:JIAZI60.find(day=>day.label==='戊申'),ymh:{yearLabel:'丙午',monthLabel:'丁酉',hourLabel:'癸亥'},dateText:'公历：2026年10月1日'}});
const lacking=()=>prepare(lackingChart(old.cases[0].question),old.cases[0].question);
// A chart whose 世爻 is 静 and 日合 (巳申), so 合起 applies and 暗动／日破 does not.
const dayCombineChart=()=>buildCanonicalCast({
 lines:[6,7,6,6,7,7].map(value=>lineFromSum(value)),source:'manual',question:'plan-day-combine-fixture',
 createdAt:new Date('2026-10-01T22:00:00+08:00').getTime(),castId:'plan-day-combine-fixture',
 calendar:{now:new Date('2026-10-01T22:00:00+08:00'),day:JIAZI60.find(day=>day.label==='戊申'),ymh:{yearLabel:'丙午',monthLabel:'丁酉',hourLabel:'癸亥'},dateText:'公历：2026年10月1日'}});

test('every plan mechanism quote is pinned to the transcript it cites, not to a summary',()=>{
 // Guards the "取法适用" half of acceptance: the quote and its locator must exist verbatim
 // in a transcribed segment, so a mechanism can never cite text that was never transcribed.
 const segments=fs.readdirSync('knowledge/classics').filter(name=>name.endsWith('.json'))
  .map(name=>JSON.parse(fs.readFileSync(`knowledge/classics/${name}`)));
 for(const mechanism of PLAN_MECHANISMS){
  const matches=segments.filter(segment=>segment.text.includes(mechanism.quote));
  // A quote must exist in at least one transcribed segment, and at least one of those
  // must carry the chapter this mechanism cites. The 進神／退神 pair share one segment.
  expect(matches.length,`unpinned quote for ${mechanism.id}`).toBeGreaterThan(0);
  expect(matches.some(segment=>segment.locator.chapter===mechanism.chapter),`chapter mismatch for ${mechanism.id}`).toBe(true);
 }
 expect(PLAN_MECHANISMS.map(m=>m.id)).toHaveLength(7);
 // 月合 and 月破 are one usefulness axis read in opposite directions, so neither of the
 // pair may be declared neutral while its sibling is decisive.
 const combine=PLAN_MECHANISMS.find(m=>m.rule_id==='MONTH-COMBINE-001'),clash=PLAN_MECHANISMS.find(m=>m.rule_id==='MONTH-CLASH-001');
 expect(combine.kind).toBe(clash.kind);expect(combine.assessment).toBe('support');expect(clash.assessment).toBe('oppose');
});

test('only a static 世爻 takes the 日辰 mechanisms, matching what those chapters state',async()=>{
 // 日辰章 states 暗动／日破 for 静爻, and 六合章第十九 states 合起 for 静爻 while calling a
 // moving line 合絆 instead. So a moving 世爻 must take neither 日辰 factor.
 const moving=await covered();
 const movingIds=admittedPlanMappings(moving.context,selectionCatalog(moving.context).entries).map(m=>m.id);
 expect(movingIds).toContain('plan-shi-return-control');
 expect(movingIds).not.toContain('plan-shi-day-clash');expect(movingIds).not.toContain('plan-shi-day-combine');
 // A static 世爻 that is 日合 does take 合起 as a conditional factor.
 const sc=await prepare(dayCombineChart(),'我想继续做这个项目，是否适合继续推进？');
 const scMaps=admittedPlanMappings(sc.context,selectionCatalog(sc.context).entries);
 expect(scMaps.map(m=>m.id)).toContain('plan-shi-day-combine');
 expect(scMaps.find(m=>m.id==='plan-shi-day-combine').assessments).toEqual(['conditional','neutral']);
});

test('only a self-directed affirmative plan question is recognised, and it never becomes an assistance question',()=>{
 for(const q of [old.cases[0].question,old.cases[1].question,'我想整理旧书，是否适合继续推进？'])
  expect(planGoal(q)).toBe('self_plan_advance');
 // The recogniser must not require the 我想…是否 phrasing: the same category is asked as
 // 要不要/该不该/值不值得/还能不能/有没有必要, with or without a leading actor.
 for(const q of ['我要不要继续做这个项目？','这个项目还值得继续做吗？','这个副业值不值得继续做下去？',
  '我该不该继续投入这个项目？','这个项目还能不能继续做下去？','我想做这个项目，能不能继续推进？',
  '我适不适合继续推进这个项目？','接下来还要不要继续做这个项目？','这个项目有没有必要继续做？',
  '这件事我应该继续坚持吗？','这个项目继续做下去合适吗？','这个项目我还应该继续吗？',
  '要不要继续这个项目？','继续做这个项目好不好？','这个项目适合长期做下去吗？',
  '我现在还能继续推进这个项目吗？','我想继续推进它，是否合适？'])
  expect(planGoal(q),q).toBe('self_plan_advance');
 for(const q of ['他能否帮助我整理旧书？','我能否帮助朋友整理旧书？','我想整理旧书，是否适合推进？还是先做别的？',
  '不要分析我想整理旧书是否适合继续推进。','我不想整理旧书，是否适合继续推进？','帮我看看我想做这个项目是否适合推进。',
  '朋友想整理旧书，是否适合继续推进？','朋友想继续做这个项目，是否适合继续推进？',
  '我想做这个项目是否适合推进？我能赚钱吗？','这个网页能火吗？',
  // A negation attached to the advance itself inverts the question, even though the
  // affirmative wording is still present. These four were real bypasses.
  '我想把这套旧书整理完，不打算继续推进，是否适合推进？',
  '我想继续推进整理，但我不打算继续投入时间，是否适合推进？',
  '我想停止推进这个整理，是否适合推进？',
  // No continuation signal at all, so it is a different question than the reviewed one.
  '我想整理旧书，是否适合推进？'])
  expect(planGoal(q)).toBeNull();
 // An unrelated negative clause must not veto an otherwise affirmative plan question.
 expect(planGoal('我想继续整理旧书，不出售、不组织交换活动，是否适合继续推进？')).toBe('self_plan_advance');
 // The two recognisers never both claim one question.
 for(const [q,owner] of [[old.cases[0].question,'plan'],[old.cases[1].question,'plan'],['他能否帮助我整理旧书？','peer']]){
  const claimed=[reviewedGoal(q)!==null?'peer':null,planGoal(q)!==null?'plan':null].filter(Boolean);
  expect(claimed).toEqual([owner]);
 }
});

test('a moving 世爻 with 回头克 admits exactly one conditional plan factor, with no decisive effect',async()=>{
 const p=await covered(),maps=admittedPlanMappings(p.context,selectionCatalog(p.context).entries);
 expect(maps.map(m=>m.id)).toEqual(['plan-shi-return-control']);
 const mapping=maps[0];
 expect(mapping.perspective).toBe('self');expect(mapping.decisive).toBe(false);
 expect(mapping.assessments).toEqual(['conditional','neutral']);
 expect(mapping.basis_ids).toEqual(['t4']);expect(mapping.role_ids).toEqual(['l4']);
 expect(mapping.condition).toContain('不说明事情成败');
 expect(pendingConfirmation(maps)[0]).toContain('仍未核实');
 // The schema offers only that basis, and forbids a decisive assessment.
 const schema=selectionSchema(p.context);
 expect(schema.properties.factors.maxItems).toBe(1);
 expect(schema.properties.factors.items.properties.basis_id.enum).toEqual(['t4']);
 expect(schema.properties.factors.items.properties.assessment.enum).toEqual(['conditional','neutral']);
 expect(schema.properties.main_choice.properties.perspective.enum).toEqual(['none','self']);
});

test('a plan chart whose 世爻 offers no reviewed mechanism is a chart gap, not a coverage gap',async()=>{
 const p=await lacking();
 expect(planGoal(old.cases[0].question)).toBe('self_plan_advance');
 expect(admittedPlanMappings(p.context,selectionCatalog(p.context).entries)).toEqual([]);
 const capability=readingAvailability(p.context);
 expect(capability.blocked).toBe(true);expect(capability.kind).toBe('chart_basis_missing');
 expect(capability.message).toContain('本盘依据的缺口');
});

test('the three gaps stay distinguishable on the same question class',async()=>{
 const uncovered=await prepare(old.cases[0].canonical,'这个网页能火吗？');
 expect(readingAvailability(uncovered.context).kind).toBe('method_not_covered');
 expect(readingAvailability((await lacking()).context).kind).toBe('chart_basis_missing');
 const coveredCapability=readingAvailability((await covered()).context);
 expect(coveredCapability.blocked).toBe(false);expect(coveredCapability.kind).toBe('conditions_unconfirmed');
 expect(coveredCapability.items.join()).toContain('仍未核实');
 // An uncovered project question must not borrow the plan method, and the reverse too.
 expect(readingTask(uncovered.context)).toBe('interpretation');
 expect(admittedMappings((await covered()).context,selectionCatalog((await covered()).context).entries)).toEqual([]);
});

test('an admitted plan factor still cannot overreach the reviewed scope',async()=>{
 const p=await covered(),maps=admittedPlanMappings(p.context,selectionCatalog(p.context).entries),m=maps[0];
 const factor={basis_id:m.basis_ids[0],assessment:'conditional',
  role:{basis_id:m.role_ids[0],perspective:'self',meaning:'对应本次由自己推动的计划，不确认实际条件。'},
  application:{origin:'model_hypothesis',state:'proposed',goal_link:'按本题明确的推进目标观察该位自身的局部方向，不扩展为现实投入或成败。',mapping_id:m.id,effect_scope:'requires_conditions',effect_conditions:[{condition:'实际可投入的时间与条件。',status:'unconfirmed',user_quotes:[]}]},
  interpretation:'仅作条件性观察，不能单独据此判断计划能否推进成功。'};
 const shape={schema_version:'structured-selection-2',context_id:p.context.context_id,direction:'unclear',
  main_choice:{basis_id:m.role_ids[0],perspective:'self',reason:'仅观察明确询问的推进方向。'},factors:[factor],
  judgment:{basis_ids:[m.basis_ids[0]],reason:'实际条件尚未确认，不作成败结论。'},role_tradeoffs:[],general_advice:[],
  background_usage:[],timing_candidates:[],uncertainties:['原文只给出该爻的局部方向。']};
 expect(parse(p,shape).status).toBe('validated');
 expect(parse(p,shape).answer.factors[0].interpretation).toContain('取法来源');
 const mutate=change=>{const copy=structuredClone(shape);change(copy);return parse(p,copy).status;};
 expect(mutate(a=>{a.factors[0].assessment='support';})).toBe('fallback');
 expect(mutate(a=>{a.factors[0].application.mapping_id='invented';})).toBe('fallback');
 expect(mutate(a=>{a.factors[0].basis_id='l4';})).toBe('fallback');
 expect(mutate(a=>{a.factors[0].role.perspective='counterpart';})).toBe('fallback');
 expect(mutate(a=>{a.factors[0].application.goal_link='这条取法与目标之间的关联尚未建立。';})).toBe('fallback');
 expect(mutate(a=>{a.direction='favorable';})).toBe('fallback');
});
