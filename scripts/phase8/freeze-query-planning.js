// Phase 8B.0 baseline freeze. Identity and sealing come from the shared v2 utility.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { prepareV2, verifyFreeze, writeCanonicalJsonArtifact,
  SOURCE_IDENTITY_POLICY, ARTIFACT_HASH_POLICY, JSON_SERIALIZATION_POLICY,
  TEXT_SERIALIZATION_POLICY } from '../experiments/freeze-identity.js';
import { validateBenchmarkCandidate } from './validate-query-planning.js';
import { QUERY_PLAN_VERSION } from '../../src/knowledge/query-plan-schema.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';

export const FREEZE_ID = 'phase8b-query-planning-baseline-1';
export const SOURCE_COMMIT = '21c0441d40ad991912c67a298b6c29e58dcd8fe3';
export const BENCHMARK_VERSION = 'query-planning-candidate-1.1';
export const SOURCE_PATHS = Object.freeze([
  'docs/PHASE_8B_DESIGN.md',
  'experiments/phase8/query-planning/README.md',
  'experiments/phase8/query-planning/benchmark.json',
  'experiments/phase8/query-planning/benchmark.schema.json',
  'knowledge/catalog/rule-concept-map.json',
  'scripts/phase8/generate-query-benchmark.js',
  'scripts/phase8/validate-query-planning.js',
  'src/knowledge/query-plan-schema.js',
  'tests/phase8/query-plan-contract.test.js',
  'tests/phase8/query-planning-benchmark.test.js'
]);
const DEPENDENCY_PATHS = Object.freeze([
  'knowledge/catalog/catalog.json', 'src/knowledge/versions.js',
  'src/rules/engine.js', 'src/rules/registry.js'
]);
const repo = fileURLToPath(new URL('../../', import.meta.url));
export const FREEZE_ROOT = path.join(repo, 'experiments', 'phase8', 'query-planning', 'freeze', FREEZE_ID);
const read = relative => JSON.parse(fs.readFileSync(path.join(repo, relative), 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const need = (condition, message) => { if (!condition) throw new Error(`Phase 8B freeze: ${message}`); };
const artifactSpecs = Object.freeze([
  { path: 'metadata.json', kind: 'generated_json' },
  { path: 'README.md', kind: 'generated_text' }
]);
const same = (a, b) => isDeepStrictEqual(a, b);

function dependencyBlobs() {
  return DEPENDENCY_PATHS.map(name => ({ path: name, blob_oid: git('rev-parse', '--verify', `${SOURCE_COMMIT}:${name}`) }));
}
function assertBenchmark() {
  const benchmark = read('experiments/phase8/query-planning/benchmark.json');
  const validation = validateBenchmarkCandidate(benchmark);
  need(benchmark.version === BENCHMARK_VERSION && benchmark.candidate_status === 'candidate_not_frozen', 'benchmark source identity changed');
  need(QUERY_PLAN_VERSION === 'query-plan-1.1' && RULESET_VERSION === 'r1' && RULES.length === 25, 'contract or Ruleset changed');
  need(validation.cases === 72 && validation.development === 48 && validation.holdout === 24 &&
    validation.families === 24 && validation.fact_references === 23, 'benchmark invariants changed');
  need(benchmark.semantic_families.every(f => benchmark.cases.filter(c => c.family_id === f.family_id).every(c => c.split === f.split)), 'family split changed');
  return { benchmark, validation };
}
function metadata() {
  const { benchmark, validation } = assertBenchmark();
  return {
    freeze_id: FREEZE_ID,
    source_commit: SOURCE_COMMIT,
    source_identity_policy_version: SOURCE_IDENTITY_POLICY,
    artifact_hash_policy_version: ARTIFACT_HASH_POLICY,
    benchmark_version: benchmark.version,
    benchmark_source_status: benchmark.candidate_status,
    planner_contract_version: QUERY_PLAN_VERSION,
    frozen_source_paths: [...SOURCE_PATHS],
    benchmark_invariants: {
      cases: validation.cases, development: validation.development, holdout: validation.holdout,
      semantic_families: validation.families, family_cross_split: 0,
      fact_reference_conflicts: 0, fact_references: validation.fact_references,
      selected_concepts_max: 2, requested_available_selected_separate: true,
      unresolved_mentions_contract: true, acceptable_plans_atomic: true,
      question_span_unit: 'javascript_utf16_code_unit',
      zero_knowledge_retrieval_query: null, source_checked_selectable: false
    },
    referenced_dependencies: {
      ruleset_version: RULESET_VERSION, ruleset_rule_count: RULES.length,
      concept_catalog_revision: benchmark.cases[0].catalog_revision,
      hardened_corpus: { version: 'phase8a-month-combine-hardening-1', hash: validation.current_corpus_hash },
      historical_corpus: { version: 'phase7.1-initial-1', hash: validation.historical_corpus_hash },
      git_blobs: dependencyBlobs()
    }
  };
}
const readme = `# Phase 8B.0 query-planning baseline freeze

\`query-planning-candidate-1.1\` was frozen as the Phase 8B.0 query-planning baseline at source commit \`${SOURCE_COMMIT}\`.
The benchmark source retains \`candidate_not_frozen\`; this separate freeze has ID \`${FREEZE_ID}\`.

The source set is exactly the 10 D1 files listed in \`FREEZE.v2.json\`. Dependencies in \`metadata.json\` are references, not extra frozen benchmark source files. Source identity is commit + Git blob (\`${SOURCE_IDENTITY_POLICY}\`); generated JSON uses \`${JSON_SERIALIZATION_POLICY}\`, generated text uses \`${TEXT_SERIALIZATION_POLICY}\`, and each artifact has an exact raw-byte SHA-256 under \`${ARTIFACT_HASH_POLICY}\`. The manifest itself is canonically serialized and sealed by \`FREEZE.v2.sha256\`.

The 72 cases contain 48 development and 24 holdout cases across 24 isolated semantic families. Phase 8B.1 may use the development cases to design and debug a deterministic planner. Run holdout only after the baseline planner design is settled. If a specific holdout result is inspected and used to change the planner, record that exposure; later results are no longer fully unseen holdout evidence.

A confirmed ground-truth defect requires a documented new benchmark revision and a new freeze. Retain this freeze for verification; never silently edit or reseal it. This freeze contains no planner algorithm or production integration.
`;

export function prepareQueryPlanningFreeze() {
  need(git('rev-parse', 'HEAD') === SOURCE_COMMIT, 'prepare requires the reviewed D1 source commit at HEAD');
  need(!fs.existsSync(FREEZE_ROOT), 'freeze directory already exists');
  fs.mkdirSync(FREEZE_ROOT, { recursive: true });
  writeCanonicalJsonArtifact(FREEZE_ROOT, 'metadata.json', metadata());
  fs.writeFileSync(path.join(FREEZE_ROOT, 'README.md'), readme, { flag: 'wx' });
  const prepared = prepareV2({ repo, root: FREEZE_ROOT, trackedSourcePaths: [...SOURCE_PATHS], artifacts: [...artifactSpecs] });
  need(prepared.tracked_sources === 10 && prepared.artifacts === 2, 'unexpected v2 source/artifact count');
  return { freeze_id: FREEZE_ID, ...prepared, verified: verifyQueryPlanningFreeze() };
}

export function verifyQueryPlanningFreeze({ root = FREEZE_ROOT } = {}) {
  const base = verifyFreeze({ repo, root });
  need(base.policy === 'v2' && base.status === 'verified_v2' && base.repository_commit === SOURCE_COMMIT, 'not the intended v2 source freeze');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'FREEZE.v2.json'), 'utf8'));
  need(same(Object.keys(manifest).sort(), ['artifacts', 'artifact_hash_policy_version', 'freeze_schema_version', 'source_identity_policy_version', 'tracked_sources'].sort()), 'freeze manifest schema changed');
  need(same(Object.keys(manifest.tracked_sources).sort(), ['files', 'repository_commit']) &&
    manifest.tracked_sources.files.every(x => same(Object.keys(x).sort(), ['blob_oid', 'path'])), 'tracked source schema changed');
  need(manifest.artifacts.every(x => same(Object.keys(x).sort(), ['kind', 'path', 'serialization', 'sha256_raw_bytes'])), 'artifact schema changed');
  need(same(manifest.tracked_sources.files.map(x => x.path), [...SOURCE_PATHS].sort()), 'frozen source set changed');
  need(same(manifest.artifacts.map(x => ({ path: x.path, kind: x.kind })), [...artifactSpecs].sort((a, b) => a.path.localeCompare(b.path))), 'freeze artifact set changed');
  need(same(JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8')), metadata()), 'freeze metadata or benchmark invariants changed');
  need(fs.readFileSync(path.join(root, 'README.md'), 'utf8') === readme, 'freeze policy notes changed');
  for (const dependency of dependencyBlobs()) need(git('rev-parse', '--verify', `HEAD:${dependency.path}`) === dependency.blob_oid,
    `referenced dependency changed: ${dependency.path}`);
  return { freeze_id: FREEZE_ID, source_files: SOURCE_PATHS.length, dependency_blobs: DEPENDENCY_PATHS.length,
    benchmark_cases: 72, fact_reference_conflicts: 0, ...base };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const command = process.argv[2];
    if (command === 'prepare') console.log(JSON.stringify(prepareQueryPlanningFreeze(), null, 2));
    else if (command === 'verify') console.log(JSON.stringify(verifyQueryPlanningFreeze(), null, 2));
    else throw new Error('Usage: freeze-query-planning.js prepare | verify');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
