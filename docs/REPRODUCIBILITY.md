# Experiment freeze source identity

## Why v2 exists

Phase 7's historical freeze policy (`v1`) recorded SHA-256 of the **working-tree bytes** for tracked source files. Git may store an LF blob while a Windows checkout presents CRLF bytes. A byte-only source check can therefore fail even when the committed source content is identical. This does not affect the meaning of the old FREEZE: its hashes remain the hashes that were actually recorded at preparation time.

Future rounds use `freeze_schema_version: "2"`, `source_identity_policy_version: "git-blob-v2"`, and `artifact_hash_policy_version: "sha256-raw-bytes-v1"`. The v2 manifest and its seal are new files; no Phase 6 or Phase 7 FREEZE is migrated or rewritten.

## Tracked source: Git blob identity

For each explicitly listed tracked source, v2 records its repository-relative `path`, the preparation `repository_commit`, and the Git `blob_oid` at that commit. Preparation requires a resolvable committed file and no staged or unstaged **Git-content** changes in tracked files. Verification confirms that the frozen commit still resolves, each recorded blob still exists at that commit, and the current HEAD has the same blob for every frozen path. A later commit that leaves those blobs unchanged is acceptable; a committed source change is not.

Dirty detection compares the index with HEAD and the working tree with the index. Git converts text according to its checkout rules before comparison. A CRLF-only working-tree representation can be reported as `M` by `git status` on Windows even while Git's normalized content diff is empty; it does not become a new source identity. An actual staged or unstaged content edit blocks preparation and verification. Untracked or ignored experiment outputs do not enter this tracked-file check. This policy does not hash an uncommitted source file and claim it belongs to a commit.

The current v2 policy does **not** store a separate normalized-text hash. The Git blob is primary; no Unicode, BOM, whitespace, or final-newline normalization is silently applied by this tool.

## Generated and external artifacts: exact bytes

Prompts, payloads, answers, PDF witnesses, scoring packets and similar files are artifacts, not Git source identities. Each artifact records `sha256_raw_bytes` over its exact file bytes. Any byte change invalidates verification. External files are never rewritten or newline-normalized by the freeze tool.

For newly generated JSON, `canonical-json-utf8-lf-v1` requires UTF-8 without BOM, compact JSON with recursively sorted object keys, array order preserved, and exactly one final LF. It does **not** rewrite newline characters inside string values or Unicode normalization. `generated_text` requires BOM-free UTF-8, LF line endings and one final LF. Preparation validates these conventions before taking a raw-byte hash. Generated payloads remain byte-identical only when the same serializer and input are used; the manifest records each artifact's serialization policy separately from its SHA-256.

The v2 manifest itself uses `canonical-json-utf8-lf-v1`. `FREEZE.v2.sha256` seals the **exact manifest bytes**, including schema and policy versions, commit, blob IDs and artifact hashes. Unknown policy versions fail closed. The seal is an integrity check, not a signature or proof of who prepared the round.

## Historical v1 compatibility

The read-only `verifyFreeze` compatibility path checks the original `FREEZE.sha256` and every file listed in its original `private/seal.json` by exact raw bytes. It then reports one of three source states:

| State | Meaning |
| --- | --- |
| `exact_match` | All current working-tree source bytes match the historical SHA-256 values. |
| `content_equivalent_git` | Raw source bytes differ, but the frozen plan said the tree was clean, the current tracked content is clean, and every frozen source path has the same Git blob at the frozen commit and current HEAD. **Not** exact historical bytes. |
| `unverifiable` | The byte check differs and Git-content equivalence cannot be established, including changed source blobs or an unresolvable commit. No equivalence claim is made. |

`raw_worktree_bytes_mismatch` and `git_content_changed` are reported separately. The original Phase 7 workflow's strict v1 verifier remains unchanged; this compatibility verifier is for read-only identity diagnosis. Under the current Phase 8A.2 HEAD, the local Phase 7 external round has an exact sealed-artifact check but reports `unverifiable` for source identity: 41 raw-byte mismatches and four Git source blobs changed since the frozen code commit. Those source changes include later work; the old round must not be relabeled v2 or described as exactly verified against this checkout. Its original code commit remains the reference for historical reproduction.

## Offline use

`scripts/experiments/freeze-identity.js` exports `prepareV2`, `verifyFreeze`, `canonicalJsonBytes`, and `writeCanonicalJsonArtifact`. A new round must use its own directory containing prepared artifacts, with a JSON config listing `trackedSourcePaths` and `{path,kind}` artifacts (`generated_json`, `generated_text`, or `external`). The CLI equivalents are:

```text
node scripts/experiments/freeze-identity.js prepare-v2 <new-round-directory> <config.json> [repository]
node scripts/experiments/freeze-identity.js verify <round-directory> [repository]
```

The synthetic tests exercise prepare → verify, LF/CRLF checkout representation, dirty and staged source edits, ignored outputs, committed blob changes, exact answer/PDF hashes, canonical JSON, seal changes, unknown policies, and both v1 exact and Git-equivalent states. They call no model and make no effect claim. No `.gitattributes`, `core.autocrlf`, historical FREEZE or historical answer is modified by this policy.
