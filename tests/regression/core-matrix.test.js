import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import fixtures from './fixtures/static-casts.json';
import { calculateCast } from '../../src/core/casting.js';
import { lineFromSum } from '../../src/core/physics.js';
import { JIAZI60 } from '../../src/core/constants.js';
import { buildYearMonthHourPillars, buildDateDisplayText } from '../../src/core/ganzhi.js';
const require = createRequire(import.meta.url);
const { baseline, capture } = require('./harness.cjs');

test('64 frozen static hexagrams and 384 single-moving variants match original, with palace and shi/ying invariants', () => {
  const original = baseline();
  const names = new Set(), palaces = new Map();
  const shiByStage = { 八纯: 6, 一世: 1, 二世: 2, 三世: 3, 四世: 4, 五世: 5, 游魂: 4, 归魂: 3 };
  expect(fixtures.cases).toHaveLength(64);
  try {
    for (let bits = 0; bits < 64; bits++) for (let moving = -1; moving < 6; moving++) {
      const input = { question: '核心回归', source: 'manual', dayIndex: (bits * 7 + moving + 1) % 60, date: '2026-09-15T12:00:00+08:00',
        sums: Array.from({ length: 6 }, (_, i) => (bits >> i & 1) ? (moving === i ? 9 : 7) : (moving === i ? 6 : 8)) };
      const expected = moving < 0 ? fixtures.cases[bits].expected : capture(original.window, input).cast;
      const now = new Date(input.date), day = JIAZI60[input.dayIndex];
      const { cast } = calculateCast(input.sums.map(lineFromSum), input.source,
        { now, day, ymh: buildYearMonthHourPillars(day.stem, now), dateText: buildDateDisplayText(now) }, 'date');
      expect(JSON.parse(JSON.stringify(cast)), `bits=${bits}, moving=${moving}`).toEqual(expected);
      if (moving < 0) {
        expect(fixtures.cases[bits].bits).toBe(bits);
        expect(fixtures.cases[bits].input).toEqual(input);
        names.add(cast.guaName);
        const [, palace, stage] = cast.palaceText.match(/^(.宫) · (八纯|一世|二世|三世|四世|五世|游魂|归魂)/);
        const stages = palaces.get(palace) || [];
        stages.push(stage); palaces.set(palace, stages);
        const shi = cast.lines.flatMap((line, i) => line.是否世爻 ? [i + 1] : []);
        const ying = cast.lines.flatMap((line, i) => line.是否应爻 ? [i + 1] : []);
        expect(shi).toEqual([shiByStage[stage]]);
        expect(ying).toEqual([(shi[0] + 2) % 6 + 1]);
        expect(cast.lines.map(line => line.爻位)).toEqual(['1爻', '2爻', '3爻', '4爻', '5爻', '6爻']);
      }
    }
    expect(names.size).toBe(64);
    expect(palaces.size).toBe(8);
    for (const stages of palaces.values()) expect(stages.sort()).toEqual(Object.keys(shiByStage).sort());
  } finally { original.window.close(); }
}, 30000);
