# GitHub Pages browser edition

This directory is the zero-install delivery surface for the ICM Calibration Workbench.

## Architecture

- GitHub Pages serves static HTML/CSS/JavaScript only.
- Pyodide 0.29.4 runs Python 3.13 in the user's browser.
- The Pages build copies the audited `src/icm_workbench` Python calculation/parsing package into the static artifact.
- `python_bridge.py` is a thin JSON adapter around that same reference engine.
- ICM source files are read from a user-approved local folder or drag/drop and written only to the browser's temporary WebAssembly filesystem. They are not uploaded to GitHub or an application server.

## Supported ingestion

- Standard CSV and ICM HYD/P_DATETIME CSV
- FDV / FDV.txt
- Rainfall R / R.txt
- Local folder picker (File System Access API where available)
- `webkitdirectory` fallback
- Multi-file picker
- Drag/drop files and Chromium folder drops

## Browser target

Desktop Chromium-based browsers are the primary engineering target because they provide the most complete local-directory picker support. Other modern browsers retain file picker and drag/drop fallback paths.

## Deployment gate

`.github/workflows/pages.yml` runs the Python regression suite, browser-bridge tests, JavaScript/Python syntax checks and a real Playwright Chromium journey. That journey must ingest the demo source pool, map observed/model/rainfall series, render Plotly, calculate comparison metrics, apply an exclusion to spill assessment, execute storage screening and download workspace/report artifacts before the Pages build job can run.

GitHub Pages must be enabled once for the repository with **GitHub Actions** selected as the Pages source. This is an account/repository setting rather than a software installation on user machines.
