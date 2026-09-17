# ICM Calibration Workbench

[Open the browser tool](https://anzarsajid91.github.io/ICM_Graphing_Tool/)

The GitHub Pages edition processes local exports through the shared Python engine. Initial loading requires access to the pinned browser dependencies. Add files or choose a folder, map observed/model/rainfall channels, then inspect the graph and run the relevant assessment.

**Remediation is not yet released.** See [current checkpoint](docs/resume-checkpoint.md) and [requirements ledger](docs/requirements-ledger.md). Local changes have not been pushed, merged or deployed; real-export validation and browser acceptance remain pending.

Presentation copyright: © 2026 Anzar Sajid.

## Historical desktop documentation

The original application is retained. The following documentation describes that legacy workflow and is not evidence of browser feature completion.

# ICM CSV Calibration Viewer V17

Local Dash/Python tool for ICM calibration review, observed/modelled comparison, rainfall overlay, V16 12/24 spill count assessment, V17 scatter comparison, multi-link simulated profile selection, and separate modelled overflow storage screening.

## Launch
Run `install.bat` once, then `launch.bat`. Place CSV exports in the `data` folder or pass a data folder path to `app.py`.

## V17 key controls
- Apply / Refresh Graph updates time-series, scatter, statistics band and existing spill assessment.
- Calculate Storage Requirement is separate and does not run during graph refresh.
- Storage screening uses overflow link flow CSV + Threshold 2 + ranked 12/24 spill-block volumes. Target is <=10 spills/year, so the 11th largest annual block volume is reported as required storage.
- Known placeholder values 9999, -9999, 99999 and -99999 are converted to zero.
