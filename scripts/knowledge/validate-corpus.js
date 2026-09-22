import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { validateCorpus } from '../../src/knowledge/validate.js';
import { DEFAULT_CORPUS_ROOT, readCorpus } from '../../src/knowledge/load.js';
export { readCorpus } from '../../src/knowledge/load.js';

export function checkCorpus(root = DEFAULT_CORPUS_ROOT) {
  return validateCorpus(readCorpus(root), { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION,
    mode: 'production', requireImageWitness: true });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), allowPending = args.includes('--allow-pending');
    const paths = args.filter(x => x !== '--allow-pending');
    if (paths.length > 1 || args.filter(x => x === '--allow-pending').length > 1 || paths.some(x => x.startsWith('--'))) throw new Error('Usage: node scripts/knowledge/validate-corpus.js [corpus-directory] [--allow-pending]');
    const result = checkCorpus(paths[0] ? path.resolve(paths[0]) : DEFAULT_CORPUS_ROOT);
    console.log(JSON.stringify(result, null, 2));
    // Retaining pending records is explicit; admission remains unchanged in both modes.
    if (result.excluded.length && !allowPending) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
