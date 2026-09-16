# ICM Calibration Workbench — development branch

This branch preserves the original `app.py`, `install.bat`, `launch.bat` and `requirements.txt` while adding a separate, testable workbench under `src/icm_workbench`.

## New pilot launcher

```bat
scripts\install_workbench.bat
scripts\launch_workbench.bat "C:\path\to\ICM exports"
```

Or, after installing the package:

```bash
python -m icm_workbench --data-dir examples/demo
```

The server binds to loopback only. The `examples/demo` files are synthetic and deliberately include a telemetry sentinel plus a workspace exclusion period.

## Verification

```bash
python -m pytest
python -m compileall -q src tests
```

Read `docs/implementation-status.md`, `docs/feature-parity.md`, `docs/behaviour-changes.md` and `docs/methods.md` before using corrected outputs for engineering work. Real-export/Windows UAT is still a release gate.
