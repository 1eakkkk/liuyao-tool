// Explicit, one-time capture from the authoritative legacy HTML; never run by tests.
process.env.TZ = 'Asia/Shanghai';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { baseline, capture } = require('../tests/regression/harness.cjs');
const root = path.resolve(__dirname, '..');
const sha256 = 'f458d62538d46a64b11fb15af019784acdba98cb930cd54a40f1169f60e7ef1b';
const html = fs.readFileSync(path.join(root, 'tests/regression/baseline/index.html'));
if (crypto.createHash('sha256').update(html).digest('hex') !== sha256) throw new Error('Authoritative baseline hash mismatch');
const original = baseline();
try {
  const cases = Array.from({ length: 64 }, (_, bits) => {
    const input = { question: '核心回归', source: 'manual', dayIndex: (bits * 7) % 60,
      date: '2026-09-15T12:00:00+08:00', sums: Array.from({ length: 6 }, (_, i) => (bits >> i & 1) ? 7 : 8) };
    return { bits, input, expected: capture(original.window, input).cast };
  });
  const output = { provenance: { commit: '1964881a16fb6ca6956794a820f058cdaa16390d', sha256, timezone: process.env.TZ }, cases };
  fs.writeFileSync(path.join(root, 'tests/regression/fixtures/static-casts.json'), JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
} finally { original.window.close(); }
