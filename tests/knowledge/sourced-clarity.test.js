// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test,expect} from 'vitest';
import {prepareSourcedPairs} from '../../experiments/reading-quality/sourced-pairs.js';
import {prepareClarityPairs,CLARITY_RUBRIC} from '../../experiments/reading-quality/sourced-clarity.js';
import {sealPlan} from '../../experiments/reading-quality/knowledge-pairs.js';
import {checkSourcedOutput} from '../../experiments/reading-quality/sourced-output.js';
const plan=await prepareClarityPairs(),base=await prepareSourcedPairs('three-pairs');
const controls=JSON.parse(fs.readFileSync(new URL('../../experiments/reading-quality/sourced-clarity-controls.json',import.meta.url)));
test('keeps all old questions, facts, packets and budgets; revises only system instructions in request bodies',()=>{
  expect(plan.base_plan_hash).toBe(sealPlan(base));expect(plan.cases.map(c=>c.id)).toEqual(['month-break','month-combine','void']);
  expect(plan.evaluation).toEqual(CLARITY_RUBRIC);expect(plan.execution_policy.live_executor_available).toBe(false);
  for(const field of ['reserve_cny','reservation_cny_per_million','checked_peak_cny_per_million','input_token_allowance','max_output_tokens','model'])
    expect(plan[field]).toEqual(base[field]);
  const archived=JSON.parse(fs.readFileSync(new URL('../../docs/acceptance/sourced-clarity-20260930/plan.json',import.meta.url)));
  const seal=JSON.parse(fs.readFileSync(new URL('../../docs/acceptance/sourced-clarity-20260930/seal.json',import.meta.url)));
  expect(sealPlan(archived)).toBe(seal.hash);expect(seal.hash).toBe(sealPlan(plan));
  for(const [n,c] of plan.cases.entries()) for(const [i,arm] of c.arms.entries()){
    const old=base.cases[n].arms[i],copy=structuredClone(arm.body);
    expect(arm.body.messages[1]).toEqual(old.body.messages[1]);
    expect(c.evidence).toEqual(base.cases[n].evidence);expect(arm.material).toEqual(old.material);
    expect(copy.messages[0].content).not.toBe(old.body.messages[0].content);
    copy.messages[0]=old.body.messages[0];expect(copy).toEqual(old.body);
    expect(arm.input_bytes_with_allowance).toBeLessThanOrEqual(plan.input_token_allowance);
  }
});
function synthetic(c){const card=c.arms[1].material.packet.cards[0];
  const facts=c.evidence.filter(e=>e.kind==='program_fact'),rules=c.evidence.filter(e=>e.kind==='rule_result');
  return {schema_version:plan.output_version,conclusion:'合成机械检查，不是模型回答。',
    facts:facts.map(e=>({evidence_id:e.id,value:e.value})),rules:rules.map(e=>({evidence_id:e.id,result:e.result})),
    interpretations:[{text:'合成解释。',fact_ids:facts.map(e=>e.id),rule_ids:rules.map(e=>e.id),literature_ids:[card.literature_id],
      applicability:'合成适用性。',uncertainties:['尚未验证。'],source_claims:[
        {literature_id:card.literature_id,field:'/original_text',origin:'source_transcription',quote:card.original_text},
        {literature_id:card.literature_id,field:'/editorial_summary',origin:'modern_editorial',quote:card.editorial_summary}]}],advice:[]};
}
test.each(controls.controls)('retains the semantic limitation in every free-text field: $id',control=>{
  const c=plan.cases.find(c=>c.id===control.case_id);
  for(const example of control.examples) for(const slot of controls.slots){
    const answer=synthetic(c),i=answer.interpretations[0];
    if(slot==='conclusion') answer.conclusion=example.text;
    else if(slot==='advice') answer.advice=[{text:example.text,basis:'general_advice'}];
    else if(slot==='uncertainties') i.uncertainties=[example.text];else i[slot]=example.text;
    const result=checkSourcedOutput(answer,c.evidence,c.arms[1].material.packet);
    // BOTH annotated good and bad prose can link: never advertise a semantic blocker.
    expect(result.mechanical_ok).toBe(true);expect(result.sources[0].free_text_attribution).toBe('unassessed');
    expect(result.production_ready).toBe(false);
  }
});
test('exports the exact API messages and frozen rubric without a credential file; refuses to overwrite',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clarity-export-')),dir=path.join(root,'prepared');
  const script=fileURLToPath(new URL('../../scripts/prepare-sourced-clarity.js',import.meta.url));
  try{
    const result=JSON.parse(execFileSync(process.execPath,[script,dir],{cwd:root,encoding:'utf8'}));
    expect(result.network_calls).toBe(0);expect(result.reservation_made).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dir,'seal.json'))).hash).toBe(sealPlan(plan));
    expect(JSON.parse(fs.readFileSync(path.join(dir,'rubric.json')))).toEqual(CLARITY_RUBRIC);
    for(const c of plan.cases) for(const arm of c.arms)
      expect(fs.readFileSync(path.join(dir,arm.id+'-prompt.txt'),'utf8')).toBe(arm.body.messages[0].content+'\n\n【输入数据】\n'+arm.body.messages[1].content+'\n');
    expect(()=>execFileSync(process.execPath,[script,dir],{cwd:root,stdio:'pipe'})).toThrow();
    const executor=fileURLToPath(new URL('../../scripts/execute-sourced-reading.js',import.meta.url));
    let failure;
    try{execFileSync(process.execPath,[executor,dir],{cwd:root,stdio:'pipe'});}catch(error){failure=error;}
    expect(failure?.stderr.toString()).toContain('Plan/version/date/replay rejected');
    expect(fs.existsSync(path.join(dir,'execution.json'))).toBe(false);
    expect(fs.readdirSync(root)).toEqual(['prepared']);
  }finally{if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)) throw Error('Unexpected cleanup path');fs.rmSync(root,{recursive:true,force:true});}
});
