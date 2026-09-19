# Live deployment improvement loop

The workbench uses two independent release gates:

1. **Pre-deployment verification** builds the exact GitHub Pages artifact and runs Python, JavaScript and Chromium acceptance tests against that artifact.
2. **Post-deployment verification** waits until the public GitHub Pages site advertises the exact deployed commit in `build.json`, then runs the same end-to-end Chromium workflow against the live URL.

The live verifier is implemented in `.github/workflows/live-pages-verification.yml`.

## Triggering

Live verification runs:

- after a successful `GitHub Pages Workbench` production push on `main`;
- every six hours as an external-health regression check; and
- manually through `workflow_dispatch`.

For a production deployment the verifier does not begin functional testing until the public `build.json` reports the exact commit SHA that triggered the Pages deployment. This prevents a stale CDN/site revision from being mistaken for the new release.

## Evidence and failure signal

Every live run retains an artifact containing the live build metadata, browser log and selected full-page screenshots. A failed browser stage also captures a full-page failure screenshot.

A failing live verification creates or updates one open GitHub issue labelled `live-regression`. A later successful live verification closes that signal.

This issue is the durable hand-off point for an automated repair agent: it contains the expected deployed SHA, workflow run link and engineering repair policy.

## Automated repair boundary

Low-risk fixes may be implemented and merged automatically when they are confined to:

- browser/UI integration;
- CSS/layout and accessibility;
- drag/drop and file-ingestion plumbing;
- graph rendering and report presentation;
- deployment/workflow configuration; or
- implementation performance where numerical results are unchanged.

The automated cycle must not silently alter:

- hydraulic methodology;
- WAPUG/FSAT criteria;
- spill-counting rules;
- volume-balance equations;
- engineering thresholds;
- validity/exclusion semantics;
- unit contracts; or
- any other rule capable of changing an engineering conclusion.

Any repair that enters those areas must stop at a reviewable pull request.

## Regression-first repair rule

Every defect repaired through the loop must first be represented by a regression check, or strengthen an existing one. A repair is considered complete only when:

1. Python tests pass;
2. JavaScript/browser source validation passes;
3. local release-artifact Chromium acceptance passes;
4. the PR is merged to `main`;
5. GitHub Pages deploys that exact SHA; and
6. the subsequent live Pages verification passes.

This makes the deployed application, rather than the repository alone, the final acceptance boundary.
