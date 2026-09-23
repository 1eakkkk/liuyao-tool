// One-shot, offline holdout runner. Predictions are sealed before ground truth is scored.
// This is separate from the unchanged development evaluator so its output cannot be
// overwritten by that evaluator's CLI.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planQuery } from '../../src/knowledge/query-plan.js';
import { QUERY_PLAN_VERSION } from '../../src/knowledge/query-plan-schema.js';
import { QUERY_INTENT_PATTERNS_VERSION } from '../../src/knowledge/query-intent-patterns.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { stableJson } from '../../src/knowledge/validate.js';
import { caseContext, matchesCompletePlan, selectionSafety, comparablePlan } from './eval-query-planner.js';
import { verifyQueryPlanningFreeze, FREEZE_ID } from './freeze-query-planning.js';
import { canonicalJsonBytes, rawSha256, SOURCE_IDENTITY_POLICY, ARTIFACT_HASH_POLICY } from '../experiments/freeze-identity.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const round = path.join(repo, 'test-results', 'phase8b-query-planner-holdout-01');
const implementationCommit = '1bc96dba7709fd63e915871a84df051f37ffdd03';
const freezeHash = 'sha256:f8567161f152a5295965d3beb4eb9df8f5480bb713a01bbaca57f6b0c837401f';
const executionId = 'phase8b-query-planner-holdout-01';
const benchmarkPath = 'experiments/phase8/query-planning/benchmark.json';
const helperPath = fileURLToPath(import.meta.url);
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const need = (condition, message) => { if (!condition) throw new Error(message); };
const read = name => JSON.parse(fs.readFileSync(path.join(round, name), 'utf8'));
const bytes = name => fs.readFileSync(path.join(round, name));
const write = (name, value) => fs.writeFileSync(path.join(round, name), canonicalJsonBytes(value), { flag: 'wx' });
const hash = name => rawSha256(bytes(name));
const same = (a, b) => stableJson(a) === stableJson(b);
const ids = values => values.map(x => typeof x === 'string' ? x : x.concept_id);
const equalSet = (a, b) => same([...new Set(a)].sort(), [...new Set(b)].sort());
const intersection = (a, b) => a.filter(x => b.includes(x)).length;
const precision = (tp, predicted) => predicted ? tp / predicted : 1;
const recall = (tp, expected) => expected ? tp / expected : 1;

function sourceIdentity() {
  need(git('rev-parse', 'HEAD') === implementationCommit, 'Planner implementation HEAD changed');
  need(!git('diff', '--name-only', 'HEAD', '--') && !git('diff', '--cached', '--name-only', 'HEAD', '--'),
    'Tracked source is dirty');
  const frozen = verifyQueryPlanningFreeze();
  need(frozen.status === 'verified_v2' && frozen.freeze_id === FREEZE_ID && frozen.freeze_hash === freezeHash,
    'Frozen benchmark verification failed');
  return frozen;
}
function benchmark() {
  const value = JSON.parse(fs.readFileSync(path.join(repo, benchmarkPath), 'utf8'));
  need(value.version === 'query-planning-candidate-1.1', 'Benchmark version changed');
  const holdout = value.cases.filter(item => item.split === 'holdout');
  need(holdout.length === 24 && new Set(holdout.map(x => x.case_id)).size === 24, 'Holdout count/IDs changed');
  return { value, holdout };
}
function assertExecution() {
  const execution = read('execution.json');
  need(execution.execution_id === executionId && execution.implementation_commit === implementationCommit &&
    execution.benchmark_freeze_id === FREEZE_ID && execution.benchmark_freeze_hash === freezeHash &&
    execution.helper_raw_hash === rawSha256(fs.readFileSync(helperPath)), 'Execution metadata or runner changed');
  return execution;
}
function prepare() {
  need(!fs.existsSync(round), 'Holdout round already exists');
  sourceIdentity();
  const { value, holdout } = benchmark();
  fs.mkdirSync(round, { recursive: false });
  write('execution.json', {
    execution_id: executionId, prepared_at: new Date().toISOString(), repository_commit: implementationCommit,
    implementation_commit: implementationCommit, planner_contract_version: QUERY_PLAN_VERSION,
    pattern_version: QUERY_INTENT_PATTERNS_VERSION, benchmark_freeze_id: FREEZE_ID,
    benchmark_freeze_hash: freezeHash, benchmark_version: value.version,
    evaluator_path: 'scripts/phase8/eval-query-planner.js',
    evaluator_blob_oid: git('rev-parse', `HEAD:scripts/phase8/eval-query-planner.js`),
    planner_blob_oid: git('rev-parse', 'HEAD:src/knowledge/query-plan.js'),
    pattern_blob_oid: git('rev-parse', 'HEAD:src/knowledge/query-intent-patterns.js'),
    runner_path: 'scripts/phase8/run-query-planner-holdout.js',
    helper_raw_hash: rawSha256(fs.readFileSync(helperPath)),
    split: 'holdout', expected_case_count: holdout.length, deterministic: true,
    ai_used: false, network_required: false, holdout_exposure_before_run: false,
    source_identity_policy: SOURCE_IDENTITY_POLICY, result_hash_policy: ARTIFACT_HASH_POLICY
  });
  return { execution_id: executionId, execution_manifest: path.join(round, 'execution.json'),
    execution_manifest_hash: hash('execution.json'), holdout_exposure: false };
}
function predict({ acknowledgeHoldoutExposure }) {
  need(acknowledgeHoldoutExposure === true, 'Holdout predictions require --acknowledge-holdout-exposure');
  sourceIdentity();
  const execution = assertExecution();
  need(!fs.existsSync(path.join(round, 'exposure.json')) && !fs.existsSync(path.join(round, 'raw-predictions.json')),
    'Holdout already started: first exposure cannot be repeated');
  const { holdout } = benchmark();
  const catalog = JSON.parse(fs.readFileSync(path.join(repo, 'knowledge/catalog/catalog.json'), 'utf8'));
  const map = JSON.parse(fs.readFileSync(path.join(repo, 'knowledge/catalog/rule-concept-map.json'), 'utf8'));
  const rawCorpus = readCorpus({ version: 'phase8a-month-combine-hardening-1' });
  const index = loadCorpus({ version: 'phase8a-month-combine-hardening-1' }, {
    ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION });
  const corpus = { ...index, units: rawCorpus.units };
  const fixtures = new Map();
  // Persist exposure before the first planner call. If execution fails, do not retry silently.
  write('exposure.json', { execution_id: execution.execution_id, first_holdout_exposure_at: new Date().toISOString(),
    holdout_exposure: true, first_holdout_execution_id: executionId,
    implementation_commit: implementationCommit, benchmark_freeze_id: FREEZE_ID });
  const predictions = [];
  for (const item of holdout) {
    try { predictions.push({ case_id: item.case_id, plan: planQuery(caseContext(item, fixtures, catalog, map, corpus)) }); }
    catch (error) { predictions.push({ case_id: item.case_id, plan: null, error: String(error.message) }); }
  }
  need(predictions.length === 24, 'Incomplete holdout prediction count');
  write('raw-predictions.json', { execution_id: executionId, split: 'holdout',
    implementation_commit: implementationCommit, benchmark_freeze_id: FREEZE_ID, predictions });
  write('raw-seal.json', { execution_id: executionId, raw_prediction_file: 'raw-predictions.json',
    raw_prediction_bytes: bytes('raw-predictions.json').length,
    raw_prediction_sha256: hash('raw-predictions.json'), case_count: predictions.length,
    implementation_commit: implementationCommit, benchmark_freeze_id: FREEZE_ID,
    execution_metadata_sha256: hash('execution.json'), exposure_metadata_sha256: hash('exposure.json') });
  // No ground-truth comparison has occurred before this point.
  return { execution_id: executionId, raw_prediction_path: path.join(round, 'raw-predictions.json'),
    raw_prediction_sha256: hash('raw-predictions.json'), raw_seal_sha256: hash('raw-seal.json'),
    case_count: predictions.length, holdout_exposure: true };
}
function assertRawSeal() {
  const execution = assertExecution();
  const exposure = read('exposure.json');
  const seal = read('raw-seal.json');
  need(exposure.holdout_exposure === true && exposure.execution_id === executionId,
    'Holdout exposure metadata missing');
  need(seal.execution_id === executionId && seal.raw_prediction_sha256 === hash('raw-predictions.json') &&
    seal.raw_prediction_bytes === bytes('raw-predictions.json').length && seal.case_count === 24 &&
    seal.execution_metadata_sha256 === hash('execution.json') &&
    seal.exposure_metadata_sha256 === hash('exposure.json'), 'Raw prediction seal mismatch');
  return { execution, exposure, seal };
}
function classify(expected, actual, safety) {
  const kinds = [];
  const wanted = ids(expected.requested_concepts), got = ids(actual.requested_concepts);
  if (got.some(x => !wanted.includes(x))) kinds.push('intent_false_positive');
  if (wanted.some(x => !got.includes(x))) kinds.push('intent_false_negative');
  if (expected.question_scope !== actual.question_scope) kinds.push('scope_error');
  if (expected.status !== actual.status) kinds.push('status_error');
  if (!equalSet(expected.constraints.exclude_concepts, actual.constraints.exclude_concepts)) kinds.push('exclusion_error');
  if (expected.excluded_concepts.some(x => x.reason === 'case_relation_not_present') !==
    actual.excluded_concepts.some(x => x.reason === 'case_relation_not_present')) kinds.push('anchor_error');
  if (expected.excluded_concepts.some(x => x.reason === 'knowledge_not_admitted') !==
    actual.excluded_concepts.some(x => x.reason === 'knowledge_not_admitted')) kinds.push('admission_error');
  if (expected.constraints.narrow_request !== actual.constraints.narrow_request) kinds.push('narrow_request_error');
  if (!same(expected.unresolved_mentions, actual.unresolved_mentions)) kinds.push('unresolved_mention_error');
  if ((expected.status === 'needs_narrowing') !== (actual.status === 'needs_narrowing')) kinds.push('too_many_topics_error');
  if (safety.false_positive_concepts.length) kinds.push('false_positive_knowledge_injection');
  if (safety.false_negative_concepts.length) kinds.push('false_negative_knowledge_omission');
  if (!kinds.length) kinds.push('other');
  return kinds;
}
function score() {
  sourceIdentity();
  const { execution, exposure, seal } = assertRawSeal();
  need(!fs.existsSync(path.join(round, 'score-report.json')) && !fs.existsSync(path.join(round, 'HOLDOUT.sha256')),
    'Holdout was already scored/sealed');
  const raw = read('raw-predictions.json');
  const { holdout } = benchmark();
  need(raw.execution_id === executionId && raw.benchmark_freeze_id === FREEZE_ID && raw.predictions.length === 24,
    'Raw prediction identity/count changed');
  need(raw.predictions.every((p, i) => p.case_id === holdout[i].case_id), 'Raw prediction case order/ID changed');
  const totals = { primary_plan_match: 0, alternate_plan_match: 0, accepted_plan_match: 0,
    requested_exact_set: 0, selected_exact_set: 0, false_positive_knowledge_injection: 0,
    false_negative_knowledge_omission: 0, zero_knowledge_correct: 0, zero_knowledge_cases: 0,
    explicit_exclusion_correct: 0, explicit_exclusion_cases: 0, needs_narrowing_correct: 0,
    needs_narrowing_cases: 0, case_anchor_compliant: 0, case_anchor_cases: 0,
    knowledge_admission_compliant: 0, knowledge_admission_cases: 0,
    question_scope_correct: 0, status_correct: 0, unresolved_mention_correct: 0 };
  const count = { requested_tp: 0, requested_predicted: 0, requested_expected: 0,
    selected_tp: 0, selected_predicted: 0, selected_expected: 0 };
  const results = [], errors = [], false_positive_cases = [], false_negative_cases = [];
  for (let i = 0; i < holdout.length; i++) {
    const item = holdout[i], actual = raw.predictions[i].plan, expected = item.primary_expected_plan;
    if (actual === null) {
      errors.push({ case_id: item.case_id, categories: ['other'], error: raw.predictions[i].error });
      results.push({ case_id: item.case_id, primary_match: false, alternate_match: false, accepted_match: false,
        planner_exception: raw.predictions[i].error });
      continue;
    }
    const primary = matchesCompletePlan(actual, expected);
    const alternate = item.acceptable_plans.some(alt => matchesCompletePlan(actual, alt));
    const accepted = primary || alternate;
    totals.primary_plan_match += Number(primary);
    totals.alternate_plan_match += Number(alternate);
    totals.accepted_plan_match += Number(accepted);
    const wanted = ids(expected.requested_concepts), got = ids(actual.requested_concepts);
    const expectedSelected = expected.selected_concepts, actualSelected = actual.selected_concepts;
    totals.requested_exact_set += Number(equalSet(wanted, got));
    totals.selected_exact_set += Number(equalSet(expectedSelected, actualSelected));
    count.requested_tp += intersection(got, wanted);
    count.requested_predicted += got.length; count.requested_expected += wanted.length;
    count.selected_tp += intersection(actualSelected, expectedSelected);
    count.selected_predicted += actualSelected.length; count.selected_expected += expectedSelected.length;
    const safety = selectionSafety(actual, item);
    totals.false_positive_knowledge_injection += Number(Boolean(safety.false_positive_concepts.length));
    totals.false_negative_knowledge_omission += Number(Boolean(safety.false_negative_concepts.length));
    const allowed = [...new Set([expected, ...item.acceptable_plans].flatMap(plan => plan.selected_concepts))].sort();
    for (const concept of safety.false_positive_concepts) {
      const request = actual.requested_concepts.find(x => x.concept_id === concept);
      false_positive_cases.push({ case_id: item.case_id, user_wording: item.user_question,
        actual_selected_concept: concept, allowed_selected_concepts: allowed,
        responsible_deterministic_pattern: request ? `${request.basis}:${request.question_span.matched_text}` : 'no matched request',
        retrieval_query_occurred: actual.retrieval_query !== null,
        risk: 'Knowledge retrieval was planned for a concept absent from every frozen accepted plan.' });
    }
    for (const concept of safety.false_negative_concepts) {
      const request = actual.requested_concepts.find(x => x.concept_id === concept);
      const excluded = actual.excluded_concepts.find(x => x.concept_id === concept);
      false_negative_cases.push({ case_id: item.case_id, expected_concept: concept,
        actual_requested_concepts: got, actual_selected_concepts: actualSelected,
        cause: !request ? 'intent_recognition_omission' : excluded?.reason ?? 'selection_omission',
        responsible_deterministic_pattern: request ? `${request.basis}:${request.question_span.matched_text}` : 'no safe term match',
        conservative_fail_closed: Boolean(excluded) });
    }
    if (expected.status === 'zero_knowledge') {
      totals.zero_knowledge_cases++;
      totals.zero_knowledge_correct += Number(actual.status === 'zero_knowledge');
    }
    if (expected.constraints.exclude_concepts.length) {
      totals.explicit_exclusion_cases++;
      totals.explicit_exclusion_correct += Number(equalSet(expected.constraints.exclude_concepts, actual.constraints.exclude_concepts));
    }
    if (expected.status === 'needs_narrowing') {
      totals.needs_narrowing_cases++;
      totals.needs_narrowing_correct += Number(actual.status === 'needs_narrowing');
    }
    const anchorExcluded = expected.excluded_concepts.filter(x => x.reason === 'case_relation_not_present').map(x => x.concept_id);
    if (anchorExcluded.length) {
      totals.case_anchor_cases++;
      totals.case_anchor_compliant += Number(!actualSelected.some(id => anchorExcluded.includes(id)));
    }
    const admissionExcluded = expected.excluded_concepts.filter(x => x.reason === 'knowledge_not_admitted').map(x => x.concept_id);
    if (admissionExcluded.length) {
      totals.knowledge_admission_cases++;
      totals.knowledge_admission_compliant += Number(!actualSelected.some(id => admissionExcluded.includes(id)));
    }
    totals.question_scope_correct += Number(actual.question_scope === expected.question_scope);
    totals.status_correct += Number(actual.status === expected.status);
    totals.unresolved_mention_correct += Number(same(actual.unresolved_mentions, expected.unresolved_mentions));
    if (!accepted) errors.push({ case_id: item.case_id, categories: classify(expected, actual, safety),
      expected_summary: comparablePlan(expected), actual_summary: comparablePlan(actual),
      responsible_pattern: actual.requested_concepts.map(x => `${x.basis}:${x.question_span.matched_text}`).join(', ') || 'no safe term match' });
    results.push({ case_id: item.case_id, primary_match: primary, alternate_match: alternate,
      accepted_match: accepted, question_scope: actual.question_scope, status: actual.status,
      selected_concepts: actualSelected });
  }
  const error_categories = {};
  for (const error of errors) for (const category of error.categories)
    error_categories[category] = (error_categories[category] ?? 0) + 1;
  const report = { execution_id: executionId, split: 'holdout', holdout_exposure: true,
    first_holdout_exposure_at: exposure.first_holdout_exposure_at,
    implementation_commit: implementationCommit, benchmark_freeze_id: FREEZE_ID,
    benchmark_freeze_hash: freezeHash, raw_prediction_sha256: seal.raw_prediction_sha256,
    scoring_reference: 'frozen primary complete plan or one frozen acceptable complete plan; layer metrics use primary',
    cases: holdout.length, metrics: { ...totals,
      requested_precision: precision(count.requested_tp, count.requested_predicted),
      requested_recall: recall(count.requested_tp, count.requested_expected),
      selected_precision: precision(count.selected_tp, count.selected_predicted),
      selected_recall: recall(count.selected_tp, count.selected_expected) },
    metric_counts: count, error_categories, failed_case_ids: errors.map(x => x.case_id),
    results, errors, false_positive_cases, false_negative_cases,
    development_reference: { accepted_plan_match: 48, cases: 48, status: 'development/debugging, not unseen' },
    limitations: ['24 frozen holdout questions are a benchmark, not a natural-language population sample.',
      'No second holdout run was used to establish determinism.',
      'Exact-set and precision/recall layers use the primary plan even where a complete alternative is accepted.',
      'This measures intent and retrieval planning, not divination or production answer quality.'] };
  write('score-report.json', report);
  const resultSeal = { execution_id: executionId, implementation_commit: implementationCommit,
    benchmark_freeze_id: FREEZE_ID, benchmark_freeze_hash: freezeHash,
    execution_metadata_sha256: hash('execution.json'), exposure_metadata_sha256: hash('exposure.json'),
    raw_seal_sha256: hash('raw-seal.json'), raw_prediction_sha256: seal.raw_prediction_sha256,
    score_report_sha256: hash('score-report.json'), holdout_exposure: true,
    first_holdout_exposure_at: exposure.first_holdout_exposure_at,
    source_identity_policy: SOURCE_IDENTITY_POLICY, result_hash_policy: ARTIFACT_HASH_POLICY,
    tracked_source_blobs: {
      evaluator: execution.evaluator_blob_oid, planner: execution.planner_blob_oid, patterns: execution.pattern_blob_oid
    }, runner_raw_hash: execution.helper_raw_hash };
  write('HOLDOUT.json', resultSeal);
  fs.writeFileSync(path.join(round, 'HOLDOUT.sha256'), `${hash('HOLDOUT.json')}\n`, { flag: 'wx' });
  return { execution_id: executionId, score_report: path.join(round, 'score-report.json'),
    score_report_sha256: hash('score-report.json'), holdout_seal: path.join(round, 'HOLDOUT.json'),
    holdout_seal_sha256: hash('HOLDOUT.json'), metrics: report.metrics,
    error_categories: report.error_categories, failed_case_ids: report.failed_case_ids };
}
function verify() {
  sourceIdentity();
  const { execution, exposure, seal } = assertRawSeal();
  const result = read('HOLDOUT.json');
  need(bytes('HOLDOUT.sha256').equals(Buffer.from(`${hash('HOLDOUT.json')}\n`)), 'Holdout seal hash changed');
  need(result.execution_id === execution.execution_id && result.holdout_exposure === true &&
    result.first_holdout_exposure_at === exposure.first_holdout_exposure_at &&
    result.raw_prediction_sha256 === seal.raw_prediction_sha256 &&
    result.score_report_sha256 === hash('score-report.json') &&
    result.execution_metadata_sha256 === hash('execution.json') &&
    result.exposure_metadata_sha256 === hash('exposure.json') &&
    result.raw_seal_sha256 === hash('raw-seal.json'), 'Holdout result seal mismatch');
  return { status: 'verified', execution_id: executionId, holdout_seal_sha256: hash('HOLDOUT.json'),
    raw_prediction_sha256: seal.raw_prediction_sha256, score_report_sha256: result.score_report_sha256,
    holdout_exposure: true };
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'prepare' && args.length === 0) console.log(JSON.stringify(prepare(), null, 2));
  else if (command === 'predict' && args.length === 3 && args[0] === '--split' && args[1] === 'holdout' &&
    args[2] === '--acknowledge-holdout-exposure')
    console.log(JSON.stringify(predict({ acknowledgeHoldoutExposure: true }), null, 2));
  else if (command === 'score' && args.length === 0) console.log(JSON.stringify(score(), null, 2));
  else if (command === 'verify' && args.length === 0) console.log(JSON.stringify(verify(), null, 2));
  else throw new Error('Usage: run-query-planner-holdout.js prepare | predict --split holdout --acknowledge-holdout-exposure | score | verify');
} catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
