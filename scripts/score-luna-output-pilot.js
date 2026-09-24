// Mechanical scoring only. Does not generate, fix, retry or semantically grade answers.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildOutputContext } from '../src/ai/output/context.js';
import { parseOutputAnswer } from '../src/ai/output/parse.js';
const root = process.argv[2];
if (!root) throw new Error('Provide pilot directory');
const sha = x => createHash('sha256').update(x).digest('hex');
const bytes = fs.readFileSync(path.join(root, 'manifest.json'));
if (sha(bytes) !== fs.readFileSync(path.join(root, 'manifest.sha256'), 'utf8').trim()) throw new Error('Pilot manifest changed');
const manifest = JSON.parse(bytes), results = [], reviewCases = [];
for (const item of manifest.cases) {
  const dir = path.join(root, item.id), canonicalBytes = fs.readFileSync(path.join(dir, 'canonical.json'));
  if (sha(canonicalBytes) !== item.canonical_sha256 || sha(fs.readFileSync(path.join(dir, 'prompt.txt'))) !== item.prompt_sha256)
    throw new Error(`Frozen input changed: ${item.id}`);
  const canonical = JSON.parse(canonicalBytes), context = await buildOutputContext(canonical);
  if (context.context_id !== item.context_id) throw new Error('Context identity changed');
  const raw = fs.readFileSync(path.join(dir, 'response.txt'), 'utf8');
  const result = parseOutputAnswer(raw, context, { completed: true });
  results.push({ case_id: item.id, status: result.status, validation: result.validation, issues: result.issues,
    response_sha256: sha(raw), response_characters: raw.length,
    completion_source: 'agent_reported_file_complete_not_api_finish_reason',
    reported_usage: null, reported_cost: null });
  const usedIds = new Set();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
    for (const section of ['factors', 'yongshen_candidates', 'timing_candidates'])
      for (const entry of Array.isArray(parsed?.[section]) ? parsed[section] : [])
        for (const id of Array.isArray(entry?.evidence_ids) ? entry.evidence_ids : []) usedIds.add(id);
  } catch { /* Invalid model output remains intact for reviewer. */ }
  reviewCases.push({ id: item.id, question: item.question, expectations: item.expectations,
    program_facts: context.input.C_canonical_cast,
    cited_evidence: [...usedIds].map(id => context.evidence.find(e => e.id === id) ?? { id, missing: true }),
    response: raw });
}
const report = { pilot: manifest.pilot, model_requested: manifest.model_requested,
  independent_holdout: false, deepseek_api_test: false, source_manifest_sha256: sha(bytes),
  attempted: results.length, mechanically_valid: results.filter(x => x.status === 'validated').length, results };
const json = x => JSON.stringify(x, null, 2) + '\n';
fs.writeFileSync(path.join(root, 'mechanical-report.json'), json(report), { flag: 'wx' });
fs.writeFileSync(path.join(root, 'review-packet.json'), json({ rubric: manifest.scoring.semantic,
  instructions: 'Judge semantic claims using exact response quotes and input facts. Do not repair answers. Mark undecidable claims unknown. Mechanical validation results intentionally omitted.',
  cases: reviewCases }), { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
