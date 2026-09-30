import { test, expect } from 'vitest';
import canonical from '../../experiments/phase7/fixtures/compat-1.json';
import { webcrypto } from 'node:crypto';
import { buildOutputContext } from '../../src/ai/output/context.js';
import { parseOutputAnswer } from '../../src/ai/output/parse.js';
import { renderOutputResult, outputIssueText } from '../../src/ai/output/view.js';
import { syntheticOutput } from '../../experiments/structured-output/example.js';

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
