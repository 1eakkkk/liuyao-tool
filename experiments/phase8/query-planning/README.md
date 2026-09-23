# Phase 8B query-planning benchmark candidate

This directory contains **candidates, not a frozen benchmark**. No model answers, planner predictions, treatment mapping, effect claims or production integration are present. Human review must finish before a separate freeze manifest or holdout run is created.

## Files and reproducibility

- `benchmark.schema.json`: closed candidate record structure.
- `benchmark.json`: 72 authored questions and provisional ground truth: 48 development, 24 holdout, three per semantic family. `semantic_families` records each family's split and intent template.
- `scripts/phase8/generate-query-benchmark.js`: authored question source and deterministic materialization of canonical hashes, full r1 hit IDs and JavaScript UTF-16 spans. It does not recognize arbitrary questions or implement a planner.
- `scripts/phase8/validate-query-planning.js`: read-only integrity/ground-truth validator. Run `node scripts/phase8/validate-query-planning.js` from the repository root.

`case_fixture` uses an existing immutable Canonical record only as context. The benchmark's `user_question` is the question to classify; it deliberately does not rewrite the fixture's stored `canonical.question.text`. `available_rule_ids` are recomputed from that fixture for validation. No-case records have a null fixture and no available Rule IDs. The hardening corpus and historical corpus are loaded explicitly and their pinned hashes verified.

## Label interpretation

`primary_expected_plan` contains the complete provisional intent plan: scope, status, requested concepts with exact UTF-16 spans, selected concepts, exclusions, constraints, and unresolved mentions. `acceptable_plans` contains complete alternative plans, not independently combinable field values. A future evaluator must compare a prediction against one whole plan at a time. An empty array means there is no alternative. An explicitly excluded term remains requested, with `explicit_exclusion` recorded separately. A source-checked topic may be requested but cannot be selected. Theory requests can use reviewed knowledge without a current relation anchor.

`exact_term` means an exact catalog label; `catalog_alias` means a registered alias. Thus `化进` and `化退` are aliases. Longer descriptions use `deterministic_phrase` only when their wording warrants it. The catalog itself is unchanged. Mixed questions record their theory and current-case occurrences using `question_span` and `additional_question_spans` for one concept. `unresolved_mentions` preserves a found but unresolved expression, such as `近神`; it does not assert a requested concept or permit a Rule hit to fill in intent.

`status` is a proposed planner status, not a model result. `ready` may coexist with an unresolved mention when its selected portion is safe. `ambiguous` means no safe retrieval plan can be formed; `zero_knowledge` means no Knowledge is needed, including reviewed-topic admission failures. Non-ready states imply `retrieval_query: null` in the separate planner contract. Mixed selection records `theory_context` and `case_relation` as separate uses without double counting evidence.

`question_fact_references` binds explicit case-fact assertions to real r1 Rule targets and a span of the question. The validator recomputes Rules from the pinned Canonical fixture and checks rule ID, line, component, related line, and the question span. It does not parse arbitrary Chinese; factual claims without explicit authored references still require human audit. The candidate set is not yet frozen.

`qp-012` conservatively leaves “往前进那种标注” unresolved and permits a complete `advance` alternative. `qp-072` safely selects `retreat`, leaves “近神” unresolved, and permits a complete two-topic alternative. `qp-066` recognizes the explicitly written “旬空”; whether a bare “空” is equivalent belongs to the answer boundary. Neither “空” nor “近神” became a catalog alias. `ambiguity_status` describes annotation certainty, not prediction confidence.

## Split and leakage boundary

Families 01–16 are development, using Phase 7 cast context or no cast. Families 17–24 are holdout, using Phase 6 cast context or no cast. The validator requires every family ID to occupy exactly one split and checks the semantic-family manifest, exact duplicates, historical Phase 7.3B questions, pinned fixture hashes, Rule hits, and authored fact references. This mechanical check cannot establish semantic independence; human review must inspect intent templates and paraphrases before freeze. The 12 Phase 7.3B questions are historical diagnostics only.

Future metrics must separately report requested-concept exact set, precision and recall; selected-concept exact set, precision and recall; false-positive injection, false-negative omission, zero-knowledge accuracy, exclusion and anchor compliance, needs-narrowing and scope accuracy, and deterministic replay. Do not combine these into a weighted score or infer prediction accuracy.
