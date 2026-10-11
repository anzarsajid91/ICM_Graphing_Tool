# Performance comparison

Exact baseline `dff8ff593e61dbfea142007b5ac32b0d66787f0a`; candidate `6ed4f4c785cad4a350705b6832a208b053e6ffcc`.
[Successful same-runner run](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38085106112). Raw measurements: [performance-comparison.json](evidence/performance-comparison.json).

One Ubuntu GitHub runner, Chromium 140 / Playwright 1.55.0, 1440×1000, fresh browser contexts, alternating order, three repetitions per fixture and target. Medians below; millisecond values include test-side browser round trips where stated. This small controlled sample does not establish universal performance or 60 FPS.

| Fixture / measurement | Baseline median | Candidate median | Change |
|---|---:|---:|---:|
| FM7413.fdv · Shell ready, ms | 1201.0 | 1193.0 | -0.7% |
| FM7413.fdv · First useful graph, ms | 1312.0 | 1283.0 | -2.2% |
| FM7413.fdv · Authoritative parse ready, ms | 8325.0 | 8195.0 | -1.6% |
| FM7413.fdv · Native zoom, ms | 328.0 | 339.0 | +3.4% |
| FM7413.fdv · Focus to next paint, ms | 49.0 | 52.0 | +6.1% |
| FM7413.fdv · Focus chart resized, ms | 251.0 | 256.0 | +2.0% |
| FM7413.fdv · JS heap, MB | 53.5 | 56.8 | +6.2% |
| FM7413.fdv · Route to next paint, ms | 62.6 | 62.0 | -1.0% |
| CS2666_EDM.csv · Shell ready, ms | 1199.0 | 1197.0 | -0.2% |
| CS2666_EDM.csv · First useful graph, ms | 1412.0 | 1426.0 | +1.0% |
| CS2666_EDM.csv · Authoritative parse ready, ms | 9231.0 | 9236.0 | +0.1% |
| CS2666_EDM.csv · Native zoom, ms | 267.0 | 279.0 | +4.5% |
| CS2666_EDM.csv · Focus to next paint, ms | 56.0 | 55.0 | -1.8% |
| CS2666_EDM.csv · Focus chart resized, ms | 248.0 | 247.0 | -0.4% |
| CS2666_EDM.csv · JS heap, MB | 44.7 | 44.7 | +0.0% |
| CS2666_EDM.csv · Route to next paint, ms | 54.0 | 55.1 | +2.0% |

Native graph x/y/unit hashes match exactly across all twelve samples, two fixtures. FDV is 268,283 bytes; EDM CSV is 2,838,553 bytes / 105,121 source rows. Native zoom is a two-hour range after authoritative parsing, with native-resolution status asserted. Focus measurement waits until Plotly width agrees with the chart client width. No calculation code was changed.

The largest median increase is focus-to-paint in the small FDV sample (52 ms versus 49 ms); final chart resize differs by 5 ms. FDV sampled JS heap rises 3.3 MB; EDM heap is unchanged. Heap sampling is Chromium approximate JS heap, not total worker/process memory or a leak study. No material import/graph latency regression is evident in this sample. Further profiling is required for arbitrary network sizes, maximum supported imports, sustained editing, export latency and memory retention.

Earlier route captures included a fixed 250 ms settling wait and are not used as navigation benchmarks. Earlier baseline full-smoke performance is retained in the baseline artifact for context, not mixed with this runner comparison.

## Newer controlled comparison

[Run 38122112501](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38122112501) passed at candidate `4e685ef5`. Same environment/method, fresh three-repetition contexts; [raw comparison](evidence/performance-comparison-latest.json).

| Measurement | Baseline | Candidate |
|---|---:|---:|
| FDV shell median, ms | 883 | 892 |
| FDV first useful graph, ms | 887 | 897 |
| FDV authoritative ready, ms | 5869 | 5801 |
| FDV native zoom, ms | 312 | 305 |
| EDM shell median, ms | 865 | 884 |
| EDM first useful graph, ms | 936 | 919 |
| EDM authoritative ready, ms | 6367 | 6472 |
| EDM native zoom, ms | 260 | 254 |
| Complete nine-monitor survey worker elapsed, seconds | 118.2134 | 119.7618 |

Complete survey used the same CI runner and fixtures, with test-side control observation disabled. Authoritative objects match after excluding only the performance member; normalized SHA-256 values are identical in [survey comparison](evidence/survey-performance-comparison.json). One survey pair is a bounded observation (+1.3%), not a distribution or universal guarantee.

A route-specific exception remains under investigation: returning to Data with the large EDM fixture measured 407/414/392 ms at baseline versus 600/593/400 ms at 4e. Import, zoom and focus resize remain close, but the two slower return samples prevent an unconditional navigation non-regression claim. Later same-runner runs and synchronous-versus-paint instrumentation distinguish synchronous work from pending chart repaint. Do not average this exception away into a global route median or claim universal 60 FPS. Maximum-size retained memory and sustained schematic/edit/export profiling remain bounded gaps.
