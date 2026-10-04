# Audit stack release checklist

## Stack and publication

| Sequence | Remote PR | Branch | Base |
| --- | --- | --- | --- |
| 1 | #56 | audit/pr1-baseline-safety-net | main |
| 2 | #57 | audit/pr2-numerical-integrity | audit/pr1-baseline-safety-net |
| 3 | #58 | audit/pr3-survey-source-exclusion-integrity | audit/pr2-numerical-integrity |
| 4 | #59 | audit/pr4-review-ledger | audit/pr3-survey-source-exclusion-integrity |
| 5 | #60 | audit/pr5-week-matrix-network | audit/pr4-review-ledger |
| 6 | #61 | audit/pr6-detriment-methodology | audit/pr5-week-matrix-network |
| 7 | Awaiting publication | audit/pr7-local-runtime-dependencies | audit/pr6-detriment-methodology |
| 8 | Awaiting publication | audit/pr8-integrated-release-gate | audit/pr7-local-runtime-dependencies |

The original remote PR #61 contains a corrupted Python context parser that stops
test collection. Local commit `7545788` removes duplicated code, restores the
source-context and flooding-measure helpers, and updates the reference tests to
meet the explicit elevation-confirmation contract.

A browser-only source-contract defect was also found in PR 3: `wb` was
undefined when building rainfall RPC specifications. Commit `60c1431` uses the
shared authoritative rainfall-semantics helper and adds a source-spec regression.
The repaired PR 3 has been merged forward through the local PR 4–8 branches so
the fix is present before any predecessor can be released.

PR 7 commit `1169801` packages pinned dependencies, validates vendor integrity,
hardens association import and enables Pages gates on `audit/**` PR bases.

PR 8 adds same-origin acceptance with external requests blocked, source-fingerprint
restore, three viewport checks, vendor-tampering regressions, and release gating
on Chromium, Firefox and performance jobs. Integrated acceptance also repairs
full Detriment HTML exports to include figures derived from full scoped rows and
result provenance, and updates the generic-volume journey to exercise the new
explicit measure declaration. Methodology schema version 2 reaches the engine.

## Evidence recorded during recovery

| Gate | Result |
| --- | --- |
| Exact PR 1 Python suite | 220 passed; 7 expected characterizations xfailed |
| Exact PR 2 Python suite | 231 passed |
| Exact PR 3–5 Python suites | 234 passed on each head |
| Cumulative Python suite | 240 passed; 9 subtests passed |
| JavaScript syntax and unit suites | Passed |
| Reference EDM/Flow Survey simulation | Passed; 9 monitors, 4 gauges, rainfall reconciliation and volume-balance checks |
| Deterministic package | Two builds produced identical hashes for 93 non-cache files |
| Chromium isolated-network release journey | Passed; no external requests; source hash survived workspace restore; 1440/1366/780 px |
| Chromium Detriment journey | Passed; three assessments, exports, precision, source removal/restoration, responsive layout |
| Chromium Detriment reference journey | Passed; native reference CSVs, A/B values, PNG/CSV/HTML exports, crash/retry |
| Chromium shell | Passed |
| Cumulative cross-workspace Chromium smoke | Passed; rainfall declaration and packaged-bundle fallback paths reconciled |
| Firefox local launch | Blocked: process timed out before page/test startup, with and without proxy |
| Performance comparison | Passed, 4 datasets × 3 samples; large model preview median 4.72 s versus 70.13 s baseline |

Firefox shell and the complete survey matrix journey must also be recorded as
passing before GO. Pending or
blocked checks are not passes. Exact remote CI is required after publication.

## Merge and deployment procedure

1. Publish the repaired PR 3–6 branches and create stacked PR 7 and PR 8.
2. Run all exact-head CI jobs; review the cumulative engineering/browser evidence.
3. Resolve any failed or blocked gate before changing draft/readiness status.
4. Merge in sequence. After each merge, retarget its successor to current main,
   verify that its diff contains only the intended scope, and rerun exact-head CI.
5. Confirm the Pages artifact and live `build.json` contain the final main SHA.
6. Require successful post-deployment live verification before declaring live.

## Limitations

All eight remote PRs are not yet ready for merge. Publication was rejected by
automatic approval review because it requires explicit authorization to push
repository contents to GitHub. No merge or production deployment was performed.
Local browser evidence does not substitute for remote CI or live-SHA verification.
