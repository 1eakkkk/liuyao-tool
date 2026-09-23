# Phase 8B.1D: post-holdout failure analysis and baseline decision

This is a read-only interpretation of the sealed Phase 8B.1C result. It does not rescore predictions or change the frozen expected plans. The deterministic planner showed strong controlled-concept recognition on this frozen holdout, but weaknesses in task and scope constraints led to one false-positive Knowledge injection. It remains an explainable offline baseline. **Production readiness: NO.**

## Fixed evidence and exposure

| Item | Identity |
| --- | --- |
| Planner implementation commit | `1bc96dba7709fd63e915871a84df051f37ffdd03` |
| Benchmark freeze | `phase8b-query-planning-baseline-1` |
| Benchmark freeze hash | `sha256:f8567161f152a5295965d3beb4eb9df8f5480bb713a01bbaca57f6b0c837401f` |
| Holdout execution | `phase8b-query-planner-holdout-01` |
| Raw prediction SHA-256 | `sha256:f2e3ecfedca3818d1bee057af5a61d93fc3f53766f9e98c00017c08f30b62dbc` |
| Score report SHA-256 | `sha256:43c341a3d2ebc2ac148af41fa49be77a7a86d5f80c700594c7d7a2d2501598df` |
| Result seal SHA-256 | `sha256:65183d75d15fc9b4ef4f46936cc1e1a62222921a2fa53d5cecc09673dae73713` |
| Holdout exposure | `true` |

The 24 holdout cases are now exposed. They may be used for regression or post-holdout development analysis. They cannot be called unseen, untouched, or an independent holdout again. Any future change informed by `qp-049`, `qp-057`, `qp-062`, `qp-068`, or another exposed case must record `holdout-informed modification = true`. A future unseen claim requires a newly authored, independently frozen evaluation set.

The complete raw predictions and score report remain byte-for-byte in ignored local `test-results/phase8b-query-planner-holdout-01/`. The public [Phase 8B.1C report](PHASE_8B_1C_HOLDOUT.md) and the existing sealed `HOLDOUT.json` already record their identities. No duplicate result-manifest format is needed, and the full raw predictions need not be committed to the public repository. Preserve a separate immutable backup of the ignored local artifacts before any workspace cleanup.

## Thirteen complete-plan failures

The strict complete-plan result was **11/24 primary, 0/24 alternative, 11/24 accepted**. A failure can be caused by a requested evidence span, `basis`, scope, status, exclusion, or output constraint even when the selected concept set is correct. The mutually exclusive *primary* analysis classification below does not replace or alter the overlapping categories in the sealed score report.

| Case | Observed difference from the frozen complete plan | Primary classification |
| --- | --- | --- |
| `qp-049` | “月建冲” was not recognized as `month-break`; the Planner selected only `day-clash`. | CAPABILITY_FAILURE |
| `qp-052` | Selected `retreat` and `xunkong` correctly, but omitted `no_prediction`. | STRUCTURAL_MISMATCH |
| `qp-054` | Selected both concepts correctly; comparison evidence `basis` and `no_prediction` differed. | STRUCTURAL_MISMATCH |
| `qp-056` | Correctly withheld Knowledge for the absent current-case relation, but cited the later “月合” span instead of the frozen “月建合爻” span. | STRUCTURAL_MISMATCH |
| `qp-057` | Missed “月建合爻”; theory/ready became unknown/zero_knowledge, omitting `month-combine` and `no_prediction`. | CAPABILITY_FAILURE |
| `qp-058` | Selected `month-combine` and rejected unadmitted `day-combine` correctly; comparison evidence `basis` differed. | STRUCTURAL_MISMATCH |
| `qp-062` | Failed to exclude “旬空先别说”; counted three active topics, returned needs_narrowing, and omitted `month-break` and `advance`. | CAPABILITY_FAILURE |
| `qp-063` | Withheld Knowledge for three topics correctly; two requested-concept comparison `basis` values differed. | STRUCTURAL_MISMATCH |
| `qp-066` | Recognized and selected `xunkong`, but classified a terminology question as case_specific instead of theory. | CAPABILITY_FAILURE |
| `qp-067` | Returned zero Knowledge, but missed the narrow restatement task and its `no_explanation` constraint. | STRUCTURAL_MISMATCH |
| `qp-068` | Selected `shi-ying` and emitted a retrieval query for a numeric-only position question whose frozen plan allows no Knowledge. | SAFETY_FAILURE |
| `qp-069` | Treated background “日合” as a requested topic and misclassified a string-output task; Knowledge admission happened to prevent injection. | CAPABILITY_FAILURE |
| `qp-072` | Preserved “近神” as unresolved and selected `retreat` correctly, but omitted `no_prediction`; it matched neither whole primary nor whole acceptable alternative. | STRUCTURAL_MISMATCH |

**Mutually exclusive primary classification:** 1 SAFETY_FAILURE (`qp-068`), 5 CAPABILITY_FAILURE (`qp-049`, `qp-057`, `qp-062`, `qp-066`, `qp-069`), and 7 STRUCTURAL_MISMATCH (`qp-052`, `qp-054`, `qp-056`, `qp-058`, `qp-063`, `qp-067`, `qp-072`). These counts sum to 13. Structural mismatch does not imply an output constraint is unimportant downstream.

Among the 13 failures, **10/13 requested concept ID sets** and **9/13 selected concept ID sets** were correct. Only four cases changed the selected Knowledge set: three conservative misses (`qp-049`, `qp-057`, `qp-062`; four omitted concepts in total) and one false-positive injection (`qp-068`). Requested-concept evidence objects, which also include role and spans, were completely equal in only 4/13. `available_concepts` and Rule-ID availability agreed with the frozen case context for all 13; `unresolved_mentions` also agreed in all 13. The 11/24 full-plan result must therefore not be relabeled as 13 semantic-intent failures.

## Safety and upstream causes

`qp-068` is the only observed false-positive Knowledge injection. The deterministic `shi-ying` phrase pattern recognized the paired 世/应 wording. The narrow-request detector did not cover “位置编号相差多少？只给数字，不解释含义”, so Knowledge remained allowed, scope defaulted to case_specific, and the present Rule anchor and reviewed corpus permitted selection. This defines a general failure family: a user names a technical entity but asks only for a number, position, or format operation. Existing development narrow cases use more explicit forms such as “只报卦名”, “只列动爻位置”, and “不要引用文献”. The family may include “只要数字”, “告诉我第几爻”, “位置就行”, and “别解释”, but those variants were not separately evaluated in this run. No case-specific patch follows from this analysis.

The four omitted concepts have two causes. In `qp-049`, “月建冲” was not recognized as `month-break`; in `qp-057`, “月建合爻” was not recognized as `month-combine`. These are recognition gaps, not missing Rule anchors or Knowledge admission rejections. In `qp-062`, `month-break` and `advance` were both recognized, but the excluded `xunkong` was counted as a third active topic; the >2-topic gate conservatively withheld retrieval on an incorrect premise. `qp-069` is a different risk: an irrelevant background mention became requested intent, but source admission blocked selection in this corpus.

Four scope mismatches were observed: `qp-057` theory→unknown after missing intent, `qp-066` theory→case_specific for a terminology question, and `qp-068`/`qp-069` unknown→case_specific after operation-task constraints were missed. No mixed-scope miss was observed among these four. Scope is a material bottleneck, though three of the four mismatches were propagated from earlier recognition or task-constraint errors. The three status mismatches also followed upstream failures: `qp-057` ready→zero_knowledge, `qp-062` ready→needs_narrowing, and `qp-068` zero_knowledge→ready. Only the last produced incorrect Knowledge injection.

## Baseline decision and next evaluation boundary

Requested precision/recall were **97.06%/94.29%** and selected precision/recall **94.44%/80.95%** on this authored holdout. These figures describe this benchmark only. Explicit terminology and a small number of general safety boundaries may still be amenable to deterministic revision. Repeatedly adding question-specific regex forms for comparisons, background mentions, cross-clause exclusions, and theory/case scope risks a brittle phrase table. One holdout does not establish that deterministic planning has reached a general ceiling.

Three future directions remain open: (A) retain the deterministic baseline for offline comparison without expanding it; (B) make a clearly labeled holdout-informed deterministic revision, beginning with general task/safety boundaries; or (C) investigate a semantic fallback after defining when it is invoked and how safety is checked. **B is the recommended next study**, with C considered only through a separate design and comparison. A fallback triggered solely by unresolved or ambiguous status would not inspect `qp-068`, whose unsafe actual status was ready. Neither B nor C may reuse these 24 cases as unseen final evaluation; a new independently authored and frozen set is required.

**Production readiness: NO.** The observed injection, task/scope failures, selected recall, small reviewed Knowledge corpus, and absence of production integration tests do not support direct deployment. Interpretability remains a useful property of this baseline, not evidence of production safety or general natural-language understanding.

Phase 8B.1 closes as: **8B.1A** deterministic baseline implementation; **8B.1B** pre-holdout leakage/generalization audit; **8B.1C** one-shot frozen holdout evaluation; **8B.1D** post-holdout failure analysis. Final status: `baseline retained`, `production readiness = NO`, `holdout exposed = true`.

The one-shot runner binds execution to the baseline implementation commit. Once HEAD advances for documentation archival, its HEAD identity guard rejects a new invocation; that does not mean the sealed raw result changed. Historical verification should use a checkout of the baseline commit or read-only byte-hash verification of the existing artifacts. Do not loosen the runner guard or produce a second holdout prediction for convenience.
