# Phase 8B.2 task-gate benchmark freeze

The reviewed `query-planning-task-gate-candidate-1.2` source was committed at `c4b1d1a1dfa92a147328dc7b1909cce45960ba91`.
This separate freeze has ID `phase8b2-task-gate-benchmark-1`; the source benchmark retains its original candidate status.

The source set consists of the 9 tracked files in `FREEZE.v2.json`. Dependencies in `metadata.json` are referenced by Git blob identity. Source identity uses `git-blob-v2`; generated artifacts use `canonical-json-utf8-lf-v1` or `utf8-no-bom-lf-v1` and exact raw-byte SHA-256 under `sha256-raw-bytes-v1`.

The benchmark contains 64 cases, split 32 development / 32 holdout across 16 isolated semantic families. The new Phase 8B.2 holdout has not been run or exposed. The old Phase 8B.1 holdout is exposed and is historical development evidence. A ground-truth change requires a new benchmark revision and a new freeze; do not rewrite this freeze.
