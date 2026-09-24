# Phase 8B.2 — deterministic Task Gate implementation

Status: offline implementation baseline; **new 32-case holdout exposure = false**. This is not a production integration or an independent holdout result. The 1.1 Planner, frozen 1.2 benchmark, Rules r1, concept catalog, corpus, Canonical, and Structured 1.2 are unchanged.

## Identity and boundary

- Frozen benchmark: `phase8b2-task-gate-benchmark-1`, `sha256:c55d4389440ce845f239265ffd5d5f75b35093e4e4f5fc310b8f8b16ff24a5ae`, `verified_v2`.
- Reviewed source commit: `c4b1d1a1dfa92a147328dc7b1909cce45960ba91`.
- Planner contract: `query-plan-1.2`. Phrase table: `task-gate-patterns-1.0`.
- Development reader stops after the 32nd development object, before the first new holdout case. No new holdout question was dispatched, predicted, scored, or printed.
- Old 24-case 8B.1 holdout was already exposed. Its use here is **post-holdout regression** and `old-holdout-informed development = true`.

## Pipeline and safety gates

The offline Planner identifies task evidence and explicit prohibitions, recognizes controlled concepts from catalog names/aliases and a small versioned descriptive phrase list, assigns per-concept Knowledge use and question scope from the user's words, then checks Rule availability, exclusions, the two-topic cap, present case anchors, and reviewed Knowledge admission. A Rule hit can make a concept available but cannot create the user's intent. An unresolved spelling such as `近神` remains unresolved and cannot be silently corrected. A bare `空` is not a catalog alias. Pure numeric/position/format/transformation and query-feasibility operations do not trigger retrieval merely because they mention a concept. Positive literature intent without a safely identified topic fails closed as an unknown task. Output directives are separate from selection.

The new patterns are categories rather than case-specific matches: branch-clash/combine descriptions identify a relation; literature verbs and nouns identify a content request; negated literature verbs identify a prohibition; operation verbs identify a non-literature operation; unconfirmed spellings identify unresolved mentions. Each concept phrase carries its semantic reason in the pattern table. There are no benchmark IDs, complete benchmark questions, fixture IDs, edit-distance correction, model calls, embeddings, numerical confidence, or production imports in the Planner.

## First pass, preserved before development fixes

The immutable local raw artifact is `test-results/phase8b2-task-gate-development-first-pass.json`, SHA-256 `bab440ef306dfb091cdfa4ec3e9df9e57c4557e68515e1b794cdfbee8fb33671`. It was written with exclusive creation and was not overwritten. First pass: task 26/32, scope 27/32, requested P/R 33/33 and 33/33, per-concept use 31/33, selected P/R 16/16 and 16/16, output policy 26/32, strict full contract 1/32, four Planner exceptions, deterministic replay 28/32. False-positive injection, false-negative omission, explicit no-K, missing-anchor, admission, and exclusion violations were all zero among completed cases. The four exceptions came from a quote-span implementation error. This is diagnostic development evidence, not unseen evaluation.

## Current development and exposed regression

The current development artifact is `test-results/phase8b2-task-gate-development-current-final.json`, SHA-256 `0f5e6e1b8b5f95ec022d26e12f47177d57067ec128603dd6709bd32be4f7c198`. On 32 development cases: task 32/32; scope 32/32; requested precision/recall 34/34; per-concept use 34/34; selected precision/recall 17/17; output policy 32/32; deterministic replay 32/32; exceptions 0. Explicit exclusions 3/3, missing-anchor gates 1/1, admission gates 4/4. All four required safety-violation counts are zero, as are false-negative omissions and exclusion violations.

The **strict full-contract match remains 1/32**. The label contract includes exact `task_evidence` spans, and this baseline's general phrase grammar frequently returns a shorter or longer valid evidence span than the authored label. The layer metrics above do not imply that the complete contract matches or that language understanding is solved. A future change to evidence extraction should be assessed independently and must not use new holdout answers for tuning.

The old exposed 24-case regression artifact is `test-results/phase8b2-task-gate-old-exposed-regression.json`: zero Planner exceptions, zero false-positive Knowledge injections, and 11 conservative misses relative to historical 1.1 selections. The old `qp-068` false-positive class remains blocked. The 1.1 labels did not encode the new Task Gate's content-request requirement, so these misses are descriptive regression differences, not 11 new unseen errors.

## Pre-holdout audit

- Metadata leakage: **NO**. Planner code consumes question, Canonical, Rule Result, catalog/map and admitted corpus; it does not read benchmark metadata or fixture IDs.
- Benchmark-ID hardcoding: **0**. Full-question hardcoding: **0**. Fixture-specific branches: **0**.
- Freeze: `verified_v2`; frozen source and generated artifact identities match. The old 1.1 Planner is untouched.
- Deterministic replay: 32/32; development safety violations: 0.
- New holdout exposure: **false**. No 1.2 holdout prediction or score artifact has been created.

The implementation may be committed as an explainable offline baseline. These development numbers do not establish production readiness or generalization. The next authorized stage would require a fixed implementation commit before any one-shot new holdout execution.
