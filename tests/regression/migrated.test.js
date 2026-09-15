import { beforeAll, afterAll, test, expect, vi } from 'vitest';
import fs from 'node:fs';
import fixtures from './fixtures/casts.json';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { baseline } = require('./harness.cjs');
let app, castStore;
beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T12:00:00+08:00'));
  document.documentElement.innerHTML = fs.readFileSync('index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  localStorage.setItem('liuyao_onboarded', '1');
  window.scrollTo = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  await import('../../src/main.js');
  ({castStore} = await import('../../src/app/cast-store.js'));
  app = { ...await import('../../src/ui/casting-view.js'), ...await import('../../src/core/physics.js'), ...await import('../../src/ai/formatter.js'), ...await import('../../src/ai/prompt-builder.js'), ...await import('../../src/storage/history.js') };
  const {state} = await import('../../src/app/state.js');
  app.setTestCalendar = date => { state.knownCastDate = date; state.daySelectionMode = 'date'; };
});
afterAll(() => { vi.clearAllTimers(); vi.useRealTimers(); });
for (const fixture of fixtures) {
  test(`migrated code equals authoritative ${fixture.id}`, () => {
    const { input, expected } = fixture;
    document.getElementById('questionInput').value = input.question;
    document.getElementById('dayGanzhi').value = String(input.dayIndex);
    app.setTestCalendar(new Date(input.date));
    document.getElementById('dayLookupTime').value = '12:00';
    app.renderPlate(input.sums.map(app.lineFromSum), input.source);
    const cast = JSON.parse(JSON.stringify(castStore.legacy));
    expect(cast).toEqual(expected.cast);
    expect(app.formatCastDataForAI(cast)).toBe(expected.text);
    expect(document.getElementById('plateWrap').innerHTML).toBe(expected.plate);
    expect(app.buildExportPromptText(input.question, app.formatCastDataForAI(cast))).toBe(expected.export);
    const snapshot = app.buildHistoryCastSnapshot(castStore.canonical);
    const {canonical, ...legacySnapshot} = JSON.parse(JSON.stringify(snapshot));
    expect(canonical.schema_version).toBe('1.0');
    expect(legacySnapshot).toEqual(expected.history);
  });
}

test('date-only, solar-term, manual day and automatic mode preserve original behavior', () => {
  const original = baseline();
  try {
    const scenarios = [
      { date: '2025-02-03', time: '' },
      { date: '2026-01-01', time: '23:59' },
      { date: '', time: '', manual: '0' },
      { date: '', time: '' },
    ];
    for (const scenario of scenarios) {
      for (const w of [window, original.window]) {
        const date = w.document.getElementById('dayLookupDate'), time = w.document.getElementById('dayLookupTime');
        time.value = scenario.time; date.value = scenario.date; date.dispatchEvent(new w.Event('change'));
        time.dispatchEvent(new w.Event('change'));
        if (scenario.manual) {
          const day = w.document.getElementById('dayGanzhi'); day.value = scenario.manual; day.dispatchEvent(new w.Event('change'));
        }
      }
      const sums = [6, 7, 8, 9, 8, 7];
      original.window.renderPlate(sums.map(original.window.lineFromSum), 'manual');
      app.renderPlate(sums.map(app.lineFromSum), 'manual');
      expect(JSON.parse(JSON.stringify(castStore.legacy))).toEqual(JSON.parse(JSON.stringify(original.window.lastCastData)));
    }
  } finally { original.window.close(); }
});
