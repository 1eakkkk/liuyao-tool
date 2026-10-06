// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildCanonicalCast} from '../../src/core/normalize.js';
import {lineFromSum} from '../../src/core/physics.js';
import {JIAZI60} from '../../src/core/constants.js';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession} from '../../src/ai/output/session.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {strictReadingRequest} from '../../src/ai/output/strict-transport.js';
import {REVIEWED_MAPPING,reviewedGoal,admittedMappings} from '../../src/ai/output/mapping-admission.js';
import {selectionCatalog,selectionSchema} from '../../src/ai/output/selection.js';
const old=JSON.parse(fs.readFileSync('docs/acceptance/strict-reading-20261006/plan.json'));
const prepare=(canonical,question,basis=4,s=createReadingSession(canonical))=>prepareSelectedReadingTurn(s,question,{judgmentPolicyVersion:6,basisPolicyVersion:basis});
const empty=p=>({schema_version:'structured-selection-2',context_id:p.context.context_id,direction:'unclear',main_choice:{basis_id:'none',perspective:'none',reason:selectionSchema(p.context).properties.main_choice.properties.reason.const},factors:[],judgment:{basis_ids:[],reason:selectionSchema(p.context).properties.judgment.properties.reason.const},role_tradeoffs:[],general_advice:[],background_usage:[],timing_candidates:[],uncertainties:['现有已核对取法尚未覆盖这个目标。']});
const parse=(p,a)=>parseOutputAnswer(JSON.stringify(a),p.context,{completed:true});

test('the source card quote and locator are pinned to the supplied transcript, not a promoted corpus effect',()=>{
 const segment=JSON.parse(fs.readFileSync('knowledge/classics/zsby-1925-s1.json'));
 expect(segment.text).toContain(REVIEWED_MAPPING.source.quote);expect(REVIEWED_MAPPING.source.image_page).toBe(segment.locator.image_page);
 expect('sha256:'+createHash('sha256').update(segment.text).digest('hex')).toBe(REVIEWED_MAPPING.source.text_hash);
 const unit=JSON.parse(fs.readFileSync('knowledge/units/zsby-shiying-scope-001.json'));expect(unit.rule_link_semantics).toBe('association_only');
 expect(REVIEWED_MAPPING.assessments).toEqual(['conditional','neutral']);
});
test('the original two plan targets are never given the assistance mapping, and each gap is named separately',async()=>{
 // The peer-help mapping must not leak into a self-directed plan question.
 for(const c of old.cases)expect(admittedMappings((await prepare(c.canonical,c.question)).context,selectionCatalog((await prepare(c.canonical,c.question)).context).entries)).toEqual([]);
 const lacking=await prepare(old.cases[0].canonical,old.cases[0].question),lackingInput=JSON.parse(lacking.messages[1].content);
 // This chart's 世爻 is 静 with no 进/退/回头 and no 日冲, so the method applies but the chart lacks its basis.
 expect(lackingInput.admitted_mappings).toEqual([]);expect(lackingInput.bases).toEqual([]);expect(lackingInput.response_schema.properties.factors.maxItems).toBe(0);
 const a=empty(lacking);expect(parse(lacking,a).status).toBe('validated');expect(parse(lacking,a).answer.answer).toContain('取法覆盖不足');
 a.direction='favorable';expect(parse(lacking,a).status).toBe('fallback');a.direction='unclear';a.main_choice.basis_id='l1';expect(parse(lacking,a).status).toBe('fallback');
 // This chart's 世爻 does move and is 回头克, so a limited conditional observation exists.
 const covered=await prepare(old.cases[1].canonical,old.cases[1].question),coveredInput=JSON.parse(covered.messages[1].content);
 expect(coveredInput.admitted_mappings.map(m=>m.id)).toEqual(['plan-shi-return-control']);
 expect(coveredInput.admitted_mappings[0].basis_ids).toEqual(['t4']);
 expect(coveredInput.response_schema.properties.factors.maxItems).toBe(1);
});
test('quoted examples, other objectives, AI requests and multiple questions do not admit assistance mapping',()=>{
 for(const q of [old.cases[0].question,old.cases[1].question,'帮我算一下我的朋友是不是喜欢这个网页。','别人说“他能否帮助我整理旧书？”这句话是什么意思？','不要分析他能否帮助我整理旧书。','他能否帮助我整理旧书？我能赚钱吗？','朋友能否帮助我维护项目，还是我能帮他维护？','朋友能否帮助我维护项目还是我帮他维护'])expect(reviewedGoal(q)).toBeNull();
 expect(reviewedGoal('他能否帮助我整理旧书？')).toBe('counterpart_helps_self');expect(reviewedGoal('我能否帮助朋友整理旧书？')).toBe('self_helps_counterpart');
 for(const q of ['朋友能否帮助我，我也可以帮助他？','朋友能否帮助我，也想问我能否帮助他？','朋友能否帮助我，也能不能帮助他？','朋友能否帮助我我也可以帮助他？'])expect(reviewedGoal(q)).toBeNull();
});

async function mapped(){
 const now=new Date('2026-10-01T22:00:00+08:00'),question='他能否帮助我整理旧书？';
 for(let bits=0;bits<64;bits++){
  const canonical=buildCanonicalCast({lines:Array.from({length:6},(_,i)=>lineFromSum(bits&(1<<i)?7:8)),source:'manual',question,createdAt:now.getTime(),castId:`mapping-fixture-${bits}`,calendar:{now,day:JIAZI60.find(d=>d.label==='戊申'),ymh:{yearLabel:'丙午',monthLabel:'丁酉',hourLabel:'癸亥'},dateText:'公历：2026年10月1日'}});
  const p=await prepare(canonical,question),maps=admittedMappings(p.context,selectionCatalog(p.context).entries);if(maps.length)return {p,m:maps[0]};
 }
 throw Error('No deterministic assistance-direction fixture');
}
test('admitted mappings require the actual rule and eligible actor, and cannot become decisive',async()=>{
 const {p,m}=await mapped(),schema=selectionSchema(p.context),a={schema_version:'structured-selection-2',context_id:p.context.context_id,direction:'unclear',main_choice:{basis_id:m.role_ids[0],perspective:m.perspective,reason:'仅观察明确询问的帮助方向。'},factors:[{basis_id:m.basis_ids[0],assessment:'conditional',role:{basis_id:m.role_ids[0],perspective:m.perspective,meaning:'对应本次询问的帮助方，不确认其实际意愿。'},application:{origin:'model_hypothesis',state:'proposed',goal_link:'按本题明确的帮助目标观察双方方向，不扩展为现实参与或成败。',mapping_id:m.id,effect_scope:'requires_conditions',effect_conditions:[{condition:'对方实际愿意参与协助。',status:'unconfirmed',user_quotes:[]}]},interpretation:'仅作条件性观察，不能单独据此判断事情能否成功。'}],judgment:{basis_ids:[m.basis_ids[0]],reason:'帮助是否实际发生尚未确认，不作成败结论。'},role_tradeoffs:[],general_advice:[],background_usage:[],timing_candidates:[],uncertainties:['原文作用范围有限。']};
 expect(parse(p,a).status).toBe('validated');expect(parse(p,a).answer.factors[0].interpretation).toContain('取法来源');
 expect(schema.properties.factors.items.properties.assessment.enum).toEqual(['conditional','neutral']);
 a.factors[0].assessment='support';expect(parse(p,a).status).toBe('fallback');a.factors[0].assessment='conditional';
 a.factors[0].application.mapping_id='invented';expect(parse(p,a).status).toBe('fallback');a.factors[0].application.mapping_id=m.id;
 a.factors[0].role.perspective='self';expect(parse(p,a).status).toBe('fallback');
});
test('policy four history survives while the actual frozen policy three request remains byte identical',async()=>{
 const frozen=JSON.parse(fs.readFileSync('docs/acceptance/effect-conditions-live-20261006/plan.json')).cases[0];
 const legacy=await prepare(frozen.canonical,frozen.question,3,createReadingSession(frozen.canonical,{style:'brief',custom:''}));expect(JSON.stringify(strictReadingRequest(legacy).body)).toBe(JSON.stringify(frozen.body));
 const s=createReadingSession(old.cases[0].canonical),p=await prepare(s.canonical,old.cases[0].question,4,s);appendReadingTurn(s,p,JSON.stringify(empty(p)),true,'external');
 const restored=(await restoreReadingSession(serializeReadingSession(s))).session;expect(restored.basisPolicyVersion).toBe(4);expect(restored.turns[0].result.status).toBe('validated');
 await expect(prepare(restored.canonical,old.cases[0].question,3,restored)).rejects.toThrow('不能升级');
});
