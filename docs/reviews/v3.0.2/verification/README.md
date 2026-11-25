# DE-01 verification decision evidence

## Baseline

On v3.0.1 the two April 11 synthetic CSVs produced a coverage fraction of 0.5 and one exact pair with RMSE 0 m³/s. The independent review recorded that an engineer could save Acceptable. Each source independently covers 120 seconds of the 240-second window. They coincide only at 00:02:00. [Original browser observations and input files](../../v3.0.1/technical/)

## Implemented method

Verification Overview and event comparison share the same positive-duration native interval intersection. Offset precedes intersection. Missing, excessive-gap and excluded intervals contribute no common time. Distinct finite paired times inside the closed joint intervals are counted after the half-open exclusion mask. Point statistics retain isolated paired samples. The method identity is `joint-support-v2`. Source-specific validity retains its existing `validity-v1` contract.

A current comparison can record Insufficient evidence or Requires investigation. Full acceptance requires comparable declared quantities and resolved matching units, existing clock and datum safeguards, two distinct joint-support pairs and joint support throughout the requested period. Caveated acceptance requires positive joint duration, two qualifying pairs, a documented approved project criterion and a rationale. The operator remains responsible for determining whether the cited criterion applies. Revised evidence identity and saved review keys require re-review of legacy decisions. The offline report includes the support basis for each selected scenario.

## Reproduction and expected values

Run the native bridge, public event, revision and browser API tests from the repository root.

```sh
PYTHONPATH=src python -m pytest -q tests/unit/test_browser_api_boundary.py tests/unit/test_verification_events.py tests/unit/test_verification_revisions.py tests/web/test_browser_bridge_native.py
```

The implementation run passed all 34 cases. The added parameterized case covers the touching-window fixture, complete evidence, a half-window exclusion, complete exclusion, an isolated unsupported pair amid asymmetric gaps, a one-minute model shift over explicit bounds, and disjoint support. The fixture produces **0 of 240 s common time, one exploratory pair, zero qualifying pairs, RMSE 0 m³/s**. The complete fixture produces 240 s common time and five qualifying pairs. A 120 s prefix exclusion leaves 120 s common over 120 s eligible, three qualifying pairs and incomplete requested support.

The guarded existing `web/tests/verification-overview-smoke.mjs` exercises complete and caveated acceptance, the criterion/rationale requirement, local restore, stale review invalidation, offline report scope and the original two-file failure through the Data, Verification and Reports UI. Use `ICM_BROWSER=chromium` and `ICM_BROWSER=firefox` against a source-reviewed local build. Browser execution and specialist disposition are tracked separately.
