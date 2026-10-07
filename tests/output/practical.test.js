// @vitest-environment node
import fs from 'node:fs';
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession,readingExport} from '../../src/ai/output/session.js';
import {selectionSchema} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {readingAvailability} from '../../src/ai/output/availability.js';
import {strictReadingRequest} from '../../src/ai/output/strict-transport.js';
const canonical=JSON.parse(fs.readFileSync('experiments/phase7/fixtures/compat-1.json'));
const prepare=q=>prepareSelectedReadingTurn(createReadingSession(canonical),q,{judgmentPolicyVersion:7,basisPolicyVersion:0});
const reply=p=>({schema_version:'structured-selection-2',context_id:p.context.context_id,answer:'象意上偏有利，适合继续小步推进；关键在于保持当前节奏，并留意变化带来的牵制。这不是对实际结果的保证。',direction:'favorable',main_choice:{basis_id:'l1',reason:'观察自身与目标的关系，解释这个观察角度为何有关。'},factors:[{basis_ids:['l1'],assessment:'support',interpretation:'以这个观察对象的条件作为推进的支持角度，不代表已核实实际能力。'}],background_usage:[],timing_candidates:[],uncertainties:['实际结果还取决于行动。']});
test('varied goals and static charts receive complete catalog, no admission preflight or forced unclear',async()=>{
 for(const q of ['我要不要继续做这个项目？','我的王者万象棋段位能到王者吗？','今晚还能出去散步吗？','我买的彩票有希望中奖吗？']){
  const p=await prepare(q),input=JSON.parse(p.messages[1].content),schema=selectionSchema(p.context);
  expect(readingAvailability(p.context).blocked).toBe(false);expect(input.chart.lines).toHaveLength(6);expect(input.bases.length).toBeGreaterThan(6);
  expect(input.admitted_mappings).toBeUndefined();expect(schema.properties.direction.enum).toContain('favorable');
  expect(parseOutputAnswer(JSON.stringify(reply(p)),p.context,{completed:true}).status).toBe('validated');expect(readingExport(p)).toContain(p.messages[0].content);
 }
});
test('bad IDs, mismatched context and invalid labels still fail; valid symbolic inference is allowed',async()=>{
 const p=await prepare('这个计划能推进吗？'),a=reply(p);
 for(const mutate of [r=>r.context_id='wrong',r=>r.factors[0].basis_ids=['fake'],r=>r.factors[0].assessment='invalid']){const r=structuredClone(a);mutate(r);expect(parseOutputAnswer(JSON.stringify(r),p.context,{completed:true}).status).toBe('fallback');}
 const input=JSON.parse(p.messages[1].content),relation=input.bases.find(e=>e.id.startsWith('e'));if(relation){a.factors[0].basis_ids=[relation.id];expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('validated');}
});
test('factor label balance does not block the answer; unsolicited timing is not shown',async()=>{
 const p=await prepare('今晚能出去散步吗？'),r=reply(p);r.direction='mixed';r.factors[0].assessment='conditional';
 r.timing_candidates=[{candidate:'亥时',basis_id:'l1',reason:'未经用户请求的时间猜测'}];
 const parsed=parseOutputAnswer(JSON.stringify(r),p.context,{completed:true});expect(parsed.status).toBe('validated');expect(parsed.answer.timing_candidates).toEqual([]);
});
test('new API, export and restored history share policy seven; old requests are not changed',async()=>{
 const s=createReadingSession(canonical),p=await prepareSelectedReadingTurn(s,'这个计划能推进吗？',{judgmentPolicyVersion:7,basisPolicyVersion:0});
 appendReadingTurn(s,p,JSON.stringify(reply(p)),true,'external');const restored=await restoreReadingSession(serializeReadingSession(s));expect(restored.session.judgmentPolicyVersion).toBe(7);expect(restored.session.turns[0].result.status).toBe('validated');expect(restored.session.turns[0].context.context_id).toBe(p.context.context_id);
 expect(strictReadingRequest(p).body.tools[0].function.strict).toBe(true);
});
test('combined whole-line references display without the legacy twelve-reference limit',async()=>{
 const p=await prepare('这个项目能推进吗？'),r=reply(p);
 r.factors[0].basis_ids=['l1','l2','l3','l4'];
 const parsed=parseOutputAnswer(JSON.stringify(r),p.context,{completed:true});
 expect(parsed.status).toBe('validated');expect(parsed.answer.factors[0].evidence_ids.length).toBeGreaterThan(12);
 r.uncertainties=[];expect(parseOutputAnswer(JSON.stringify(r),p.context,{completed:true}).status).toBe('fallback');
});
