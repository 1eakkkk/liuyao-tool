# Phase 8B.1C: one-shot deterministic query-planner holdout

## Experiment identity and execution order

This is the **first and only** 24-case holdout prediction run for the fixed deterministic baseline. `holdout exposure = true` from `2026-09-23T13:03:09.077Z` (execution `phase8b-query-planner-holdout-01`). Any future change informed by these cases must be labeled post-holdout development; the same 24 questions cannot be described as unseen again.

| Identity | Frozen value |
| --- | --- |
| Branch / implementation commit | `phase8/query-planning` / `1bc96dba7709fd63e915871a84df051f37ffdd03` |
| Planner contract / patterns | `query-plan-1.1` / `query-intent-patterns-1.0` |
| Benchmark / split | `query-planning-candidate-1.1` / holdout, 24 cases |
| Benchmark freeze | `phase8b-query-planning-baseline-1` |
| Benchmark freeze hash | `sha256:f8567161f152a5295965d3beb4eb9df8f5480bb713a01bbaca57f6b0c837401f` |
| Freeze verification before prediction | `verified_v2` |
| Existing evaluator Git blob | `e3377d726b76269b5806d6776af65a7cc2b3a6f5` |
| AI / network | none / not required |

Before prediction, the branch, clean tracked worktree, exact implementation commit, and frozen benchmark were verified. `execution.json` was written first. The unchanged evaluator CLI scores while predicting and overwrites its result path, so it could not satisfy the required raw-before-score order. A separate [one-shot runner](../scripts/phase8/run-query-planner-holdout.js) reused the evaluator's case-context, complete-plan comparison, and selection-safety helpers, required the same explicit `--split holdout --acknowledge-holdout-exposure` flags, and refused a second prediction after its exposure marker. The prediction path called the Planner once per case; it did **not** perform the evaluator's development-only deterministic replay. No Planner, pattern, evaluator, benchmark, corpus, Rules, Canonical, Structured 1.2, or production path was changed.

The runner created `exposure.json` before the first Planner call, then wrote `raw-predictions.json` once with exclusive-create semantics. It hashed and sealed those exact bytes **before** loading frozen ground truth for scoring. No prediction file was edited, reserialized, or rerun after scoring. Local results are under the ignored `test-results/phase8b-query-planner-holdout-01/` directory; they are not part of this public document.

| Sealed artifact | Identity |
| --- | --- |
| `raw-predictions.json` | 68,621 bytes; `sha256:f2e3ecfedca3818d1bee057af5a61d93fc3f53766f9e98c00017c08f30b62dbc` |
| `raw-seal.json` | `sha256:f8d1f2f325706531627bbbcb69b8a477c10057d24053819f01668ed6c606f791` |
| `score-report.json` | `sha256:43c341a3d2ebc2ac148af41fa49be77a7a86d5f80c700594c7d7a2d2501598df` |
| `HOLDOUT.json` result seal | `sha256:65183d75d15fc9b4ef4f46936cc1e1a62222921a2fa53d5cecc09673dae73713` |

The result seal binds execution and exposure metadata, implementation and frozen benchmark identity, the raw prediction and score-report byte hashes, and tracked evaluator/Planner/pattern Git blob IDs. Verification returned `verified`. Generated artifacts use raw-byte SHA-256; tracked source identity uses Git blobs. The old benchmark FREEZE was not rewritten.

## Results against complete frozen plans

An accepted plan must equal the entire primary plan or one entire acceptable alternative. Fields from different alternatives are never spliced together. Layer-level exact sets and precision/recall below use the primary plan as reference, including cases with acceptable alternatives. This is a strict contract match, so a wrong evidence span, `basis`, or output constraint can fail the complete plan even when the selected topics match.

| Measure | First holdout result |
| --- | ---: |
| Primary complete plan | 11/24 |
| Alternative complete plan | 0/24 |
| Accepted complete plan | 11/24 |
| Requested exact set | 21/24 |
| Requested precision / recall | 33/34 (97.06%) / 33/35 (94.29%) |
| Selected exact set | 20/24 |
| Selected precision / recall | 17/18 (94.44%) / 17/21 (80.95%) |
| False-positive Knowledge injection | 1 case / 1 concept |
| False-negative Knowledge omission | 3 cases / 4 concepts |
| Zero-K status accuracy | 6/7 |
| Explicit exclusion exact compliance | 1/2 |
| Needs-narrowing status accuracy | 2/2 |
| Case-anchor compliance | 2/2 |
| Knowledge-admission compliance | 3/3 |
| Question-scope / status accuracy | 20/24 / 21/24 |
| Unresolved-mentions exact handling | 24/24 |

The separate development set reached 48/48 accepted complete plans **after debugging**. Its result is not unseen evidence and is not combined with holdout into a `72/72` claim. A second holdout run was not used to test determinism; existing unit tests cover deterministic behavior.

## Safety-first error review

**False-positive Knowledge injection:** `qp-068` asked, “世爻和应爻的位置编号相差多少？只给数字，不解释含义。” The frozen primary and acceptable plans allow no selected concept. The Planner selected `shi-ying` and emitted a non-null `retrieval_query`. Its deterministic phrase recognition matched `世爻` in the paired 世/应 wording, but the narrow numeric-only request was not gated. This is an unnecessary Knowledge retrieval plan, despite the otherwise high selected precision. It is the highest-priority safety observation; the baseline was not changed.

**False-negative omissions:** `qp-049` missed `month-break` because “月建冲” was not recognized as requested intent, while `day-clash` was selected. `qp-057` missed `month-combine` in a theory-only “月建合爻” question and consequently returned `zero_knowledge`/unknown scope. `qp-062` recognized `month-break`, `advance`, and `xunkong`, but failed to treat “旬空先别说” as an explicit exclusion; all three were treated as active, causing `needs_narrowing` and no selected topics. The first two are intent-recognition omissions. The last is an exclusion/too-many-topics interaction that conservatively withheld retrieval, not a Knowledge admission rejection. These are three cases and four missing selected concepts. Source-checked admission remained compliant in 3/3 applicable cases.

The 13 failed complete-plan IDs are `qp-049`, `qp-052`, `qp-054`, `qp-056`, `qp-057`, `qp-058`, `qp-062`, `qp-063`, `qp-066`, `qp-067`, `qp-068`, `qp-069`, and `qp-072`. Error categories can overlap:

| Category | Failed cases |
| --- | ---: |
| `intent_false_positive` | 1 |
| `intent_false_negative` | 2 |
| `scope_error` | 4 |
| `status_error` | 3 |
| `exclusion_error` | 1 |
| `anchor_error` | 0 |
| `admission_error` | 1 |
| `narrow_request_error` | 3 |
| `too_many_topics_error` | 1 |
| `unresolved_mention_error` | 0 |
| `false_positive_knowledge_injection` | 1 |
| `false_negative_knowledge_omission` | 3 |
| `other` (strict field mismatch) | 6 |

The six `other` failures are not hidden selection errors: `qp-052` and `qp-072` missed a frozen `no_prediction` output constraint; `qp-054`, `qp-058`, and `qp-063` differed on requested-concept evidence `basis`; `qp-056` selected the later “月合” span instead of the frozen earlier “月建合爻” span. `qp-066` was recognized and selected as `xunkong`, but its `question_scope` differed. `qp-067` and `qp-069` missed narrow output handling; `qp-069` also recognized an irrelevant `day-combine` mention but did not inject Knowledge. No failure was used to amend this run's Planner or ground truth.

## Interpretation boundary

This result measures how the fixed deterministic Planner mapped 24 frozen questions into the frozen intent/retrieval-plan contract. The one false-positive Knowledge injection and exclusion/narrow-request safety errors matter more than the accepted-plan percentage alone. The set is authored and finite; it is not evidence that the Planner generally understands Chinese questions, is ready for production, or improves divination, Knowledge correctness, or AI answer quality. Any later correction based on these cases is post-holdout development and requires a new independent evaluation set for an unseen claim.
