import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { loadCorpus } from '../../src/knowledge/load.js';
import { retrieve } from '../../src/knowledge/retrieve.js';

try {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/knowledge/retrieve.js [JSON-query]');
  const index = loadCorpus(undefined, { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION });
  console.log(JSON.stringify(retrieve(index, JSON.parse(process.argv[2] ?? '{}')), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
