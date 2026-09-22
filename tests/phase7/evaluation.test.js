// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test as vitestTest, expect, afterEach } from 'vitest';
import { loadCases, regenerate, assertFresh, conditionHits, referencePack } from '../../scripts/phase7/evaluation-cases.js';
import { prepare, verify, importAnswer, exportScoring, lockReviews, unblind, summarize, report, status } from '../../scripts/phase7/evaluation-workflow.js';
import { REVIEW_SCHEMA, METRICS, revealsTreatment, reviewTemplate, validateReviews } from '../../scripts/phase7/evaluation-review-schema.js';
import { buildKnowledgePair, commonBase, KNOWLEDGE_SYSTEM_PROMPT } from '../../src/ai/knowledge-input.js';
import { readCorpus } from '../../src/knowledge/load.js';
import { evaluateRules } from '../../src/rules/engine.js';
import { validateAiValue } from '../../src/ai/schemas.js';
const dirs=[];
// Round-trip tests hash complete frozen archives and spawn the CLI, not just pure functions.
const test=(name,fn)=>vitestTest(name,fn,30000);
afterEach(()=>{for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const put=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2));
const data=loadCases().data,corpus=readCorpus();
const options={experiment_id:'phase7-synthetic',data_kind:'synthetic',seed:'test-only-private-seed',model:{client:'synthetic',label:'synthetic',version:null,settings:{}}};
function setup(){const parent=fs.mkdtempSync(path.join(os.tmpdir(),'phase7-eval-'));dirs.push(parent);const root=path.join(parent,'experiment'),out=path.join(parent,'scoring');prepare(root,options);return {parent,root,out,plan:verify(root)};}
function request(ctx,index=0,text='[SYNTHETIC] 😀甲。乙。'){
 const initial=path.join(ctx.parent,`i-${index}.txt`),follow=path.join(ctx.parent,`f-${index}.txt`);
 fs.writeFileSync(initial,text);fs.writeFileSync(follow,'[SYNTHETIC] 乙。');
 return {...ctx.plan.schedule[index],data_kind:'synthetic',initial_file:initial,follow_up_file:follow,actual_order:index+1,model:options.model.label,settings:{},deviations:[]};
}
async function collect(ctx){for(let i=0;i<24;i++)await importAnswer(ctx.root,request(ctx,i));}
function minimal(){
 const packet={reference_pack:referencePack(),cases:[{case_id:'case-01',facts:[{fact_id:'field-1'}],checklist:[{checklist_id:'c1',turns:['initial','follow_up']}],answers:[{variant:'A',initial:'😀甲。乙。',follow_up:'乙。'}]}]};
 const review=reviewTemplate(packet);for(const r of review.reviews){r.review_status='complete';r.reviewer_id='synthetic';for(const a of r.checklist_assessments){a.assessment='satisfied';a.reason='Synthetic validator fixture';}}
 return {packet,review,r:review.reviews[0]};
}
const finding=(extra={})=>({finding_id:'f1',turn:'initial',quotes:[{turn:'initial',start:2,end:3,text:'甲'}],fact_ids:[],checklist_id:null,source_reference_ids:[],direction_error:false,reason:'Synthetic finding',...extra});

test('12 fixed unique cases, exact 8/2/2 strata and no historical recipes or fixture shapes',()=>{
 expect(data.cases).toHaveLength(12);expect(new Set(data.cases.map(c=>c.case_id)).size).toBe(12);
 expect(data.cases.filter(c=>c.case_type==='explanation_boundary')).toHaveLength(8);
 expect(data.cases.filter(c=>c.case_type==='low_gain')).toHaveLength(2);expect(data.cases.filter(c=>c.case_type==='zero_match')).toHaveLength(2);
 assertFresh(data.cases);expect(()=>assertFresh([data.cases[0],data.cases[0]])).toThrow();
 const old=read('experiments/phase6/cases.json').cases.find(c=>c.source.kind==='core_recipe');
 expect(()=>assertFresh([{recipe:old.source,canonical:old.canonical}])).toThrow(/Reused/);
 expect(()=>assertFresh([{recipe:{sums:[7,7,7,7,7,7]},canonical:read('experiments/phase7/fixtures/compat-1.json')}])).toThrow(/Reused/);
});
for(const c of data.cases)test(`${c.case_id}: Core/r1 replay, actual retrieval, budget and common input remain frozen`,()=>{
 expect(regenerate(c.recipe,c.question,c.case_id)).toEqual(c.canonical);expect(evaluateRules(c.canonical)).toEqual(c.rule_result);
 expect(conditionHits(c.canonical,c.rule_result,c.condition).length).toBeGreaterThan(0);
 const pair=buildKnowledgePair({canonical:c.canonical,corpus,case_id:c.case_id,query:c.query});
 expect(pair.archive).toEqual(c.expected.archive);expect(pair.archive.selected_knowledge_ids).toEqual(c.expected.selected_ids);
 expect(commonBase(pair.off.input)).toEqual(commonBase(pair.on.input));
 expect(pair.archive.f_chars.on).toBeLessThanOrEqual(2400);expect(pair.archive.delta_percent).toBeLessThanOrEqual(15);expect(pair.archive.selected_knowledge_ids.length).toBeLessThanOrEqual(4);
 expect(pair.archive.retrieval_trace.admission_excluded.filter(x=>x.reasons.includes('verification:source_checked'))).toHaveLength(3);
 expect(pair.on.text.startsWith(KNOWLEDGE_SYSTEM_PROMPT)).toBe(true);expect(pair.on.text).not.toMatch(/"enabled"|"assignment"|"selected_count"|"retrieval_status"/);
 expect(c.checklist).toHaveLength(3);
 if(c.expected.zero_match){expect(pair.on.input.F_literature_context.items).toEqual([]);expect(Buffer.from(pair.off.text).equals(Buffer.from(pair.on.text))).toBe(true);}
 else expect(pair.archive.selected_knowledge_ids).toHaveLength(1);
});
test('closed case schema rejects unknown fields and illegal line values',()=>{
 const schema=read('experiments/phase7/evaluation/cases.schema.json'),copy=structuredClone(data);copy.cases[0].unknown=true;
 expect(()=>validateAiValue(copy,schema)).toThrow();delete copy.cases[0].unknown;copy.cases[0].recipe.sums[0]=5;expect(()=>validateAiValue(copy,schema)).toThrow();
});
test('rubric on disk equals independent v2 implementation and contains no scoring weights',()=>{
 expect(read('experiments/phase7/evaluation/review.schema.json')).toEqual(REVIEW_SCHEMA);
 expect(JSON.stringify(REVIEW_SCHEMA)).toContain('UTF-16');expect(JSON.stringify(REVIEW_SCHEMA)).not.toMatch(/severity|weight|overall_score|confidence/);
 const {packet,review}=minimal();review.reviews[0].score=1;expect(()=>validateReviews(review,packet)).toThrow();
});
test('UTF-16 positions after emoji, exact raw slice and out-of-range rejection',()=>{
 const {packet,review,r}=minimal();r.literature_overreach=[finding()];expect(()=>validateReviews(review,packet)).not.toThrow();
 r.literature_overreach[0].quotes[0].start=1;expect(()=>validateReviews(review,packet)).toThrow(/Quotation/);
 r.literature_overreach[0].quotes=[{turn:'initial',start:2,end:100,text:'甲。乙。'}];expect(()=>validateReviews(review,packet)).toThrow(/Quotation/);
});
test('omitted requires exactly one finding and remains separate from satisfied follow-up',()=>{
 const {packet,review,r}=minimal();r.checklist_assessments[0].assessment='omitted';expect(()=>validateReviews(review,packet)).toThrow(/Omission/);
 r.relevant_omissions=[finding({quotes:[],checklist_id:'c1'})];expect(()=>validateReviews(review,packet)).not.toThrow();
 r.relevant_omissions.push(finding({finding_id:'f2',quotes:[],checklist_id:'c1'}));expect(()=>validateReviews(review,packet)).toThrow(/Omission/);
});
test('incorrect requires error and cannot also count as omission',()=>{
 const {packet,review,r}=minimal();r.checklist_assessments[0].assessment='incorrect';expect(()=>validateReviews(review,packet)).toThrow(/Incorrect/);
 r.fact_errors=[finding({checklist_id:'c1',fact_ids:['field-1']})];expect(()=>validateReviews(review,packet)).not.toThrow();
 r.relevant_omissions=[finding({finding_id:'omit',checklist_id:'c1',quotes:[]})];expect(()=>validateReviews(review,packet)).toThrow(/Omission/);
 r.checklist_assessments[0].assessment='omitted';expect(()=>validateReviews(review,packet)).toThrow(/incorrect/);
});
test('uncertain assessment and finding must agree',()=>{
 const {packet,review,r}=minimal();r.checklist_assessments[0].assessment='uncertain';expect(()=>validateReviews(review,packet)).toThrow(/Uncertain/);
 r.uncertain=[finding({quotes:[],checklist_id:'c1'})];expect(()=>validateReviews(review,packet)).not.toThrow();r.checklist_assessments[0].assessment='satisfied';expect(()=>validateReviews(review,packet)).toThrow();
});
test('contradictions need two distinct quotations and both turns for cross-turn',()=>{
 const {packet,review,r}=minimal();r.contradictions=[finding()];expect(()=>validateReviews(review,packet)).toThrow(/Contradiction/);
 r.contradictions[0].quotes.push({turn:'initial',start:4,end:5,text:'乙'});expect(()=>validateReviews(review,packet)).not.toThrow();
 r.contradictions[0].turn='cross_turn';expect(()=>validateReviews(review,packet)).toThrow(/both turns/);
 r.contradictions[0].quotes[1]={turn:'follow_up',start:0,end:1,text:'乙'};expect(()=>validateReviews(review,packet)).not.toThrow();
});
test('direction errors require relation indexing; misquotes require neutral source reference',()=>{
 const {packet,review,r}=minimal();r.fact_errors=[finding({direction_error:true,fact_ids:['field-1']})];expect(()=>validateReviews(review,packet)).toThrow(/Direction/);
 r.relation_errors=structuredClone(r.fact_errors);expect(()=>validateReviews(review,packet)).not.toThrow();
 r.literature_misquotes=[finding({finding_id:'misquote'})];expect(()=>validateReviews(review,packet)).toThrow(/source reference/);
 r.literature_misquotes[0].source_reference_ids=['reference-1'];expect(()=>validateReviews(review,packet)).not.toThrow();
});
test('leakage markers require disclosure; citing book alone is not leakage',()=>{
 expect(revealsTreatment('《增删卜易》')).toBe(false);expect(revealsTreatment('F_literature_context')).toBe(true);
 const {packet,review,r}=minimal();packet.cases[0].answers[0].initial='F_literature_context';expect(()=>validateReviews(review,packet)).toThrow(/blinding/);r.blinding_compromised=true;r.blinding_note='Protocol exposed';expect(()=>validateReviews(review,packet)).not.toThrow();
});
test('private mapping has four cells of 3, all three margins 6/6, repeatable and no execution leak',()=>{
 const ctx=setup(),plan=ctx.plan;
 const cells={};for(const first of plan.schedule.filter((_,i)=>i%2===0)){const k=plan.assignments[first.case_id].A+'/'+first.variant;cells[k]=(cells[k]??0)+1;}
 expect(Object.values(cells)).toEqual([3,3,3,3]);
 expect(Object.values(plan.assignments).filter(a=>a.A==='on')).toHaveLength(6);
 const starts=plan.schedule.filter((_,i)=>i%2===0);expect(starts.filter(s=>s.variant==='A')).toHaveLength(6);expect(starts.filter(s=>plan.assignments[s.case_id][s.variant]==='on')).toHaveLength(6);
 const other=setup();expect(other.plan.assignments).toEqual(plan.assignments);expect(other.plan.schedule).toEqual(plan.schedule);
 for(const file of fs.readdirSync(path.join(ctx.root,'execution'))){const text=fs.readFileSync(path.join(ctx.root,'execution',file),'utf8');expect(text).not.toContain(options.seed);expect(text).not.toContain('assignments');}
 expect(status(ctx.root).collected_pairs).toBe(0);expect(()=>prepare(ctx.root,options)).toThrow();
});
test('seal detects changed frozen follow-up; collection and unlocking fail closed',async()=>{
 const ctx=setup();expect(()=>exportScoring(ctx.root,ctx.out)).toThrow(/24/);expect(()=>unblind(ctx.root)).toThrow();
 fs.appendFileSync(path.join(ctx.root,'execution/case-01-follow-up.txt'),'tampered');expect(()=>verify(ctx.root)).toThrow(/Frozen/);await expect(importAnswer(ctx.root,request(ctx))).rejects.toThrow(/Frozen/);
});
test('raw BOM/CRLF preserved, duplicates/model/settings/kind rejected, archived tamper detected',async()=>{
 const ctx=setup(),req=request(ctx,0,'\uFEFF[SYNTHETIC]\r\n😀甲。');
 await expect(importAnswer(ctx.root,{...req,model:'wrong'})).rejects.toThrow(/Model/);
 await expect(importAnswer(ctx.root,{...req,settings:{extra:true}})).rejects.toThrow(/settings/);
 await expect(importAnswer(ctx.root,{...req,data_kind:'external'})).rejects.toThrow(/kind/);
 await importAnswer(ctx.root,req);const archive=path.join(ctx.root,`private/answers/${req.case_id}-${req.variant}/initial.txt`);
 expect(fs.readFileSync(archive).equals(fs.readFileSync(req.initial_file))).toBe(true);
 await expect(importAnswer(ctx.root,req)).rejects.toThrow(/Duplicate/);
 await expect(importAnswer(ctx.root,{...request(ctx,1),actual_order:1})).rejects.toThrow(/Duplicate/);
 fs.appendFileSync(archive,'changed');expect(()=>status(ctx.root)).toThrow(/Archived/);
});
test('neutral pack is shared, reviewed-only, and omits unit IDs and retrieval associations',()=>{
 const refs=referencePack();expect(refs).toHaveLength(7);
 expect(JSON.stringify(refs)).not.toMatch(/knowledge_id|related_rule_ids|related_concepts|verification_status|retrieval/);
 expect(refs.every(r=>r.original_text&&r.source_url&&r.locator)).toBe(true);
});
test('external seeds are never user supplied and placeholder model blocks answer collection',async()=>{
 const ctx=setup(),root=path.join(ctx.parent,'external');
 expect(()=>prepare(root,{...options,data_kind:'external'})).toThrow(/random seed/);
 prepare(root,{experiment_id:'package-only',data_kind:'external',model:{...options.model,label:'MODEL_NOT_SELECTED'}});
 await expect(importAnswer(root,{...request(ctx),data_kind:'external'})).rejects.toThrow(/Select the real model/);
});
test('frozen rubric and reference pack tampering are detected',()=>{
 const ctx=setup();fs.appendFileSync(path.join(ctx.root,'private/reference-pack.json'),' ');expect(()=>verify(ctx.root)).toThrow(/Frozen/);
 const second=setup();fs.appendFileSync(path.join(second.root,'private/review.schema.json'),' ');expect(()=>verify(second.root)).toThrow(/Frozen/);
});
test('scoring output cannot be inside execution tree and imports close after packet export',async()=>{
 const ctx=setup();await collect(ctx);
 expect(()=>exportScoring(ctx.root,path.join(ctx.root,'execution/scoring'))).toThrow(/outside/);
 exportScoring(ctx.root,ctx.out);await expect(importAnswer(ctx.root,request(ctx))).rejects.toThrow(/closed/);
});
test('full synthetic CLI workflow: private separation, complete lock, unblind, descriptive report',async()=>{
 const ctx=setup();await collect(ctx);exportScoring(ctx.root,ctx.out);
 const packet=read(path.join(ctx.out,'scoring-packet.json')),reviews=read(path.join(ctx.out,'reviews.json'));
 expect(packet.reference_pack).toHaveLength(7);
 const text=JSON.stringify(packet);expect(text).not.toMatch(/assignments|selected_knowledge_ids|retrieval_query|F_literature_context|prompt_chars|private\/|seed|source_checked/);
 expect(()=>lockReviews(ctx.root,path.join(ctx.out,'reviews.json'))).toThrow(/incomplete/);expect(()=>unblind(ctx.root)).toThrow(/locked/);
 for(const r of reviews.reviews){r.review_status='complete';r.reviewer_id='synthetic-reviewer';for(const a of r.checklist_assessments){a.assessment='omitted';a.reason='Synthetic answer intentionally omits required content';r.relevant_omissions.push(finding({finding_id:`${a.checklist_id}-${a.turn}`,turn:a.turn,quotes:[],checklist_id:a.checklist_id}));}}
 put(path.join(ctx.out,'reviews.json'),reviews);
 const cli=(...args)=>JSON.parse(execFileSync(process.execPath,['scripts/phase7-evaluation.js',...args],{encoding:'utf8'}));
 expect(cli('verify',ctx.root).status).toBe('freeze_verified');
 expect(cli('lock',ctx.root,path.join(ctx.out,'reviews.json')).status).toBe('blind_reviews_locked');
 expect(cli('unblind',ctx.root).data_kind).toBe('synthetic');expect(cli('report',ctx.root).status).toBe('synthetic_pipeline_validation');
 const result=summarize(ctx.root);expect(result.effects_conclusion).toBeNull();expect(result.cases.filter(c=>c.zero_match).every(c=>c.byte_identical&&c.visible_identical)).toBe(true);
 expect(result.affected_responses.off.relevant_omissions).toBe(12);expect(result.cases.every(c=>c.comparison==='same')).toBe(true);
 fs.appendFileSync(path.join(ctx.root,'private/reviews.json'),' ');expect(()=>unblind(ctx.root)).not.toThrow();
 const changed=read(path.join(ctx.root,'private/reviews.json'));changed.reviews[0].notes='changed';put(path.join(ctx.root,'private/reviews.json'),changed);expect(()=>unblind(ctx.root)).toThrow(/Locked/);
});
