import {test,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createEvidenceLedContext,validateEvidenceLedAnswer,evidenceLedView,evidenceLedMessages} from '../../experiments/judgment-review/evidence-led.js';
import {renderEvidenceLedPreview} from '../../experiments/judgment-review/evidence-led-view.js';
import {evidenceLedSynthetic,prepareEvidenceLedDemo} from '../../scripts/prepare-evidence-led.js';
async function setup(task='trend'){
  const c=(await prepareJudgmentPlan()).cases[0];
  const source=await buildOutputContext(c.canonical,{includeMissingRecords:true});
  const context=await createEvidenceLedContext(source,task);return {source,context,answer:evidenceLedSynthetic(context)};
}
test('program generates original facts and rule source closure without model copies or double counts',async()=>{
  const {context,answer}=await setup();
  const rule=context.evidence.find(e=>e.kind==='rule_result'&&e.result.code==='ying_controls_shi')??context.evidence.find(e=>e.kind==='rule_result');
  answer.factors[0].evidence_ids=[rule.id,rule.source_facts[0]];
  const v=evidenceLedView(answer,context).factors[0];
  expect(new Set(v.source_facts.map(e=>e.id)).size).toBe(v.source_facts.length);
  expect(v.source_facts.map(e=>e.id)).toEqual(rule.source_facts);
  expect(v.rules[0].source_ids).toEqual(rule.source_facts);
  const original=JSON.stringify(context);v.source_facts[0].text='wrong';expect(JSON.stringify(context)).toBe(original);
  answer.factors[0].value='wrong';expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow('unknown_field');
});
test.each(['unknown','duplicate_factor','unknown_major','overlap','wrong_context','wrong_task','focus_name','missing_focus_fact','extra_fact_value','four_factors'])('rejects invalid reference or schema: %s',async kind=>{
  const {context,answer}=await setup();
  if(kind==='unknown')answer.factors[0].evidence_ids=['fact:/no-such-fact'];
  if(kind==='duplicate_factor'){const f=structuredClone(answer.factors[0]);f.interpretation+='另一段';answer.factors.push(f);}
  if(kind==='unknown_major')answer.decision.major_factor_ids=['f2'];
  if(kind==='overlap'){answer.decision.major_factor_ids=['f1'];answer.decision.counter_factor_ids=['f1'];}
  if(kind==='wrong_context')answer.context_id+='x';
  if(kind==='wrong_task')answer.decision.task='advice';
  if(kind==='focus_name')answer.decision.focus=[{evidence_id:'fact:/hexagram/primary/name',role_hypothesis:'角色假设'}];
  if(kind==='missing_focus_fact')answer.decision.focus=[{evidence_id:'fact:/lines/3/relative',role_hypothesis:'角色假设'}];
  if(kind==='extra_fact_value')answer.facts=[{value:'wrong'}];
  if(kind==='four_factors')answer.factors=Array.from({length:4},(_,i)=>({...answer.factors[0],interpretation:String(i)}));
  expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow();
});
test('mixed is never derived from counts; any asserted direction requires explicit focus, major effects and reasons',async()=>{
  const {context,answer}=await setup();
  answer.decision.direction='mixed';expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow('requires focus');
  answer.decision.focus=[{evidence_id:'fact:/lines/0/relative',role_hypothesis:'仅供离线对照的取用假设，非传统规范。'}];
  answer.decision.major_factor_ids=['f1'];answer.factors[0].effect='support';
  expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow('opposed major');
  answer.factors.push({...structuredClone(answer.factors[0]),id:'f2',effect:'oppose'});
  answer.decision.major_factor_ids=['f1','f2'];answer.decision.tradeoff_reason='   ';
  expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow('invalid_length');
  answer.decision.tradeoff_reason='此处只有合成的结构对照，是否真正牵制仍需独立语义审查。';
  const v=evidenceLedView(answer,context);expect(v.direction).toBe('mixed');expect(v.semantic_acceptance).toBe('unassessed');
  answer.decision.direction='unclear';expect(evidenceLedView(answer,context).direction).toBe('unclear');
  answer.decision.direction='favorable';answer.factors[0].effect='neutral';expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow('lacks');
});
test('an unselected neutral factor cannot lend its focus to unrelated major trend factors',async()=>{
  const {context,answer}=await setup();
  answer.decision.direction='favorable';answer.decision.major_factor_ids=['f1'];
  answer.factors[0].effect='support';answer.factors[0].evidence_ids=['fact:/calendar/month_branch'];
  answer.factors.push({...structuredClone(answer.factors[0]),id:'f2',effect:'neutral',evidence_ids:['fact:/lines/3/relative']});
  answer.decision.focus=[{evidence_id:'fact:/lines/3/relative',role_hypothesis:'只用于检测结构缺口的离线假设。'}];
  expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow('selected major');
  // A direct link fixes only structure, not whether the chosen explanation is relevant.
  answer.factors[0].evidence_ids.push('fact:/lines/3/relative');
  expect(evidenceLedView(answer,context).semantic_acceptance).toBe('unassessed');
});
test.each(['facts','advice'])('task boundary %s does not force yongshen or favorable/unfavorable judgment',async task=>{
  const {context,answer}=await setup(task);expect(validateEvidenceLedAnswer(answer,context)).toBe(answer);
  answer.decision.direction='favorable';expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow('Non-trend');
  answer.decision.direction='unclear';answer.general_advice=['先检查实际条件。'];
  if(task==='facts')expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow('Fact task');
  else expect(evidenceLedView(answer,context).general_advice[0].label).toBe('一般建议');
});
test('ordinary advice and insufficient trend do not need decorative chart factors; fact checks still need citations',async()=>{
  for(const task of ['advice','trend','facts']){
    const {context,answer}=await setup(task);answer.factors=[];
    if(task==='facts')expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow('requires cited facts');
    else{expect(validateEvidenceLedAnswer(answer,context)).toBe(answer);answer.decision.direction='favorable';expect(()=>validateEvidenceLedAnswer(answer,context)).toThrow();}
  }
});
test('source identity, known task and offline prompt stay separate from production sessions',async()=>{
  const {source,context}=await setup();expect(context.context_id).not.toBe(source.context_id);
  expect(context.source_context_id).toBe(source.context_id);expect(context.input).toBe(source.input);
  await expect(createEvidenceLedContext(structuredClone(source),'trend')).rejects.toThrow('Trusted');
  await expect(createEvidenceLedContext(source,'unknown')).rejects.toThrow('explicit task');
  expect(()=>evidenceLedMessages(structuredClone(context))).toThrow('Untrusted');
  const messages=evidenceLedMessages(context);expect(messages[0].content).toContain('离线实验');
  expect(JSON.parse(messages[1].content).response_schema).not.toHaveProperty('properties.facts');
});
test('preview starts with a short conclusion, collapses facts once and treats all model prose as text',async()=>{
  const {context,answer}=await setup();answer.summary='<img src=x onerror="alert(1)">';
  const node=document.createElement('main');renderEvidenceLedPreview(node,answer,context);
  expect(node.querySelector('img')).toBeNull();expect(node.textContent).toContain(answer.summary);
  expect(node.querySelectorAll('details[open]')).toHaveLength(0);expect(node.querySelectorAll('details details')).toHaveLength(0);
  expect(node.textContent.match(/第1爻 · 六亲/g)).toHaveLength(1);
  expect(node.textContent).toContain('非真实模型回答');
  const before=node.innerHTML;answer.context_id='bad';expect(()=>renderEvidenceLedPreview(node,answer,context)).toThrow();expect(node.innerHTML).toBe(before);
});
test('prepare writes synthetic offline artifacts without credentials or network and refuses to overwrite a frozen demo',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-led-')),dir=path.join(root,'demo');
  const load=vi.spyOn(process,'loadEnvFile').mockImplementation(()=>{throw Error('No credentials permitted');});
  const network=vi.fn(()=>{throw Error('No network permitted');});vi.stubGlobal('fetch',network);
  try{
    const result=await prepareEvidenceLedDemo(dir),before=fs.readFileSync(path.join(dir,'plan.json'));
    expect(result.network_calls).toBe(0);expect(result.prepared_cases).toBe(2);
    const plan=JSON.parse(before);expect(plan.production).toBe(false);expect(plan.paid_executor_available).toBe(false);expect(plan.budget_reserved).toBe(false);
    expect(plan.semantic_acceptance).toBe('unassessed');expect(plan.blind).toBe(false);
    expect(fs.readFileSync(path.join(dir,'preview.html'),'utf8')).toContain('非真实模型回答');
    await expect(prepareEvidenceLedDemo(dir)).rejects.toThrow();expect(fs.readFileSync(path.join(dir,'plan.json')).equals(before)).toBe(true);
    expect(load).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
  }finally{vi.restoreAllMocks();vi.unstubAllGlobals();fs.rmSync(root,{recursive:true,force:true});}
});
