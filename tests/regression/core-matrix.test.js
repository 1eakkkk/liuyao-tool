import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { calculateCast } from '../../src/core/casting.js';
import { lineFromSum } from '../../src/core/physics.js';
import { JIAZI60 } from '../../src/core/constants.js';
import { buildYearMonthHourPillars, buildDateDisplayText } from '../../src/core/ganzhi.js';
const require = createRequire(import.meta.url);
const { baseline, capture } = require('./harness.cjs');

test('64 static hexagrams and 384 single-moving variants match original across all day stems/branches', () => {
  const original = baseline();
  try {
    for (let bits = 0; bits < 64; bits++) for (let moving = -1; moving < 6; moving++) {
      const input = { question: '核心回归', source: 'manual', dayIndex: (bits * 7 + moving + 1) % 60, date: '2026-09-15T12:00:00+08:00',
        sums: Array.from({ length: 6 }, (_, i) => (bits >> i & 1) ? (moving === i ? 9 : 7) : (moving === i ? 6 : 8)) };
      const expected = capture(original.window, input).cast;
      const now = new Date(input.date), day = JIAZI60[input.dayIndex];
      const { cast } = calculateCast(input.sums.map(lineFromSum), input.source,
        { now, day, ymh: buildYearMonthHourPillars(day.stem, now), dateText: buildDateDisplayText(now) }, 'date');
      expect(JSON.parse(JSON.stringify(cast)), `bits=${bits}, moving=${moving}`).toEqual(expected);
    }
  } finally { original.window.close(); }
}, 30000);
