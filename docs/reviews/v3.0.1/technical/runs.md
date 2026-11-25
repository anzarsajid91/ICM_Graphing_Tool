# Reviewer A replay and evidence index

All listed browser flows opened public GitHub Pages on v3.0.1, SHA `ccc36427c12f003e5d9b1fee61632770b31952cc`. The browser harnesses used isolated contexts, only synthetic fixtures, and the repository privacy observer with the exact release token. The neutral same-network and monitor fixture contents are copied into this evidence directory. No application or source changes were made.

Set `TMPDIR` to a writable scratch directory with room for browser profiles. The review used `/dev/shm/hydra-technical`. From the exact worktree use the following environment.

```bash
cd /workspace/hydra-v301-production
export PLAYWRIGHT_BROWSERS_PATH=/workspace/hydra-browsers
export GITHUB_SHA=ccc36427c12f003e5d9b1fee61632770b31952cc
export ICM_BASE_URL=https://anzarsajid91.github.io/ICM_Graphing_Tool/
export PYTHONDONTWRITEBYTECODE=1
technical=/workspace/hydra-evidence/dual-expert/technical
node "$technical/observations.mjs"
ICM_BROWSER=firefox node "$technical/observations.mjs" network,direction,verification,detriment
node "$technical/survey-observation.mjs"
ICM_BROWSER=firefox node "$technical/survey-observation.mjs"
python scripts/verify_live_integrity.py _site "$ICM_BASE_URL" "$GITHUB_SHA"
```

The two browser harnesses contain fixture generation, exact UI paths, source comparisons and terminal/evidence output. The main harness reads the neutral fixture copies administered alongside it. The original working baseline and the copies have identical bytes.

## Completed Chromium repository browser runs

| Script (`node web/tests/<script>.mjs`) | Asserted network requests | Local log |
| --- | ---: | --- |
| project-home-smoke | 137 | [Output](regression/project-home-smoke.log) |
| series-quality-smoke | 104 | [Output](regression/series-quality-smoke.log) |
| rainfall-audit-smoke | 101 | [Output](regression/rainfall-audit-smoke.log) |
| spill-scenarios-smoke | 104 | [Output](regression/spill-scenarios-smoke.ram.log) |
| spill-inquiry-smoke | 104 | [Output](regression/spill-inquiry-smoke.ram.log) |
| storage-routing-smoke | 104 | [Output](regression/storage-routing-smoke.ram.log) |
| network-context-smoke | 105 + 30 | [Output](regression/network-context-smoke.ram.log) |
| network-revision-smoke | 107 | [Output](regression/network-revision-smoke.ram.log) |
| simulation-results-smoke | 33 | [Output](regression/simulation-results-smoke.log) |
| survey-monitor-diagnostics-smoke | 105 | [Output](regression/survey-monitor-diagnostics-smoke.log) |
| survey-process-controls-acceptance | 105 | [Output](regression/survey-process-controls-acceptance.ram.log) |
| rainfall-spatial-smoke | 107 | [Output](regression/rainfall-spatial-smoke.ram.log) |
| verification-overview-smoke | 105 | [Output](regression/verification-overview-smoke.ram.log) |
| verification-matrix-smoke | 105 | [Output](regression/verification-matrix-smoke.log) |
| hydraulic-design-smoke | 109 | [Output](regression/hydraulic-design-smoke.ram.log) |
| detriment-smoke | 120 | [Output](regression/detriment-smoke.ram.log) |
| assessment-revision-smoke | 107 | [Output](regression/assessment-revision-smoke.ram.log) |
| security-about-smoke | 27 | [Output](regression/security-about-smoke.log) |

These 18 runs observed 1,819 requests across 19 guarded assertions and zero violations. Five first-attempt launch logs show overlay `ENOSPC` and were replaced for conclusions by their passing RAM reruns. The independent Chromium and Firefox observations and the fixed-resource check are separate from this count.

```bash
PYTHONPATH=src /workspace/hydra-venv/bin/python -m pytest -q -p no:cacheprovider \
  tests/unit/test_verification_matrix.py tests/unit/test_storage_routing.py \
  tests/unit/test_detriment.py tests/unit/test_spills.py tests/unit/test_series_quality.py
```


The selected source-method run passed 89 tests. The warnings log retains the observed NumPy and pytest deprecations. [Method test output](regression/method-unit.log)

The source confidentiality gate passed for 16 reviewed network-capable sources and 22 pinned browser dependency files. The privacy unit run passed 28 tests, and the JavaScript test passed the positive and negative observer contracts. [Source gate](regression/privacy-source.log) · [Privacy unit output](regression/privacy-unit.log) · [JavaScript observer unit output](regression/privacy-network-unit.log)

The independent Chromium observations recorded 366 guarded requests across the five main cases. Firefox recorded 263 across its four main cases. The separate survey replays recorded 104 requests in Chromium and 102 in Firefox. The supplementary Chromium long-section table replay recorded 30. All returned zero violations. [Chromium observations](observations-chromium-network-direction-verification-detriment-calculation.json) · [Firefox observations](observations-firefox-network-direction-verification-detriment.json) · [Survey Chromium](regression/independent-survey-chromium.log) · [Survey Firefox](regression/independent-survey-firefox.log) · [Long-section replay](regression/independent-direction-profile.log)
