import { test, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createCoinWorld, advanceCoinWorld } from '../../src/core/physics.js';
const require = createRequire(import.meta.url);
const { baseline } = require('./harness.cjs');

test('six physical rounds preserve the original settling result and step count', () => {
  const original = baseline();
  vi.stubGlobal('CANNON', original.window.CANNON);
  try {
    for (let round = 0; round < 6; round++) {
      const input = { phase: 1.2, duration: .35, distance: 180, vx: 240, vy: -150 };
      const old = original.window.createCoinWorld(input, round), current = createCoinWorld(input, round);
      let resultOld, resultNew;
      for (let step = 0; step < 2400; step++) {
        resultOld = original.window.advanceCoinWorld(old);
        resultNew = advanceCoinWorld(current);
        expect(JSON.parse(JSON.stringify(resultNew))).toEqual(JSON.parse(JSON.stringify(resultOld)));
        if (resultOld) break;
      }
      expect(resultNew).toBeTruthy();
      expect(current.steps).toBe(old.steps);
    }
  } finally { vi.unstubAllGlobals(); original.window.close(); }
}, 30000);
