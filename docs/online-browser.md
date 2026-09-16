# Online browser edition

## Purpose
The browser edition is the zero-install distribution target for the ICM Calibration Workbench. It is a static GitHub Pages application: users open a URL, choose a local folder or drag/drop supported ICM exports, assign observed/modelled/rainfall/storage roles from one common source pool, and run the analysis in the browser.

## Security and local-folder behaviour
A website cannot read an arbitrary path such as `C:\ICM\Exports` merely because a user types the path. Modern browsers deliberately prevent that. The supported equivalent is **Choose folder**, which asks the user to grant read access for the browser session. A multi-file picker, folder-input fallback and drag/drop are also supported. Source-file content is processed locally in the browser and is not committed or uploaded to GitHub by the application.

## Calculation integrity
The Pages application does not maintain an independent JavaScript copy of the engineering formulas. Pyodide runs Python in WebAssembly and the Pages build ships the same `src/icm_workbench` parser/alignment/metric/spill/integration/storage modules used by the reviewed Python workbench. JavaScript owns presentation, file permissions and interaction state; engineering calculations remain in the Python reference engine.

The browser reference engine includes:
- CSV / ICM HYD P_DATETIME parsing
- FDV parsing with explicit interval/unit validation
- rainfall R parsing
- sentinel-to-missing handling
- bounded alignment/interpolation
- calibration metrics and scenario comparison
- physical spill detection and reviewed 12/24 counting
- multiple reversible exclusion periods with mandatory reasons
- excluded-time versus unknown-gap reporting
- elapsed-time overflow integration and idealised storage screening

## Common source pool
Every recognised local file is parsed once and enters one pool. Available channels then appear in the observed, modelled/comparison, rainfall, modelled-level and overflow-flow selectors. The browser records SHA-256 fingerprints for workspace/review provenance.

## Deployment and acceptance
`.github/workflows/pages.yml` is the authoritative deployment workflow. It runs the repository Python regression suite, validates browser-layer syntax, assembles the static site, and exercises a real Chromium acceptance path covering engine boot, source-pool ingestion, mapping, graphing, comparison, exclusion-aware spills, storage, and workspace/report downloads before a Pages artifact may be deployed.

GitHub Pages itself must be enabled for the repository with **GitHub Actions** as the Pages source. Repository/account policy may require the owner to perform that one-time setting; the workflow does not change repository visibility.

## Browser support
Current desktop Chromium/Edge/Chrome is the primary engineering target because it has the strongest local-directory picker support. Other modern browsers retain multi-file/folder-input fallbacks. Direct typed filesystem paths remain intentionally unsupported by browser security.

## Network requirement
The application is hosted on GitHub Pages. Pyodide and Plotly.js are pinned CDN dependencies, so initial load requires internet access. After loading, selected ICM source data remains local to the browser tab.
