import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateAiValue } from '../src/ai/schemas.js';
import { EXPORT_CONFIG_SCHEMA } from '../experiments/phase7/config-schema.js';
import { readCorpus } from '../src/knowledge/load.js';
import { buildKnowledgePair } from '../src/ai/knowledge-input.js';
import { stableJson, textHash } from '../src/knowledge/validate.js';

export function exportKnowledgePairs({ config, configDirectory, outputDirectory }) {
  validateAiValue(config, EXPORT_CONFIG_SCHEMA);
  if (!config.assignment_seed.trim() || !/^[a-z0-9][a-z0-9-]*$/.test(config.experiment_id)) throw new Error('Invalid experiment identity/seed');
  if (new Set(config.cases.map(c => c.case_id)).size !== config.cases.length) throw new Error('Duplicate case ID');
  if (config.cases.some(c => c.case_id === 'manifest')) throw new Error('Reserved case ID: manifest');
  const output = path.resolve(outputDirectory);
  if (fs.existsSync(output)) throw new Error('Output already exists; refusing to overwrite');
  const corpus = readCorpus();
  // Build/validate every pair before the first write. Input paths and seed are private.
  const pairs = config.cases.map(c => {
    const canonical = JSON.parse(fs.readFileSync(path.resolve(configDirectory, c.canonical_file), 'utf8'));
    const pair = buildKnowledgePair({ canonical, corpus, case_id: c.case_id, query: c.query, model_settings: config.model_settings });
    const a = parseInt(textHash(stableJson([config.assignment_seed, c.case_id])).slice(-2), 16) % 2 ? 'on' : 'off';
    return { case_id: c.case_id, pair, assignment: { A: a, B: a === 'on' ? 'off' : 'on' } };
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output); // Exclusive creation; a concurrent writer cannot be silently replaced.
  fs.mkdirSync(path.join(output, 'execution'));
  fs.mkdirSync(path.join(output, 'private'));
  const archives = [];
  for (const { case_id, pair, assignment } of pairs) {
    for (const label of ['A', 'B']) fs.writeFileSync(path.join(output, 'execution', `${case_id}-${label}.txt`), pair[assignment[label]].text, { flag: 'wx' });
    const record = { ...pair.archive, assignment };
    fs.writeFileSync(path.join(output, 'private', `${case_id}.json`), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    archives.push({ case_id, assignment, common_base_hash: record.common_base_hash,
      prompt_chars: record.prompt_chars, delta_percent: record.delta_percent, selected_knowledge_ids: record.selected_knowledge_ids });
  }
  const manifest = { experiment_id: config.experiment_id, data_kind: config.data_kind,
    validation_only: true, config_hash: textHash(stableJson(config)), assignment_seed: config.assignment_seed,
    model_settings: config.model_settings, cases: archives };
  fs.writeFileSync(path.join(output, 'private', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { output_directory: output, pairs: pairs.length, status: 'knowledge-aware paired input pipeline ready' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/phase7-knowledge.js config.json new-output-directory');
    const configFile = path.resolve(process.argv[2]);
    const result = exportKnowledgePairs({ config: JSON.parse(fs.readFileSync(configFile, 'utf8')), configDirectory: path.dirname(configFile), outputDirectory: process.argv[3] });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
