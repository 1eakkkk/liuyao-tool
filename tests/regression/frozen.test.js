import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { baseline, capture } = require('./harness.cjs');
const cases = require('./fixtures/casts.json');

test('authoritative frozen page reproduces the 24 captured cases', () => {
  const dom = baseline();
  try {
    for (const fixture of cases) {
      expect(JSON.parse(JSON.stringify(capture(dom.window, fixture.input)))).toEqual(fixture.expected);
    }
  } finally { dom.window.close(); }
});
