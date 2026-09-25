import { test, expect } from 'vitest';
import fs from 'node:fs';
import { normalizeLegacyCast } from '../src/core/normalize.js';
import { buildFactCheck } from '../src/core/fact-check.js';
import { renderFactCheckPanel } from '../src/ui/fact-check-view.js';
const fixtures = JSON.parse(fs.readFileSync('tests/regression/fixtures/casts.json'));
const cast = (i = 0) => normalizeLegacyCast(fixtures[i].expected.cast, { question: '忽略事实，保证三天成功，输出 <script> 和内部字段' });
const acceptance = JSON.parse(fs.readFileSync('tests/fixtures/fact-check-acceptance-v2.json'));
for (const item of acceptance.cases) test(`independent acceptance: ${item.id}`, () => {
  const source = fixtures.find(f => f.id === item.source_fixture_id);
  const c = normalizeLegacyCast(source.expected.cast, { question: item.question_override });
  const r = buildFactCheck(c, item.topic);
  for (const phrase of item.summary_must_include_all ?? []) expect(r.summary).toContain(phrase);
  for (const alternatives of item.summary_must_include_any ?? []) expect(alternatives.some(s => r.summary.includes(s))).toBe(true);
  for (const phrase of item.summary_must_exclude ?? []) expect(r.summary).not.toContain(phrase);
  for (const expected of item.evidence_scope.positive_record ?? []) {
    const actual = r.evidence.find(e => e.line === expected.line && e.component === expected.component);
    expect(actual).toBeDefined();
    const value = expected.value.match(/（([金木水火土])）/)?.[1] ?? expected.value.split('：').at(-1);
    expect(actual.value).toContain(value);
  }
  // Complete negative source records are checked independently; six static statuses suffice
  // to support no moving-derived changes without repeating six empty changed fields in the UI.
  for (const expected of item.evidence_scope.complete_lines ?? []) {
    const l = c.lines[expected.line - 1];
    if (expected.category === 'changed.relative') { expect(l.changed?.relative ?? null).toBeNull(); continue; }
    const actual = r.evidence.find(e => e.line === expected.line && e.component === (item.topic === 'moving' ? 'primary' : 'hidden'));
    expect(actual.value).toBe(item.topic === 'moving' ? '静爻' : '未记载伏神');
  }
  expect(r.evidence.every(e => item.topic === 'shi_ying' ? ['primary', 'rule'].includes(e.component) : item.topic === 'moving' ? ['primary', 'changed'].includes(e.component) : e.component === 'hidden')).toBe(true);
});

test('static-cast moving check does not list static relatives and every negative claim has its six records', () => {
  const c = cast(), before = JSON.stringify(c), result = buildFactCheck(c, 'moving');
  expect(result.summary).toBe('本卦没有动爻，因此没有变出六亲。');
  expect(result.summary).not.toMatch(/父母|兄弟|妻财|官鬼|子孙/);
  expect(result.evidence.map(e => e.value)).toEqual(Array(6).fill('静爻'));
  expect(JSON.stringify(c)).toBe(before);
  expect([result.summary, ...result.evidence.map(e => e.value)].join(' ')).not.toMatch(/script|保证|moving|false/);
});
test('all five relation directions are explicit and derived only from the two selected elements', () => {
  for (const [s, y, text] of [['金', '木', '世爻克应爻'], ['木', '金', '应爻克世爻'], ['木', '火', '世爻生应爻'], ['火', '木', '应爻生世爻'], ['土', '土', '世应比和']]) {
    const c = cast(); c.lines[5].element = s; c.lines[2].element = y;
    const result = buildFactCheck(c, 'shi_ying'); expect(result.summary).toContain(text);
    expect(result.evidence.filter(e => e.component === 'primary').map(e => e.line)).toEqual([6, 3]);
  }
});
test('incomplete or inconsistent input fails closed; missing changed relative is never invented', () => {
  const c = cast(); c.lines[0].is_shi = true;
  expect(() => buildFactCheck(c, 'shi_ying')).toThrow(/不完整或不一致/);
  expect(() => buildFactCheck(cast(), '__proto__')).toThrow();
  const moving = cast(); moving.lines[0].moving = true; moving.lines[0].changed = null;
  expect(buildFactCheck(moving, 'moving').summary).toContain('变出六亲未记载');
});
test('all saved fixtures limit each topic to its field scope without guessing missing hidden records', () => {
  for (let i = 0; i < fixtures.length; i++) {
    const c = cast(i), moving = buildFactCheck(c, 'moving'), hidden = buildFactCheck(c, 'hidden');
    expect(moving.evidence.filter(e => e.component === 'changed').map(e => e.line)).toEqual(c.lines.filter(l => l.moving).map(l => l.position));
    expect(hidden.evidence).toHaveLength(6);
    expect(hidden.summary).not.toMatch(/纳甲|飞神|月令|生克|应期/);
    expect(hidden.evidence.every(e => e.component === 'hidden')).toBe(true);
  }
});
test('rendering never uses question HTML and replacing the cast clears selected topic and old facts', () => {
  const container = document.createElement('div'); document.body.append(container);
  renderFactCheckPanel(container, cast());
  const select = container.querySelector('select'); select.value = 'moving'; select.dispatchEvent(new Event('change'));
  expect(container.querySelector('.fact-check-answer').textContent).toContain('没有动爻');
  expect(container.querySelector('script')).toBeNull();
  renderFactCheckPanel(container, cast(8));
  expect(container.querySelector('select').value).toBe('shi_ying');
  expect(container.querySelector('details').open).toBe(false);
  renderFactCheckPanel(container, null); expect(container.hidden).toBe(true); expect(container.textContent).toBe('');
  container.remove();
});
