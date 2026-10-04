# Hydra Bench audit-remediation programme

Baseline production revision: `8031b8a37fdb04a3bdc4c4eac17b2cffe6301288`  
Programme start: 2026-10-04

## Architecture freeze

This programme deliberately preserves the working application architecture:

- HTML/CSS/JavaScript browser UI;
- browser Web Worker + Pyodide;
- authoritative Python engineering calculations under `src/icm_workbench`;
- Plotly rendering;
- browser-local source processing and workspace persistence.

The programme does **not** introduce Rust, Java, Go, React/Vue, a server/backend,
a database, a TypeScript rewrite, a second calculation engine, or a replacement
for Pyodide. New contracts may use JSDoc/schema validation, but runtime behaviour
must stay within the existing architecture unless an audited defect requires a
specific change.

## Release discipline

The work is split into eight sequential pull requests. At the user's request,
implementation is prepared as a stack before any merge: PR 1 targets `main`,
and each following PR targets its predecessor. Merge in order; retarget each
successor to the updated `main` and rerun its exact-head gates before merging.
Each PR has its own regression evidence and must be reversible without depending
on an unmerged later PR. A green cumulative PR 8 does not replace those gates.

1. **PR 1 — baseline safety net**
   - freeze this programme and the production baseline;
   - add explicit known-issue characterization tests for the numerical defects
     that are already reproduced;
   - add golden-fixture conventions for later remediation PRs;
   - no runtime behaviour changes.

2. **PR 2 — numerical integrity (A-01 to A-07)**
   - DWF flow-support eligibility;
   - rainfall semantics versus rainfall units;
   - interval-aware rainfall exclusions;
   - boundary-safe observed/model interpolation;
   - explicit timezone/model-clock resolution;
   - exclusion-aware event response;
   - common non-finite-value handling.

3. **PR 3 — Flow Survey source/exclusion integrity (A-09 to A-11)**
   - monitor/gauge/channel-specific exclusions;
   - authoritative network-rainfall membership;
   - exact/confirmed/candidate/conflict/missing rainfall-source matching.

4. **PR 4 — immutable engineer-review governance (A-12)**
   - append-only review ledger;
   - migration of existing workspace review records;
   - stale/reconfirmed/reverted review events without destructive deletion.

5. **PR 5 — Week Matrix + Network (chosen UX option) + A-19/A-20**
   - synchronized monitor/week matrix, schematic and persistent evidence drawer;
   - exception navigation;
   - rainfall and volume-balance matrix variants;
   - remove popup → route → scroll as the primary review path;
   - search, pan/zoom, focus and larger-network schematic controls.

6. **PR 6 — Detriment correctness/methodology (A-13 to A-17)**
   - full assessment export versus filtered-view export;
   - explicit new-flooding policy;
   - independent spill count/duration acceptance policies;
   - source-verified versus engineer-declared scope/datum/template metadata;
   - explicit semantic measure declaration for generic flooding columns.

7. **PR 7 — dependency/deployment hardening (A-08/A-18)**
   - replace the legacy SheetJS dependency with an approved vendored build;
   - vendor core browser dependencies required for normal operation;
   - deterministic version/hash checks and malformed-workbook regressions.

8. **PR 8 — integrated acceptance and production release gate**
   - complete cross-workspace browser journey;
   - reference-data engineering reconciliation;
   - workspace save/reload/source-fingerprint checks;
   - desktop/laptop/tablet UI checks;
   - exact main SHA → Pages artifact → live-build verification;
   - no unresolved P0/P1 item from this programme.

## Audit register

| ID | Severity / class | Remediation PR | Required outcome |
| --- | --- | ---: | --- |
| A-01 | P0 DWF validity | 2 | Sparse flow support cannot yield complete DWF evidence. |
| A-02 | P0 rainfall semantics | 2 | Intensity and incremental depth are explicit, independent contracts. |
| A-03 | P0 exclusion/support | 2 | Exclusions subtract interval support even when no sample timestamp lies inside them. |
| A-04 | P1 pairing | 2 | Requested-window interpolation retains defensible bracketing samples. |
| A-05 | P1 time basis | 2 | Timezone-aware sources require explicit model-clock resolution before calculations. |
| A-06 | P1 event response | 2 | Hydraulic exclusions and support quality govern baseline/response metrics. |
| A-07 | P1 finite values | 2 | NaN/+Inf/-Inf are invalid evidence and cannot support a complete result. |
| A-08 | P1 dependency security | 7 | Legacy SheetJS runtime dependency removed/replaced and pinned locally. |
| A-09 | P1 survey exclusions | 3 | Exclusions can target monitor/gauge/channel without suppressing unrelated sources. |
| A-10 | P1 rainfall membership | 3 | Only authoritative/explicitly confirmed network gauges affect survey rainfall context. |
| A-11 | P1 source identity | 3 | Heuristic rainfall matches require confirmation and are never silently authoritative. |
| A-12 | P1 auditability | 4 | Review/revert/comment actions preserve immutable history. |
| A-13 | P1 detriment export | 6 | Full evidence export is independent of transient UI filters. |
| A-14 | Method policy | 6 | Treatment of new flooding is explicit, versioned and reported. |
| A-15 | Method policy | 6 | Spill count and duration have independent statuses and declared combination policy. |
| A-16 | P2 provenance | 6 | Source-verified and engineer-declared context are distinguishable. |
| A-17 | P1/P2 semantics | 6 | Generic volume columns require an explicit flooding-measure declaration. |
| A-18 | P2 deployment | 7 | Core runtime no longer depends on public CDNs for normal operation. |
| A-19 | P2 Flow Survey UX | 5 | Persistent evidence drawer replaces context-breaking modal/route workflow. |
| A-20 | P2 Flow Survey scale | 5 | Schematic supports search/focus/pan/zoom and larger surveys. |

The chosen **Week Matrix + Network** experience is also implemented in PR 5.
It is a presentation/review layer over the authoritative survey batch result,
not a new calculation engine.

## Numerical acceptance principles

All remediation work must preserve these cross-cutting rules:

- calculations use source-resolution/native analytical data, not plot-downsampled data;
- units and physical quantity semantics are explicit before dimensional calculations;
- missing/unknown/excluded support is never silently converted to zero/dry;
- long gaps are not interpolated or integrated across;
- excluded time is removed from assessment rather than treated as non-event time;
- result completeness derives from support validity, not merely the presence of a number;
- calculated evidence remains distinct from engineer-reviewed evidence;
- source fingerprints and calculation dependencies determine staleness;
- changed methodology is versioned and reported.

## PR 1 known-issue tests

`tests/unit/test_audit_remediation_known_issues.py` contains intentionally
`xfail` characterization tests for the reproduced A-01 to A-07 defects. An
`xfail` is not evidence that the defect is resolved. During PR 2 each relevant
test must be converted to a normal passing regression as its defect is fixed.

Unexpected `XPASS` should be investigated: either the defect has been fixed by
another change and the test can be promoted to a normal regression, or the
characterization does not exercise the intended path.

## Merge gates for every PR

Before a PR is eligible to merge:

1. Python regression suite passes.
2. JavaScript syntax/unit/contract checks pass.
3. Deterministic Pages package builds.
4. Chromium complete workflow smoke passes for affected workflows.
5. Firefox shell check passes.
6. Real reference-workflow simulation passes where the PR affects engineering calculations.
7. No unrelated workspace numerical output changes without an explained, reviewed reason.
8. PR body records intentional result deltas and remaining known limitations.

PR 8 additionally requires live exact-SHA verification after merge.
