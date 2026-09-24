// Phase 8B.2 reviewed task-gate benchmark freeze, using the shared v2 identity policy.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { prepareV2, verifyFreeze, writeCanonicalJsonArtifact,
  SOURCE_IDENTITY_POLICY, ARTIFACT_HASH_POLICY, JSON_SERIALIZATION_POLICY,
  TEXT_SERIALIZATION_POLICY } from '../experiments/freeze-identity.js';
import { validateTaskGateBenchmark } from './validate-task-gate-benchmark.js';
import { QUERY_PLAN_VERSION_12 } from '../../src/knowledge/query-plan-schema-v1.2.js';
import { RULE_CONCEPT_MAP_VERSION } from '../../src/knowledge/query-plan-schema.js';
import { loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';

export const FREEZE_ID = 'phase8b2-task-gate-benchmark-1';
export const SOURCE_COMMIT = 'c4b1d1a1dfa92a147328dc7b1909cce45960ba91';
export const BENCHMARK_VERSION = 'query-planning-task-gate-candidate-1.2';
export const SOURCE_PATHS = Object.freeze([
  'docs/PHASE_8B_2A_DESIGN.md',
  'docs/PHASE_8B_2C_CANDIDATE_REVISION.md',
  'experiments/phase8/query-planning-task-gate/README.md',
  'experiments/phase8/query-planning-task-gate/benchmark.json',
  'experiments/phase8/query-planning-task-gate/benchmark.schema.json',
  'scripts/phase8/generate-task-gate-benchmark.js',
  'scripts/phase8/validate-task-gate-benchmark.js',
  'src/knowledge/query-plan-schema-v1.2.js',
  'tests/phase8/task-gate-candidate.test.js'
]);
const DEPENDENCY_PATHS = Object.freeze([
  'experiments/phase6/cases.json',
  'experiments/phase7/evaluation/cases.json',
  'experiments/phase8/query-planning/benchmark.json',
  'experiments/phase8/query-planning/benchmark.schema.json',
  'knowledge/catalog/catalog.json',
  'knowledge/catalog/rule-concept-map.json',
  'scripts/experiments/freeze-identity.js',
  'src/knowledge/load.js',
  'src/knowledge/query-plan-schema.js',
  'src/knowledge/validate.js',
  'src/knowledge/versions.js',
  'src/rules/engine.js',
  'src/rules/registry.js'
]);
const repo = fileURLToPath(new URL('../../', import.meta.url));
export const FREEZE_ROOT = path.join(repo, 'experiments', 'phase8', 'query-planning-task-gate', 'freeze', FREEZE_ID);
const read = relative => JSON.parse(fs.readFileSync(path.join(repo, relative), 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const need = (condition, message) => { if (!condition) throw new Error(`Phase 8B.2 freeze: ${message}`); };
const same = (a, b) => isDeepStrictEqual(a, b);
const artifactSpecs = Object.freeze([
  { path: 'metadata.json', kind: 'generated_json' },
  { path: 'README.md', kind: 'generated_text' }
]);

function dependencyBlobs() {
  return DEPENDENCY_PATHS.map(name => ({ path: name, blob_oid: git('rev-parse', '--verify', `${SOURCE_COMMIT}:${name}`) }));
}
function benchmarkIdentity() {
  const benchmark = read('experiments/phase8/query-planning-task-gate/benchmark.json');
  const validated = validateTaskGateBenchmark(benchmark);
  need(benchmark.version === BENCHMARK_VERSION && benchmark.candidate_status === 'candidate_not_frozen', 'benchmark source identity changed');
  need(QUERY_PLAN_VERSION_12 === 'query-plan-1.2' && RULESET_VERSION === 'r1' && RULES.length === 25,
    'contract or Ruleset changed');
  need(validated.cases === 64 && validated.development === 32 && validated.holdout === 32 &&
    validated.families === 16 && validated.acceptable_complete_plans === 0, 'benchmark invariants changed');
  const familyCounts = { development: 0, holdout: 0 };
  for (const family of benchmark.semantic_families) {
    familyCounts[family.split]++;
    need(benchmark.cases.filter(c => c.family_id === family.family_id).length === 4 &&
      benchmark.cases.filter(c => c.family_id === family.family_id).every(c => c.split === family.split),
    `family split or case count changed: ${family.family_id}`);
  }
  need(familyCounts.development === 8 && familyCounts.holdout === 8, 'family split count changed');
  return { benchmark, validated, familyCounts };
}
function metadata() {
  const { benchmark, validated, familyCounts } = benchmarkIdentity();
  const ruleIds = RULES.map(rule => rule.rule_id);
  const hardened = loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, { ruleIds, rulesetVersion: RULESET_VERSION });
  const historical = loadCorpus({ version: 'phase7.1-initial-1' }, { ruleIds, rulesetVersion: RULESET_VERSION });
  need(hardened.corpus_hash === validated.corpus_hash, 'hardened corpus hash changed');
  need(historical.corpus_hash === 'sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729',
    'historical corpus hash changed');
  const catalog = read('knowledge/catalog/catalog.json');
  const mapping = read('knowledge/catalog/rule-concept-map.json');
  need(mapping.version === RULE_CONCEPT_MAP_VERSION && mapping.ruleset_version === RULESET_VERSION &&
    mapping.catalog_revision === catalog.revision, 'concept map identity changed');
  return {
    freeze_id: FREEZE_ID,
    source_commit: SOURCE_COMMIT,
    source_identity_policy_version: SOURCE_IDENTITY_POLICY,
    artifact_hash_policy_version: ARTIFACT_HASH_POLICY,
    benchmark_version: benchmark.version,
    benchmark_source_status: benchmark.candidate_status,
    planner_contract_version: QUERY_PLAN_VERSION_12,
    frozen_source_paths: [...SOURCE_PATHS],
    benchmark_invariants: {
      cases: validated.cases, development: validated.development, holdout: validated.holdout,
      semantic_families: validated.families, families_per_split: familyCounts,
      cases_per_family: 4, family_cross_split: 0,
      acceptable_complete_plans: validated.acceptable_complete_plans,
      fact_reference_conflicts: 0,
      fact_references: benchmark.cases.reduce((sum, item) => sum + item.question_fact_references.length, 0),
      new_holdout_exposure: false, old_phase8b1_holdout_exposure: true
    },
    referenced_dependencies: {
      ruleset_version: RULESET_VERSION, ruleset_rule_count: RULES.length,
      concept_catalog_revision: catalog.revision, rule_concept_map_version: mapping.version,
      hardened_corpus: { version: hardened.corpus_version, hash: hardened.corpus_hash },
      historical_corpus: { version: historical.corpus_version, hash: historical.corpus_hash },
      git_blobs: dependencyBlobs()
    }
  };
}
const readme = `# Phase 8B.2 task-gate benchmark freeze

The reviewed \`query-planning-task-gate-candidate-1.2\` source was committed at \`${SOURCE_COMMIT}\`.
This separate freeze has ID \`${FREEZE_ID}\`; the source benchmark retains its original candidate status.

The source set consists of the ${SOURCE_PATHS.length} tracked files in \`FREEZE.v2.json\`. Dependencies in \`metadata.json\` are referenced by Git blob identity. Source identity uses \`${SOURCE_IDENTITY_POLICY}\`; generated artifacts use \`${JSON_SERIALIZATION_POLICY}\` or \`${TEXT_SERIALIZATION_POLICY}\` and exact raw-byte SHA-256 under \`${ARTIFACT_HASH_POLICY}\`.

The benchmark contains 64 cases, split 32 development / 32 holdout across 16 isolated semantic families. The new Phase 8B.2 holdout has not been run or exposed. The old Phase 8B.1 holdout is exposed and is historical development evidence. A ground-truth change requires a new benchmark revision and a new freeze; do not rewrite this freeze.
`;

export function prepareTaskGateFreeze() {
  need(git('rev-parse', 'HEAD') === SOURCE_COMMIT, 'prepare requires the reviewed candidate source commit at HEAD');
  need(!fs.existsSync(FREEZE_ROOT), 'freeze directory already exists');
  const frozenMetadata = metadata();
  fs.mkdirSync(FREEZE_ROOT, { recursive: true });
  writeCanonicalJsonArtifact(FREEZE_ROOT, 'metadata.json', frozenMetadata);
  fs.writeFileSync(path.join(FREEZE_ROOT, 'README.md'), readme, { flag: 'wx' });
  const prepared = prepareV2({ repo, root: FREEZE_ROOT, trackedSourcePaths: [...SOURCE_PATHS], artifacts: [...artifactSpecs] });
  need(prepared.tracked_sources === SOURCE_PATHS.length && prepared.artifacts === artifactSpecs.length,
    'unexpected v2 source/artifact count');
  return { freeze_id: FREEZE_ID, ...prepared, verified: verifyTaskGateFreeze() };
}
export function verifyTaskGateFreeze({ root = FREEZE_ROOT } = {}) {
  const base = verifyFreeze({ repo, root });
  need(base.policy === 'v2' && base.status === 'verified_v2' && base.repository_commit === SOURCE_COMMIT,
    'not the intended v2 source freeze');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'FREEZE.v2.json'), 'utf8'));
  need(same(Object.keys(manifest).sort(), ['artifacts', 'artifact_hash_policy_version', 'freeze_schema_version',
    'source_identity_policy_version', 'tracked_sources'].sort()), 'freeze manifest schema changed');
  need(same(manifest.tracked_sources.files.map(item => item.path), [...SOURCE_PATHS].sort()), 'frozen source set changed');
  need(same(manifest.artifacts.map(item => ({ path: item.path, kind: item.kind })),
    [...artifactSpecs].sort((a, b) => a.path.localeCompare(b.path))), 'freeze artifact set changed');
  need(same(JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8')), metadata()),
    'freeze metadata or benchmark invariants changed');
  need(fs.readFileSync(path.join(root, 'README.md'), 'utf8') === readme, 'freeze notes changed');
  for (const dependency of dependencyBlobs()) need(git('rev-parse', '--verify', `HEAD:${dependency.path}`) === dependency.blob_oid,
    `referenced dependency changed: ${dependency.path}`);
  return { freeze_id: FREEZE_ID, source_files: SOURCE_PATHS.length,
    dependency_blobs: DEPENDENCY_PATHS.length, ...base };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const command = process.argv[2];
    if (command === 'prepare') console.log(JSON.stringify(prepareTaskGateFreeze(), null, 2));
    else if (command === 'verify') console.log(JSON.stringify(verifyTaskGateFreeze(), null, 2));
    else throw new Error('Usage: freeze-task-gate-benchmark.js prepare | verify');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
