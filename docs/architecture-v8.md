# Workbench architecture — v8

The browser workbench is organised around three explicit boundaries.

## 1. Canonical project/domain registry

`web/assets/domain-registry.js` owns the browser-side representation of the
loaded engineering project:

`Project -> Assets -> Sources -> Series -> Relationships`

A source is classified once after parsing. Each engineering series carries its
asset, role, quantity and unit. The authoritative `fm_rg_assoc.xlsx` workbook
adds monitor-to-monitor and rainfall-gauge relationships to the same registry.

Existing selectors are retained for backwards compatibility, but their option
lists and default suggestions are projections of this registry. Workspace and
report audit output also include a registry snapshot. New workflows should
consume registry metadata rather than re-inferring file meaning independently.

## 2. Isolated analysis worker

`web/assets/analysis-worker.js` owns Pyodide and the Python filesystem. The UI
thread never loads Pyodide. Files are transferred into the worker and Python
calls use a small request/result protocol.

The worker serialises Python operations, reports progress, and can be terminated
and rebuilt when a user cancels an operation. Parsed browser File objects remain
on the UI side so already-loaded sources can be restored after a worker restart.

This boundary is responsible for execution and responsiveness only. It must not
contain hydraulic methodology.

## 3. Single authoritative Python engineering kernel

Browser-facing calculation APIs live inside the installable package:

- `src/icm_workbench/browser_api.py`
- `src/icm_workbench/advanced_api.py`

The historical files `web/python_bridge.py` and `web/advanced_bridge.py` are
thin compatibility shims only. Calculation logic must not be added to those
files.

The worker imports the package APIs directly. Desktop/tests/browser therefore
exercise the same parsing, validity, unit, comparison, rainfall, survey, spill,
storage and reporting calculations.

## Change rule

When adding a feature:

1. Put engineering calculations in `src/icm_workbench` and unit-test them.
2. Expose only a serialisable API operation through the package browser APIs.
3. Execute the operation through the worker RPC boundary.
4. Project source/asset identity through `ICMProjectRegistry`; do not invent a
   second file-to-monitor mapping inside an individual tab.
5. Keep plotting/layout/report transformation in the browser presentation layer.
6. Add browser acceptance coverage for the user workflow.
7. Require both release-artifact and live-Pages verification to pass.

Hydraulic methodology, WAPUG/FSAT criteria, spill-counting rules, volume-balance
equations, unit contracts and validity semantics remain protected engineering
behaviour and require explicit review when changed.
