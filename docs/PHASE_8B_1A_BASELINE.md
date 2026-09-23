# Phase 8B.1A deterministic query-planner baseline (development review)

This is an offline, rule-based planner baseline. It has no production import, AI classifier, retrieval invocation, prediction judgment, or holdout exposure. The Phase 8B.0 benchmark and v2 freeze remain unchanged.

## Input and decisions

`src/knowledge/query-plan.js` consumes the original user question, an optional Canonical cast with its r1 Rule Result, the revision-2 concept catalog, the frozen r1 rule–concept map, and the explicitly selected Phase 8A corpus. It emits `query-plan-1.1` and validates the result against the existing closed contract.

1. Requested concepts come only from exact catalog labels, catalog aliases, and bounded phrases in `query-intent-patterns-1.0`. Rule hits never create user intent. Every match retains a UTF-16 span into the unchanged question. Isolated `空` and `近神` remain unresolved, never aliases.
2. Available concepts are derived only from Rule Result r1 through the existing frozen mapping, with rule ID and target anchors. The map must cover all 25 rules and contain known concept IDs.
3. Selection applies explicit exclusions, narrow factual requests, question scope, a two-topic cap, current Rule anchors for case-specific questions, and reviewed KnowledgeUnit admission. `day-combine`, `return-relation`, and `flying-hidden` may be requested but their source-checked literature cannot be selected. A `shi-ying` Rule hit alone does not imply reviewed coverage for every direction.
4. Only a ready plan with at least one selected topic receives a retrieval query (`reviewed`, limit 4). This stage does not call `retrieve()` or the Structured 1.2 pipeline. The existing 4-unit and prompt-budget limits remain downstream responsibilities.

Scope uses explicit current-case and theory cues; the mere existence of a cast is insufficient when no topic is safely recognized. A mixed question retains separate theory and case spans for one concept. Exclusion patterns are bounded to explicit wording such as `先别说 X`, `不讨论 X`, `除了 X`, and `只看 X`; `不要判断吉凶` is an output constraint, not a concept exclusion. More than two positive topics produce `needs_narrowing` without silently choosing a subset.

The planner does not autocorrect typos, infer use-god, choose auspiciousness, assign weights, or generate a numeric confidence. Unknown words fail closed. Semantic output has no random number, timestamp, or environment-dependent field, and repeated planning yields the same canonical serialization.

## Development-only evaluation

Run `node scripts/phase8/eval-query-planner.js`. It evaluates only the 48 development records by default and writes the per-case, development-only report to ignored `test-results/phase8-query-planner-development.json`. Holdout evaluation requires both `--split holdout` and `--acknowledge-holdout-exposure`; it was **not run** in Phase 8B.1A. The evaluator compares one entire primary expected plan or one entire acceptable plan, never fields assembled from multiple alternatives. It reports component metrics separately, without a weighted total.

Current development run: primary full-plan match 48/48, alternate full-plan match 0/48, and accepted match (primary **or** a complete alternative) 48/48; requested and selected exact sets 48/48 each; requested/selected micro precision and recall 1.0; scope and status 48/48; deterministic replay 48/48. False-positive Knowledge injection 0, false-negative omission 0, explicit-exclusion compliance 6/6, zero-K status 16/16, and source-checked admission compliance 8/8. There were no development cases with an expected `needs_narrowing` or `case_relation_not_present` status, so those evaluator denominators are 0; synthetic unit tests cover both branches. The generated error-category report is empty for this run.

These are in-sample development results on authored cases. They do not establish generalization, holdout performance, safer model answers, or prediction accuracy. The narrow phrase recognizer and the catalog cover these development questions well; unseen colloquialisms, nested negation, pronoun reference, broad ambiguous requests, and multiple case anchors remain limitations. The holdout must remain unseen until a later explicitly authorized evaluation.

## Freeze and change boundary

Frozen source commit: `21c0441d40ad991912c67a298b6c29e58dcd8fe3`. Freeze ID: `phase8b-query-planning-baseline-1`; seal: `sha256:f8567161f152a5295965d3beb4eb9df8f5480bb713a01bbaca57f6b0c837401f`. This implementation does not alter benchmark ground truth, the freeze manifest, corpus, Rules r1, Canonical, Structured 1.2, or production routes. Phase 8B.1A was reviewed before baseline finalization; see `PHASE_8B_1B_AUDIT.md` for the pre-holdout audit.
