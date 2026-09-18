# Behaviour and methodology changes

| ID | Class | Old behaviour | New behaviour | Verification / effect | Method |
|---|---|---|---|---|---|
| BC01 | C | Invalid sentinels converted to `0.0`. | Sentinels become missing with import audit. | Removes false zero telemetry; parser regression. | `missingness-v1` |
| BC02 | C | Flow integration could produce 180 m³ for 1 m³/s over 120 elapsed s. | Piecewise-linear integration over actual elapsed support. | Analytical regression requires 120 m³. | `integration-v1` |
| BC03 | C | Interpolation could bridge arbitrarily long gaps. | Pairing only inside valid segments up to configured max gap; no extrapolation. | Long-gap pairing regression. | `alignment-v1` |
| BC04 | C | Spill state could continue through missing samples. | Missing/long-gap time is unknown; counts marked partial when unexcluded coverage is incomplete. | Missing-gap spill regression. | `spill-physical-v1` |
| BC05 | C | Later discharges in one counting window could be skipped from storage volume when incremental count was zero. | Every physical discharge volume is integrated and aggregated to its counting block. | Two 1 h × 1 m³/s discharges = 7,200 m³. | `screening-v1` |
| BC06 | C | Missing observed duration could appear as zero. | Zero is distinguished from unavailable/partial coverage. | Coverage/count-status tests. | `coverage-v1` |
| BC07 | E | No reusable exclusion-mask model. | One or many reversible exclusion periods with mandatory reason and workspace/report audit. | Exclusion unit/integration/workspace tests. | `exclusions-v1` |
| BC08 | E | Scenario diagnostics coupled to callback state. | Pure same-window scenario table and common-valid-domain option. | Scenario comparison test. | `scenario-compare-v1` |
| BC09 | E | Time shifts risked implicit application. | Offset preview returns before/after diagnostics without mutating source. | Non-mutation test. | `time-offset-preview-v1` |
| BC10 | P/C | Display downsampling could erase gaps. | Display-only extrema-aware downsampling preserves explicit segment separators. | Gap-separator test. | `display-downsample-v1` |

No regulatory/utility profile is re-labelled as approved. Existing 12/24 semantics are retained as a compatibility method whose project applicability still requires confirmation.


## 17 September retry
- C: all-excluded/no-valid-support spill domains become unavailable, rather than definitive zero.
- M: masked count windows labelled provisional under the compatibility 12/24 policy; physical durations remain exact retained support.
- C: yearly coverage is local to each year; exclusive midnight year-end does not add a year.
- C: cumulative instantaneous-flow diagnostics use trapezoids; 0→2→0 m³/s over 120 s yields 120 m³.
- C: cross-quantity comparisons rejected; flow-only diagnostics withheld for depth/level.
- E: scoped editable exclusions, explicit spill model, stale-report guards and presentation attribution.
- P: core calculation engine retained; obsolete graph redraw route retired.
Browser behavior is implemented-unverified pending staged acceptance; see checkpoint.


## 18 September engineering-correctness phase 1

| ID | Class | Old behaviour | New behaviour | Verification / effect | Method |
|---|---|---|---|---|---|
| BC11 | C | Generic CSV numeric values were treated as already-canonical regardless of header units. | Recognised explicit units are converted once to canonical SI; unresolved units remain explicitly unresolved. | L/s and Ml/d conversion regressions; unknown-unit regression. | `unit-contract-v1` |
| BC12 | C | Rainfall depth/event duration used one median timestep. | Intensity is integrated over actual timestamp support; a final intensity sample only receives declared regular support. | Irregular-timestamp analytical fixtures. | `rain-support-v2` |
| BC13 | C | Missing rainfall was filled with zero for dry-day selection. | Incomplete rainfall support makes the candidate day unknown and ineligible for DWF. | Missing-interval DWF regression. | `dwf-validity-v2` |
| BC14 | C | Storage/spill-volume results could look definitive with unresolved units or incomplete flow support. | Dimensional storage/volume is unit-gated; incomplete/excluded/uncovered support propagates partial/unavailable state and required storage is withheld. | Unit/coverage/storage regressions. | `storage-coverage-v2` |
| BC15 | C/E | Source reset left exclusions/derived browser state behind. | Clearing the source pool invalidates mappings, exclusions, histories, colours and derived analytical state. | Browser runtime state regression / smoke gate. | `state-invalidation-v1` |
| BC16 | E | Python workspace service rejected anything except v1; browser had independent v3 behaviour. | v1/v2 migrate deterministically to v3; browser also validates/migrates v1/v2 and rejects future schemas. | Workspace migration regressions. | `workspace-schema-v3` |
| BC17 | R | Corrupt named-workspace local storage could break loading. | Corrupt local state is quarantined and an empty usable store is recovered. | JavaScript runtime regression. | `workspace-recovery-v1` |
| BC18 | C/E | Coverage/status vocabulary differed between rainfall, integration, spill and comparison paths, and excluded time could overlap unknown support in accounting. | A shared `validity-v1` contract provides valid/suspect/invalid/excluded/missing/unknown states plus complete/partial/unavailable status; exclusions are removed before missing/unknown classification. | Cross-workflow unit regressions, browser-bridge regression and Chromium comparison-status acceptance. | `validity-v1` |
| BC19 | E | Representative real-export acceptance had no reusable machine-readable gate. | Local manifest-driven parser/unit/sample reconciliation with SHA-256 evidence and a documented hydraulic-modeller sign-off protocol. | Harness unit test; actual field corpus remains project/user input. | `representative-uat-v1` |

These are correctness changes. They deliberately preserve the local-first Pages/Pyodide product path and the existing physical-spill versus 12/24 counting separation.
