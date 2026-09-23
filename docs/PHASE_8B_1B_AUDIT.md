# Phase 8B.1B pre-holdout audit

This audit uses the frozen Phase 8B.0 development split and a separate, explicitly synthetic diagnostic set. No holdout prediction or expected plan was inspected. The baseline remains offline; its implementation is finalized only after this pre-holdout review.

## Input boundary and leakage

The evaluator parses the benchmark, filters by `split === 'development'`, and uses only `user_question`, `context_mode`, and `case_fixture.file/case_id` to locate the legitimate cast. It then calls `planQuery` with **exactly** `{ question, canonical, ruleResult, catalog, map, corpus, ruleIds }`. The case fixture key is used solely to load Canonical; it is not passed to the planner. The corpus handle includes version/hash and units for reviewed admission. Rule Result is recomputed by the existing r1 engine. The planner receives no case ID, split, family, primary/alternative expected plan, rationale, expected scope/status/exclusion, or other benchmark label. Expected-plan fields exist in the parsed record but are accessed for scoring only after the raw plan has been produced. An in-memory test changes a development record's expected labels, rationale, case ID and family while keeping the cast and question fixed: the raw plan remains byte-equivalent while its score changes. **Benchmark metadata leakage: NO. Evaluator label leakage: NO.**

Static search and a regression test find `hardcoded_case_ids = 0`, `hardcoded_full_development_questions = 0/48`, and `fixture_specific_planner_branches = 0` in the planner and phrase table. Tests and the evaluator necessarily name fixtures/case IDs for validation and reporting; none of those identifiers reaches `planQuery`. The question is never corrected, fuzzily matched, or rewritten. All evidence spans index the original JavaScript UTF-16 string. `近神` and a bare `空` remain unresolved, never `advance`/`xunkong` aliases. Available concepts come from r1 hits only; changing the cast and Rule hits under the same question does not change requested concepts.

## Phrase-pattern audit

`query-intent-patterns-1.0` has these auditable entries. Case lists refer **only** to development. Each entry maps terminology or preserves uncertainty; no entry is a complete benchmark question. Catalog labels/aliases are handled separately and are not silently extended.

| ID | Match → target | Development occurrence | Independent rationale and template risk |
|---|---|---|---|
| P01 | `与月建相合` → month-combine | qp-005 | Explicit month relation; one-case exact phrase, moderate coverage risk. |
| P02 | `日辰冲` → day-clash | qp-008, qp-035 | Named day relation; low risk. |
| P03 | `日辰合` → day-combine | qp-038 | Named day relation; source-checked admission still blocks injection. |
| P04 | `日旬里缺的两支` → xunkong | qp-023 | Explicit two missing branches; long one-case wording, moderate template risk. |
| P05 | `落在日旬缺的地支里` → xunkong | qp-017 | Explicit day-cycle missing branch; long one-case wording, moderate template risk. |
| P06 | `反过来生原爻` → return-relation | qp-040 | Changed-to-original generation direction; one-case wording, source-checked admission blocks injection. |
| P07–08 | `回头生` / `回頭生` → return-relation | none | Named simplified/traditional relation; no development evidence; admission blocks injection. |
| P09–10 | `回头克` / `回頭克` → return-relation | qp-042 / qp-041 | Named simplified/traditional relation; admission blocks injection. |
| P11 | `世爻` **only with** `应爻` → shi-ying | qp-021 | Paired 世/应 wording identifies the relationship; 世爻 alone no longer triggers it. One development case; guard prevents broad one-word matching. |
| PAIR1–2 | `飞神 … 伏神` / reverse, gap ≤ 8 → flying-hidden | qp-043 / qp-045 | Bounded named pair; intervening wording varies. Replaces two case-shaped full fragments; source-checked admission blocks injection. |
| CTX1–2 | `一般` prefix / `的通常含义` suffix → theory span | applied qp-046 / qp-047 | Generic cues around registered terms, applied only when the same concept also has a case cue. |
| CTX3–4 | `这卦的` / `本卦` prefix → case span | applied qp-046 / qp-047 | Generic current-cast cues paired with a theory cue; no concept-specific clause is hardcoded. |
| U1 | `近神` → unresolved possible typo | none | Never auto-corrects to advance. |
| U2 | bounded `(?:往前\|向前)进.{0,3}标注` → unresolved | qp-012 | Colloquial direction remains uncertain. One-case pattern has moderate template risk but cannot select literature. |

P04–P06 and U2 remain precise, one-case language patterns. Their semantic mapping is independently explainable, but 48/48 development accuracy cannot establish coverage of unseen paraphrases. The audit replaced the four concept-specific theory/case fragments and two flying/hidden full fragments with generic, bounded grammars; it did not add catalog aliases or a new ontology.

## Development evaluator and profile

`primary_plan_match` means the complete primary plan matched. `alternate_plan_match` means one complete alternative matched. `accepted_plan_match` means **primary OR one whole alternative**, not a fieldwise mixture. The current development results are **48/48 primary, 0/48 alternate, 48/48 accepted**. Earlier wording “acceptable 48/48” meant accepted, not that all 48 matched an alternative. Selection safety now allows concepts in a complete accepted alternative and uses that matched plan for omission checks; component precision/recall otherwise use primary labels. A test rejects a plan assembled from fields of different alternatives.

There are 16 development semantic families with 3 cases each, so 48/48 is not 48 independent language capabilities. Primary labels contain exact-term evidence in 16 cases, catalog alias in 10, deterministic phrase in 14, explicit comparison in 1, and explicit exclusion in 6; categories may overlap within a case. Five are narrow requests. Scopes: 31 case-specific, 8 theory, 2 mixed, 7 unknown. Statuses: 31 ready, 16 zero-K, 1 ambiguous, 0 needs-narrowing. The zero denominator for development `needs_narrowing` and `case_relation_not_present` is a coverage gap, not proof those branches work. Development false-positive injection and false-negative omission are both 0 after audit.

## Recorded synthetic development diagnostics

The 27 questions in `tests/phase8/fixtures/query-planner-synthetic.json` are not benchmark additions. Their **first pass is historical diagnostic evidence**; because the results were then used to repair the planner, all subsequent runs are **development/debugging diagnostics, not independent unseen evaluation**. First pass was saved with exclusive-create semantics as ignored `test-results/phase8-query-planner-synthetic-first-pass.json`, SHA-256 `58c75d1cfa494489e64c5109652bfbbb9924cb80a81ceba2c5923b33eec5d3a9`. **First pass:** requested 27/27, selected 25/27, status 25/27, exclusions 20/27; selected-topic false positives 0, false negatives 2 cases / 3 events. Two cases lacked safe coverage (`月破先排除` and explicit theory-only wording). Four more had wrong exclusion reasons, though their selected topics were safe because the fixture lacked the named relation anchor.

That missing anchor hid a real safety problem. Four additional anchored probes, recorded before modification in `test-results/phase8-query-planner-anchored-safety-prechange.json`, paired the same natural-language forms with a cast where 月破 **was** present. Name-only, count-only, “先放一边”, and “不要讨论” then all incorrectly selected month-break: **4/4 false-positive injections**. This supplemental evidence is separate from the frozen 27-case first pass; it was not silently folded into its metrics.

General narrow-request recognition, explicit exclusion wording, and explicit refusal of current-cast interpretation were then corrected. No case ID, fixture-specific branch, alias, Rule, or benchmark label was added. Post-change 27-case results under the original diagnostic fixture: requested/selected/status 27/27, exclusions 26/27, false-positive 0, false-negative 0. Anchored probes now select no literature for the two narrow requests and only day-clash for the two excluded-topic requests: **0/4 false positives**. The remaining exclusions mismatch (`sd-08`) was an authored **synthetic expectation defect**: the planner correctly records `too_many_requested_topics` for all three positive topics, while the diagnostic expected an empty exclusion list. The later pattern-generalization audit did not change those 27 outputs.

During finalization, only the current synthetic fixture's `sd-08.expected_excluded` metadata was corrected and its fixture version advanced from `phase8b-1b-diagnostics-1` to `phase8b-1b-diagnostics-1.1`. The 27 questions, planner, frozen benchmark and original first-pass report were not rewritten. This was **not** a frozen benchmark defect and involved no holdout data. The final current diagnostic run has requested/selected/status/exclusions **27/27 each**, false-positive Knowledge injection **0**, false-negative omission **0**. This shows the known repaired failure modes no longer trigger in these development diagnostics; it does **not** demonstrate generalization to unseen language.

Synthetic absent-anchor probes for month-combine, retreat and xunkong all yield `selected=[]`, `retrieval_query=null`, and `case_relation_not_present`. Three positive reviewed topics yield `needs_narrowing` with no query; explicitly excluding the third permits the two remaining topics. 世应 controls with 应克世 and 比和 Rule hits remain unavailable for literature selection because no reviewed unit covers those exact rule IDs. Multiple cast contexts leave requested intent unchanged; five identical replays have identical canonical serialization without timestamp or confidence.

## Remaining limits and decision

The recognizer is intentionally narrow. Unseen paraphrases, nested negation, distant cross-clause references, multiple anchors for one concept, and fine-grained 世应 coverage can still cause false negatives or ambiguous plans. P04–P06 and U2 retain one-case template risk. The 27 diagnostics are authored and non-random; zero observed false positives cannot prove general safety. The first-pass anchored-probe miss shows why relation-present safety cases must remain in future tests. No model-response quality or prediction accuracy is evaluated here.

**PRE_HOLDOUT_RECOMMENDATION: READY**, limited to committing this reviewed deterministic baseline and then performing a separately authorized, one-time holdout run. This recommendation meets the stated gates: metadata leakage NO; evaluator leakage NO; hardcoded case IDs/full questions 0; current synthetic false-positive injection 0 after the documented fix; original freeze verified; holdout exposure false. It does not assert unseen performance. Finalizing this baseline does not run holdout.
