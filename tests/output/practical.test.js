// @vitest-environment node
import fs from 'node:fs';
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession,readingExport} from '../../src/ai/output/session.js';
import {selectionSchema} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {readingAvailability} from '../../src/ai/output/availability.js';
import {strictReadingRequest,parseStrictReadingResponse} from '../../src/ai/output/strict-transport.js';
const canonical=JSON.parse(fs.readFileSync('experiments/phase7/fixtures/compat-1.json'));
const prepare=q=>prepareSelectedReadingTurn(createReadingSession(canonical),q,{judgmentPolicyVersion:7,basisPolicyVersion:0});
const reply=p=>({schema_version:'structured-selection-2',context_id:p.context.context_id,answer:'象意上偏有利，适合继续小步推进；关键在于保持当前节奏，并留意变化带来的牵制。这不是对实际结果的保证。',direction:'favorable',main_choice:{basis_id:'l1',reason:'观察自身与目标的关系，解释这个观察角度为何有关。'},factors:[{basis_ids:['l1'],assessment:'support',interpretation:'以这个观察对象的条件作为推进的支持角度，不代表已核实实际能力。'}],background_usage:[],timing_candidates:[],uncertainties:['实际结果还取决于行动。']});
test('varied goals and static charts receive complete catalog, no admission preflight or forced unclear',async()=>{
 for(const q of ['我要不要继续做这个项目？','我现在想用ai做东西，帮我算一下我做什么比较好？','我的王者万象棋段位能到王者吗？','今晚还能出去散步吗？','我买的彩票有希望中奖吗？','我昨日运势如何？','我能活多久，我很焦虑','只核对世应五行','只给两条建议','仅知道这个名字，尚未提供玩法规则，帮我看看方向']){
  const p=await prepare(q),input=JSON.parse(p.messages[1].content),schema=selectionSchema(p.context);
  expect(readingAvailability(p.context).blocked).toBe(false);expect(input.chart.lines).toHaveLength(6);expect(input.bases.length).toBeGreaterThan(6);
  expect(input.admitted_mappings).toBeUndefined();expect(schema.properties.direction.enum).toContain('favorable');
  expect(parseOutputAnswer(JSON.stringify(reply(p)),p.context,{completed:true}).status).toBe('validated');expect(readingExport(p)).toContain(p.messages[0].content);
 }
});
test('complete current-round prose survives side-field failures, persists and continues as unchecked context',async()=>{
 const s=createReadingSession(canonical),p=await prepareSelectedReadingTurn(s,'我现在想用ai做东西，做什么比较好？',{judgmentPolicyVersion:7,basisPolicyVersion:0});
 const a=reply(p);a.factors[0].basis_ids=['missing'];
 const t=appendReadingTurn(s,p,JSON.stringify(a),true,'external');expect(t.result.status).toBe('fallback');expect(t.result.readable_answer).toBe(a.answer);expect(t.result.answer).toBeNull();
 const restored=await restoreReadingSession(serializeReadingSession(s));expect(restored.session.turns[0].result.readable_answer).toBe(a.answer);
 const next=await prepareSelectedReadingTurn(s,'请继续解释');const input=JSON.parse(next.messages[1].content);expect(input.conversation.history[0].checked).toBe(false);expect(input.conversation.history[0].answer).toBe(a.answer);
 for(const [raw,completed]of [[JSON.stringify({...a,context_id:'wrong'}),true],[JSON.stringify(a),false],[JSON.stringify(a).slice(0,-1),true],['{"answer":"one","answer":"two"}',true]])expect(parseOutputAnswer(raw,p.context,{completed}).readable_answer).toBeUndefined();
 const packet={choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:'解读如下',tool_calls:[{id:'one',type:'function',function:{name:'submit_reading',arguments:JSON.stringify(a)}}]}}]};expect(parseStrictReadingResponse(packet,p.context).result.readable_answer).toBe(a.answer);
});
test('quality disagreements are not program vetoes for current readings',async()=>{
 const p=await prepare('请解卦'),a=reply(p);const line=p.context.input.C_canonical_cast.lines[0];
 a.answer=`第一爻为${line.moving?'静':'动'}爻。模型对它的解释应展示供用户对照。`;
 expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('validated');
 a.factors=Array.from({length:5},(_,i)=>({...a.factors[0],interpretation:`解释${i}`}));a.uncertainties=[];
 expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('validated');
});
test('a complete prose prefix survives damaged optional JSON without repairing the response',async()=>{
 const p=await prepare('用 AI 做什么比较好？'),a=reply(p);
 const raw=JSON.stringify(a).replace('"direction":"favorable"','"direction":"这里有"坏引号""');
 const result=parseOutputAnswer(raw,p.context,{completed:true});expect(result.status).toBe('fallback');expect(result.readable_answer).toBe(a.answer);expect(result.answer).toBeNull();expect(result.display_text).toBe(raw);
 for(const bad of [raw.slice(0,-1),raw.replace(p.context.context_id,'other'),raw.replace(/}$/,',"\\u0061nswer":"other"}'),raw.replace('象意上偏有利','象意上"坏引号')])expect(parseOutputAnswer(bad,p.context,{completed:true}).readable_answer).toBeUndefined();
 expect(parseOutputAnswer(raw,p.context,{completed:false}).readable_answer).toBeUndefined();
});
test('bad IDs, mismatched context and invalid labels still fail; valid symbolic inference is allowed',async()=>{
 const p=await prepare('这个计划能推进吗？'),a=reply(p);
 for(const mutate of [r=>r.context_id='wrong',r=>r.factors[0].basis_ids=['fake'],r=>r.factors[0].assessment='invalid']){const r=structuredClone(a);mutate(r);expect(parseOutputAnswer(JSON.stringify(r),p.context,{completed:true}).status).toBe('fallback');}
 const input=JSON.parse(p.messages[1].content),relation=input.bases.find(e=>e.id.startsWith('e'));if(relation){a.factors[0].basis_ids=[relation.id];expect(parseOutputAnswer(JSON.stringify(a),p.context,{completed:true}).status).toBe('validated');}
});
test('factor label balance and timing selection are left to the model',async()=>{
 const p=await prepare('今晚能出去散步吗？'),r=reply(p);r.direction='mixed';r.factors[0].assessment='conditional';
 r.timing_candidates=[{candidate:'亥时',basis_id:'l1',reason:'未经用户请求的时间猜测'}];
 const parsed=parseOutputAnswer(JSON.stringify(r),p.context,{completed:true});expect(parsed.status).toBe('validated');expect(parsed.answer.timing_candidates[0].candidate).toBe('亥时');
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
 r.uncertainties=[];expect(parseOutputAnswer(JSON.stringify(r),p.context,{completed:true}).status).toBe('validated');
});
test('all valid catalog references, duplicates and an empty reference list keep the answer visible',async()=>{
 const p=await prepare('我昨日运势如何？'),catalog=JSON.parse(p.messages[1].content).bases;
 for(const ids of [catalog.map(b=>b.id),['l1','l2','l3','l4','l5','l6'],['l1','l1'],[]]){
  const r=reply(p);r.factors[0].basis_ids=ids;
  const parsed=parseOutputAnswer(JSON.stringify(r),p.context,{completed:true});expect(parsed.status).toBe('validated');expect(parsed.answer.answer).toBe(r.answer);
  if(!ids.length){expect(parsed.answer.factors[0].evidence_ids).toEqual([]);expect(parsed.answer.factors[0].interpretation).not.toContain('程序依据');}
 }
 const bad=reply(p);bad.factors[0].basis_ids=['invented'];expect(parseOutputAnswer(JSON.stringify(bad),p.context,{completed:true}).status).toBe('fallback');
});
