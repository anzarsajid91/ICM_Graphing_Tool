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


## Recorded release-candidate evidence

The evidence covers the fixture and workflow states stated below. The local
browser checks used the release artifact and synthetic data unless identified
as a separate local ICM reference review. See the browser interaction and smoke
artifacts for route and activation inventories.

| Workflow | Functional evidence |
|---|---|
| v1.071 regression comparison | The same browser fixture produced identical paired traces, monthly spill counts and durations, rendered comparison counts, and report figures. |
| Native ICM review | The original reference export was exercised locally through the browser picker, audit, full network render, fit, zoom and JSON export. Hydraulic calculator results were reconciled separately against the reference export's full-flow values. |
| Network import controls | Cancel leaves the schematic unchanged. Engineering layout changes the drawn positions while preserving imported source coordinates, connectivity and conduit dimensions. An unsupported JSON file preserves the current network and a valid saved JSON file restores it. |
| Saved network review | Named views restore the camera, snapshots download their corresponding data, and selector placeholders leave state and downloads alone. |
| Printed network report | The button calls the browser print entry point. The test generates a separate headless PDF and checks that the printed assessment basis remains visible. The native operating-system dialog was outside the headless test. |
| Detriment evidence | Current-view CSV and HTML exports respect the active filter, the full export retains the remaining rows, and closing the evidence drawer restores keyboard focus. |
| Worker process queue | Run next reorders eligible work, and Cancel removes a waiting job while the uncancelled jobs still complete. A separate local check exercised Cancel running and confirmed the worker restarts and retains sources that were ready. |
