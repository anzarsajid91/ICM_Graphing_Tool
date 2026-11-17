# HydraBench 2.0 control acceptance

Production sign-off requires an outcome for every enabled button, link, or
disclosure in the supported desktop workflows, including controls that only
appear after import or calculation. Record the exact candidate SHA.

- Use the `*-control-evidence.json` files in the browser and interaction CI
  artifacts as the starting inventory. The recorded activations are actual
  browser events. Match each to a functional assertion or reproduce it and
  record the observed outcome. A click alone never passes a control.
- Reconcile the inventory with empty, populated, busy, error, restored and
  narrow desktop states. Exercise file chooser and cancellation, download and
  print, confirm and cancel, optional disclosures, dependency-gated controls,
  keyboard actions, and report-only and source-missing workspaces.
- For calculations and exports, compare the rendered data and generated files
  against known results. Check cross-workspace handoff, stale-state handling
  and source reattachment. Keep project data outside CI.
- Record route, control, prerequisite state, expected effect, observed result,
  browser/viewport and evidence for each result. A disabled or unavailable
  control needs a documented reason and a check of its prerequisite.
- Review screenshots of populated views and exports for clipping, overlap and
  illegible text. Include desktop Chromium and Firefox at representative sizes.

## Current sign-off status

**Open.** The inventory and browser tests are evidence collection. Remaining
controls must be reconciled and verified against user-visible outcomes. A green
CI run does not automatically close this review.
