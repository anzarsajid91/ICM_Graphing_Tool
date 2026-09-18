# ICM Calibration Workbench

[Open the browser tool](https://anzarsajid91.github.io/ICM_Graphing_Tool/)

The primary product is a local-first browser workbench for auditable review of
InfoWorks ICM and related hydraulic datasets. The GitHub Pages edition processes
selected local exports through the shared Python engineering engine in Pyodide;
source data is not intentionally uploaded to an application server.

Current capabilities include observed/model scenario plotting and comparison,
rainfall/event assessment, DWF screening, telemetry/data-quality review,
physical spill detection with separate 12/24 compatibility counting, reversible
reason-coded exclusions, idealised storage screening, workspaces and evidence
exports.

Engineering calculations use explicit unit and support contracts. Dimensional
results are withheld when units are unresolved, missing rainfall is not treated
as dry weather, rainfall calculations use actual timestamp support, and
partial/unknown coverage is surfaced instead of being silently converted to a
definitive result. See [behaviour and methodology changes](docs/behaviour-changes.md).

Automated Python and Chromium release gates protect the deployed artifact.
Representative real-export engineering reconciliation remains a separate domain
UAT requirement before describing the tool as field-validated for a project.
The repository includes a
[representative-validation protocol](tests/representative/README.md) and
machine-readable acceptance harness.

Presentation copyright: © 2026 Anzar Sajid.

## Product direction

The intended end state is an ICM verification and hydraulic-data workbench:
import once, classify series once, and reuse the same governed data/validity
state across telemetry QA, rainfall, DWF, event response, calibration,
spill/EDM and reporting workflows. Development follows controlled,
regression-tested phases rather than a rewrite of the working browser product.

## Historical desktop documentation

The original desktop/Dash application is retained for reference/fallback. The
following notes describe that legacy workflow and must not be read as the
current browser methodology.

### ICM CSV Calibration Viewer V17

The legacy viewer provided local Dash/Python graphing, observed/modelled
comparison, rainfall overlay, V16 12/24 spill-count assessment, V17 scatter
comparison, multi-link simulated profile selection and separate modelled
overflow storage screening.

Run `install.bat` once, then `launch.bat`. Place CSV exports in the `data`
folder or pass a data folder path to `app.py`.

Historical V17 converted placeholder values such as 9999/-9999 to zero. The
current engineering workbench deliberately does **not** retain that behaviour:
known sentinels are treated as missing and audited.
