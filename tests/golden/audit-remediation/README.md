# Audit-remediation golden fixtures

This directory is reserved for deterministic, minimal fixtures used by the
eight-PR audit-remediation programme.

The fixtures are intentionally separate from the larger real/reference survey
pack. They exist to make one numerical or governance rule auditable at a time.

Planned fixture families:

- `dwf/`: complete versus sparse daily flow/rainfall support;
- `rainfall/`: intensity versus incremental-depth semantics, missing support,
  interval exclusions and final-sample support;
- `comparison/`: requested-window bracketing and maximum-gap behaviour;
- `event-response/`: role-specific exclusions and baseline/response support;
- `finite-values/`: NaN, +Inf and -Inf handling;
- `survey/`: targeted exclusions, gauge membership/matching and review-ledger
  migration;
- `detriment/`: export completeness, flooding policy, spill count/duration
  policy, provenance and semantic measure matching.

A golden fixture must document:

1. source values and time/unit semantics;
2. requested analysis window and exclusions;
3. expected numerical output;
4. expected validity/calculation status;
5. the audit issue or methodology rule it protects.

PR 1 adds characterization tests for the already reproduced A-01 to A-07
defects. PRs 2-7 should add concrete golden files here when a file-based fixture
is clearer than an inline unit test. PR 8 consumes the complete set during the
integrated acceptance gate.
