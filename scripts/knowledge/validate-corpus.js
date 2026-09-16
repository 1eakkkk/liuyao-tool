import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { validateCorpus } from '../../src/knowledge/validate.js';

const defaultRoot = fileURLToPath(new URL('../../knowledge/', import.meta.url));
const parse = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function readDirectory(directory) {
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
  return fs.readdirSync(directory).sort().flatMap(name => {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
    if (stat.isDirectory()) return readDirectory(file);
    if (name === '.gitkeep') return [];
    if (!name.endsWith('.json')) throw new Error(`Unexpected corpus file: ${name}`);
    return [parse(file)];
  });
}
// Only these four corpus directories are read; tests/ and local experimental files are never scanned.
export function readCorpus(root = defaultRoot) {
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
  const catalogPath = path.join(root, 'catalog', 'catalog.json');
  if (fs.lstatSync(path.dirname(catalogPath)).isSymbolicLink() || fs.lstatSync(catalogPath).isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
  return { sources: readDirectory(path.join(root, 'sources')), segments: readDirectory(path.join(root, 'classics')),
    units: readDirectory(path.join(root, 'units')), commentary: readDirectory(path.join(root, 'commentary')), catalog: parse(catalogPath) };
}
export function checkCorpus(root = defaultRoot) {
  return validateCorpus(readCorpus(root), { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION, mode: 'production' });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: node scripts/knowledge/validate-corpus.js [corpus-directory]');
    const result = checkCorpus(process.argv[2] ? path.resolve(process.argv[2]) : defaultRoot);
    console.log(JSON.stringify(result, null, 2));
    // Structurally valid drafts are retainable, but this command must not report a ready corpus for them.
    if (result.excluded.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
