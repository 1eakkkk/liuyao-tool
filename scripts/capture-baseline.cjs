// Run explicitly only when freezing a baseline; tests never regenerate expected output.
const fs = require('node:fs');
const { baseline, capture } = require('../tests/regression/harness.cjs');
const root = require('node:path').join(__dirname, '..');
const dom = baseline();
const cases = Array.from({length:24}, (_, i) => ({
  id: `baseline-${String(i + 1).padStart(2,'0')}`,
  input: { question: `固定回归问题 ${i + 1}`, dayIndex: (i * 7) % 60,
    date: ['2026-09-15T12:00:00+08:00','2026-01-01T00:00:00+08:00','2025-02-03T22:00:00+08:00'][i % 3],
    source: i % 2 ? 'manual' : 'system',
    sums: i < 8 ? Array.from({length:6}, (_, p) => (i >> (p % 3)) & 1 ? 7 : 8)
      : i === 8 ? [6,6,6,6,6,6] : i === 9 ? [9,9,9,9,9,9]
      : Array.from({length:6}, (_, p) => 6 + ((i * (p+1) + p*p) % 4)) }
}));
for (const entry of cases) entry.expected = capture(dom.window, entry.input);
fs.mkdirSync(root + '/tests/regression/fixtures', {recursive:true});
fs.writeFileSync(root + '/tests/regression/fixtures/casts.json', JSON.stringify(cases,null,2)+'\n');
fs.writeFileSync(root + '/tests/regression/fixtures/system-prompt.txt', dom.window.buildSystemPrompt());
const html = fs.readFileSync(root+'/tests/regression/baseline/index.html','utf8');
const keys = [...html.matchAll(/const (LS_KEY_\w+|ONBOARD_KEY) = '([^']+)'/g)].map(m=>({symbol:m[1],key:m[2]}));
const functions = [...html.matchAll(/^(?:async )?function (\w+)\(/gm)].map(m=>m[1]);
const events = html.split('\n').flatMap((s,i)=>/addEventListener|setInterval/.test(s)?[{line:i+1,source:s.trim()}]:[]);
fs.writeFileSync(root+'/tests/regression/fixtures/inventory.json',JSON.stringify({keys,functions,events},null,2)+'\n');
dom.window.close();
console.log(`Captured ${cases.length} fixed casts, ${keys.length} keys and ${functions.length} functions.`);
