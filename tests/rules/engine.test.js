import { test, expect } from 'vitest';
import fixture from './fixtures/rule-cases.json';
import legacy from '../regression/fixtures/casts.json';
import staticFixtures from '../regression/fixtures/static-casts.json';
import { normalizeLegacyCast } from '../../src/core/normalize.js';
import { evaluateRules, readEvidencePath } from '../../src/rules/engine.js';
import { RULES } from '../../src/rules/registry.js';
import { assertRuleResult } from '../../src/rules/schema.js';
import { buildCanonicalCast } from '../../src/core/normalize.js';
import { lineFromSum } from '../../src/core/physics.js';
import { JIAZI60 } from '../../src/core/constants.js';
import { buildYearMonthHourPillars, buildDateDisplayText } from '../../src/core/ganzhi.js';
function patched(patch = {}) {
  const cast = normalizeLegacyCast(legacy[0].expected.cast, { question: '规则测试', createdAt: 0 });
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.slice(1).split('/'), last = keys.pop(); let obj = cast;
    for (const key of keys) obj = obj[key] ??= {};
    obj[last] = structuredClone(value);
  }
  return cast;
}
const has = (cast, id, line) => evaluateRules(cast).hits.some(hit => hit.rule_id === id && hit.target.line === line);
for (const row of fixture.cases) test(`${row.rule_id}: explicit positive and negative`, () => {
  expect(has(patched(row.positive), row.rule_id, row.target_line)).toBe(true);
  expect(has(patched(row.negative), row.rule_id, row.target_line)).toBe(false);
  assertRuleResult(evaluateRules(patched(row.positive)));
});

test('all 25 registered rules are covered; 88 casts have stable, traceable, non-mutating results', () => {
  expect(RULES).toHaveLength(25);
  expect(fixture.cases.map(r => r.rule_id).sort()).toEqual(RULES.map(r => r.rule_id).sort());
  const freeze = obj => { if (obj && typeof obj === 'object') { Object.values(obj).forEach(freeze); Object.freeze(obj); } return obj; };
  for (const raw of [...legacy.map(f => f.expected.cast), ...staticFixtures.cases.map(f => f.expected)]) {
    const cast = normalizeLegacyCast(raw), before = JSON.stringify(cast);
    freeze(cast);
    const result = assertRuleResult(evaluateRules(cast));
    expect(JSON.stringify(evaluateRules(cast))).toBe(JSON.stringify(result));
    expect(JSON.stringify(cast)).toBe(before);
    expect(result.diagnostics).toEqual([]);
    for (const hit of result.hits) for (const e of hit.evidence) expect(readEvidencePath(cast, e.path)).toEqual(e.value);
    const modified = JSON.parse(before);
    modified.question.text = '另一个问题'; modified.display.overall_trend_text = '世生应 吉 +999'; modified.compatibility.extensions.fake = '规则';
    expect(evaluateRules(modified)).toEqual(result);
  }
});

test('month branch relations exhaust all 144 pairs against explicit independent pairs', () => {
  const branches = [...'子丑寅卯辰巳午未申酉戌亥'];
  const clashes = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
  const combines = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
  for (const month of branches) for (const b of branches) {
    const c = patched({ '/calendar/month_branch': month, '/lines/0/branch': b });
    const pair = month + b, reverse = b + month;
    expect(has(c, 'MONTH-CLASH-001', 1)).toBe(clashes.includes(pair) || clashes.includes(reverse));
    expect(has(c, 'MONTH-COMBINE-001', 1)).toBe(combines.includes(pair) || combines.includes(reverse));
    expect(c.calendar).not.toHaveProperty('month_clash');
  }
});

test('shi/ying directions exhaust 25 element pairs with exactly one hit', () => {
  const elements = ['木', '火', '土', '金', '水'];
  const expected = [
    ['世应比和', '世生应', '世克应', '应克世', '应生世'],
    ['应生世', '世应比和', '世生应', '世克应', '应克世'],
    ['应克世', '应生世', '世应比和', '世生应', '世克应'],
    ['世克应', '应克世', '应生世', '世应比和', '世生应'],
    ['世生应', '世克应', '应克世', '应生世', '世应比和'],
  ];
  for (let s = 0; s < 5; s++) for (let y = 0; y < 5; y++) {
    const hits = evaluateRules(patched({ '/lines/5/element': elements[s], '/lines/2/element': elements[y] })).hits.filter(h => h.origin === 'shared_core_function');
    expect(hits).toHaveLength(1); expect(hits[0].result.label).toBe(expected[s][y]);
    if (s !== y) {
      const reverse = expected[s][y].startsWith('应');
      expect(hits[0].result.from.line).toBe(reverse ? 3 : 6);
      expect(hits[0].result.to.line).toBe(reverse ? 6 : 3);
    }
  }
});

test('missing, invalid, conflicting and non-applicable inputs never get repaired', () => {
  const cast = patched();
  delete cast.lines[0].is_kongwang;
  cast.calendar.month_branch = null;
  cast.lines[1].relations.day_relation = '日辰六合（未知扩展）';
  cast.lines[2].relations.return_relation = '回头生'; // static line: conflicting input
  cast.lines[3].relations.hidden_relation = '飞神生伏神'; // no hidden line
  cast.hexagram.shi_line = 3; // inconsistent flags
  const before = JSON.stringify(cast), result = evaluateRules(cast);
  expect(result.hits.some(h => h.rule_id.startsWith('MONTH-'))).toBe(false);
  expect(result.hits.some(h => h.origin === 'shared_core_function')).toBe(false);
  expect(result.skipped.some(s => s.reason === 'insufficient_data')).toBe(true);
  expect(result.skipped.some(s => s.reason === 'not_applicable')).toBe(true);
  expect(result.diagnostics.some(s => s.reason === 'invalid_data')).toBe(true);
  expect(result.diagnostics.some(s => s.reason === 'conflicting_input')).toBe(true);
  expect(JSON.stringify(cast)).toBe(before);
  expect(() => evaluateRules({ ...cast, schema_version: '99' })).toThrow();
});

test('existing annotations remain authoritative rather than being independently recalculated', () => {
  const c = patched({ '/lines/0/is_kongwang': true, '/lines/0/moving': true,
    '/lines/0/changed': { element: '木', branch: '卯' }, '/lines/0/element': '土', '/lines/0/relations/return_relation': '回头生' });
  // Intentionally altered source annotations: projection must not replace them with its own algorithm.
  expect(has(c, 'LINE-VOID-001', 1)).toBe(true);
  expect(has(c, 'MOVE-RETURN-GENERATE-001', 1)).toBe(true);
  delete c.lines[0].relations.return_relation;
  expect(has(c, 'MOVE-RETURN-CONTROL-001', 1)).toBe(false);
});

test('focused real Core cast exercises advance; hidden same-element remains an explicit synthetic contract case', () => {
  const now = new Date('2026-09-15T12:00:00+08:00'), day = JIAZI60[0];
  const cast = buildCanonicalCast({ lines: [7, 8, 9, 7, 6, 8].map(lineFromSum), source: 'manual', createdAt: 0, castId: 'advance-fixture',
    calendar: { now, day, ymh: buildYearMonthHourPillars(day.stem, now), dateText: buildDateDisplayText(now) } });
  const hit = evaluateRules(cast).hits.find(h => h.rule_id === 'MOVE-ADVANCE-001');
  expect(hit?.target.line).toBe(5);
  expect(cast.lines[4].branch).toBe('申'); expect(cast.lines[4].changed.branch).toBe('酉');
});
