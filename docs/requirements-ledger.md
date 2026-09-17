# Requirements ledger — current retry

States apply to this retry, not historical completion claims. Core evidence: `tests/unit/test_resume_regressions.py`, `tests/web/test_browser_bridge_native.py`, existing regression suite. Browser code: `web/assets/runtime.release.js`, `workbench-v2.js`; bridge: `web/python_bridge.py`. Browser smoke is blocked pending permitted execution; the current local runtime cannot launch Chromium. The consolidated 17 September implementation plan remains authoritative.

| ID | Current implementation / next action | State |
|---|---|---|
| U01 | Pages architecture retained; rerun clean browser full journey | implemented-unverified |
| U02 | Mixed file pool and HYD extension; representative format/error validation needed | implemented-unverified |
| U03 | Three-file collapse retained; exercise all cardinalities | implemented-unverified |
| U04 | Optional mappings and explicit spill model; unit/datum confirmation incomplete | not started (remaining contract) |
| U05 | Observed-only and rainfall-only paths; browser acceptance pending | implemented-unverified |
| U06 | Serialized calls and range lifecycle repairs; reproduce full browser zoom/reset/races | implemented-unverified |
| U07 | Separate rainfall band retained; unit/conversion contract incomplete | implemented-unverified |
| U08 | Threshold mounting fixed; per-series datum/unit validation still needed | implemented-unverified |
| U09 | Status retained; responsive worker and genuine cancellation still needed | not started (remaining worker) |
| U10 | Year-specific coverage and unavailable states; numerical regressions pass | verified (core only) |
| U11 | Scope/editor/audit/range/undo; exact support across diagnostics/events still needed | implemented-unverified |
| U12 | Removed competing DOM workaround; viewport/keyboard/control inventory pending | blocked (browser evidence) |
| U13 | Full FP/E acceptance outstanding below | not started (remaining parity) |
| FP01 | CSV/HYD/FDV/R adapters; representative exports needed | blocked (real data) |
| FP02 | Metadata quantity comparison gate; units and support validation needed | implemented-unverified |
| FP03 | Multiple scenarios and explicit spill model; selected diagnostic profile needed | implemented-unverified |
| FP04 | Comparison role retained; acceptance needed | implemented-unverified |
| FP05 | Rain band and factor; depth/intensity semantics needed | implemented-unverified |
| FP06 | Colours/threshold labels/axis controls; browser check needed | implemented-unverified |
| FP07 | Display/assessment bounds separated for spills/storage; all operations not yet aligned | implemented-unverified |
| FP08 | Native slicing and gap separators unit-tested; UI race acceptance needed | verified (core only) |
| FP09 | Rating/scatter/log retained; domain/support checks incomplete | implemented-unverified |
| FP10 | Metrics/peak timing retained; exact common support and lag acceptance needed | implemented-unverified |
| FP11 | DWF/event response retained; window/exclusion contract incomplete | implemented-unverified |
| FP12 | Criteria retained and serialized; event annotation workflows incomplete | implemented-unverified |
| FP13 | Import audit retained; quality-to-range action and pre-sort audit incomplete | not started (remaining UI/audit) |
| FP14 | Physical/counting separation; masked uncertainty fixed; lookback context needed | verified (limited core fixtures) |
| FP15 | Monthly split retained, yearly coverage added; requested dry month rows needed | verified (limited core fixtures) |
| FP16 | Storage assessment bounds added; flow support/quantity acceptance needed | implemented-unverified |
| FP17 | Screening retained; complete unit/coverage validation needed | implemented-unverified |
| FP18 | Copyright + stale guard + snapshots; complete offline report parity still needed | implemented-unverified |
| FP19 | Fingerprint relinking and extra settings; complete fresh-tab round-trip needed | implemented-unverified |
| FP20 | Provenance retained; full result CSV/manifest bundle incomplete | not started (remaining exports) |
| FP21 | Local launch retained; bounded memory/cache lifecycle needed | implemented-unverified |
| E01 | Audit-to-range navigation and full pre-cleaning counts incomplete | not started |
| E02 | Scenario table present; explicit common-domain option incomplete | implemented-unverified |
| E03 | Residuals retained; browser acceptance needed | implemented-unverified |
| E04 | Trapezoids fixed; masked diagnostics explicitly unavailable pending exact support | verified (unmasked core only) |
| E05 | Paired-window FDC, named left-support convention; masked support incomplete | implemented-unverified |
| E06 | Event navigation/bookmarks/flags/notes incomplete | not started |
| E07 | Workspace additions; migration and full moved-source round-trip incomplete | implemented-unverified |
| E08 | Snapshot guards and copyright; complete CSV/offline report parity incomplete | implemented-unverified |
| E09 | Fixtures present; one-action clean/defective UI demo incomplete | not started |
| E10 | Core offset preview present; before/after/apply browser workflow incomplete | not started (browser) |
| E11 | Scoped exclusion UI/core additions; full cross-operation acceptance incomplete | implemented-unverified |
| E12 | Core batch present; bounded browser progress/cancel incomplete | not started (browser) |
| E13 | Site review notes serialized/exported; event notes incomplete | implemented-unverified |
| E14 | Optional threshold sensitivity | explicitly deferred |
| E15 | Optional saved-assessment diff | explicitly deferred |

## Original defects F01–F15

| ID | Recheck / evidence / next action |
|---|---|
| F01 | Integration fixture retained; cumulative trapezoids independently tested at 120 m³ |
| F02 | Same-count-window discharge volumes covered by existing 7,200 m³ fixture |
| F03 | Cross-quantity comparison rejected; wider unit/datum gates incomplete |
| F04 | Sentinel-to-missing existing parser regression retained |
| F05 | Bounded gaps retained; count uncertainty labelled; lookback incomplete |
| F06 | UI state persistence partially repaired; full workflow test blocked |
| F07 | Explicit spill model added; other diagnostics still default to first valid pair |
| F08 | Timestamp and missing-value graph gaps preserved by bridge regression |
| F09 | Annual missing source not zero-filled; all-excluded unavailable regression |
| F10 | Local launcher unchanged; target Windows launch evidence not obtained |
| F11 | One Python engine retained; legacy graph calls routed to one V2 renderer |
| F12 | Interpreter serialization tested; all operation result lifecycle still incomplete |
| F13 | Snapshot/stale guards added; every report operation not yet reconciled |
| F14 | Pre-cleaning sentinel audit retained; ordering/duplicate policy incomplete |
| F15 | Branch-safe deployment/failure artifacts; full dependency lock and visible build identity incomplete |
