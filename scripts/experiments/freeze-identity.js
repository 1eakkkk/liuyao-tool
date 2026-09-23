// Offline freeze identity for future rounds. Historical v1 files are read, never rewritten.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const FREEZE_SCHEMA_VERSION = '2';
export const SOURCE_IDENTITY_POLICY = 'git-blob-v2';
export const ARTIFACT_HASH_POLICY = 'sha256-raw-bytes-v1';
export const JSON_SERIALIZATION_POLICY = 'canonical-json-utf8-lf-v1';
export const TEXT_SERIALIZATION_POLICY = 'utf8-no-bom-lf-v1';
const manifestName = 'FREEZE.v2.json';
const sealName = 'FREEZE.v2.sha256';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const rawSha256 = bytes => `sha256:${digest(bytes)}`;
const need = (ok, message) => { if (!ok) throw new Error(message); };
const git = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function stable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { need(Number.isFinite(value), 'Non-finite JSON number'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  need(value && Object.getPrototypeOf(value) === Object.prototype, 'Canonical JSON needs plain objects');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
// No BOM; sorted object keys; compact JSON; one final LF. Values are never newline- or Unicode-normalized.
export const canonicalJsonBytes = value => Buffer.from(`${stable(value)}\n`, 'utf8');
function relativePath(name) {
  need(typeof name === 'string' && name.length > 0 && !name.includes('\\') && !name.includes(':') &&
    !name.startsWith('/') && name.split('/').every(part => part && part !== '.' && part !== '..'), `Invalid relative path: ${name}`);
  return name;
}
function within(root, name) {
  const target = path.resolve(root, ...relativePath(name).split('/'));
  need(target.startsWith(path.resolve(root) + path.sep), `Path escapes freeze root: ${name}`);
  return target;
}
function regularBytes(file) {
  need(fs.lstatSync(file).isFile(), `Not a regular file: ${file}`);
  return fs.readFileSync(file);
}
function commitAt(repo, value) {
  try { return git(repo, ['rev-parse', '--verify', `${value}^{commit}`]); }
  catch { throw new Error(`Unresolvable Git commit: ${value}`); }
}
function blobAt(repo, commit, name) {
  relativePath(name);
  let oid;
  try { oid = git(repo, ['rev-parse', '--verify', `${commit}:${name}`]); }
  catch { throw new Error(`Tracked source missing at commit: ${name}`); }
  need(git(repo, ['cat-file', '-t', oid]) === 'blob', `Tracked source is not a blob: ${name}`);
  const tree = git(repo, ['ls-tree', commit, '--', name]);
  need(/^100(?:644|755) blob /.test(tree), `Tracked source is not a regular Git file: ${name}`);
  return oid;
}
function trackedDirty(repo) {
  // Check index and worktree content separately. Git may report an M for CRLF-only
  // representation changes even when both converted blobs still equal HEAD.
  return Boolean(git(repo, ['diff', '--cached', '--name-only', 'HEAD', '--']) ||
    git(repo, ['diff', '--name-only', '--']));
}
function artifactBytes(root, item) {
  need(item && Object.getPrototypeOf(item) === Object.prototype &&
    Object.keys(item).sort().join(',') === 'kind,path', 'Artifact spec needs only kind/path');
  need(['generated_json', 'generated_text', 'external'].includes(item.kind), 'Unknown artifact kind');
  const bytes = regularBytes(within(root, item.path));
  if (item.kind === 'generated_json') {
    let value;
    try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`Invalid generated JSON: ${item.path}`); }
    need(bytes.equals(canonicalJsonBytes(value)), `Noncanonical generated JSON bytes: ${item.path}`);
  }
  if (item.kind === 'generated_text') {
    const value = bytes.toString('utf8');
    need(!bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) &&
      Buffer.from(value, 'utf8').equals(bytes) && !value.includes('\r') && value.endsWith('\n') && !value.endsWith('\n\n'),
    `Generated text must be BOM-free UTF-8 with LF and one final newline: ${item.path}`);
  }
  return bytes;
}
export function writeCanonicalJsonArtifact(root, name, value) {
  const target = within(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, canonicalJsonBytes(value), { flag: 'wx' });
  return target;
}

export function prepareV2({ repo, root, trackedSourcePaths, artifacts }) {
  need(fs.existsSync(root) && fs.statSync(root).isDirectory(), 'Freeze root must exist');
  need(!fs.existsSync(path.join(root, manifestName)) && !fs.existsSync(path.join(root, sealName)), 'V2 freeze already exists');
  need(!trackedDirty(repo), 'Dirty tracked worktree: commit source changes before prepare');
  need(Array.isArray(trackedSourcePaths) && trackedSourcePaths.length > 0 &&
    new Set(trackedSourcePaths).size === trackedSourcePaths.length, 'Distinct tracked source paths required');
  need(Array.isArray(artifacts) && artifacts.length > 0 &&
    new Set(artifacts.map(item => item.path)).size === artifacts.length, 'Distinct artifacts required');
  const commit = commitAt(repo, 'HEAD');
  const files = [...trackedSourcePaths].sort().map(name => ({ path: relativePath(name), blob_oid: blobAt(repo, commit, name) }));
  const artifactRecords = artifacts.map(item => {
    const bytes = artifactBytes(root, item);
    return { path: item.path, kind: item.kind,
      serialization: item.kind === 'generated_json' ? JSON_SERIALIZATION_POLICY :
        item.kind === 'generated_text' ? TEXT_SERIALIZATION_POLICY : null,
      sha256_raw_bytes: rawSha256(bytes) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { freeze_schema_version: FREEZE_SCHEMA_VERSION,
    source_identity_policy_version: SOURCE_IDENTITY_POLICY, artifact_hash_policy_version: ARTIFACT_HASH_POLICY,
    tracked_sources: { repository_commit: commit, files }, artifacts: artifactRecords };
  const bytes = canonicalJsonBytes(manifest);
  fs.writeFileSync(path.join(root, manifestName), bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(root, sealName), `${rawSha256(bytes)}\n`, { flag: 'wx' });
  return { status: 'prepared_v2', freeze_hash: rawSha256(bytes), tracked_sources: files.length, artifacts: artifactRecords.length };
}

function verifyV2(repo, root) {
  const bytes = regularBytes(path.join(root, manifestName));
  need(regularBytes(path.join(root, sealName)).equals(Buffer.from(`${rawSha256(bytes)}\n`, 'utf8')), 'V2 FREEZE seal changed');
  const manifest = JSON.parse(bytes.toString('utf8'));
  need(bytes.equals(canonicalJsonBytes(manifest)), 'V2 manifest serialization changed');
  need(manifest.freeze_schema_version === FREEZE_SCHEMA_VERSION &&
    manifest.source_identity_policy_version === SOURCE_IDENTITY_POLICY &&
    manifest.artifact_hash_policy_version === ARTIFACT_HASH_POLICY, 'Unknown freeze policy version');
  need(!trackedDirty(repo), 'Dirty tracked worktree during V2 verification');
  const commit = commitAt(repo, manifest.tracked_sources.repository_commit), head = commitAt(repo, 'HEAD');
  need(Array.isArray(manifest.tracked_sources.files) && manifest.tracked_sources.files.length > 0, 'No V2 tracked sources');
  for (const source of manifest.tracked_sources.files) {
    need(blobAt(repo, commit, source.path) === source.blob_oid, `Frozen Git blob identity changed: ${source.path}`);
    need(blobAt(repo, head, source.path) === source.blob_oid, `Tracked source blob changed since freeze: ${source.path}`);
  }
  need(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, 'No V2 artifacts');
  for (const item of manifest.artifacts) {
    const bytes = artifactBytes(root, { path: item.path, kind: item.kind });
    const expectedSerialization = item.kind === 'generated_json' ? JSON_SERIALIZATION_POLICY :
      item.kind === 'generated_text' ? TEXT_SERIALIZATION_POLICY : null;
    need(item.serialization === expectedSerialization, `Unknown artifact serialization policy: ${item.path}`);
    need(rawSha256(bytes) === item.sha256_raw_bytes, `Raw artifact SHA-256 mismatch: ${item.path}`);
  }
  return { policy: 'v2', status: 'verified_v2', source_status: 'git_blob_match', artifact_status: 'exact_raw_bytes',
    repository_commit: commit, current_commit: head, freeze_hash: rawSha256(regularBytes(path.join(root, manifestName))) };
}

function verifyV1(repo, root) {
  const plan = JSON.parse(regularBytes(within(root, 'private/plan.json')).toString('utf8'));
  need(plan.freeze_schema_version === undefined || plan.freeze_schema_version === '1', 'Unknown freeze policy version');
  need(plan.source_hashes && Object.getPrototypeOf(plan.source_hashes) === Object.prototype &&
    typeof plan.code_commit === 'string', 'Unsupported historical v1 manifest');
  const seal = JSON.parse(regularBytes(within(root, 'private/seal.json')).toString('utf8'));
  need(regularBytes(path.join(root, 'FREEZE.sha256')).toString('utf8') === digest(Buffer.from(JSON.stringify(seal))), 'Historical FREEZE seal changed');
  for (const [name, expected] of Object.entries(seal)) {
    need(digest(regularBytes(within(root, name))) === expected, `Historical frozen artifact changed: ${name}`);
  }
  const mismatches = Object.entries(plan.source_hashes).filter(([name, expected]) => {
    try { return digest(regularBytes(path.resolve(repo, ...relativePath(name).split('/')))) !== expected; }
    catch { return true; }
  }).map(([name]) => name);
  if (mismatches.length === 0) return { policy: 'v1', status: 'exact_match', source_status: 'exact_historical_worktree_bytes',
    artifact_status: 'exact_raw_bytes', raw_worktree_bytes_mismatch: [], git_content_changed: [] };
  const changed = [];
  let comparable = plan.working_tree_dirty === false && !trackedDirty(repo);
  if (comparable) {
    try {
      const frozenCommit = commitAt(repo, plan.code_commit), head = commitAt(repo, 'HEAD');
      for (const name of Object.keys(plan.source_hashes)) if (blobAt(repo, frozenCommit, name) !== blobAt(repo, head, name)) changed.push(name);
    } catch { comparable = false; }
  }
  return { policy: 'v1', status: comparable && changed.length === 0 ? 'content_equivalent_git' : 'unverifiable',
    source_status: comparable && changed.length === 0 ? 'content_equivalent_git' : 'unverifiable',
    artifact_status: 'exact_raw_bytes', raw_worktree_bytes_mismatch: mismatches, git_content_changed: changed };
}

export function verifyFreeze({ repo, root }) {
  const v2 = fs.existsSync(path.join(root, manifestName)), v1 = fs.existsSync(path.join(root, 'FREEZE.sha256'));
  need(v2 !== v1, 'Expected exactly one known FREEZE format');
  return v2 ? verifyV2(repo, root) : verifyV1(repo, root);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const [command, root, third, fourth] = process.argv.slice(2);
    if (command === 'verify' && root) console.log(JSON.stringify(verifyFreeze({ root: path.resolve(root), repo: path.resolve(third ?? process.cwd()) }), null, 2));
    else if (command === 'prepare-v2' && root && third) {
      const config = JSON.parse(fs.readFileSync(third, 'utf8'));
      console.log(JSON.stringify(prepareV2({ root: path.resolve(root), repo: path.resolve(fourth ?? process.cwd()), ...config }), null, 2));
    } else throw new Error('Usage: freeze-identity.js verify <round> [repo] | prepare-v2 <round> <config.json> [repo]');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
