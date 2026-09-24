# Phase 8B.2A — Query Plan 1.2 contract and Task Gate benchmark candidate

> Historical 8B.2A proposal. The current, revised candidate and its audit are recorded in `PHASE_8B_2C_CANDIDATE_REVISION.md`. Counts and `tg-062` alternative below describe the earlier candidate, not the current 8B.2C files. Neither version has been frozen.

Phase 8B.2A adds an **offline candidate contract and candidate benchmark only**. The deterministic 1.1 implementation remains an explainable, non-production-ready baseline. Its 72-case benchmark, freeze, and one-shot holdout result remain bound to `query-plan-1.1`; the old holdout is exposed. No Planner 1.2 recognition algorithm, retrieval integration, production wiring, AI planner, new freeze, or new evaluation result is included.

## Candidate contract

`src/knowledge/query-plan-schema-v1.2.js` defines the independent `query-plan-1.2` schema. It preserves the 1.1 plan envelope but adds a task gate, per-concept Knowledge use, exact evidence spans, conflict structure, and comparison metadata. Unknown fields are rejected. The benchmark uses a smaller complete-label projection because fixture hashes, Rule availability, and input identities are attached to each case independently. Full 1.1 artifacts continue to use the untouched 1.1 validator.

| Dimension | Meaning and decision boundary |
| --- | --- |
| `question_scope` | `case_specific`, `theory`, `mixed`, `unknown`; determined by user language. A supplied Canonical cast is not by itself a scope cue. |
| `knowledge_task` | `knowledge_seeking`, `non_knowledge`, `mixed`, `unknown`; asks whether literature is part of the requested work. |
| `requested_concepts[].knowledge_use` | `required`, `not_required`, `excluded`, `uncertain`; distinguishes an operated-on concept from a literature target. Incidental labels remain outside requested intent. |
| `task_evidence` | Typed, exact UTF-16 question spans: knowledge request, operation, exclusive output, prohibition, output restriction, concept exclusion, scope cue, unresolved term. |
| `task_conflict` | Boolean plus opposed evidence spans. Global exclusive-output versus literature request fails closed. Sequential requests may coexist. |
| `request_relation` | `none` or `comparison`; comparison changes neither task/admission nor the two-topic cap. |
| `constraints` | `knowledge_allowed` is a checked derivative, `knowledge_prohibited` captures explicit prohibition, and output constraints remain separate (`no_prediction`, `no_explanation`, numeric/string/Boolean/quote/verbatim forms). |
| `status` | Existing five values remain. `ambiguous` now has a reason code for task conflict, unknown task, unresolved concept, or unknown scope. |

The intended future fail-closed sequence is: user constraints → task evidence → task → requested concepts and per-concept use → scope → available Rules → exclusions → topic cap → case anchor → reviewed admission → selection → query. The validator checks the candidate labels against these gates. A Rule hit can make a concept available; it cannot make it requested. Source-checked material may be requested but cannot be selected. `no_prediction` and `no_explanation` govern eventual answer output and do not, by themselves, veto a source request. There is no numeric confidence and no weighted score.

## Benchmark composition and contrasts

The candidate is `query-planning-task-gate-candidate-1.2`: 64 questions, 16 families, four questions per family. Development is 32/8 families and holdout is 32/8 families. `tg-062` has one complete acceptable alternate scope reading; 63 other questions currently have a single proposed complete ground truth. This remains subject to independent semantic review. Four questions use no cast; the rest bind immutable existing fixture identities. The candidate pins hardened and historical corpus hashes separately and checks r1's 25-rule mapping.

| Split | Family | Contrast focus |
| --- | --- | --- |
| Dev | `tgf-01` | current-cast numeric 世应 versus literature and sequential mixed request |
| Dev | `tgf-02` | six-line string serialization versus separate 旬空 literature |
| Dev | `tgf-03` | restatement/background labels versus independently requested 月合 explanation |
| Dev | `tgf-04` | quote-only, no-explanation, no-prediction, Boolean output |
| Dev | `tgf-05` | local topic exclusions and >2-topic narrowing |
| Dev | `tgf-06` | absent case anchor versus theory admission |
| Dev | `tgf-07` | reviewed versus source-checked literature admission |
| Dev | `tgf-08` | global Knowledge prohibition conflict versus ordered mixed work and unresolved typo |
| Holdout | `tgf-09` | aggregate index/quantity versus separate source request |
| Holdout | `tgf-10` | source citation/quote versus Boolean label lookup |
| Holdout | `tgf-11` | Roman-numeral formatting, exclusive conflict, sequential explanation |
| Holdout | `tgf-12` | incidental 飞伏 annotation versus explicit unadmitted request |
| Holdout | `tgf-13` | theory, case, and dual-context 退神 |
| Holdout | `tgf-14` | prefixed/postposed exclusions and three-topic cap |
| Holdout | `tgf-15` | missing relation anchor versus source-checked admission |
| Holdout | `tgf-16` | typo/uncertainty, comparison, and cast-label transcription |

Minimal contrasts stay within families: `tg-001/002/003`, `tg-005/006`, `tg-009/010`, `tg-029/030`, `tg-033/034`, `tg-037/038/039`, `tg-041/042/043/044`, and `tg-045/046/047` are examples. This tests opposite tasks with near vocabulary while keeping split isolation. The new candidate does not copy any old benchmark or Phase 7 question verbatim. Its themes are intentionally informed by exposed 1.1 failures: numeric-only injection (`qp-068`), background terms (`qp-069`), postposed exclusion (`qp-062`), scope (`qp-066`), and phrase recognition (`qp-049/057`). The newly authored holdout uses different wording, operations, and family groupings; it is **not** claimed to be semantically untouched by the exposed analysis.

Candidate counts: `knowledge_seeking=33`, `non_knowledge=18`, `mixed=9`, `unknown=4`; `ready=33`, `zero_knowledge=25`, `needs_narrowing=2`, `ambiguous=4`. Source-checked rejection appears in `tg-025/026/027/028/047/048`; missing case anchors in `tg-021/057/060`; global conflicts in `tg-029/041`; one ambiguous annotation alternative in `tg-062`. `tg-031/061/064` preserve unresolved spellings. Five questions carry a line-specific Rule fact reference with an exact target and UTF-16 span; the remainder do not assert a particular line/target fact.

## Validation and later evaluation boundary

The candidate validator checks closed structure, exact UTF-16 spans, task evidence/conflict, use and selection partitions, exclusion reason precedence, topic cap, query equality, selected concept admission, actual r1 availability, pinned corpus identities, fixture hashes, 32/32 split, family isolation, atomic alternatives, and exact question non-overlap with older datasets. Tests also tamper with these invariants. The validator does **not** decide whether a human-authored question interpretation is linguistically correct; that is the next review gate.

For a later evaluator, report Task, Intent, Retrieval, Scope, Output policy, and auxiliary strict whole-plan results separately. Output-policy mismatch alone must not become a retrieval failure. The exposed 24-case 1.1 holdout may only serve regression/development. Before any 1.2 implementation is scored on the new holdout, a human must approve question semantics, the candidate must be committed and separately frozen, and the implementation must be committed. No result from this phase establishes Planner 1.2 performance or production readiness.

## Human review decisions before freeze

1. Is the four-value task taxonomy sufficient, especially `mixed` for an operation plus a literature clause about the same concept?
2. Are `tg-029` (Knowledge prohibition versus request) and `tg-041` (exclusive output versus request) true global conflicts, while their neighboring sequential variants are not?
3. Does the `required/not_required/excluded/uncertain` concept-use field avoid redundant annotation without hiding meaningful background mention evidence?
4. Are the unknown-scope restatement labels and the single alternative on `tg-062` fair? Does “这里” merit both complete readings, or should the question be rewritten?
5. Are the four no-case questions and source-checked/absent-anchor rejection reasons correctly labeled?
6. Are the holdout families sufficiently distinct from the exposed old failures despite sharing general task requirements?

No freeze or commit is authorized in Phase 8B.2A. The benchmark remains a candidate.
