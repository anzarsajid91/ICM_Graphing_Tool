# Online browser edition

## Purpose
The browser edition is the zero-install distribution target for the ICM Graphing & Calibration Workbench. It is a static GitHub Pages application: users open a URL, choose a local folder or drag/drop supported ICM exports, assign roles from one common file pool, and run the analysis in the browser.

## Security and local-folder behaviour
A website cannot read an arbitrary path such as `C:\ICM\Exports` merely because a user types the path. Modern browsers deliberately prevent that. The supported equivalent is **Choose folder**, which asks the user to grant access to that folder for the current browser session. Drag/drop is also supported. Source-file content is processed locally in the browser and is not committed or uploaded to GitHub by the application.

## Calculation integrity
The Pages application does not carry an independent copy of the engineering formulas in JavaScript. At startup it loads Pyodide (Python compiled to WebAssembly), mounts selected source modules from `src/icm_workbench`, and imports the same parser/alignment/metric/spill logic used by the reviewed Python workbench. Plot rendering and UI state are JavaScript; engineering calculations remain Python.

The mounted core includes:
- CSV / ICM HYD P_DATETIME parser
- FDV parser
- rainfall R parser
- sentinel-to-missing handling
- bounded alignment/interpolation
- calibration metrics
- physical spill detection
- reviewed 12/24 count logic
- multiple exclusion periods with mandatory reasons
- unknown-gap and coverage reporting

## File pool
All selected files enter one pool. Each parsed file can be assigned as:
- Observed (single)
- Simulated (multiple)
- Rainfall (single)
- Overflow flow (single; retained for extended storage workflows)
- Unassigned

For multi-channel files the user also chooses the channel/series explicitly.

## Deployment
`.github/workflows/pages-browser.yml` validates JavaScript/Python syntax, executes the repository Python tests, stages the static site plus the reviewed calculation source, and deploys through GitHub Pages.

The workflow runs on pushes to `feat/icm-workbench-modernisation` while the implementation is under review. When the feature is accepted, change the deployment branch to the approved default/release branch as part of the merge/release decision.

## Browser support
Best support is expected on current Chromium/Edge/Chrome desktop and modern Safari/Firefox for multi-file selection. Folder selection relies on the browser-standardized `webkitdirectory` compatibility attribute; direct typed filesystem paths are intentionally unsupported by browsers. Dragging a complete folder uses Chromium/Safari-compatible directory-entry APIs when available and otherwise falls back to the files supplied by the browser.

## Network requirement
The application itself is hosted on GitHub Pages. Pyodide and Plotly.js are pinned CDN dependencies, so the first load requires internet access. After loading, the ICM input data remains local to the tab.
