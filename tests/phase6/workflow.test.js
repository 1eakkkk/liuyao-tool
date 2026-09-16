// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test, expect } from 'vitest';
import { prepare, loadCases, objectHash, verify, importAnswer, exportScoring, lockReviews, unblind, summarize, report, status } from '../../scripts/phase6/workflow.js';
import { METRICS, REVIEW_SCHEMA, revealsTreatment, validateReviews } from '../../scripts/phase6/review-schema.js';
import { buildRulesPair } from '../../src/ai/rules-input.js';
import { evaluateRules } from '../../src/rules/engine.js';
import { normalizeLegacyCast, buildCanonicalCast } from '../../src/core/normalize.js';
import { lineFromSum } from '../../src/core/physics.js';
import { JIAZI60 } from '../../src/core/constants.js';
import { buildYearMonthHourPillars, buildDateDisplayText } from '../../src/core/ganzhi.js';
const dirs = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive:true, force:true }); });
const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const put = (p,x) => fs.writeFileSync(p,JSON.stringify(x,null,2));
const options = {experiment_id:'test-round',data_kind:'synthetic',seed:'fixed-phase6-seed',model:{client:'synthetic',label:'synthetic-model',version:null,settings:{search:false,temperature:null}}};
function setup(extra={}) {
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'liuyao-phase6-'));dirs.push(parent);
  const root=path.join(parent,'experiment'),out=path.join(parent,'scoring');
  prepare(root,{...options,...extra});return {root,out,parent,plan:verify(root)};
}
async function collect(ctx,text='这是合成回答，用于工具测试。') {
  for(const [index,item]of ctx.plan.schedule.entries()){
    const initial=path.join(ctx.parent,`${index}-initial.txt`),follow=path.join(ctx.parent,`${index}-follow.txt`);
    fs.writeFileSync(initial,text);fs.writeFileSync(follow,'这是合成追问回答。');
    await importAnswer(ctx.root,{...item,initial_file:initial,follow_up_file:follow,actual_order:index+1,model:options.model.label,settings:options.model.settings,deviations:[]});
  }
}
function completed(ctx) {
  const file=path.join(ctx.out,'reviews.json'),reviews=read(file);
  for(const r of reviews.reviews){r.reviewer_id='synthetic-reviewer';r.review_status='complete';if(r.blinding_compromised)r.blinding_note='原回答含可推断处理的信息。';for(const a of r.checklist_assessments){a.assessment='used';a.reason='合成流程测试标注，不是对真实模型的评判。';}}
  return {file,reviews};
}
function finding(overrides={}) {return {finding_id:'f-1',turn:'initial',quotes:[{turn:'initial',start:0,end:2,text:'这是'}],fact_ids:[],checklist_id:null,direction_error:false,reason:'合成判断理由',...overrides};}
async function scored(extra={},text) {const ctx=setup(extra);await collect(ctx,text);exportScoring(ctx.root,ctx.out);return {...ctx,...completed(ctx),packet:read(path.join(ctx.out,'scoring-packet.json'))};}

test('eight frozen casts reproduce source recipes and cover 24 natural rules, not synthetic hidden equality',()=>{
  const {data}=loadCases(),ids=new Set();
  const legacy=read('tests/regression/fixtures/casts.json'),staticData=read('tests/regression/fixtures/static-casts.json');
  for(const c of data.cases){
    for(const h of evaluateRules(c.canonical).hits)ids.add(h.rule_id);
    let expected;
    if(c.source.kind==='core_recipe'){
      const now=new Date(c.source.timestamp),day=JIAZI60[c.source.explicit_day_index];
      expected=buildCanonicalCast({lines:c.source.sums.map(lineFromSum),source:'manual',createdAt:0,castId:'advance-fixture',calendar:{now,day,ymh:buildYearMonthHourPillars(day.stem,now),dateText:buildDateDisplayText(now)}});expected.question.text=c.question;
    }else expected=normalizeLegacyCast(c.source.kind==='legacy'?legacy[c.source.index].expected.cast:staticData.cases[c.source.index].expected,{question:c.question,createdAt:0});
    expect(expected).toEqual(c.canonical);
  }
  expect(ids.size).toBe(24);expect(ids.has('HIDDEN-SAME-ELEMENT-001')).toBe(false);
});

test('both arms reuse original exports; only treatment fields differ and question/checklist/reasons are sealed',()=>{
  const ctx=setup(),{data}=loadCases();
  for(const c of data.cases){
    const pair=buildRulesPair(c.canonical),a=structuredClone(pair.on.input);a.E_rule_results.enabled=false;a.E_rule_results.hits=[];expect(a).toEqual(pair.off.input);
    for(const variant of ['A','B'])expect(fs.readFileSync(path.join(ctx.root,'execution',`${c.case_id}-${variant}.txt`),'utf8')).toBe(pair[ctx.plan.assignments[c.case_id][variant]].text);
  }
  expect(status(ctx.root)).toMatchObject({collected_pairs:0,effects_conclusion:null});
  const p=path.join(ctx.root,'private/cases.json'),dataCopy=read(p);dataCopy.cases[0].checklist[0].reason='事后改标准';put(p,dataCopy);
  expect(()=>verify(ctx.root)).toThrow(/Frozen/);
});

test('mapping is reproducible, changes with seed and balances assignment and execution order separately',()=>{
  const a=setup(),b=setup(),c=setup({seed:'another-seed-value'});
  expect(a.plan.assignments).toEqual(b.plan.assignments);expect(a.plan.schedule).toEqual(b.plan.schedule);
  expect(a.plan.assignments).not.toEqual(c.plan.assignments);
  expect(Object.values(a.plan.assignments).filter(x=>x.A==='on')).toHaveLength(4);
  const starts=a.plan.schedule.filter((_,i)=>i%2===0);
  expect(starts.filter(x=>x.variant==='A')).toHaveLength(4);
  expect(starts.filter(x=>a.plan.assignments[x.case_id][x.variant]==='on')).toHaveLength(4);
  const publicSchedule=read(path.join(a.root,'execution/schedule.json'));
  for(const item of publicSchedule)expect(Object.keys(item).sort()).toEqual(['case_id','order','variant']);
  const publicFiles=fs.readdirSync(path.join(a.root,'execution'));
  expect(publicFiles).toHaveLength(26);
  expect(publicFiles.every(name=>/^(case-0[1-8]-(A|B|follow-up)\.txt|schedule\.json|INSTRUCTIONS\.txt)$/.test(name))).toBe(true);
  for(const file of publicFiles)expect(fs.readFileSync(path.join(a.root,'execution',file),'utf8')).not.toContain(options.seed);
  // The treatment remains visible INSIDE the original prompt; anonymized filenames cannot hide it.
  const firstA=fs.readFileSync(path.join(a.root,'execution/case-01-A.txt'),'utf8');
  expect(firstA).toContain('E_rule_results');expect(firstA).toContain('"enabled":');
  expect(()=>prepare(a.root,options)).toThrow(/already exists/);
});

test('frozen protocol mutation blocks answer import; wrong model/settings, duplicate and blank data are rejected',async()=>{
  const ctx=setup(),f=path.join(ctx.parent,'answer.txt');fs.writeFileSync(f,'原文\r\n第二行');
  const req={...ctx.plan.schedule[0],initial_file:f,follow_up_file:f,actual_order:1,model:options.model.label,settings:options.model.settings,deviations:[]};
  await expect(importAnswer(ctx.root,{...req,model:'other'})).rejects.toThrow(/Model/);
  await expect(importAnswer(ctx.root,{...req,settings:{search:true}})).rejects.toThrow(/Model/);
  await importAnswer(ctx.root,req);
  expect(fs.readFileSync(path.join(ctx.root,'private/answers',`${req.case_id}-${req.variant}`,'initial.txt'))).toEqual(fs.readFileSync(f));
  await expect(importAnswer(ctx.root,req)).rejects.toThrow(/Duplicate/);
  fs.writeFileSync(f,' ');await expect(importAnswer(ctx.root,{...req,...ctx.plan.schedule[1],actual_order:2})).rejects.toThrow(/Empty/);
  fs.appendFileSync(path.join(ctx.root,'execution',`${req.case_id}-follow-up.txt`),'changed');
  await expect(importAnswer(ctx.root,{...req,...ctx.plan.schedule[1],actual_order:2})).rejects.toThrow(/Frozen/);
});

test('scoring packet is an allowlist with identical neutral materials; no prompt, mode, seed, lengths or source paths',async()=>{
  const ctx=await scored();
  expect(fs.readdirSync(ctx.out).sort()).toEqual(['reviews.json','scoring-packet.json']);
  const text=fs.readFileSync(path.join(ctx.out,'scoring-packet.json'),'utf8');
  for(const token of ['rules_mode','enabled','hits','E_rule_results','prompt','payload_hash','seed','assignments','execution/','private/','off','on.txt','rule_id','source_ref'])expect(text).not.toContain(token);
  for(const c of ctx.packet.cases){expect(Object.keys(c).sort()).toEqual(['answers','case_id','checklist','facts','follow_up','question']);expect(c.answers.map(x=>x.variant)).toEqual(['A','B']);}
  await expect(importAnswer(ctx.root,{})).rejects.toThrow(/closed/);
});

test('incomplete collection or pending reviews cannot unblind; scoring output cannot be inside execution archive',async()=>{
  const ctx=setup();expect(()=>exportScoring(ctx.root,ctx.out)).toThrow(/Collect all/);
  expect(()=>unblind(ctx.root)).toThrow();await collect(ctx);
  expect(()=>exportScoring(ctx.root,path.join(ctx.root,'scoring'))).toThrow(/outside/);
  exportScoring(ctx.root,ctx.out);
  expect(()=>lockReviews(ctx.root,path.join(ctx.out,'reviews.json'))).toThrow(/incomplete/);
  expect(()=>unblind(ctx.root)).toThrow(/locked/);
  expect(()=>summarize(ctx.root)).toThrow(/locked/);
});

test('review schema on disk matches validator; invalid evidence, unknown facts, new omission standards and incomplete checklist are refused',async()=>{
  const schema=read('experiments/phase6/review.schema.json');delete schema.$schema;delete schema.title;expect(schema).toEqual(REVIEW_SCHEMA);
  const ctx=await scored();expect(()=>validateReviews(ctx.reviews,ctx.packet)).not.toThrow();
  const mutations=[
    r=>r.fact_errors.push(finding({fact_ids:['unknown']})),
    r=>r.fact_errors.push(finding({fact_ids:['field-1'],quotes:[{turn:'initial',start:0,end:2,text:'不存在'}]})),
    r=>r.relevant_omissions.push(finding({quotes:[],checklist_id:'new-standard'})),
    r=>r.checklist_assessments.pop(),
    r=>r.checklist_assessments[0].assessment='omitted',
    r=>r.checklist_assessments[0].assessment='uncertain',
    r=>r.confidence=0.9,
    r=>r.fact_errors.push({...finding({fact_ids:['field-1']}),weight:3}),
  ];
  for(const mutate of mutations){const broken=structuredClone(ctx.reviews);mutate(broken.reviews[0]);expect(()=>validateReviews(broken,ctx.packet)).toThrow();}
});

test('answer self-disclosure is preserved byte-for-byte and forces compromised blinding with explanation',async()=>{
  const raw='原回答：E_rule_results.enabled=true；根据规则层说明。\r\n不得删除这一行。';
  const ctx=await scored({},raw);expect(ctx.packet.cases[0].answers[0].initial).toBe(raw);
  expect(revealsTreatment(raw)).toBe(true);expect(ctx.reviews.reviews.every(r=>r.blinding_compromised)).toBe(true);
  const bad=structuredClone(ctx.reviews);bad.reviews[0].blinding_compromised=false;expect(()=>validateReviews(bad,ctx.packet)).toThrow(/blinding_compromised/);
  put(ctx.file,ctx.reviews);lockReviews(ctx.root,ctx.file);unblind(ctx.root);
  expect(summarize(ctx.root).blinding_compromised_pairs).toBe(16);
});

test('locks bind reviews, archives and inputs; explicit unblinding is required and no records are overwritten',async()=>{
  const ctx=await scored();put(ctx.file,ctx.reviews);lockReviews(ctx.root,ctx.file);
  expect(()=>summarize(ctx.root)).toThrow(/Explicit unblind/);expect(()=>lockReviews(ctx.root,ctx.file)).toThrow(/already locked/);
  unblind(ctx.root);expect(report(ctx.root)).toEqual({status:'synthetic_pipeline_validation',effects_conclusion:null});
  const file=path.join(ctx.root,'private/reviews.json'),r=read(file);r.reviews[0].notes='post-lock edit';put(file,r);
  expect(()=>report(ctx.root)).toThrow(/Locked material/);
});

test('deterministic summary counts evidence, omissions, directions and uncertain without a weighted score',async()=>{
  const ctx=await scored(),caseId='case-01',off=Object.entries(ctx.plan.assignments[caseId]).find(([,mode])=>mode==='off')[0];
  const r=ctx.reviews.reviews.find(r=>r.case_id===caseId&&r.variant===off),materials=ctx.packet.cases[0];
  const check=materials.checklist[0],fact=check.fact_id;
  r.relation_errors.push(finding({fact_ids:[fact],direction_error:true}));
  r.checklist_assessments[0].assessment='omitted';r.relevant_omissions.push(finding({finding_id:'missing-1',fact_ids:[fact],quotes:[],checklist_id:check.checklist_id}));
  const other=ctx.reviews.reviews.find(r=>r.case_id==='case-02');other.uncertain.push(finding({finding_id:'u-1',quotes:[]}));
  put(ctx.file,ctx.reviews);lockReviews(ctx.root,ctx.file);unblind(ctx.root);
  const a=summarize(ctx.root);expect(a).toEqual(summarize(ctx.root));expect(a.totals.off.direction_errors).toBe(1);expect(a.totals.off.relevant_omissions).toBe(1);
  expect(a.by_category.advance_retreat.off.relation_errors).toBe(1);expect(a.cases[0].comparison).toBe('on_better');expect(a.cases[1].comparison).toBe('unable_to_judge');
  expect(a.totals.off.checklist_opportunities).toBe(a.totals.on.checklist_opportunities);expect(a).not.toHaveProperty('score');expect(a.effects_conclusion).toBeNull();
});

test('same finding across categories is not presented as a summed independent error score',async()=>{
  const ctx=await scored(),r=ctx.reviews.reviews[0],f=finding({fact_ids:['field-1']});
  r.fact_errors.push(f);r.fact_overrides.push(structuredClone(f));
  expect(()=>validateReviews(ctx.reviews,ctx.packet)).not.toThrow();
  r.fact_errors.push(structuredClone(f));expect(()=>validateReviews(ctx.reviews,ctx.packet)).toThrow(/unique/);
});

test('archive tampering is rejected; synthetic completed flow never claims external-model effects',async()=>{
  const ctx=await scored();put(ctx.file,ctx.reviews);lockReviews(ctx.root,ctx.file);unblind(ctx.root);report(ctx.root);
  expect(read(path.join(ctx.root,'report.json')).experiment_status).toBe('synthetic_pipeline_validation');
  expect(fs.readFileSync(path.join(ctx.root,'report.md'),'utf8')).toContain('No external-model effect conclusion');
  const {case_id,variant}=ctx.plan.schedule[0];fs.appendFileSync(path.join(ctx.root,'private/answers',`${case_id}-${variant}`,'initial.txt'),'tampered');
  expect(()=>report(ctx.root)).toThrow(/Archived answer changed/);
});
