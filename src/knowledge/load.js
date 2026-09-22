// Explicit offline Node loading only; never imported by a production entry point.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKnowledgeIndex } from './retrieve.js';

export const DEFAULT_CORPUS_ROOT = fileURLToPath(new URL('../../knowledge/', import.meta.url));
const parse = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function readDirectory(directory) {
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
  return fs.readdirSync(directory).sort().flatMap(name => {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
    if (stat.isDirectory()) return readDirectory(file);
    if (name === '.gitkeep') return [];
    if (!name.endsWith('.json')) throw new Error(`Unexpected corpus file: ${name}`);
    return [parse(file)];
  });
}
// This returns untrusted records. Admission occurs in createKnowledgeIndex / loadCorpus.
export function readCorpus(root = DEFAULT_CORPUS_ROOT) {
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
  const catalogPath = path.join(root, 'catalog', 'catalog.json');
  if (fs.lstatSync(path.dirname(catalogPath)).isSymbolicLink() || fs.lstatSync(catalogPath).isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
  return { sources: readDirectory(path.join(root, 'sources')), segments: readDirectory(path.join(root, 'classics')),
    units: readDirectory(path.join(root, 'units')), commentary: readDirectory(path.join(root, 'commentary')), catalog: parse(catalogPath) };
}
export function loadCorpus(root = DEFAULT_CORPUS_ROOT, registryOptions) {
  return createKnowledgeIndex(readCorpus(root), registryOptions);
}
