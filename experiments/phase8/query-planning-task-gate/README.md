# Phase 8B.2A Task Gate benchmark candidate

Status: **candidate_not_frozen**. Version: `query-planning-task-gate-candidate-1.2`. This is an authored annotation set, not Planner 1.2 predictions or an evaluation result. Do not run its holdout through an implementation until the contract and questions pass independent human review, are committed, and receive a separate reproducibility freeze. The 24 Phase 8B.1 holdout items are already exposed; they are not part of this new denominator.

## Files and commands

- `benchmark.json`: 64 authored questions and complete primary plans. The 8B.2C rewrite of `tg-062` removed its former acceptable alternative; current acceptable complete plans: 0.
- `benchmark.schema.json`: closed machine-readable candidate schema. Its validator also checks the label semantics against the pinned corpus and Rule availability.
- `scripts/phase8/generate-task-gate-benchmark.js --write`: materializes authored annotations into exact UTF-16 spans and frozen fixture identities. It does **not** classify arbitrary questions.
- `node scripts/phase8/validate-task-gate-benchmark.js`: checks structure and all candidate labels without executing a Planner or scoring any predictions.

The generator source is the editable candidate annotation source. Any edit to it or the JSON requires rerunning validation and human review. Neither file is a freeze. Eight questions explicitly refer to a present current-case relation and carry `question_fact_references` with exact Rule targets and question spans. Other questions do not claim a specific line/target; their concept-level requests remain in `requested_concepts`, `task_evidence`, and the fixture's independently computed `available_rule_ids`. The validator checks every fact reference against actual Rule hits.

## Frozen-input candidates, not a freeze

The current proposed corpus is `phase8a-month-combine-hardening-1`, `sha256:aa3522aebb7e4ad18b54e144ea26499323e55838f79856fdd59f2c53baadcda3`. The historical `phase7.1-initial-1` corpus is independently checked. The mapping is r1 and must still cover 25 Rules. Case fixtures use existing Phase 6/7 Canonical JSON; seven theory questions use `no_case` and carry neither a Canonical hash nor Rule IDs. No random casting is involved.

The 16 semantic families each contain four cases and belong to exactly one split. Families `tgf-01`–`tgf-08` are development (32); `tgf-09`–`tgf-16` are holdout (32). Family-level split isolation prevents same-family minimal contrast pairs from leaking across development and holdout. The validator rejects exact duplicates from the frozen 72-case benchmark and Phase 7 evaluation questions. The new cases still share broad requirements with exposed Phase 8B.1 failures; that is explicitly **holdout-informed development of the task definition**, not proof of independence at the semantic-topic level. The 8B.2C human audit of semantic overlap is in `docs/PHASE_8B_2C_CANDIDATE_REVISION.md`.

## Annotation conventions

- `question_scope`: what context the user asks about, based on language, never inferred solely from an available cast. `theory`, `case_specific`, `mixed`, and `unknown` are independent of `knowledge_task`.
- `knowledge_task`: `knowledge_seeking`, `non_knowledge`, `mixed`, or `unknown`.
- A requested concept has one `knowledge_use`: `required`, `not_required`, `excluded`, or `uncertain`. Background words need not enter `requested_concepts`.
- `knowledge_allowed` is derived from task, explicit prohibition/conflict, and at least one required concept. `no_prediction` and `no_explanation` are output policies, not Knowledge gates. `request_relation=comparison` is synthesis metadata, not a fifth task.
- A global Knowledge prohibition or exclusive-output instruction that contradicts a literature request sets `task_conflict.present=true`, gives exact opposing evidence spans, and fails closed as `ambiguous` with no selection or query. Ordered two-part instructions are `mixed`, not automatically conflicts.
- `selected_concepts` contains only required, user-facing, reviewed topics. Case-specific topics need a present r1 anchor. The cap is two. Explicit exclusions, source-checked units, missing anchors, unknown scope/task, and unresolved spelling cannot be silently selected.
- `ambiguity_status` describes ground-truth annotation certainty, not model or prediction confidence. The ambiguous “这里” wording in `tg-062` was rewritten as an explicit theory question, so the current candidate has no acceptable alternate plan. Future alternatives, if independently justified, must be complete and scored atomically, never spliced field-by-field.
- “这个词能否直接作为检索词” is a `non_knowledge` meta task: it does not request literature content or trigger retrieval. Pure UI/search capability questions fall outside this benchmark. `unknown` denotes ambiguity in the user's task or scope, not a Planner vocabulary miss; rewrite unclear cases before freezing.
- `output_directives` retains a small generic `format`/`brevity`/`verbatim` instruction with exact question span. It does not create a separate output format ontology. The existing `no_prediction` and `no_explanation` policies remain distinct. Task, Intent, Retrieval, Scope, Output policy, and strict whole-plan scoring stay separate.

## Proposed later scoring contract (not implemented here)

Report separate layers: (A) Knowledge task and task-conflict accuracy; (B) requested-concept precision/recall and per-concept use; (C) selected precision/recall, false-positive injection, false-negative omission, anchor/admission/exclusion compliance, and zero-K; (D) scope; (E) output-policy fields; (F) strict full-plan match as an auxiliary metric. Compare each predicted plan against the primary and each complete alternative independently. Do not count an output-policy error as a retrieval failure if selection is correct. Do not create a weighted score.

The next implementation phase may use the 32 development cases, old 48 development cases, exposed old 24 holdout cases, and synthetic diagnostics. It must mark `old-holdout-informed development = true`. The new 32 holdout predictions/scores must remain unseen until a Planner 1.2 implementation commit is fixed; the eventual holdout run is one-shot. These disciplines remain prospective because this candidate has not yet been frozen.
