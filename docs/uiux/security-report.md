# Confidentiality verification

Current release status (11 October 2026): PR76 is merged as `65b0be8` and v1.063 is live.
Final candidate `11fba20` passed review, performance and isolated-preview gates;
production deployment and exact-revision live verification passed.
See [current requirements audit](2026-10-11-requirements-audit.md).
Older candidate/pending statements below are historical checkpoints, not current blockers.

Scope: presentation changes on `feat/unified-premium-uiux`. Canonical Python,
analysis worker, FastPath worker, domain registry, source bytes and persistence
schemas are unchanged from main `dff8ff593e61dbfea142007b5ac32b0d66787f0a`.

Executed before each implementation commit:

```sh
python scripts/verify_data_confidentiality.py
python -m unittest discover -s tests/privacy -v
node web/tests/privacy-network-unit.mjs
```

All passed: 20 pinned browser dependencies, eight reviewed network-capable sources,
five Python privacy tests and positive/negative JavaScript request contracts.
Modified approved sources (`runtime.release.js`, `workflow-26.js`,
`network-schematic.js`) have reviewed SHA/rationale entries; their fixed downloads,
blank report windows, local blob exports and print paths remain intact. No gate,
source approval or CI check was disabled. No new production static dependency,
font CDN, analytics, telemetry, remote logging or animation service was added.

[Confidentiality CI for candidate 6ed4f4c](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38085106086)
passed. [Preview artifact/browser gates](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38085106104)
passed: UI contracts 23 requests, network editing 167 requests, annual review 109
requests, all zero violations. The observer checks destination, method, body,
headers, resource queries/referrers and sockets while synthetic imports, worker
calculations and exports run. Full workflow and live deployment acceptance evidence
must also pass before release recommendation.

Preview staging verified all 99 production release files byte-identical to the
fresh exact-main build. The candidate lives under `/preview/unified-uiux/` with
`hydra-unified-uiux-preview:` storage isolation. Historical network preview prefix
is preserved by the existing staging API. Unknown independently hosted preview
folders cannot be preserved by rebuilding main unless supplied as staging inputs;
the previously documented network preview path returned 404 during this review.
This limitation does not affect the production release or main git branch.

All committed evidence uses repository synthetic fixtures or unloaded screens.
The supplied reference recording is not committed. CI test helpers and showcase
are excluded from the production release. CI artifacts expire after 30 days;
selected synthetic screenshots and reports are retained with this documentation.
No guarantee is made about arbitrary external browser extensions or workflows
outside the observed request guard; no confidential engineering data was used.

Newer [confidentiality gates at 4e](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38122112493) and [full synthetic browser review](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38122112522) passed. Exact-head native-dialog fix [source/privacy CI](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38122848122) also passed. Final head and served-revision acceptance are available from PR76 checks; cancelled superseded jobs are not treated as security passes.
