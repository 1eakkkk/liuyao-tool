# Phase 8B.2C — Task Gate candidate revision for human review

Status: **candidate_not_frozen**. This is a revision of authored benchmark questions and complete expected plans, not a Planner 1.2 implementation or evaluation. The old query-plan-1.1 benchmark, freeze, holdout predictions, corpus, r1 Rules, Canonical, Structured 1.2, and production paths are unchanged. The prior 1.1 holdout is exposed and cannot serve as unseen evidence again.

## Contract decision

`query-plan-1.2` retains four values each for `question_scope` and `knowledge_task`. There is no fifth task, fuzzy correction, new concept alias, or relaxed requirement that `knowledge_seeking` have a required concept. The only contract addition is `output_directives`, a generic array of `{text, question_span, kind}` with `kind ∈ {format, brevity, verbatim}`. `boolean_only` was already an existing output constraint. The directive records an exact UTF-16 span and cannot influence requested concepts, Knowledge selection, or retrieval status. `no_prediction` and `no_explanation` remain separate safety semantics. A formatting mismatch belongs to Output policy or strict full-plan scoring, never Retrieval scoring.

“这个词能否直接作为检索词？” is a **non_knowledge meta task**. An unresolved spelling stays in `unresolved_mentions`; it cannot silently become requested or selected Knowledge. Questions purely about product UI or search capability lie outside this retrieval-planning benchmark. `unknown` means the user's task or scope itself cannot safely be determined, not merely that a Planner lexicon lacks a phrase. Ambiguous benchmark wording should be rewritten before freeze.

## Revisions and independent adjudication

The earlier audit's 24 rewrite items were revised: `tg-001/003/005/007/009/010/011/012/019/025/029/031/039/041/053/054/055/056/057/058/059/060/061/064`. Astra additionally required rewriting `tg-062`, making **25 specified rewrites**. `tg-008` and `tg-044` changed wording to make their revised scopes explicit; `tg-037/038` changed to remove a near-duplicate cross-split task pair. These additional edits are not counted as the original 24 rewrite findings.

| Label revision | Final decision |
| --- | --- |
| `tg-008` | `mixed` scope: cast serialization plus **theory** quotation on 旬空; mixed task and selected xunkong remain. |
| `tg-017` | Two separate source requests, `request_relation=none`; 旬空 is explicitly excluded. |
| `tg-023` | Cast yes/no confirmation uses existing `boolean_only`. |
| `tg-032` | Cast label yes/no confirmation uses existing `boolean_only`. |
| `tg-036` | `mixed` scope: case-specific void count plus **theory** definition of 旬空. |
| `tg-043` | Roman numerals use generic `format` directive; “不附说明” is `no_explanation`. |
| `tg-044` | Explicit general literature question with `theory` scope and theory context for catalog alias 日沖. |
| `tg-048` | General source requests use `theory` scope/context and `request_relation=none`; 飞伏 is still unadmitted. |

| Astra case | Revised standalone question | Complete-plan decision |
| --- | --- | --- |
| `tg-029` | 整条回答不得使用任何古籍内容，但同时请附上退神的古籍原句。 | Theory; `unknown` task, real global conflict, `ambiguous`, no selection/query. Opposed spans are explicit. |
| `tg-031` | 这里只判断未确认的“近神”能否直接作为检索词，不要查询或提供古籍内容。 | `non_knowledge` feasibility task; 近神 unresolved with candidate advance, not requested/selected; zero Knowledge. |
| `tg-062` | 不结合当前卦，只比较月建与爻相合、日辰冲爻在古籍条件上的不同。 | Unambiguous `theory`, two required concepts, comparison, both selected; no cast and no acceptable alternative. |
| `tg-064` | 词表审核：拼写待核的“旬孔”能否直接进入检索索引？只给审核结论，不引用古籍。 | `non_knowledge` feasibility task; 旬孔 unresolved with candidate xunkong, not requested/selected; zero Knowledge. |

All 64 questions are standalone. `tg-009`–`012` carry the exact text to transcribe/edit inside each question. Quoted or background mentions are not Knowledge intent. `tgf-14` now uses source checklists, two-column lists, a deferred field, and a three-card request rather than swapping concept names in the development exclusion family. `tgf-15` uses an asserted-but-absent relation, a theory term card, a present-direction citation, and an absent relation that also faces admission gating; it does not copy the development anchor/admission templates. Missing anchor takes precedence over corpus admission. Complete acceptable alternatives: **0**, because the unclear `tg-062` wording was rewritten.

## Sixteen-family audit

| Family | Split | Four independent contrasts | Semantic audit |
| --- | --- | --- | --- |
| `tgf-01` | Dev | position formatting / source account / sequential combined request / number-only refusal | Distinct from old distance-calculation failure. |
| `tgf-02` | Dev | symbol serialization / void explanation / symbol table / theory quotation | No incidental source term in pure conversions. |
| `tgf-03` | Dev | quoted transcription / transcription plus source / short editing / explicit no-source editing | Each includes its own input text. |
| `tgf-04` | Dev | quotation / no-prediction explanation / original plus paraphrase / cast yes-no | Output policy separated from retrieval. |
| `tgf-05` | Dev | postposed exclusion / prefixed exclusion / deferred topic / >2 positive topics | Exclusions are local. |
| `tgf-06` | Dev | missing case anchor / theory with no anchor / cast yes-no / present case anchor | No Canonical-implied case scope. |
| `tgf-07` | Dev | source-checked return / source-checked flying-hidden / mixed admission / theory unadmitted | Rule hit does not prove reviewed admission. |
| `tgf-08` | Dev | global literature conflict / compatible sequence / typo feasibility / no-source cast lookup | Query feasibility does not retrieve. |
| `tgf-09` | Holdout | aggregate index / index plus source / count / count plus theory | Aggregate operations differ from Dev position and symbol operations. |
| `tgf-10` | Holdout | source index card / flying-hidden Boolean fact / source locator after cast check / theory locator | Citation metadata differs from Dev quote-only prompt. |
| `tgf-11` | Holdout | global Roman-format conflict / sequential two-part task / format without explanation / theory alias request | Roman format is a generic directive, not a new ontology. |
| `tgf-12` | Holdout | incidental flying-hidden / background-only cast task / unadmitted citation / general paired quotations | Background words do not become intent. |
| `tgf-13` | Holdout | theory retreat / case retreat / dual scope via alias / cast line number | Theory and case evidence are explicit. |
| `tgf-14` | Holdout | source checklist / two-column source list / withheld field / three source cards | Different syntax and task structures from Dev exclusions. |
| `tgf-15` | Holdout | false relation in annotation / independent theory card / present relation source / absent relation source | Anchor and admission precedence explicit. |
| `tgf-16` | Holdout | draft typo marking / general comparison / label transcription / index-eligibility meta task | No mixed-scope ambiguity or autocorrection. |

Families remain entirely within one split: 8 development families, 8 holdout families, 4 cases each. The hand audit found **0 blocker cross-split semantic leakage pairs**. Acceptable capability overlaps remain: `tgf-04/10` both test literature with output restrictions but one asks for a quotation and the other a locator index card; `tgf-05/14` both test exclusions but have different task structures; `tgf-06/15` both test anchor gates but differ in assertion and document-card form. These similarities are disclosed, not claimed as total conceptual independence.

## Old-failure overlap and lexical profile

| Pair | Audit class | Basis |
| --- | --- | --- |
| `tg-001` / old `qp-068` | A — independent same capability | Two-position formatted extraction, not numeric distance calculation. |
| `tg-005/007` / old `qp-069` | A — independent same capability | Symbol serialization/table without the old incidental 日合 distractor or its question structure. |
| `tg-031` / old `qp-072` | A — independent same capability | Meta check of an unconfirmed search term, not a two-term literary definition comparison. |

Suspicious paraphrases (B): **0 after revision**. Direct derivatives (C): **0**. This is a manual structural audit, not a mathematical independence guarantee. The candidate remains informed by exposed old failures.

| Split | Cases | Concept-bearing cases | Exact concept spans | Catalog-alias spans | Grounded descriptive spans | Knowledge / non-K / mixed / unknown | Conflict | Explicit exclusion | Absent anchor | Unadmitted | Unresolved | >2 topics | Exact Rule fact refs |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Development | 32 | 26 | 28 | 2 | 1 | 15 / 11 / 5 / 1 | 1 | 3 | 1 | 4 | 1 | 1 | 3 |
| Holdout | 32 | 28 | 17 | 6 | 11 | 18 / 9 / 4 / 1 | 1 | 3 | 2 | 2 | 2 | 1 | 5 |

Spans, rather than cases, are counted in the three lexical columns. Holdout has 13 concept-bearing cases with **no exact catalog term**: `tg-038/039/044/051/053/054/055/056/057/058/059/060/062`. The ratio is 13/28; aliases and descriptive phrases are based on existing catalog entries or ordinary named relations. These benchmark phrases are **not** new catalog aliases. Neither “空” nor “近神” is an alias. The exact Rule references include a selected current-case relation, an absent-anchor contrast elsewhere in the same family, a theory request requiring no anchor, and a Rule-present non-K fact operation. Each reference is checked against the frozen fixture's actual r1 target; fact conflicts: **0**.

| Additional profile (case count except phrase spans) | Development | Holdout |
| --- | ---: | ---: |
| Descriptive relation spans within `deterministic_phrase` | 0 | 6 |
| Natural paraphrase spans within `deterministic_phrase` | 1 | 5 |
| Incidental/quoted background concept cases (manual audit) | 4 | 3 |
| Explicit Knowledge-request evidence cases | 21 | 23 |
| Non-K operation evidence cases, including mixed tasks | 15 | 13 |
| Generic output-directive cases | 5 | 6 |

The descriptive/paraphrase split is a manual linguistic subcategory of `deterministic_phrase`, not a new schema `basis` or catalog alias. The background count includes quoted text that is being transformed rather than queried; its concept may still be independently requested in a separate clause, as in `tg-010`.

## Self-audit and gate

The revised questions have 0 identified ground-truth, task-taxonomy, scope, mixed-scope, conflict, unknown, standalone-context, fact-reference, old-failure-derivative, and cross-split blocker defects. The output-format directives do not alter selection labels. Scoring must keep Task, Intent, Retrieval, Scope, Output policy, and strict full-contract results separate. A `no_prediction` or Roman-format mismatch cannot be counted as a Knowledge-selection failure.

**FREEZE_RECOMMENDATION: YES for human final review only.** This is not a freeze authorization or an evaluation result. Planner 1.2 is not implemented; Planner 1.1 and old holdout artifacts are unchanged. No new holdout has been run, no freeze has been created, and no commit has been made in this revision step.
