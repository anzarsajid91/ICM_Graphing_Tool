# Release numbers and synthetic reference fixtures

Hydra Bench started at **v1.000**. Every merged PR into `main` advances the integer release counter once: v1.001, v1.002, etc. Commits within a PR, closed/unmerged PRs and branch-sync PRs do not advance the published version. At iteration 1,000 the number becomes v2.000.

`release-history.json` records the 59 historical main PR merges through the baseline commit. This includes an earlier main PR whose merge is nested in another main merge. Subsequent merge/squash commit subjects must retain the GitHub PR number. Use merge or squash when releasing; rebase without PR markers cannot be counted reliably. Builds read full local Git history; they make no API requests. Production checkouts therefore use `fetch-depth: 0`. Missing history fails the build instead of publishing a guessed number.

The build stamps the release into the footer beside **Anzar Sajid**, the HTML metadata and `build.json`. PR builds display the next number with a `-preview` suffix. Engine status updates target a separate footer element so booting Python cannot overwrite the version.

## Independent synthetic fixtures

The current `reference/current-tool` bundle is generated from scratch. The generator does not open uploaded datasets, copy measured values, map real identifiers or preserve real topology. Its independent seed describes only a fictional network. File format fields and engineering contracts are retained, including FDV units, rainfall intensity semantics, unresolved CSV rainfall units, HYD metadata, association precedence, upstream trace logic and detriment report schemas.

All nine monitors and four gauges have new identifiers and periods. The workbook and FDV files share consistent diameters and a newly generated acyclic network. Flow/depth/velocity satisfy circular pipe area relationships within source-format rounding. The model archive and workbook have fresh metadata and contain no inherited auxiliary files. New report plots/tables replace the original HTML; the original screenshot is removed.

Fixture checks use generator statistics plus independent integration, parser equivalence, relationship validation, artifact hashes, archive inspection and engineering workflow checks. No production calculation engine was modified. The Pages artifact contains no reference data and runtime sources contain no fixture identifiers or paths.

This replacement cleans the current tree. Earlier Git history, other branches, forks, clones and cached CI artifacts are separate copies and are not erased by this change. Removing those requires a separately scoped history and artifact cleanup; this PR does not claim complete historical erasure.

## Local verification for this change

- 286 Python tests and 77 subtests passed.
- FastPath/Python fixture reconciliation, workbook import, engine recovery and network schematic unit checks passed.
- Browser cold start retained the version beside the author without loading Python before data import.
- Browser detriment acceptance passed flooding, level and spill assessments, chart checks, CSV/HTML/PNG exports, worker recovery and failed initial boot recovery.
- Standalone EDM and complete Flow Survey simulations passed all engineering checks: nine monitors, four loaded gauges, three associated gauges, three network candidate events, two qualifying events and 20 weekly volume-balance rows.
- Production packaging excludes the reference bundle. No production calculation code changed.

Remote publication has not been performed. The next merged main PR will display v1.060; the local PR artifact displays v1.060-preview.
