// Offline corpus selection. Phase 7 remains a separate immutable snapshot.
import { fileURLToPath } from 'node:url';

export const HISTORICAL_CORPUS_VERSION = 'phase7.1-initial-1';
export const DEFAULT_CORPUS_VERSION = 'phase8a-month-combine-hardening-1';
export const CORPUS_VERSION_ENV = 'LIUYAO_KNOWLEDGE_CORPUS_VERSION';

const versions = Object.freeze({
  [HISTORICAL_CORPUS_VERSION]: Object.freeze({
    root: fileURLToPath(new URL('../../knowledge/versions/phase7.1-initial-1/', import.meta.url)),
    hash: 'sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729'
  }),
  [DEFAULT_CORPUS_VERSION]: Object.freeze({
    root: fileURLToPath(new URL('../../knowledge/', import.meta.url)),
    hash: 'sha256:aa3522aebb7e4ad18b54e144ea26499323e55838f79856fdd59f2c53baadcda3'
  })
});
const loadedVersions = new WeakMap();

export function selectedCorpusVersion(explicitVersion) {
  const version = explicitVersion ?? process.env[CORPUS_VERSION_ENV] ?? DEFAULT_CORPUS_VERSION;
  if (!Object.hasOwn(versions, version)) throw new Error(`Unknown corpus version: ${version}`);
  return version;
}

export function corpusRoot(version) {
  return versions[selectedCorpusVersion(version)].root;
}

export function pinnedCorpusHash(version) {
  return versions[selectedCorpusVersion(version)].hash;
}

// The loader records explicit selection without adding a field to the closed corpus Schema.
export function markLoadedCorpus(corpus, version) {
  loadedVersions.set(corpus, selectedCorpusVersion(version));
  return corpus;
}

export function loadedCorpusVersion(corpus) {
  return loadedVersions.get(corpus);
}
