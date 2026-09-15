import { beforeAll, afterAll, test, expect, vi } from 'vitest';
import fs from 'node:fs';
import fixtures from './fixtures/casts.json';
let app;
beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T12:00:00+08:00'));
  document.documentElement.innerHTML = fs.readFileSync('index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  localStorage.setItem('liuyao_onboarded', '1');
  window.scrollTo = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  app = await import('../../src/main.js');
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
    const cast = JSON.parse(JSON.stringify(window.lastCastData));
    expect(cast).toEqual(expected.cast);
    expect(app.formatCastDataForAI(cast)).toBe(expected.text);
    expect(document.getElementById('plateWrap').innerHTML).toBe(expected.plate);
    expect(app.buildExportPromptText(input.question, app.formatCastDataForAI(cast))).toBe(expected.export);
    expect(JSON.parse(JSON.stringify(app.buildHistoryCastSnapshot(cast)))).toEqual(expected.history);
  });
}
