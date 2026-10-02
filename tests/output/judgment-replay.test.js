// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test,expect,afterEach} from 'vitest';
import {replayJudgmentReview} from '../../experiments/judgment-review/replay.js';
import {prepareJudgmentCandidate} from '../../experiments/judgment-review/candidate.js';
import {prepareJudgmentPlan,planHash} from '../../experiments/judgment-review/plan.js';
const fixture='docs/acceptance/judgment-live-20261002',dirs=[];
afterEach(()=>{for(const d of dirs.splice(0))fs.rmSync(d,{recursive:true,force:true});});
function copy(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'judgment-review-'));dirs.push(dir);for(const f of fs.readdirSync(fixture))fs.copyFileSync(path.join(fixture,f),path.join(dir,f));return dir;}
test('real development failures replay with exact quotes; mechanical validation is not semantic acceptance',async()=>{
  const r=await replayJudgmentReview(fixture);expect(r.quote_integrity).toBe('passed');expect(r.semantic_acceptance).toBe('not_established');
  expect(r.cases.map(c=>c.model_direction)).toEqual(['unfavorable','mixed']);
  expect(r.cases.every(c=>c.mechanical==='validated'&&c.dimensions.facts.conservative_status==='fail')).toBe(true);
  expect(r.cases[0].dimensions.priority.conservative_status).toBe('uncertain');
  expect(r.forecast_accuracy).toBe('unassessed');expect(r.overall_improvement).toBe('unassessed');
});
test.each(['reply','quote','field','evidence','criteria','missing_dimension','reviewer_identity','sse'])('record tampering is rejected: %s',async kind=>{
  const dir=copy(),file=path.join(dir,'reviewer-a.json'),r=JSON.parse(fs.readFileSync(file));
  const d=r.cases[0].dimensions.facts;
  if(kind==='reply')fs.appendFileSync(path.join(dir,'game-rank-response.txt'),' ');
  if(kind==='quote')d.quotes[0].start++;
  if(kind==='field')d.quotes[0].field='uncertainties.0';
  if(kind==='evidence')d.evidence_ids=['fact:/missing'];
  if(kind==='criteria')r.review_criteria[0].requirement='changed';
  if(kind==='missing_dimension')delete r.cases[0].dimensions.support;
  if(kind==='reviewer_identity')r.reviewer_id='agent-b';
  if(kind==='sse')fs.appendFileSync(path.join(dir,'game-rank-raw.sse'),'data: extra\n\n');
  fs.writeFileSync(file,JSON.stringify(r));await expect(replayJudgmentReview(dir)).rejects.toThrow();
});
test('compact candidate is offline, preserves full user data, and changes no production request',async()=>{
  const base=await prepareJudgmentPlan(),before=planHash(base),candidate=await prepareJudgmentCandidate();
  expect(candidate.production).toBe(false);expect(candidate.live_execution_available).toBe(false);expect(candidate.network_calls).toBe(0);
  expect(candidate.base_plan_hash).toBe(before);expect(planHash(await prepareJudgmentPlan())).toBe(before);
  expect(candidate.reading_prompt).not.toBe(base.reading_prompt);expect(candidate.source_reading_prompt).toBe(base.reading_prompt);
  expect(candidate.stop_policy).toContain('zero network calls');
  expect(candidate.reserve_cny).toBeGreaterThan(0);expect(candidate.budget_reserved).toBe(false);
  for(const [i,c]of candidate.cases.entries()){
    expect(c.body.messages[1]).toEqual(base.cases[i].body.messages[1]);
    expect(c.body.messages[0].content).toContain('每段先选本段实际需要的引用');
    expect(c.body.messages[0].content).toContain('不知道游戏机制就不给机制相关建议');
    expect(c.body.messages[0].content.length).toBeLessThan(base.cases[i].body.messages[0].content.length);
    expect(c.body.max_tokens).toBe(8192);
  }
});
test('identical phrase in a different field cannot borrow its raw offsets',async()=>{
  const dir=copy(),file=path.join(dir,'reviewer-a.json'),r=JSON.parse(fs.readFileSync(file));
  const raw=fs.readFileSync(path.join(dir,'game-rank-response.txt'),'utf8'),text='第5爻官鬼酉金发动且';
  const start=raw.indexOf(text);expect(start).toBeGreaterThan(0);
  r.cases[0].dimensions.facts.quotes[0]={field:'factors.1.interpretation',start,end:start+text.length,text};
  fs.writeFileSync(file,JSON.stringify(r));await expect(replayJudgmentReview(dir)).rejects.toThrow('offset belongs');
});
test('internally consistent replacement archive hashes do not disconnect SSE from the actual reply',async()=>{
  const dir=copy(),bytes=Buffer.from('data: [DONE]\n\n'),archiveFile=path.join(dir,'game-rank-archive.json'),checkFile=path.join(dir,'game-rank-check.json');
  const archive=JSON.parse(fs.readFileSync(archiveFile)),check=JSON.parse(fs.readFileSync(checkFile));
  archive.bytes=bytes.length;archive.sha256=createHash('sha256').update(bytes).digest('hex');
  const {http_status,...metadata}=archive;check.archive=metadata;
  fs.writeFileSync(archiveFile,JSON.stringify(archive));fs.writeFileSync(checkFile,JSON.stringify(check));fs.writeFileSync(path.join(dir,'game-rank-raw.sse'),bytes);
  await expect(replayJudgmentReview(dir)).rejects.toThrow('SSE replay differs');
});
