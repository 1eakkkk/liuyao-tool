// Phase 8B.2 one-shot deterministic Task Gate holdout runner.
// Raw predictions are sealed BEFORE frozen ground truth is scored.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { planTaskGate12 } from '../../src/knowledge/query-plan-v1.2.js';
import { QUERY_PLAN_VERSION_12 } from '../../src/knowledge/query-plan-schema-v1.2.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { stableJson } from '../../src/knowledge/validate.js';
import { caseContext } from './eval-query-planner.js';
import {
  verifyTaskGateFreeze,
  FREEZE_ID
} from './freeze-task-gate-benchmark.js';
import {
  canonicalJsonBytes,
  rawSha256,
  SOURCE_IDENTITY_POLICY,
  ARTIFACT_HASH_POLICY
} from '../experiments/freeze-identity.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));

const round = path.join(
  repo,
  'test-results',
  'phase8b2-task-gate-holdout-01'
);

const implementationCommit =
  'c1fd7c1ea868546987b77abf4a8c0283bc2c6d34';

const freezeHash =
  'sha256:c55d4389440ce845f239265ffd5d5f75b35093e4e4f5fc310b8f8b16ff24a5ae';

const executionId =
  'phase8b2-task-gate-holdout-01';

const benchmarkPath =
  'experiments/phase8/query-planning-task-gate/benchmark.json';

const benchmarkVersion =
  'query-planning-task-gate-candidate-1.2';

const patternVersion =
  'task-gate-patterns-1.0';

const runnerPath =
  'scripts/phase8/run-task-gate-holdout.js';

const helperPath = fileURLToPath(import.meta.url);

const git = (...args) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

const need = (condition, message) => {
  if (!condition) throw new Error(message);
};

const read = name =>
  JSON.parse(
    fs.readFileSync(path.join(round, name), 'utf8')
  );

const bytes = name =>
  fs.readFileSync(path.join(round, name));

const write = (name, value) =>
  fs.writeFileSync(
    path.join(round, name),
    canonicalJsonBytes(value),
    { flag: 'wx' }
  );

const hash = name =>
  rawSha256(bytes(name));

const same = (a, b) =>
  stableJson(a) === stableJson(b);

const sameSet = (a, b) =>
  same(
    [...new Set(a)].sort(),
    [...new Set(b)].sort()
  );

const ids = values =>
  values.map(value =>
    typeof value === 'string'
      ? value
      : value.concept_id
  );

const intersection = (a, b) =>
  a.filter(x => b.includes(x)).length;

const ratio = (n, d) =>
  d ? n / d : 1;

const fields = [
  'question_scope',
  'knowledge_task',
  'status',
  'requested_concepts',
  'selected_concepts',
  'excluded_concepts',
  'constraints',
  'unresolved_mentions',
  'task_evidence',
  'task_conflict',
  'ambiguity_reasons',
  'request_relation',
  'output_directives',
  'retrieval_query'
];

const comparable = value =>
  Object.fromEntries(
    fields.map(key => [key, value[key]])
  );

function sourceIdentity() {
  need(
    git('rev-parse', 'HEAD') === implementationCommit,
    'Planner implementation HEAD changed'
  );

  need(
    !git('diff', '--name-only', 'HEAD', '--') &&
    !git('diff', '--cached', '--name-only', 'HEAD', '--'),
    'Tracked source is dirty'
  );

  const frozen = verifyTaskGateFreeze();

  need(
    frozen.status === 'verified_v2' &&
    frozen.freeze_id === FREEZE_ID &&
    frozen.freeze_hash === freezeHash,
    'Frozen task-gate benchmark verification failed'
  );

  need(
    QUERY_PLAN_VERSION_12 === 'query-plan-1.2',
    'Planner contract version changed'
  );

  return frozen;
}

function benchmark() {
  const value = JSON.parse(
    fs.readFileSync(
      path.join(repo, benchmarkPath),
      'utf8'
    )
  );

  need(
    value.version === benchmarkVersion,
    'Benchmark version changed'
  );

  const holdout =
    value.cases.filter(
      item => item.split === 'holdout'
    );

  need(
    holdout.length === 32 &&
    new Set(
      holdout.map(item => item.case_id)
    ).size === 32,
    'Holdout count/IDs changed'
  );

  need(
    holdout.every(
      item =>
        typeof item.family_id === 'string' &&
        item.family_id.length > 0
    ),
    'Holdout family identity missing'
  );

  need(
    new Set(
      holdout.map(item => item.family_id)
    ).size === 8,
    'Holdout family count changed'
  );

  return { value, holdout };
}

function assertExecution() {
  const execution = read('execution.json');

  need(
    execution.execution_id === executionId &&
    execution.implementation_commit === implementationCommit &&
    execution.benchmark_freeze_id === FREEZE_ID &&
    execution.benchmark_freeze_hash === freezeHash &&
    execution.helper_raw_hash ===
      rawSha256(fs.readFileSync(helperPath)),
    'Execution metadata or runner changed'
  );

  return execution;
}

function prepare() {
  need(
    !fs.existsSync(round),
    'Holdout round already exists'
  );

  sourceIdentity();

  const { value, holdout } = benchmark();

  fs.mkdirSync(round, { recursive: false });

  write('execution.json', {
    execution_id: executionId,
    prepared_at: new Date().toISOString(),

    repository_commit: implementationCommit,
    implementation_commit: implementationCommit,

    planner_contract_version:
      QUERY_PLAN_VERSION_12,

    pattern_version: patternVersion,

    benchmark_freeze_id: FREEZE_ID,
    benchmark_freeze_hash: freezeHash,
    benchmark_version: value.version,

    benchmark_blob_oid: git(
      'rev-parse',
      `HEAD:${benchmarkPath}`
    ),

    planner_blob_oid: git(
      'rev-parse',
      'HEAD:src/knowledge/query-plan-v1.2.js'
    ),

    schema_blob_oid: git(
      'rev-parse',
      'HEAD:src/knowledge/query-plan-schema-v1.2.js'
    ),

    runner_path: runnerPath,
    helper_raw_hash:
      rawSha256(fs.readFileSync(helperPath)),

    split: 'holdout',
    expected_case_count: holdout.length,

    deterministic: true,
    ai_used: false,
    network_required: false,

    new_holdout_exposure_before_run: false,
    old_phase8b1_holdout_exposure: true,

    source_identity_policy:
      SOURCE_IDENTITY_POLICY,

    result_hash_policy:
      ARTIFACT_HASH_POLICY
  });

  return {
    execution_id: executionId,
    implementation_commit: implementationCommit,
    benchmark_freeze_id: FREEZE_ID,
    benchmark_freeze_hash: freezeHash,
    execution_manifest:
      path.join(round, 'execution.json'),
    execution_manifest_hash:
      hash('execution.json'),
    expected_case_count: holdout.length,
    new_holdout_exposure: false
  };
}

function predict({ acknowledgeHoldoutExposure }) {
  need(
    acknowledgeHoldoutExposure === true,
    'Holdout predictions require --acknowledge-holdout-exposure'
  );

  sourceIdentity();

  const execution = assertExecution();

  need(
    !fs.existsSync(
      path.join(round, 'exposure.json')
    ) &&
    !fs.existsSync(
      path.join(round, 'raw-predictions.json')
    ),
    'New holdout already started: first exposure cannot be repeated'
  );

  const { holdout } = benchmark();

  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(
        repo,
        'knowledge/catalog/catalog.json'
      ),
      'utf8'
    )
  );

  const map = JSON.parse(
    fs.readFileSync(
      path.join(
        repo,
        'knowledge/catalog/rule-concept-map.json'
      ),
      'utf8'
    )
  );

  const rawCorpus = readCorpus({
    version:
      'phase8a-month-combine-hardening-1'
  });

  const index = loadCorpus(
    {
      version:
        'phase8a-month-combine-hardening-1'
    },
    {
      ruleIds: RULES.map(x => x.rule_id),
      rulesetVersion: RULESET_VERSION
    }
  );

  const corpus = {
    ...index,
    units: rawCorpus.units
  };

  const fixtures = new Map();

  // Exposure is persisted BEFORE the first planner call.
  // If this run fails after this point, do NOT silently retry.
  write('exposure.json', {
    execution_id: execution.execution_id,
    first_holdout_exposure_at:
      new Date().toISOString(),
    holdout_exposure: true,
    first_holdout_execution_id:
      executionId,
    implementation_commit:
      implementationCommit,
    benchmark_freeze_id:
      FREEZE_ID
  });

  const predictions = [];

  for (const item of holdout) {
    try {
      const context = caseContext(
        item,
        fixtures,
        catalog,
        map,
        corpus
      );

      predictions.push({
        case_id: item.case_id,
        plan: planTaskGate12(context)
      });
    } catch (error) {
      predictions.push({
        case_id: item.case_id,
        plan: null,
        error: String(error.message)
      });
    }
  }

  need(
    predictions.length === 32,
    'Incomplete new holdout prediction count'
  );

  write('raw-predictions.json', {
    execution_id: executionId,
    split: 'holdout',
    implementation_commit:
      implementationCommit,
    benchmark_freeze_id:
      FREEZE_ID,
    predictions
  });

  write('raw-seal.json', {
    execution_id: executionId,

    raw_prediction_file:
      'raw-predictions.json',

    raw_prediction_bytes:
      bytes('raw-predictions.json').length,

    raw_prediction_sha256:
      hash('raw-predictions.json'),

    case_count:
      predictions.length,

    implementation_commit:
      implementationCommit,

    benchmark_freeze_id:
      FREEZE_ID,

    execution_metadata_sha256:
      hash('execution.json'),

    exposure_metadata_sha256:
      hash('exposure.json')
  });

  // Frozen ground truth has NOT been scored before this point.
  return {
    execution_id: executionId,

    raw_prediction_path:
      path.join(
        round,
        'raw-predictions.json'
      ),

    raw_prediction_sha256:
      hash('raw-predictions.json'),

    raw_seal_sha256:
      hash('raw-seal.json'),

    case_count:
      predictions.length,

    holdout_exposure: true
  };
}

function assertRawSeal() {
  const execution = assertExecution();
  const exposure = read('exposure.json');
  const seal = read('raw-seal.json');

  need(
    exposure.holdout_exposure === true &&
    exposure.execution_id === executionId,
    'Holdout exposure metadata missing'
  );

  need(
    seal.execution_id === executionId &&
    seal.raw_prediction_sha256 ===
      hash('raw-predictions.json') &&
    seal.raw_prediction_bytes ===
      bytes('raw-predictions.json').length &&
    seal.case_count === 32 &&
    seal.execution_metadata_sha256 ===
      hash('execution.json') &&
    seal.exposure_metadata_sha256 ===
      hash('exposure.json'),
    'Raw prediction seal mismatch'
  );

  return {
    execution,
    exposure,
    seal
  };
}

function score() {
  sourceIdentity();

  const {
    execution,
    exposure,
    seal
  } = assertRawSeal();

  need(
    !fs.existsSync(
      path.join(round, 'score-report.json')
    ) &&
    !fs.existsSync(
      path.join(round, 'HOLDOUT.sha256')
    ),
    'Holdout was already scored/sealed'
  );

  const raw =
    read('raw-predictions.json');

  const { holdout } = benchmark();

  need(
    raw.execution_id === executionId &&
    raw.benchmark_freeze_id === FREEZE_ID &&
    raw.predictions.length === 32,
    'Raw prediction identity/count changed'
  );

  need(
    raw.predictions.every(
      (prediction, index) =>
        prediction.case_id ===
        holdout[index].case_id
    ),
    'Raw prediction case order/ID changed'
  );

  const totals = {
    cases: 32,
    planner_exceptions: 0,

    task_correct: 0,
    task_conflict_correct: 0,
    scope_correct: 0,
    status_correct: 0,

    requested_exact_set: 0,
    requested_tp: 0,
    requested_predicted: 0,
    requested_expected: 0,

    per_concept_use_correct: 0,
    per_concept_use_total: 0,

    selected_exact_set: 0,
    selected_tp: 0,
    selected_predicted: 0,
    selected_expected: 0,

    output_policy_correct: 0,
    strict_full_contract: 0,

    false_positive_knowledge_injection: 0,
    false_negative_knowledge_omission: 0,

    explicit_no_k_violations: 0,
    missing_anchor_injections: 0,
    admission_violations: 0,
    exclusion_violations: 0,

    zero_knowledge_cases: 0,
    zero_knowledge_correct: 0,

    explicit_exclusion_cases: 0,
    explicit_exclusion_compliant: 0,

    missing_anchor_cases: 0,
    missing_anchor_compliant: 0,

    admission_cases: 0,
    admission_compliant: 0,

    needs_narrowing_cases: 0,
    needs_narrowing_correct: 0
  };

  const results = [];
  const falsePositiveCases = [];
  const falseNegativeCases = [];

  for (
    let index = 0;
    index < holdout.length;
    index++
  ) {
    const item = holdout[index];

    const prediction =
      raw.predictions[index];

    const expected =
      item.primary_expected_plan;

    const actual =
      prediction.plan;

    if (actual === null) {
      totals.planner_exceptions++;

      results.push({
        case_id: item.case_id,
        planner_exception:
          prediction.error ?? 'unknown error'
      });

      continue;
    }

    const expectedRequested =
      ids(expected.requested_concepts);

    const actualRequested =
      ids(actual.requested_concepts);

    const expectedSelected =
      expected.selected_concepts;

    const actualSelected =
      actual.selected_concepts;

    const falsePositive =
      actualSelected.filter(
        id => !expectedSelected.includes(id)
      );

    const falseNegative =
      expectedSelected.filter(
        id => !actualSelected.includes(id)
      );

    totals.task_correct +=
      Number(
        actual.knowledge_task ===
        expected.knowledge_task
      );

    totals.task_conflict_correct +=
      Number(
        same(
          actual.task_conflict,
          expected.task_conflict
        )
      );

    totals.scope_correct +=
      Number(
        actual.question_scope ===
        expected.question_scope
      );

    totals.status_correct +=
      Number(
        actual.status ===
        expected.status
      );

    totals.requested_exact_set +=
      Number(
        sameSet(
          actualRequested,
          expectedRequested
        )
      );

    totals.requested_tp +=
      intersection(
        actualRequested,
        expectedRequested
      );

    totals.requested_predicted +=
      actualRequested.length;

    totals.requested_expected +=
      expectedRequested.length;

    for (
      const request
      of expected.requested_concepts
    ) {
      totals.per_concept_use_total++;

      const actualRequest =
        actual.requested_concepts.find(
          value =>
            value.concept_id ===
            request.concept_id
        );

      if (
        actualRequest?.knowledge_use ===
        request.knowledge_use
      ) {
        totals.per_concept_use_correct++;
      }
    }

    totals.selected_exact_set +=
      Number(
        sameSet(
          actualSelected,
          expectedSelected
        )
      );

    totals.selected_tp +=
      intersection(
        actualSelected,
        expectedSelected
      );

    totals.selected_predicted +=
      actualSelected.length;

    totals.selected_expected +=
      expectedSelected.length;

    const actualOutputPolicy = {
      constraints:
        actual.constraints.output_constraints,
      directives:
        actual.output_directives
    };

    const expectedOutputPolicy = {
      constraints:
        expected.constraints.output_constraints,
      directives:
        expected.output_directives
    };

    totals.output_policy_correct +=
      Number(
        same(
          actualOutputPolicy,
          expectedOutputPolicy
        )
      );

    totals.strict_full_contract +=
      Number(
        same(
          comparable(actual),
          expected
        )
      );

    totals.false_positive_knowledge_injection +=
      Number(falsePositive.length > 0);

    totals.false_negative_knowledge_omission +=
      Number(falseNegative.length > 0);

    if (
      expected.constraints
        .knowledge_prohibited &&
      actualSelected.length > 0
    ) {
      totals.explicit_no_k_violations++;
    }

    const missingAnchorIds =
      expected.excluded_concepts
        .filter(
          value =>
            value.reason ===
            'case_relation_not_present'
        )
        .map(
          value =>
            value.concept_id
        );

    if (missingAnchorIds.length > 0) {
      totals.missing_anchor_cases++;

      if (
        !actualSelected.some(
          id =>
            missingAnchorIds.includes(id)
        )
      ) {
        totals.missing_anchor_compliant++;
      }

      if (
        actualSelected.some(
          id =>
            missingAnchorIds.includes(id)
        )
      ) {
        totals.missing_anchor_injections++;
      }
    }

    const unadmittedIds =
      expected.excluded_concepts
        .filter(
          value =>
            value.reason ===
            'knowledge_not_admitted'
        )
        .map(
          value =>
            value.concept_id
        );

    if (unadmittedIds.length > 0) {
      totals.admission_cases++;

      if (
        !actualSelected.some(
          id =>
            unadmittedIds.includes(id)
        )
      ) {
        totals.admission_compliant++;
      }

      if (
        actualSelected.some(
          id =>
            unadmittedIds.includes(id)
        )
      ) {
        totals.admission_violations++;
      }
    }

    if (
      expected.constraints
        .exclude_concepts.length > 0
    ) {
      totals.explicit_exclusion_cases++;

      if (
        !actualSelected.some(
          id =>
            expected.constraints
              .exclude_concepts.includes(id)
        )
      ) {
        totals.explicit_exclusion_compliant++;
      }

      if (
        actualSelected.some(
          id =>
            expected.constraints
              .exclude_concepts.includes(id)
        )
      ) {
        totals.exclusion_violations++;
      }
    }

    if (
      expected.status ===
      'zero_knowledge'
    ) {
      totals.zero_knowledge_cases++;

      totals.zero_knowledge_correct +=
        Number(
          actual.status ===
            'zero_knowledge' &&
          actualSelected.length === 0 &&
          actual.retrieval_query === null
        );
    }

    if (
      expected.status ===
      'needs_narrowing'
    ) {
      totals.needs_narrowing_cases++;

      totals.needs_narrowing_correct +=
        Number(
          actual.status ===
            'needs_narrowing' &&
          actualSelected.length === 0 &&
          actual.retrieval_query === null
        );
    }

    if (falsePositive.length > 0) {
      falsePositiveCases.push({
        case_id: item.case_id,
        user_question:
          item.user_question,
        actual_selected:
          actualSelected,
        expected_selected:
          expectedSelected,
        false_positive:
          falsePositive,
        retrieval_query:
          actual.retrieval_query
      });
    }

    if (falseNegative.length > 0) {
      falseNegativeCases.push({
        case_id: item.case_id,
        user_question:
          item.user_question,
        actual_requested:
          actualRequested,
        actual_selected:
          actualSelected,
        expected_selected:
          expectedSelected,
        false_negative:
          falseNegative,
        excluded_concepts:
          actual.excluded_concepts
      });
    }

    results.push({
      case_id: item.case_id,

      task_match:
        actual.knowledge_task ===
        expected.knowledge_task,

      task_conflict_match:
        same(
          actual.task_conflict,
          expected.task_conflict
        ),

      scope_match:
        actual.question_scope ===
        expected.question_scope,

      status_match:
        actual.status ===
        expected.status,

      requested_match:
        sameSet(
          actualRequested,
          expectedRequested
        ),

      selected_match:
        sameSet(
          actualSelected,
          expectedSelected
        ),

      output_policy_match:
        same(
          actualOutputPolicy,
          expectedOutputPolicy
        ),

      strict_full_match:
        same(
          comparable(actual),
          expected
        ),

      false_positive:
        falsePositive,

      false_negative:
        falseNegative,

      actual:
        comparable(actual)
    });
  }

  const metrics = {
    ...totals,

    task_accuracy:
      ratio(
        totals.task_correct,
        totals.cases
      ),

    task_conflict_accuracy:
      ratio(
        totals.task_conflict_correct,
        totals.cases
      ),

    scope_accuracy:
      ratio(
        totals.scope_correct,
        totals.cases
      ),

    status_accuracy:
      ratio(
        totals.status_correct,
        totals.cases
      ),

    requested_precision:
      ratio(
        totals.requested_tp,
        totals.requested_predicted
      ),

    requested_recall:
      ratio(
        totals.requested_tp,
        totals.requested_expected
      ),

    per_concept_use_accuracy:
      ratio(
        totals.per_concept_use_correct,
        totals.per_concept_use_total
      ),

    selected_precision:
      ratio(
        totals.selected_tp,
        totals.selected_predicted
      ),

    selected_recall:
      ratio(
        totals.selected_tp,
        totals.selected_expected
      ),

    output_policy_accuracy:
      ratio(
        totals.output_policy_correct,
        totals.cases
      )
  };

  const report = {
    execution_id:
      executionId,

    evaluation:
      'task-gate-1.2-one-shot-holdout',

    split:
      'holdout',

    holdout_exposure:
      true,

    first_holdout_exposure_at:
      exposure.first_holdout_exposure_at,

    implementation_commit:
      implementationCommit,

    planner_contract_version:
      QUERY_PLAN_VERSION_12,

    pattern_version:
      patternVersion,

    benchmark_freeze_id:
      FREEZE_ID,

    benchmark_freeze_hash:
      freezeHash,

    raw_prediction_sha256:
      seal.raw_prediction_sha256,

    scoring_reference:
      'frozen query-plan-1.2 primary plan; layered metrics are reported separately from strict full-contract matching',

    cases:
      holdout.length,

    metrics,

    failed_strict_case_ids:
      results
        .filter(
          value =>
            value.planner_exception ||
            !value.strict_full_match
        )
        .map(
          value =>
            value.case_id
        ),

    results,

    false_positive_cases:
      falsePositiveCases,

    false_negative_cases:
      falseNegativeCases,

    limitations: [
      'The 32 frozen holdout questions are an authored benchmark, not a natural-language population sample.',
      'This is the first and only authorized unseen run for this frozen implementation.',
      'Strict full-contract matching includes evidence-span structure and is reported separately from retrieval safety.',
      'This measures deterministic task/intent/retrieval planning, not divination predictive validity or production answer quality.'
    ]
  };

  write(
    'score-report.json',
    report
  );

  const resultSeal = {
    execution_id:
      executionId,

    implementation_commit:
      implementationCommit,

    planner_contract_version:
      QUERY_PLAN_VERSION_12,

    benchmark_freeze_id:
      FREEZE_ID,

    benchmark_freeze_hash:
      freezeHash,

    execution_metadata_sha256:
      hash('execution.json'),

    exposure_metadata_sha256:
      hash('exposure.json'),

    raw_seal_sha256:
      hash('raw-seal.json'),

    raw_prediction_sha256:
      seal.raw_prediction_sha256,

    score_report_sha256:
      hash('score-report.json'),

    holdout_exposure:
      true,

    first_holdout_exposure_at:
      exposure.first_holdout_exposure_at,

    source_identity_policy:
      SOURCE_IDENTITY_POLICY,

    result_hash_policy:
      ARTIFACT_HASH_POLICY,

    tracked_source_blobs: {
      benchmark:
        execution.benchmark_blob_oid,
      planner:
        execution.planner_blob_oid,
      schema:
        execution.schema_blob_oid
    },

    runner_raw_hash:
      execution.helper_raw_hash
  };

  write(
    'HOLDOUT.json',
    resultSeal
  );

  fs.writeFileSync(
    path.join(
      round,
      'HOLDOUT.sha256'
    ),
    `${hash('HOLDOUT.json')}\n`,
    { flag: 'wx' }
  );

  return {
    execution_id:
      executionId,

    score_report:
      path.join(
        round,
        'score-report.json'
      ),

    score_report_sha256:
      hash('score-report.json'),

    holdout_seal:
      path.join(
        round,
        'HOLDOUT.json'
      ),

    holdout_seal_sha256:
      hash('HOLDOUT.json'),

    metrics,

    failed_strict_case_ids:
      report.failed_strict_case_ids,

    false_positive_case_ids:
      falsePositiveCases.map(
        value => value.case_id
      ),

    false_negative_case_ids:
      falseNegativeCases.map(
        value => value.case_id
      )
  };
}

function verify() {
  sourceIdentity();

  const {
    execution,
    exposure,
    seal
  } = assertRawSeal();

  const result =
    read('HOLDOUT.json');

  need(
    bytes('HOLDOUT.sha256').equals(
      Buffer.from(
        `${hash('HOLDOUT.json')}\n`
      )
    ),
    'Holdout seal hash changed'
  );

  need(
    result.execution_id ===
      execution.execution_id &&
    result.holdout_exposure === true &&
    result.first_holdout_exposure_at ===
      exposure.first_holdout_exposure_at &&
    result.raw_prediction_sha256 ===
      seal.raw_prediction_sha256 &&
    result.score_report_sha256 ===
      hash('score-report.json') &&
    result.execution_metadata_sha256 ===
      hash('execution.json') &&
    result.exposure_metadata_sha256 ===
      hash('exposure.json') &&
    result.raw_seal_sha256 ===
      hash('raw-seal.json') &&
    result.runner_raw_hash ===
      execution.helper_raw_hash,
    'Holdout result seal mismatch'
  );

  return {
    status: 'verified',

    execution_id:
      executionId,

    holdout_seal_sha256:
      hash('HOLDOUT.json'),

    raw_prediction_sha256:
      seal.raw_prediction_sha256,

    score_report_sha256:
      result.score_report_sha256,

    holdout_exposure:
      true
  };
}

const [
  command,
  ...args
] = process.argv.slice(2);

try {
  if (
    command === 'prepare' &&
    args.length === 0
  ) {
    console.log(
      JSON.stringify(
        prepare(),
        null,
        2
      )
    );
  } else if (
    command === 'predict' &&
    args.length === 3 &&
    args[0] === '--split' &&
    args[1] === 'holdout' &&
    args[2] ===
      '--acknowledge-holdout-exposure'
  ) {
    console.log(
      JSON.stringify(
        predict({
          acknowledgeHoldoutExposure:
            true
        }),
        null,
        2
      )
    );
  } else if (
    command === 'score' &&
    args.length === 0
  ) {
    console.log(
      JSON.stringify(
        score(),
        null,
        2
      )
    );
  } else if (
    command === 'verify' &&
    args.length === 0
  ) {
    console.log(
      JSON.stringify(
        verify(),
        null,
        2
      )
    );
  } else {
    throw new Error(
      'Usage: run-task-gate-holdout.js prepare | predict --split holdout --acknowledge-holdout-exposure | score | verify'
    );
  }
} catch (error) {
  console.error(
    error.stack ?? error.message
  );
  process.exitCode = 1;
}