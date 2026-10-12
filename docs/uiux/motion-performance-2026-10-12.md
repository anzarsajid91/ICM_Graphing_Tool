# Motion and render scheduling investigation — 12 October 2026

Baseline: main `c3f73201e91286785293357ace91ba7be998ad89` (v1.064).

## Demonstrated causes and changes

- Opening the overlay Inspector invoked Plotly resize twice without changing chart geometry. The shell now batches geometry reads in one animation frame and resizes only visible charts whose actual dimensions differ. It no longer broadcasts a duplicate synthetic window resize. Real viewport resizing retains Plotly responsive handling.
- Subtab changes destroyed their controls and active indicator. Controls and indicator now survive within a workspace; an interrupted transition continues from its painted position. Keyboard focus and reduced-motion cancellation are verified.
- Three survey summary notifications triggered three complete DOM redraws. Notifications now coalesce into one animation-frame redraw; explicit review actions remain synchronous and supersede a pending redraw.
- Every survey cell repeatedly requested the same dependency signature. Presentation freshness reads now share a Map **only inside one synchronous rendering call**, cleared with try/finally. The canonical signature and freshness implementation is unchanged. Subsequent rendering, review actions and exports perform fresh checks; there is no cache across user or worker events.

No canonical Python calculation, parser, worker, dataset, threshold, source mapping or signature algorithm was modified. No application telemetry, runtime profiler or new network request was introduced.

## Controlled probe

`web/tests/motion-profile.mjs`: Chromium 140 headless, 1440 × 1000, 4× CDP CPU throttle, 24 synthetic monitors with 12 weekly records, three alternating baseline/candidate fresh-context runs on the same local runner. Local CDP Performance counters measure CPU work between notification and settled presentation; they exclude idle waiting. Synthetic monthly evidence text SHA-256 agrees across all six contexts.

| Median measurement | Baseline | Candidate |
|---|---:|---:|
| Complete presentation redraws per notification burst | 3 | 1 |
| Main-thread task work | 6454.6 ms | 217.1 ms |
| Script work | 6148.0 ms | 91.1 ms |
| Layout work | 155.2 ms | 56.9 ms |
| Style recalculation work | 87.2 ms | 31.3 ms |
| Steady native scroll frame interval, 95th percentile | 16.7 ms | 16.7 ms |

Raw samples: [motion-performance-2026-10-12.json](evidence/motion-performance-2026-10-12.json). The task-work reduction is approximately 96.6% **for this synthetic update**, not overall application speed. Scroll measurement follows the update and uses CDP native mouse scrolling over 1500 px; it does not measure simultaneous updates, physical touch momentum, compositor GPU cost or 120 Hz device performance. Three repetitions do not establish a universal latency bound.

## Regression evidence

The scheduling browser suite reproduces baseline failures before each fix, checks real chart-width changes, unchanged desktop/mobile overlays, stable tab selection, notification coalescing, current/stale presentation after input changes and independent stale-review rejection. It is included in normal Pages browser CI. Source/confidentiality approval review covers the presentation-only changes and unchanged fixed local font/export paths.

Local Chromium checks cover 390/780/1280/1440 px, all 17 routes, remembered scroll offsets including late content, browser Back/Forward, rail/focus state, survey pan/zoom, report action spacing, keyboard focus and reduced motion. The synthetic loaded engineering/report acceptance runs separately. Physical iOS/desktop device smoothness remains unverified; these fixes address demonstrated scheduling stalls rather than guaranteeing any frame rate.
