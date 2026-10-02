import {test,expect} from 'vitest';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../../src/ai/output/context.js';
import {createTaskLedContext,taskLedMessages,taskLedView,validateTaskLedAnswer,TASK_LED_VERSION} from '../../experiments/judgment-review/task-led.js';
import {renderTaskLedPreview} from '../../experiments/judgment-review/task-led-view.js';
async function source(){return buildOutputContext((await prepareJudgmentPlan()).cases[0].canonical,{includeMissingRecords:true});}
const advice=c=>({schema_version:TASK_LED_VERSION,context_id:c.context_id,task:'advice',advice:['先小规模试用，再记录使用反馈。'],limits:['未提供使用反馈，不能确认体验。']});
const trend=c=>({schema_version:TASK_LED_VERSION,context_id:c.context_id,task:'trend',conclusion:{direction:'unclear',answer:'现有依据不足以确认目标是否容易完成。'},focus:[],major_factor_ids:[],counter_factor_ids:[],tradeoff_reason:'尚未建立相关取用与解释，不作单向判断。',factors:[],general_advice:[],uncertainties:['缺少已核实取法，不能确认现实结果。']});
test('fact checks are generated only from explicit program IDs and never become model requests',async()=>{
  const s=await source(),ids=['fact:/hexagram/shi_line','fact:/hexagram/ying_line','fact:/lines/3/moving'];
  const c=await createTaskLedContext(s,'facts',{fact_ids:ids}),v=taskLedView(null,c);
  expect(v.facts.map(x=>x.id)).toEqual(ids);expect(v.facts[0].text).toContain('世爻位置：4');expect(v.network_calls).toBe(0);
  expect(()=>taskLedMessages(c)).toThrow('no model request');expect(()=>validateTaskLedAnswer({},c)).toThrow('not accepted');
  v.facts[0].text='wrong';expect(taskLedView(null,c).facts[0].text).toContain('世爻位置：4');
});
test.each([undefined,[],['fact:/unknown'],['fact:/lines/3/moving','fact:/lines/3/moving'],['rule:LINE-MOVING-001:primary:4:-'],Array.from({length:19},(_,i)=>String(i))])('rejects unsupported or ambiguous fact selection %j',async ids=>{
  await expect(createTaskLedContext(await source(),'facts',{fact_ids:ids})).rejects.toThrow();
});
test('missing record is a program null record, not a prediction of absence',async()=>{
  const s=await source(),entry=s.evidence.find(e=>e.kind==='program_fact'&&e.value===null);
  expect(entry).toBeTruthy();const c=await createTaskLedContext(s,'facts',{fact_ids:[entry.id]});
  expect(taskLedView(null,c).facts[0].text).toMatch(/未记载|无记录/);
});
test('sparse arrays cannot bypass explicit fact selection',async()=>{
  for(const ids of [new Array(1),[, 'fact:/lines/0/moving']])await expect(createTaskLedContext(await source(),'facts',{fact_ids:ids})).rejects.toThrow('Dense');
});
test('advice transmits only question, task, schema and identity; no canonical, chart, history or source identity',async()=>{
  const s=await source(),c=await createTaskLedContext(s,'advice'),payload=JSON.parse(taskLedMessages(c)[1].content);
  expect(Object.keys(payload).sort()).toEqual(['context_id','question','response_schema','task']);
  expect(c).not.toHaveProperty('source_context_id');expect(c).not.toHaveProperty('evidence');expect(c).not.toHaveProperty('input');
  expect(payload.question).toBe(s.input.A_user_question);expect(validateTaskLedAnswer(advice(c),c)).toBeTruthy();
  expect(taskLedView(advice(c),c)).not.toHaveProperty('direction');
});
test.each(['factors','summary','decision','conclusion','facts','general_advice'])('advice rejects extra %s',async field=>{
  const c=await createTaskLedContext(await source(),'advice'),a=advice(c);a[field]=[];
  expect(()=>validateTaskLedAnswer(a,c)).toThrow('unknown_field');
});
test('advice cannot request chart selection, trend cannot use fact-only selection',async()=>{
  for(const task of ['advice','trend'])await expect(createTaskLedContext(await source(),task,{fact_ids:[]})).rejects.toThrow();
});
test('sparse response arrays cannot bypass shape validation',async()=>{
  const c=await createTaskLedContext(await source(),'advice'),a=advice(c);a.advice=new Array(1);
  expect(()=>validateTaskLedAnswer(a,c)).toThrow('Sparse');
  const t=await createTaskLedContext(await source(),'trend'),b=trend(t);b.factors=new Array(1);
  expect(()=>validateTaskLedAnswer(b,t)).toThrow('Sparse');
});
test('cloned source/context and task switching are rejected',async()=>{
  const s=await source();await expect(createTaskLedContext(structuredClone(s),'advice')).rejects.toThrow('Trusted');
  await expect(createTaskLedContext(s,'auto')).rejects.toThrow('explicit');
  const c=await createTaskLedContext(s,'advice');expect(()=>taskLedMessages(structuredClone(c))).toThrow('Untrusted');
  const a=advice(c);a.context_id+='x';expect(()=>validateTaskLedAnswer(a,c)).toThrow('mismatch');
  a.context_id=c.context_id;a.task='trend';expect(()=>validateTaskLedAnswer(a,c)).toThrow();
});
test('trend retains trusted program facts and rule closure, not model values',async()=>{
  const c=await createTaskLedContext(await source(),'trend'),a=trend(c);
  const r=c.evidence.find(e=>e.kind==='rule_result');
  a.factors=[{id:'f1',effect:'conditional',evidence_ids:[r.id,r.source_facts[0]],interpretation:'仅演示关系如何与当前目标建立解释，不推断现实。',assumption:'这是结构样例。',limitation:'未确认相关性。'}];
  const v=taskLedView(a,c);expect(new Set(v.factors[0].source_facts.map(v=>v.id)).size).toBe(v.factors[0].source_facts.length);
  expect(v.factors[0].rules[0].source_ids).toEqual(r.source_facts);expect(v.semantic_acceptance).toBe('unassessed');
  a.factors[0].value='wrong';expect(()=>validateTaskLedAnswer(a,c)).toThrow('unknown_field');
});
test('trend focus must select an actual relative and link directly to selected major factors',async()=>{
  const c=await createTaskLedContext(await source(),'trend'),a=trend(c);
  a.focus=[{evidence_id:'fact:/lines/3/moving',role_hypothesis:'测试非法焦点'}];
  expect(()=>validateTaskLedAnswer(a,c)).toThrow('relative fact');
  a.focus=[{evidence_id:'fact:/lines/3/relative',role_hypothesis:'测试焦点相关性'}];a.conclusion.direction='favorable';
  a.factors=[{id:'f1',effect:'support',evidence_ids:['fact:/lines/3/relative'],interpretation:'这是测试结构。',assumption:'未认证取法。',limitation:'不代表实际有利。'}];
  a.major_factor_ids=['f1'];expect(validateTaskLedAnswer(a,c)).toBe(a);
  a.conclusion.direction='mixed';expect(()=>validateTaskLedAnswer(a,c)).toThrow('opposed major');
  a.major_factor_ids=[];expect(()=>validateTaskLedAnswer(a,c)).toThrow('major factors');
});
test('rendering is flat, safe, preserves previous content when a response is invalid',async()=>{
  const c=await createTaskLedContext(await source(),'advice'),a=advice(c),el=document.createElement('div');
  a.advice=['<img src=x onerror=alert(1)>'];renderTaskLedPreview(el,a,c);expect(el.querySelector('img')).toBeNull();expect(el.textContent).toContain('<img');
  const before=el.innerHTML;a.factors=[];expect(()=>renderTaskLedPreview(el,a,c)).toThrow();expect(el.innerHTML).toBe(before);
});
test('fact preview displays only selected values and no interpretation or direction',async()=>{
  const c=await createTaskLedContext(await source(),'facts',{fact_ids:['fact:/hexagram/shi_line']}),el=document.createElement('div');
  renderTaskLedPreview(el,null,c);expect(el.querySelectorAll('li')).toHaveLength(1);expect(el.textContent).toContain('世爻位置：4');
  expect(el.querySelector('details')).toBeNull();expect(el.textContent).not.toContain('旺');
});
