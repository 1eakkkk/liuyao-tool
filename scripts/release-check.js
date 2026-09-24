import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Inspect actual bundled modules, not text matches in minified code.
await build({ plugins: [{
  name: 'stable-release-boundary',
  generateBundle(_options, bundle) {
    for (const item of Object.values(bundle)) {
      if (item.type !== 'chunk') continue;
      for (const id of Object.keys(item.modules)) {
        assert(!/\/(src\/knowledge|experiments|knowledge)\//.test(id.replaceAll('\\', '/')),
          `Unapproved knowledge module in stable release: ${id}`);
        assert(!/\/src\/ai\/knowledge-[^/]+\.js/.test(id.replaceAll('\\', '/')),
          `Unapproved knowledge AI input in stable release: ${id}`);
      }
    }
  },
}] });
const files = fs.readdirSync('dist', { recursive: true }).filter(name => fs.statSync(path.join('dist', name)).isFile()).sort();
const allowed = /^(index\.html|_headers|vendor\/cannon\.js|assets\/[^/]+\.(js|css))$/;
const artifacts = files.map(name => {
  const relative = name.replaceAll('\\', '/');
  assert(allowed.test(relative), `Unexpected release asset: ${relative}`);
  const bytes = fs.readFileSync(path.join('dist', name));
  return { path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
for (const required of ['index.html', '_headers', 'vendor/cannon.js']) assert(files.includes(required.replaceAll('/', path.sep)), `Missing ${required}`);
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/release-manifest.json', JSON.stringify({
  createdAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  mode: 'stable-legacy-default-no-knowledge', artifacts,
}, null, 2) + '\n');
console.log(`Stable release boundary passed; ${artifacts.length} assets recorded in test-results/release-manifest.json`);
