# Phase 7.3A design and freeze report

Phase 7.3A external Knowledge A/B evaluation package ready.

## Scope

Baseline: a8c8dbb701ec2962ca40287f9c94f6a89bb78536; branch phase7/knowledge. Independent offline evaluation only. External answers = 0. No model call, production integration or Phase 8.

Fixed manual concept queries evaluate reviewed literature context under controlled retrieval, not automatic classification, retrieval recall or prediction accuracy. 8 explanation/boundary cases, 2 low-gain controls, 2 zero-match controls. Questions, follow-ups, reasons/checklists, recipes, Canonical, r1 results, retrieval traces and pair hashes are in experiments/phase7/evaluation/cases.json.

## Actual recipes and payload measurements

All recipes use Asia/Shanghai at 12:00:00 +08:00, values bottom-to-top. Calendar day is generated consistently by existing Core. Selection used only deterministic predicates and pre-answer budget validation, no model response.

| Case | Date | Sums | Day index | Required condition | Selected unit suffix | OFF | ON | Delta | Increase | F ON |
|---|---|---|---:|---|---|---:|---:|---:|---:|---:|
| case-01 | 2026-10-12 | 8,9,9,9,6,8 | 55 | ying_generates | shiying-scope | 21260 | 22294 | 1034 | 4.864% | 1046 |
| case-02 | 2026-10-13 | 8,6,9,7,8,7 | 56 | shi_generates | shiying-scope | 21046 | 22080 | 1034 | 4.913% | 1046 |
| case-03 | 2026-10-14 | 6,6,7,6,8,7 | 57 | month_clash | month-clash | 21124 | 22067 | 943 | 4.464% | 955 |
| case-04 | 2026-10-15 | 8,9,8,8,7,7 | 58 | month_combine | month-combine | 22424 | 23395 | 971 | 4.330% | 983 |
| case-05 | 2026-10-16 | 7,6,8,7,8,7 | 59 | static_day_clash | day-clash-context | 21870 | 22878 | 1008 | 4.609% | 1020 |
| case-06 | 2026-10-17 | 6,7,8,7,6,8 | 0 | advance | advance-definition | 21890 | 23024 | 1134 | 5.180% | 1146 |
| case-07 | 2026-10-18 | 7,9,8,9,8,7 | 1 | retreat | retreat-definition | 21622 | 22756 | 1134 | 5.245% | 1146 |
| case-08 | 2026-10-19 | 8,8,9,7,6,8 | 2 | jiazi_void | void-definition | 22042 | 23027 | 985 | 4.469% | 997 |
| case-09 | 2026-10-20 | 7,9,8,6,7,8 | 3 | void | void-definition | 21086 | 22071 | 985 | 4.671% | 997 |
| case-10 | 2026-10-21 | 6,6,8,9,7,8 | 4 | month_combine | month-combine | 22957 | 23928 | 971 | 4.230% | 983 |
| case-11 | 2026-10-22 | 7,9,9,8,6,9 | 5 | return | none | 21515 | 21515 | 0 | 0.000% | 12 |
| case-12 | 2026-10-23 | 6,6,9,7,7,9 | 6 | hidden | none | 23168 | 23168 | 0 | 0.000% | 12 |

F OFF is 12 code points for all cases. Units <= 4, F <= 2400, total increase <= 15% in every case. No budget exclusions. Candidates and selected IDs agree for the ten nonzero cases. Cases 11/12 are real admission/filter zero matches, not limit=0; complete prompts are UTF-8 byte-identical and visible-identical. Other reviewed units are excluded by concept_filter; all three source_checked units remain excluded by verification:source_checked and conditions_unreviewed.

## Freeze and blind review

The case manifest binds the complete snapshot. Each prepared round additionally seals both full prompts/inputs, common-base hashes, rubric, seven neutral references, private balanced mapping, fixed schedule, model configuration and source hashes. Preserve the root seal independently. Mapping has four cells of 3: A=ON/A-first, A=ON/B-first, A=OFF/A-first, A=OFF/B-first. Each margin is 6/6. Formal external seeds are random and private; deterministic seeds are restricted to synthetic validation.

No real model has been selected. The example MODEL_NOT_SELECTED configuration permits freezing a preparation package but explicitly blocks import. Once a real model/settings are chosen, prepare a separate round before obtaining any response; never rewrite the existing freeze. This does not change cases, query, corpus or prompt.

Blind-review-v2 has ten unweighted metric arrays, reviewer/complete status, compromised-blinding fields and shared per-turn checklist assessments. Findings preserve exact quotes, neutral fact/source references and direction flags. quote.start / quote.end are JavaScript UTF-16 code-unit offsets into the exact raw answer string. This is distinct from Unicode code-point prompt budgets. Omission, incorrect and uncertain assessments have enforced finding correspondences. Contradictions require both quotations; misquotes require neutral sources.

Execution and scoring are separate physical directories. Scorers get only anonymous verbatim answers, question/follow-up, shared checklist, neutral facts/relations and the common seven-reviewed reference pack. No selected IDs per answer, mapping, prompts, query, cost, private paths or seeds are exported by the packet builder. Raw answers can themselves compromise blinding and are never redacted.

## Validation

Synthetic text is explicitly marked and separately typed; its deliberate omissions exercise scoring without inventing model-performance data. Full CLI prepare/verify/import/status/scoring/lock/unblind/report passed. Negative checks cover pre-lock unblinding, incomplete collection/reviews, mutation of sealed files, overwrite/order/model/settings rejection, UTF-16 emoji offsets, reference validation and no production changes.

- `npm test -- --maxWorkers=1`: 260/260 passed, 16 files; original 230 plus 30 evaluation tests. Final full run: 106.23 seconds. The first combined-load run hit three default 5-second timeouts; offline round-trip tests now have an explicit 30-second limit, and the complete rerun passed.
- `npm run build`: passed, 51 modules. Existing assets remain `index-BUs3Mv5n.js` / `index-63lbvoss.css`. Existing Cannon classic-script warning only.
- Full CLI synthetic run: `test-results/phase7-synthetic-validation-02/experiment/report.json`, status `synthetic_pipeline_validation`, 24 synthetic conversations / 48 literal turn texts, effects_conclusion null, external answers 0. The run is ignored by Git.
- Synthetic freeze seal: `1429423aa50517348198269ac6a11aa1248db879d09a8f96859bc46831c43b63`; lock hash: `6b0ad0a2b7404e1c27a534a621ade55186e5c249c45b45f185d7f5ee11ac4e11`. These identify tool validation only, not an external experiment.
- Case manifest hash: `2bc05ddf42ef0cac587190b924b36159b1f3298f2cd866429cdac4f0f69e509a`.
- `git diff --check` and staged check passed. Only 15 newly added evaluation/test/document files; no existing production or corpus files changed. Raw responses, seed, mapping and local configs are not staged.

## Frozen boundaries and limitations

Corpus remains phase7.1-initial-1; SHA-256: sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729. Seven reviewed, three source_checked; Ruleset r1 still 25 rules. No edits to corpus, src/, Core, Canonical, Prompt, Structured 1.2, production entry points or Cloudflare settings. Phase 6 historical files remain untouched.

New means these formal questions have no observed external model answers, not that hexagrams never occurred in exhaustive tests. Diagnostic/manual-query cases are not a random sample. Shared text for advance/retreat is not two independent sources. Existing common instructions may yield ceiling effects. Citation patterns can reveal grouping despite anonymous labels. Reviewed is a project editorial status, not academic certification. Hashes check integrity, not authenticity against complete malicious resealing. No statistical proof, accuracy improvement or Knowledge effectiveness conclusion.

The workflow is a self-contained adaptation of Phase 6 semantics, with independent files and rubric; no new package dependencies. Raw answers, mapping, seed, run configuration and temporary artifacts must stay in ignored test-results/.

Stop after Phase 7.3A.
