import { test, expect } from 'vitest';
import canonical from '../../experiments/phase7/fixtures/compat-1.json';
import { webcrypto } from 'node:crypto';
import { buildOutputContext } from '../../src/ai/output/context.js';
import { parseOutputAnswer } from '../../src/ai/output/parse.js';
import { renderOutputResult } from '../../src/ai/output/view.js';
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
