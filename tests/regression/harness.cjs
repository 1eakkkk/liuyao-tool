const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const EPOCH = new Date('2026-09-15T12:00:00+08:00').getTime();
function baseline(storage = {}) {
  const html = fs.readFileSync(path.join(__dirname, 'baseline/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://baseline.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const NativeDate = w.Date;
  w.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [EPOCH])); } static now() { return EPOCH; } };
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.localStorage.setItem('liuyao_onboarded', '1');
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
  for (const script of w.document.scripts) {
    const bridge = script.textContent.includes('let knownCastDate')
      ? '\nwindow.__setCalendar = function(date){knownCastDate = new Date(date); daySelectionMode = "date";};'
      : '';
    w.eval(script.textContent + bridge);
  }
  return dom;
}
function capture(w, input) {
  w.document.getElementById('questionInput').value = input.question;
  w.document.getElementById('dayGanzhi').value = String(input.dayIndex);
  w.__setCalendar(input.date);
  w.document.getElementById('dayLookupTime').value = '12:00';
  w.renderPlate(input.sums.map(w.lineFromSum), input.source);
  const cast = JSON.parse(JSON.stringify(w.lastCastData));
  return { cast, text: w.formatCastDataForAI(cast), plate: w.document.getElementById('plateWrap').innerHTML,
    export: w.buildExportPromptText(input.question, w.formatCastDataForAI(cast)),
    history: w.buildHistoryCastSnapshot(cast) };
}
module.exports = { baseline, capture, EPOCH };
