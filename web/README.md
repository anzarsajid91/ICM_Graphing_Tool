# Browser workbench

Static zero-install GitHub Pages edition of the ICM Graphing & Calibration Workbench.

The UI is implemented in `index.html`, `styles.css` and `app.js`. Engineering calculations are not duplicated in JavaScript: `app.js` boots Pyodide and mounts the reviewed Python package from `src/icm_workbench` (copied into the Pages artifact by the deployment workflow). `engine_bridge.py` is the narrow browser/Python adapter.

See `docs/online-browser.md` for architecture, file-access constraints and deployment details.
