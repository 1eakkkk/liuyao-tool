# Phase 7.3A Knowledge evaluation package

Phase 7.3A external Knowledge A/B evaluation package ready.

This is an offline, pre-answer diagnostic set. No external model answers have been collected by this phase. It tests literature interpretation with manually frozen, correct concept queries, not automatic classification/query generation, retrieval recall, classical efficacy or prediction accuracy.

## Frozen inputs

- 12 Core-generated casts: 8 explanation/boundary, 2 low-gain and 2 zero-match controls.
- `cases.json`: exact questions/follow-ups, recipes, Canonical, r1 results, common checklists with reasons, private preparation rationale, actual retrieval trace/costs and expected hashes.
- `cases.schema.json`: closed snapshot structure. Validation also replays Core/r1, enforces freshness, condition hits, corpus hashes, pair equality and actual retrieval results.
- `manifest.json`: case document hash. Changing cases means a new version/round before seeing answers.
- `review.schema.json`: independent blind-review-v2; no Phase 6 schema changes.
- `scripts/phase7/generate-evaluation-cases.js`: records the pre-answer search procedure and refuses to overwrite any frozen output. Do not run it to adapt cases after observing answers.

Dates are controlled synthetic scenario dates in Asia/Shanghai, not records of real divination outcomes. Day indices agree with the existing calendar calculation. Line values are bottom-to-top. None of these formal questions has an observed external answer; hexagram shapes may have appeared in exhaustive algorithm tests. Freshness checks additionally reject matching primary/moving shapes of Phase 6 and Phase 7.2 fixtures, and repeated shapes within this set.

## Before any future external run

Select and record the visible model/client/version/settings honestly. Copy `config.example.json` into an ignored local directory and replace the placeholders. `MODEL_NOT_SELECTED` permits package preparation but blocks import; selecting a model later requires a new frozen round. Do not alter a prepared configuration. Unknown version/settings values must be recorded as unknown rather than guessed.

No seed is accepted for external rounds: prepare generates a private random seed. Synthetic rounds may use a fixed seed for reproducibility. Four assignment/order cells each contain 3 cases; A=ON, A-first and ON-first each have 6 cases. Case order is case-01 through case-12; within-case order is frozen by the private plan. Each variant starts a new chat; initial and follow-up remain in that chat. Do not pass the other variant's answer as context.

Run commands from the repository root. All run/config/raw files belong under ignored `test-results/`, never commit them.

```text
node scripts/phase7-evaluation.js prepare test-results/phase7-round-01 test-results/my-config.json
node scripts/phase7-evaluation.js verify test-results/phase7-round-01
node scripts/phase7-evaluation.js status test-results/phase7-round-01
```

`prepare` replays and validates all cases before writing pairs. `FREEZE.sha256` binds private cases, references, rubric, mapping, schedule and both full prompts/inputs. The plan also binds source hashes for Core/rules/AI/knowledge/corpus/evaluation files and records the code commit and dirty state. Preserve a copy of the seal outside the experiment directory: local hashes detect changes, not a malicious actor rewriting every seal. Run under the frozen code; changed source hashes fail verification.

## Separate execution and scoring

- Give the executor only `execution/`. It contains anonymous prompts, follow-ups, schedule and instructions, never seed/mapping. Prompt content can still reveal literature presence.
- Never give the scorer the repository's case file, preparation rationale, execution tree or private directory.
- The scorer receives a separately exported directory containing anonymous verbatim answers, questions, shared checklists, neutral program facts/relations and the same seven-reference pack for every case. It contains no per-answer retrieved IDs/query/cost/prompt/mapping.
- The three source_checked units never enter F or the reference pack.
- The executor and scorer should be different people. Correctly citing the book is not automatically compromised blinding; revealing protocol sections or grouping is. Preserve answers verbatim and explain `blinding_compromised`.

## Import and review

Each import contains both initial and follow-up files, matching frozen model/settings, actual execution order, declared data kind and explicit deviations. Order differs from schedule is automatically recorded as a deviation. Retries require a new round; no overwrite or replacement. UTF-8 BOM, CRLF and raw content are preserved. Synthetic data kind mismatches and explicitly marked synthetic text in external rounds are rejected. The tool cannot independently authenticate claimed external provenance.

```text
node scripts/phase7-evaluation.js import test-results/phase7-round-01 test-results/my-import.json
node scripts/phase7-evaluation.js scoring test-results/phase7-round-01 test-results/phase7-scoring-01
node scripts/phase7-evaluation.js lock test-results/phase7-round-01 test-results/phase7-scoring-01/reviews.json
node scripts/phase7-evaluation.js unblind test-results/phase7-round-01
node scripts/phase7-evaluation.js report test-results/phase7-round-01
```

Scoring requires 24/24 imported conversations (48 turn texts), closes collection, and must be outside the experiment tree, including resolved symlink ancestry. Reviews start pending; default uncertain assessments are unreviewed placeholders, not completed judgments. Complete all assessments and review records. Lock validates findings and binds answers, reviews, rubric and freeze seal. No unblind before lock; no report before explicit unblind. Locked material changes fail.

## Quote offsets and rubric

**quote.start / quote.end are JavaScript UTF-16 code-unit offsets into the exact raw answer string.**

The end is exclusive. Validator requires `answer.slice(start,end) === quote.text`, with in-range bounds. For `😀甲`, 甲 begins at offset 2, not 1. Prompt budgets instead count Unicode code points; they are different concepts.

Metrics: fact_errors, relation_errors, relevant_omissions, literature_misquotes, literature_overreach, fact_overrides, duplicate_evidence, contradictions, irrelevant_literature, uncertain. Relation direction errors remain a boolean subcategory, not additional weighted errors.

Each finding contains finding_id, turn, quotes, fact_ids, checklist_id (nullable), source_reference_ids, direction_error and reason. Cross-category copies of one incident must share an identical finding record. Factual findings need neutral facts; misquotes need a neutral reference; contradictions need two distinct quotes, both turns for cross-turn contradictions.

Checklist assessments are satisfied / omitted / incorrect / uncertain. Omitted requires exactly one omission finding for that item/turn. Incorrect requires an error finding and cannot also be omission. Uncertain requires an uncertain finding. Satisfied cannot conflict with attached errors. Initial omission remains omitted even when follow-up satisfies it. No checklist requires a Knowledge citation. An omission can have no quote because it is an absence: the reason must explain that the whole specified answer turn was inspected and the required content was absent. Do not fabricate quotations. Human judgment remains necessary.

Month-clash references only support the naming definition, not an exhaustive resolution doctrine. Day-clash text requires strength premises that the program's seasonal annotation does not establish. Do not demand unstated true/false void doctrine or automatic choice of useful deity.

## Reports and synthetic validation

Reports contain metric event counts and affected conversations, turn/category breakdowns, omission opportunities, direction errors, comparisons (on_better/off_better/same/mixed/unable_to_judge), controls, deviations, uncertain, compromised blinding and separate costs. Tradeoffs are mixed; uncertain or deviated comparisons are unable_to_judge. No total score, weight, significance or prediction accuracy claim. Categories may overlap and are not additive evidence. Zero-match prompts must be byte/visible identical; answer variation there is not a Knowledge effect.

```text
node scripts/phase7/validate-evaluation-synthetic.js test-results/phase7-synthetic-check-01
```

This invokes every public CLI step with literal `[SYNTHETIC]` responses, scores their deliberate omissions, locks, unblinds and reports. It never calls a model. Synthetic report counts prove only toolchain operation, never model effectiveness. Existing run directories cannot be overwritten.

Freeze budget: at most 4 units; F <= 2400 Unicode code points; total prompt increase <= 15%. Whole units only, no corpus/status/policy edits to improve coverage. Current 10 nonzero cases each select one reviewed unit; cases 11/12 have identical empty F and identical full prompts.
