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
