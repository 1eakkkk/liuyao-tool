// Explicit offline Node loading only; never imported by a production entry point.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKnowledgeIndex } from './retrieve.js';
import { corpusRoot, markLoadedCorpus, pinnedCorpusHash, selectedCorpusVersion } from './versions.js';

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
function sourceRoot(selection) {
  if (selection === undefined) return corpusRoot();
  if (typeof selection === 'string') return selection;
  if (selection && Object.getPrototypeOf(selection) === Object.prototype &&
      Object.keys(selection).length === 1 && Object.hasOwn(selection, 'version')) return corpusRoot(selection.version);
  throw new Error('Corpus selection must be a directory or { version }');
}
export function readCorpus(selection) {
  const root = sourceRoot(selection);
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
  const catalogPath = path.join(root, 'catalog', 'catalog.json');
  if (fs.lstatSync(path.dirname(catalogPath)).isSymbolicLink() || fs.lstatSync(catalogPath).isSymbolicLink()) throw new Error('Corpus symlinks are not allowed');
  const corpus = { sources: readDirectory(path.join(root, 'sources')), segments: readDirectory(path.join(root, 'classics')),
    units: readDirectory(path.join(root, 'units')), commentary: readDirectory(path.join(root, 'commentary')), catalog: parse(catalogPath) };
  if (selection === undefined || (selection && typeof selection === 'object')) {
    return markLoadedCorpus(corpus, selection?.version);
  }
  return corpus;
}
export function loadCorpus(selection, registryOptions) {
  const version = selectedCorpusVersion(selection && typeof selection === 'object' ? selection.version : undefined);
  const index = createKnowledgeIndex(readCorpus(selection), { ...registryOptions, corpusVersion: version });
  if (selection === undefined || (selection && typeof selection === 'object')) {
    if (index.corpus_hash !== pinnedCorpusHash(version)) throw new Error(`Pinned corpus changed: ${version}`);
  }
  return index;
}
