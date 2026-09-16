import { test, expect } from 'vitest';
import fixtures from './fixtures/static-casts.json';
import { buildCanonicalCast } from '../../src/core/normalize.js';
import { lineFromSum } from '../../src/core/physics.js';
import { sixRelative } from '../../src/core/relations.js';
import { JIAZI60 } from '../../src/core/constants.js';
import { buildYearMonthHourPillars, buildDateDisplayText } from '../../src/core/ganzhi.js';

// Explicit expected relationships: columns are line elements, rows are palace elements.
const elements = ['木', '火', '土', '金', '水'];
const relatives = {
  木: ['兄弟', '子孙', '妻财', '官鬼', '父母'],
  火: ['父母', '兄弟', '子孙', '妻财', '官鬼'],
  土: ['官鬼', '父母', '兄弟', '子孙', '妻财'],
  金: ['妻财', '官鬼', '父母', '兄弟', '子孙'],
  水: ['子孙', '妻财', '官鬼', '父母', '兄弟'],
};
const relative = (line, palace) => relatives[palace][elements.indexOf(line)];
const palaceElement = cast => cast.palaceText.match(/本宫五行：(.)/)[1];
function options(sums, dayIndex = 0) {
  const now = new Date('2026-09-15T12:00:00+08:00'), day = JIAZI60[dayIndex];
  return { lines: sums.map(lineFromSum), source: 'manual', question: '不变量', createdAt: 0, castId: 'invariant', daySelectionMode: 'date',
    calendar: { now, day, ymh: buildYearMonthHourPillars(day.stem, now), dateText: buildDateDisplayText(now) } };
}

test('all sixty days obey six void groups and six-spirit rotation on all twelve branches', () => {
  const voids = ['戌亥', '申酉', '午未', '辰巳', '寅卯', '子丑'];
  const spirits = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
  const starts = [0, 0, 1, 1, 2, 3, 4, 4, 5, 5];
  expect(new Set(JIAZI60.map(day => day.label)).size).toBe(60);
  for (let day = 0; day < 60; day++) {
    const pair = [...voids[Math.floor(day / 10)]];
    const lines = [7, 8].flatMap(sum => {
      const cast = buildCanonicalCast(options(Array(6).fill(sum), day));
      expect(cast.calendar.kongwang).toEqual(pair);
      expect(cast.lines.map(line => line.spirit)).toEqual(Array.from({ length: 6 }, (_, i) => spirits[(starts[day % 10] + i) % 6]));
      return cast.lines;
    });
    expect(new Set(lines.map(line => line.branch)).size).toBe(12);
    for (const line of lines) expect(line.is_kongwang).toBe(pair.includes(line.branch));
    expect(lines.filter(line => line.is_kongwang)).toHaveLength(2);
  }
});

test('all twenty-five six-relative relationships preserve generation and control direction', () => {
  for (const palace of elements) for (const line of elements) {
    expect(sixRelative(line, palace), `${palace}宫 / ${line}爻`).toBe(relative(line, palace));
  }
});

test('all moving masks flip only selected lines and keep changed relatives anchored to the original palace', () => {
  let distinguishingPalaceChanges = 0;
  for (const bits of [17, 42]) for (let mask = 0; mask < 64; mask++) {
    const sums = Array.from({ length: 6 }, (_, i) => (bits >> i & 1) ? (mask >> i & 1 ? 9 : 7) : (mask >> i & 1 ? 6 : 8));
    const cast = buildCanonicalCast(options(sums));
    const primary = fixtures.cases[bits].expected, target = fixtures.cases[bits ^ mask].expected;
    expect(cast.hexagram.primary.name).toBe(primary.guaName);
    expect(cast.hexagram.primary.palace).toBe(primary.palaceText.split(' · ')[0]);
    expect(cast.hexagram.changed).toEqual(mask ? { name: target.guaName } : null);
    cast.lines.forEach((line, i) => {
      const moving = Boolean(mask >> i & 1);
      expect(line.position).toBe(i + 1);
      expect(line.yin_yang).toBe(bits >> i & 1 ? 'yang' : 'yin');
      expect(line.moving).toBe(moving);
      expect(line.is_shi).toBe(primary.lines[i].是否世爻);
      expect(line.is_ying).toBe(primary.lines[i].是否应爻);
      if (!moving) { expect(line.changed).toBeNull(); return; }
      const expectedLine = target.lines[i];
      const expectedRelative = relative(expectedLine.五行, palaceElement(primary));
      expect(line.changed).toEqual({ ganzhi: expectedLine.纳甲, branch: expectedLine.纳甲[1], element: expectedLine.五行, relative: expectedRelative });
      if (expectedRelative !== relative(expectedLine.五行, palaceElement(target))) distinguishingPalaceChanges++;
    });
  }
  expect(distinguishingPalaceChanges).toBeGreaterThan(0);
});

test('core rejects malformed line inputs and is deterministic without mutating valid inputs', () => {
  const input = options([6, 7, 8, 9, 7, 8]);
  const valid = input.lines;
  const malformed = [null, valid.slice(1), [...valid, valid[0]],
    [null, ...valid.slice(1)], [{ ...valid[0], sum: 5 }, ...valid.slice(1)],
    [{ ...valid[0], sum: '6' }, ...valid.slice(1)],
    [{ ...valid[0], yang: true }, ...valid.slice(1)],
    [{ ...valid[0], moving: false }, ...valid.slice(1)]];
  for (const lines of malformed) expect(() => buildCanonicalCast({ ...input, lines })).toThrow();
  const before = structuredClone(input);
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  }
  freeze(input);
  expect(buildCanonicalCast(input)).toEqual(buildCanonicalCast(input));
  expect(input).toEqual(before);
});
