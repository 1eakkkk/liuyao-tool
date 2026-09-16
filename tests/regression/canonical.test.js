import { test, expect } from 'vitest';
import fixtures from './fixtures/casts.json';
import { normalizeLegacyCast, toLegacyCast, assertCanonicalCast, buildCanonicalCast, toPlateLineData } from '../../src/core/normalize.js';
import { lineFromSum } from '../../src/core/physics.js';
import { JIAZI60 } from '../../src/core/constants.js';
import { buildYearMonthHourPillars, buildDateDisplayText } from '../../src/core/ganzhi.js';

for (const { id, input, expected } of fixtures) {
  test(`canonical preserves every legacy field: ${id}`, () => {
    const normalized = normalizeLegacyCast(expected.cast, { question: input.question, createdAt: 0 });
    expect(toLegacyCast(JSON.parse(JSON.stringify(normalized)))).toEqual(expected.cast);
    expect(normalized.lines.map(line => line.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(toPlateLineData(normalized).map(line => line.l.moving)).toEqual(expected.cast.lines.map(line => line.是否动爻));
    const now = new Date(input.date), day = JIAZI60[input.dayIndex];
    const built = buildCanonicalCast({
      lines: input.sums.map(lineFromSum), source: input.source, daySelectionMode: 'date', question: input.question,
      createdAt: 0, castId: id,
      calendar: { now, day, ymh: buildYearMonthHourPillars(day.stem, now), dateText: buildDateDisplayText(now) },
    });
    expect(toLegacyCast(built)).toEqual(expected.cast);
    expect(built.meta.cast_id).toBe(id);
  });
}
test('missing legacy fields and unknown extensions survive without inventing facts', () => {
  const old = structuredClone(fixtures[0].expected.cast);
  delete old.yearGanzhi; delete old.monthGanzhi; delete old.rulesVersion;
  for (const line of old.lines) { delete line.进退神; delete line.伏神纳甲; }
  old.extension = { retain: true };
  const canonical = normalizeLegacyCast(old);
  expect(canonical.calendar.month_branch).toBeNull();
  expect(toLegacyCast(canonical)).toEqual(old);
});
test('invalid and future schema data fail explicitly', () => {
  expect(() => normalizeLegacyCast({ lines: [] })).toThrow();
  expect(() => normalizeLegacyCast({ schema_version: '99' })).toThrow();
  const bad = normalizeLegacyCast(fixtures[0].expected.cast);
  bad.lines[0].position = 6;
  expect(() => assertCanonicalCast(bad)).toThrow();
});
