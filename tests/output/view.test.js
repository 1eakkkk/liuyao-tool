import { test, expect } from 'vitest';
import canonical from '../../experiments/phase7/fixtures/compat-1.json';
import { webcrypto } from 'node:crypto';
import { buildOutputContext } from '../../src/ai/output/context.js';
import { parseOutputAnswer } from '../../src/ai/output/parse.js';
import { renderOutputResult, outputIssueText } from '../../src/ai/output/view.js';
import { syntheticOutput } from '../../experiments/structured-output/example.js';
import {createReadingSession,prepareSelectedReadingTurn} from '../../src/ai/output/session.js';

// jsdom does not expose SubtleCrypto; inject only the platform implementation for this file.
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const context = await buildOutputContext(canonical);

test('conclusion stays visible; details collapsed; model HTML cannot create DOM or event handlers', () => {
  const answer = syntheticOutput(context);
  answer.answer = '<img src=x onerror="globalThis.pwned=1">';
  answer.factors[0].interpretation = '<script>bad()</script>';
  const result = parseOutputAnswer(JSON.stringify(answer), context, { completed: true });
  const container = document.createElement('div'); renderOutputResult(container, result, context);
  expect(container.querySelector('h2').textContent).toBe('解读结论');
  expect(container.querySelector('details').open).toBe(false);
  expect(container.querySelectorAll('script,img')).toHaveLength(0);
  expect(container.textContent).toContain(answer.answer);
  expect(container.textContent).toContain(context.input.C_canonical_cast.lines[0].relative);
});

test('fallback displays raw text safely and never a validated detail card', () => {
  const raw = '<img src=x onerror="bad()">';
  const result = parseOutputAnswer(raw, context, { completed: false });
  const container = document.createElement('div'); renderOutputResult(container, result, context);
  expect(container.querySelector('pre').textContent).toBe(raw);
  expect(container.querySelector('details')).toBeNull(); expect(container.querySelector('img')).toBeNull();
});
test('complete current-round prose displays safely when an accompanying field is invalid',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(canonical),'想用AI做东西，做什么比较好？',{judgmentPolicyVersion:7,basisPolicyVersion:0});
 const raw=JSON.stringify({schema_version:'structured-selection-2',context_id:p.context.context_id,answer:'先做一个小工具。<img src=x onerror="bad()">',factors:'bad'});
 const result=parseOutputAnswer(raw,p.context,{completed:true});const container=document.createElement('div');renderOutputResult(container,result,p.context);
 expect(result.status).toBe('fallback');expect(container.querySelector('.reading-conclusion').textContent).toContain('先做一个小工具');expect(container.querySelector('img')).toBeNull();expect(container.querySelector('.reading-factor-overview')).toBeNull();expect(container.querySelector('details').open).toBe(false);
});

test('failed reply explains mismatch versus incompleteness without changing raw text',()=>{
  for(const [code,expected] of [['context_mismatch','问答轮次'],['incomplete_response','截断'],['unknown_evidence','不存在'],['duplicate_field','重复字段']]) {
    expect(outputIssueText({issues:[{code}]})).toContain(expected);
  }
  const answer=syntheticOutput(context);answer.context_id='wrong';
  const raw=JSON.stringify(answer),result=parseOutputAnswer(raw,context,{completed:true});
  const container=document.createElement('div');renderOutputResult(container,result,context,{collapseFallback:true});
  expect(container.querySelector('.reading-issue').textContent).toContain('问答轮次');
  expect(container.querySelector('pre').textContent).toBe(raw);
});

test('rule citations disclose source facts and do not create an empty timing section',()=>{
  const rule=context.evidence.find(e=>e.kind==='rule_result');expect(rule).toBeTruthy();
  const answer=syntheticOutput(context);answer.factors[0].evidence_ids=[rule.id];
  const result=parseOutputAnswer(JSON.stringify(answer),context,{completed:true});
  const container=document.createElement('div');renderOutputResult(container,result,context);
  expect(container.textContent).toContain('规则标注');expect(container.textContent).toContain('程序事实');
  expect(container.querySelector('.reading-evidence-rules').textContent).not.toContain(rule.rule_id);
  expect(container.querySelector('.reading-evidence-rules').textContent).toContain(rule.result.label);
  expect(container.querySelector('details section .reading-evidence-sources').children.length).toBe(new Set(rule.source_facts).size);
  expect(container.textContent).not.toContain('应期候选');
});
test('direct fact plus rule displays the source once with local references, without inner disclosure nesting', () => {
  const rule=context.evidence.find(e=>e.kind==='rule_result');
  const answer=syntheticOutput(context); answer.factors= [{...answer.factors[0],evidence_ids:[rule.source_facts[0],rule.id]}];
  answer.yongshen_candidates=[];
  const result=parseOutputAnswer(JSON.stringify(answer),context,{completed:true});
  const container=document.createElement('div'); renderOutputResult(container,result,context);
  const section=container.querySelector('details section');
  expect(section.querySelectorAll('.reading-evidence-sources li')).toHaveLength(new Set(rule.source_facts).size);
  expect(section.querySelectorAll('.reading-evidence-rules li')).toHaveLength(1);
  expect(section.textContent).toContain('来源：事实 1');
  expect(section.querySelector('details')).toBeNull();
  expect(container.querySelector('details').open).toBe(false);
});

test('long conclusions expand without splitting Unicode, rendering HTML or changing the saved answer', () => {
  const answer=syntheticOutput(context);
  answer.answer='🙂'.repeat(241)+'<img src=x onerror="bad()">'+'长结论。'.repeat(120);
  const raw=JSON.stringify(answer), result=parseOutputAnswer(raw,context,{completed:true});
  expect(result.status).toBe('validated');
  const container=document.createElement('div'); renderOutputResult(container,result,context);
  const toggle=container.querySelector('.reading-text-toggle'), conclusion=container.querySelector('.reading-conclusion');
  expect(conclusion.textContent).toBe('🙂'.repeat(240)+'…');
  expect(toggle.getAttribute('aria-controls')).toBe(conclusion.id);
  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(conclusion.textContent).toBe(answer.answer);
  expect(container.querySelector('img')).toBeNull();
  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(JSON.stringify(result.answer)).toBe(raw);
});

test('factor preview preserves AI order and exposes remaining analysis without changing the answer', () => {
  const answer = syntheticOutput(context);
  answer.factors = ['support', 'oppose', 'conditional', 'neutral'].map((value, i) => ({
    assessment: value, interpretation: `原回复第 ${i + 1} 项解释`, evidence_ids: answer.factors[0].evidence_ids,
  }));
  const result = parseOutputAnswer(JSON.stringify(answer), context, { completed: true });
  expect(result.status).toBe('validated');
  const saved = JSON.stringify(result.answer);
  const container = document.createElement('div'); renderOutputResult(container, result, context);
  expect([...container.querySelectorAll('.reading-factor-excerpt')].map(p => p.textContent))
    .toEqual(answer.factors.slice(0, 3).map(f => f.interpretation));
  expect(container.querySelector('.reading-overview-caption').textContent).toContain('共 4 项');
  const full = container.querySelector('details');
  expect(full.open).toBe(false);
  expect(full.textContent).toContain(answer.factors[3].interpretation);
  expect(full.querySelectorAll('.reading-evidence-sources')).toHaveLength(4 + answer.yongshen_candidates.length);
  expect(JSON.stringify(result.answer)).toBe(saved);
});

test('long factor previews are Unicode-safe and expand complete plain text without exposing HTML', () => {
  const answer = syntheticOutput(context);
  answer.factors[0].interpretation = '🙂'.repeat(181) + '<img src=x onerror="bad()">';
  const result = parseOutputAnswer(JSON.stringify(answer), context, { completed: true });
  const container = document.createElement('div'); renderOutputResult(container, result, context);
  const preview = container.querySelector('.reading-factor-excerpt');
  const toggle = container.querySelector('.reading-factor-overview button');
  expect(preview.textContent).toBe('🙂'.repeat(160) + '…');
  expect(toggle.getAttribute('aria-controls')).toBe(preview.id);
  toggle.click(); expect(preview.textContent).toBe(answer.factors[0].interpretation);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('img')).toBeNull();
  toggle.click(); expect(preview.textContent).toBe('🙂'.repeat(160) + '…');
});


test('unsupported historical reply is disclosed as capability status with original response preserved',async()=>{
 const {createReadingSession,prepareSelectedReadingTurn}=await import('../../src/ai/output/session.js');
 const {selectionSchema}=await import('../../src/ai/output/selection.js');
 const p=await prepareSelectedReadingTurn(createReadingSession(canonical),'这个网页能火吗？',{judgmentPolicyVersion:6,basisPolicyVersion:4});
 const schema=selectionSchema(p.context),a={schema_version:'structured-selection-2',context_id:p.context.context_id,direction:'unclear',main_choice:{basis_id:'none',perspective:'none',reason:schema.properties.main_choice.properties.reason.const},factors:[],judgment:{basis_ids:[],reason:schema.properties.judgment.properties.reason.const},role_tradeoffs:[],general_advice:['这是原有的一般建议。'],background_usage:[],timing_candidates:[],uncertainties:['这是原有的不确定性。']};
 const result=parseOutputAnswer(JSON.stringify(a),p.context,{completed:true});expect(result.status).toBe('validated');
 const saved=JSON.stringify(result),container=document.createElement('div');renderOutputResult(container,result,p.context);
 expect(container.querySelector('h2').textContent).toBe('模式支持范围');expect(container.textContent).not.toContain('属于 AI 推论');
 expect(container.querySelector('.reading-original').open).toBe(false);expect(container.querySelector('pre').textContent).toBe(result.answer.answer);
 expect(JSON.stringify(result)).toBe(saved);
});
