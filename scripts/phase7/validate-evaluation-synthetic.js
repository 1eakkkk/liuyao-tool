// No model calls: literal synthetic strings only, through every public CLI command.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const parent=path.resolve(process.argv[2]??'test-results/phase7-synthetic-validation');
if(fs.existsSync(parent))throw Error('Never overwrite a validation run; choose a new directory');
fs.mkdirSync(parent,{recursive:true});
const root=path.join(parent,'experiment'),scoring=path.join(parent,'scoring');
const put=(name,v)=>{const p=path.join(parent,name);fs.writeFileSync(p,JSON.stringify(v,null,2));return p;};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const cli=(...args)=>JSON.parse(execFileSync(process.execPath,['scripts/phase7-evaluation.js',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const model={client:'synthetic',label:'synthetic-no-model',version:null,settings:{}};
const prepared=cli('prepare',root,put('synthetic-config.json',{experiment_id:'phase7-synthetic-validation',data_kind:'synthetic',seed:'synthetic-fixed-validation-seed',model}));
cli('verify',root);
const schedule=read(path.join(root,'execution/schedule.json'));
const raw=path.join(parent,'synthetic-answer.txt');fs.writeFileSync(raw,'[SYNTHETIC] 😀 This literal text validates the toolchain only.\r\n');
for(const item of schedule)cli('import',root,put('synthetic-import.json',{case_id:item.case_id,variant:item.variant,data_kind:'synthetic',initial_file:raw,follow_up_file:raw,actual_order:item.order,model:model.label,settings:{},deviations:[]}));
assert.equal(cli('status',root).collected_pairs,24);
cli('scoring',root,scoring);
const file=path.join(scoring,'reviews.json'),reviews=read(file);
for(const r of reviews.reviews){
 r.reviewer_id='synthetic-validator';r.review_status='complete';
 for(const a of r.checklist_assessments){
  a.assessment='omitted';a.reason='Synthetic placeholder does not answer this checklist item; whole turn inspected.';
  r.relevant_omissions.push({finding_id:`${a.checklist_id}-${a.turn}`,turn:a.turn,quotes:[],fact_ids:[],checklist_id:a.checklist_id,source_reference_ids:[],direction_error:false,reason:a.reason});
 }
}
fs.writeFileSync(file,JSON.stringify(reviews,null,2));
const locked=cli('lock',root,file);cli('unblind',root);const result=cli('report',root);
assert.equal(result.status,'synthetic_pipeline_validation');assert.equal(result.effects_conclusion,null);
console.log(JSON.stringify({status:result.status,external_answers:0,freeze_hash:prepared.freeze_hash,lock_hash:locked.lock_hash,report:path.join(root,'report.json')},null,2));
