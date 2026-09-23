# Phase 8B.0 query-planning baseline freeze

`query-planning-candidate-1.1` was frozen as the Phase 8B.0 query-planning baseline at source commit `21c0441d40ad991912c67a298b6c29e58dcd8fe3`.
The benchmark source retains `candidate_not_frozen`; this separate freeze has ID `phase8b-query-planning-baseline-1`.

The source set is exactly the 10 D1 files listed in `FREEZE.v2.json`. Dependencies in `metadata.json` are references, not extra frozen benchmark source files. Source identity is commit + Git blob (`git-blob-v2`); generated JSON uses `canonical-json-utf8-lf-v1`, generated text uses `utf8-no-bom-lf-v1`, and each artifact has an exact raw-byte SHA-256 under `sha256-raw-bytes-v1`. The manifest itself is canonically serialized and sealed by `FREEZE.v2.sha256`.

The 72 cases contain 48 development and 24 holdout cases across 24 isolated semantic families. Phase 8B.1 may use the development cases to design and debug a deterministic planner. Run holdout only after the baseline planner design is settled. If a specific holdout result is inspected and used to change the planner, record that exposure; later results are no longer fully unseen holdout evidence.

A confirmed ground-truth defect requires a documented new benchmark revision and a new freeze. Retain this freeze for verification; never silently edit or reseal it. This freeze contains no planner algorithm or production integration.
