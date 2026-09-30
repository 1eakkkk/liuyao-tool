// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sealPlan} from '../../experiments/reading-quality/knowledge-pairs.js';
import {prepareBoundPairs,boundInstructions} from '../../experiments/reading-quality/bound-pairs.js';
import {buildSourceCatalog} from '../../experiments/reading-quality/source-bindings.js';
import {checkBoundOutput,BOUND_OUTPUT_VERSION} from '../../experiments/reading-quality/bound-reading.js';
import {checkSourcedOutput} from '../../experiments/reading-quality/sourced-output.js';
import {prepareClarityPairs} from '../../experiments/reading-quality/sourced-clarity.js';
const plan=await prepareBoundPairs(),old=await prepareClarityPairs();
const c=plan.cases[1],packet=c.arms[1].material.packet;
test('reproduces the archived offline inputs and exports identical API messages without overwriting a run',()=>{
  const archive=new URL('../../docs/acceptance/bound-reading-20261001/',import.meta.url);
  const frozen=JSON.parse(fs.readFileSync(new URL('plan.json',archive),'utf8'));
  const seal=JSON.parse(fs.readFileSync(new URL('seal.json',archive),'utf8'));
  expect(frozen).toEqual(plan);expect(seal.hash).toBe(sealPlan(plan));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'liuyao-bound-offline-'));
  const output=path.join(root,'prepared');
  try{
    const run=()=>spawnSync(process.execPath,['scripts/prepare-bound-reading.js',output],{encoding:'utf8'});
    const first=run();expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({network_calls:0,reservation_made:false,plan_hash:seal.hash});
    expect(JSON.parse(fs.readFileSync(path.join(output,'plan.json'),'utf8'))).toEqual(plan);
    for(const c of plan.cases)for(const arm of c.arms)
      expect(fs.readFileSync(path.join(output,arm.id+'-prompt.txt'),'utf8')).toBe(arm.body.messages[0].content+'\n\n【输入数据】\n'+arm.body.messages[1].content+'\n');
    expect(run().status).not.toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(output,'seal.json'),'utf8')).hash).toBe(seal.hash);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
function answer(c,withLiterature=true){
  const p=c.arms[Number(withLiterature)].material.packet,catalog=buildSourceCatalog(p);
  const selected=catalog.items.filter(x=>x.field==='/original_text'||x.field.startsWith('/exclusions/'));
  const facts=c.evidence.filter(e=>e.kind==='program_fact'),rules=c.evidence.filter(e=>e.kind==='rule_result');
  return {schema_version:BOUND_OUTPUT_VERSION,source_catalog_hash:catalog.catalog_hash,conclusion:'合成字段连接，不是模型验收。',
    facts:facts.map(e=>({evidence_id:e.id,value:e.value})),rules:rules.map(e=>({evidence_id:e.id,result:e.result})),
    interpretations:[{text:'仅解释当前标注。',fact_ids:facts.map(e=>e.id),rule_ids:rules.map(e=>e.id),
      literature_ids:p.cards.map(c=>c.literature_id),source_ids:selected.map(x=>x.source_id),
      applicability:{program:'当前程序事实符合规则。',editorial:selected.filter(x=>x.origin==='modern_editorial').map(x=>({source_id:x.source_id,explanation:'本条现代条件需单独核对。'}))},uncertainties:['语义尚未验收。']}],advice:[]};
}
test.each(plan.cases)('resolves selected fields from the complete background without forcing all fields as evidence: $id',c=>{
  const a=answer(c),before=JSON.stringify(a),p=c.arms[1].material.packet,result=checkBoundOutput(a,c.evidence,p);
  expect(result.mechanical_ok).toBe(true);expect(JSON.stringify(a)).toBe(before);
  const catalog=buildSourceCatalog(p);expect(result.source_background).toEqual(catalog);
  expect(result.bindings[0].sources).toHaveLength(a.interpretations[0].source_ids.length);
  expect(result.bindings[0].sources.length).toBeLessThan(catalog.items.length);
  for(const note of result.bindings[0].editorial){
    expect(note.label).toBe('现代整理（不是古籍原文）');
    expect(note.text).toBe(catalog.items.find(x=>x.source_id===note.source_id).text);
  }
  expect(result.background_is_not_used_evidence).toBe(true);expect(result.production_ready).toBe(false);
});
test('binds both month-combine exclusion fields individually and preserves source evaluation in the background',()=>{
  const result=checkBoundOutput(answer(c),c.evidence,packet);
  expect(result.bindings[0].editorial.map(x=>x.field)).toEqual(['/exclusions/statements/0','/exclusions/statements/1']);
  expect(result.source_background.items.find(x=>x.field==='/original_text').text).toContain('有用');
});
test.each(['missing_note','unknown_id','wrong_card','original_as_editorial','undeclared_note','duplicate_note','invented_origin','wrong_hash','extra_claims'])('rejects broken source bindings: %s',kind=>{
  const a=answer(c),i=a.interpretations[0];
  if(kind==='missing_note')i.applicability.editorial.pop();
  if(kind==='unknown_id')i.source_ids[0]='literature:unknown#/original_text';
  if(kind==='wrong_card')i.literature_ids=[];
  if(kind==='original_as_editorial')i.applicability.editorial[0].source_id=i.source_ids[0];
  if(kind==='undeclared_note')i.source_ids.pop();
  if(kind==='duplicate_note')i.applicability.editorial.push({...i.applicability.editorial[0]});
  if(kind==='invented_origin')i.applicability.editorial[0].origin='source_transcription';
  if(kind==='wrong_hash')a.source_catalog_hash='sha256:wrong';
  if(kind==='extra_claims')i.source_claims=[];
  expect(()=>checkBoundOutput(a,c.evidence,packet)).toThrow();
});
test('detects reordered conditions and changed citation context instead of reusing old field positions',()=>{
  const a=answer(c),p=structuredClone(packet);p.cards[0].exclusions.statements.reverse();
  expect(()=>checkBoundOutput(a,c.evidence,p)).toThrow('source context mismatch');
  const q=structuredClone(packet);q.cards[0].citation={...q.cards[0].citation,notes:'edited citation'};
  expect(()=>checkBoundOutput(a,c.evidence,q)).toThrow('source context mismatch');
});
test('keeps no-literature replies valid and distinguishes unspecified exceptions from absent exceptions',()=>{
  expect(checkBoundOutput(answer(c,false),c.evidence,c.arms[0].material.packet).mechanical_ok).toBe(true);
  const status=buildSourceCatalog(packet).statuses.find(s=>s.field==='exceptions');
  expect(status.status).toBe('none_stated');expect(status.label).toBe('当前材料未说明');
  const p=structuredClone(packet);p.cards[0].exceptions.statements=['未声明的例外'];
  expect(()=>buildSourceCatalog(p)).toThrow('Unstated');
});
test('does not pass off linked editorial notes or unmarked prose as semantic attribution checks',()=>{
  const a=answer(c);a.interpretations[0].applicability.program='古籍原文规定本次不得判断效力。';
  a.interpretations[0].applicability.editorial[0].explanation='古籍原文规定这个现代限制。';
  const result=checkBoundOutput(a,c.evidence,packet);
  expect(result.mechanical_ok).toBe(true);expect(result.bindings[0].free_text_attribution).toBe('unassessed');
  expect(result.bindings[0].undeclared_source_mentions).toBe('unassessed');expect(result.production_ready).toBe(false);
});
test('rejects specified conditions with no statements and sparse statement arrays',()=>{
  const p=structuredClone(packet);p.cards[0].exclusions.statements=[];
  expect(()=>buildSourceCatalog(p)).toThrow('Specified conditions have no statements');
  const q=structuredClone(packet);delete q.cards[0].exclusions.statements[0];
  expect(()=>buildSourceCatalog(q)).toThrow('Source text missing');
});
test('preserves complete program-owned citation metadata independently of the input object',()=>{
  const p=structuredClone(packet),catalog=buildSourceCatalog(p);
  expect(catalog.citations[0].citation).toEqual(p.cards[0].citation);
  const before=structuredClone(catalog.citations[0].citation);
  p.cards[0].citation.notes='changed after catalog construction';
  expect(catalog.citations[0].citation).toEqual(before);
});
test('supports a referenced editorial summary without pretending it is a condition',()=>{
  const a=answer(c),item=buildSourceCatalog(packet).items.find(x=>x.field==='/editorial_summary');
  a.interpretations[0].source_ids.push(item.source_id);
  a.interpretations[0].applicability.editorial.push({source_id:item.source_id,explanation:'该摘要的含义需要与本段关系分开核对。'});
  const result=checkBoundOutput(a,c.evidence,packet);
  expect(result.bindings[0].editorial.at(-1).field).toBe('/editorial_summary');
  expect(result.bindings[0].semantic_support).toBe('unassessed');
  expect(boundInstructions()).not.toContain('不能只附 original_text 的引文');
  expect(boundInstructions()).toContain('不把摘要自动当作适用条件');
});
test('preserves the old protocol and only adds the program catalog to the frozen question input',()=>{
  for(const [n,c] of plan.cases.entries())for(const [k,arm] of c.arms.entries()){
    const input=JSON.parse(arm.body.messages[1].content),before=JSON.parse(old.cases[n].arms[k].body.messages[1].content);
    expect(input.source_catalog).toEqual(buildSourceCatalog(input.literature_packet));delete input.source_catalog;
    expect(input).toEqual(before);expect(c.evidence).toEqual(old.cases[n].evidence);
    expect(arm.input_bytes_with_allowance).toBeLessThanOrEqual(plan.input_token_allowance);
  }
  expect(()=>checkSourcedOutput(answer(c),c.evidence,packet)).toThrow('Unknown sourced output');
});
