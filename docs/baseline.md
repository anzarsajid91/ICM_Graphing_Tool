# Baseline record

## Repository state

- Repository: `anzarsajid91/ICM_Graphing_Tool`
- Default branch: `main`
- Immutable implementation baseline: `4bbf00d2d44715353d3ca12e21114edae9346b85`
- Feature branch: `feat/icm-workbench-modernisation` (confirmed at the same baseline before implementation)
- Baseline tree: `36b7dfa12922f400f1e306488ceb761084190ced`
- Baseline contained five tracked files.

### Original Git content identities

| Path | Git blob SHA |
|---|---|
| `README.md` | `f523e68232a7b075da434e8878c4a85a1567e446` |
| `app.py` | `3702a4583aa76e3b0b5c43a3528e20a5591cadf9` |
| `install.bat` | `2c21211179e14b06756ab7ef99b8f605dc53e00d` |
| `launch.bat` | `2e413886f22bc5d892f97317a604eee6872f3278` |
| `requirements.txt` | `f6704d53d75c410be75a210ebc308664cc581a3e` |

The connector exposed repository text but not a raw private checkout in the local execution environment, so byte-level SHA-256 values for all five original files were not independently recomputed in this session. Git commit/tree/blob identities above are recorded instead; T01 keeps raw SHA-256 as outstanding evidence rather than claiming it passed.

## Runtime characterisation

`app.py` is approximately 307 kB and contains the original implementation plus successive V18/V19/V20 patch/override layers. Source inspection confirmed consequential baseline behaviours: known telemetry sentinels are converted to zero; interpolation lacks a bounded-gap policy; missing data can be skipped during spill-state construction; the old storage-block loop can skip a later physical discharge when its incremental 12/24 count is zero; the launcher hard-codes an author-specific project path; and dependencies are open-ended lower bounds.

The preserved assessment records the 180 m³ versus 120 m³ flow-integration defect for constant 1 m³/s over 120 elapsed seconds. The new engine contains an independent analytical regression requiring exactly 120 m³.

## Local validation environment

- Python 3.13.5
- pandas 2.2.3
- NumPy 2.3.5
- Plotly 6.5.2
- pytest 9.0.2
- Dash and pyarrow were not installed in the local execution container.

Pure analysis/parser/service tests and Python compilation were executed locally. Dash/browser/Windows evidence comes from CI/target testing and is not called passed until the run confirms it.
