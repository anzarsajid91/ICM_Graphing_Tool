# HydraBench 2.0 development baseline

Production on 15 November 2026 served v1.071 and embedded SHA
`5483d3fc369ea7ff63ecafb95082fee7a80dc6f1`, matching the remote `main` at
inspection. The designated preview branch starts at this commit. The existing
version ledger labels development builds v1.072-preview. Assign the 2.0 release
candidate identity when the integrated release is eligible for review.

| Baseline workflow | Contract to preserve |
| --- | --- |
| Home and Data | Separate Home network overview. Data handles FDV, R, hydraulic CSV, association workbook and recognised ICM report imports with authoritative parser metadata, manual semantics and a preliminary FastPath graph. Ordinary URLs opened Data on the baseline. |
| Spills and storage | Physical threshold exceedance on valid support, separate 12/24 count windows, explicit missingness, and idealised storage screening. |
| Network Schematic | Legacy route `#/spills/network`. Manual assets, connector direction and bends, layout, pins, labels, annual scenario evidence, local graph drill-down and export. |
| Flow Survey | FDV and gauge quality, WAPUG, common-support volume balance, weekly reviews and monthly PDF. |
| Plots | `#/graphs/comparison`, `#/graphs/rating`, `#/graphs/dwf`. Bounded overlap alignment, depth and rating analysis, scatter, DWF and comparison evidence. Older `#/verification/…` links are aliases. |
| Detriment | Scenario comparability and existing flooding, level and spill methods. |
| Reports and About | Browser-local exports, workspace save/restore, security disclosure. Persistence accepts workspace schemas 1, 2 and 3 and writes schema 3. |

The release build swaps in `runtime.release.js`. The browser domain registry
owns project, asset, source, series and association metadata. The Pyodide
worker executes the canonical Python analysis APIs. Browser presentation,
workspace restoration and the lazy SVG schematic consume those results.
The shared network/assessment model should extend that registry and preserve
distinct physical and monitoring identities.

[Engineering methods](methods.md) and [design system](uiux/design-system.md)
describe the intended contracts. Older version and review dates in those
documents are historical. [Security policy](../SECURITY.md) limits browser
requests to fixed application resources and permits engineering data in browser
memory, workers, local storage and explicit local exports. Existing CI and
production deployment rules were left in place.

## Measured reference checks

| Check | Result |
| --- | --- |
| Python baseline suite | 335 tests and 111 subtests passed. |
| Browser JavaScript baseline unit suites | 19 suites passed. |
| Privacy baseline | Source gate passed for nine reviewed network-capable sources and 22 pinned dependency files. All 28 privacy tests and JavaScript privacy contracts passed. |
| Synthetic EDM reference | 459.897 mm support-aware rainfall depth with partial coverage. 29 qualified events for each WAPUG population preset. Synthetic Level threshold 5.7000 m yielded 145 physical spill events. |
| Synthetic survey reference | 9 matched monitors, 2 network-qualified WAPUG events and 20 Green volume-balance rows. All 18 reference workflow criteria passed. This run measured 81.64 s for the native survey batch. |
| Chromium cold shell | Single loopback sample 1.337 s. No Pyodide requests before the first import. |
| Chromium network fixture | 400 assets, 399 wires. Single baseline browser layout sample 48 ms. Pinning, alignment and panning contracts exercised by the existing suite. |

Timings reflect single local samples and are insufficient to establish speedups
or certify large-project performance. The source samples are synthetic and
the engineering values are fixture references.

## Existing defects and development changes

- [Issues #106](https://github.com/anzarsajid91/ICM_Graphing_Tool/issues/106) and
  [#100](https://github.com/anzarsajid91/ICM_Graphing_Tool/issues/100) remain open.
  The latter concerns an intermittent mixed-file import timeout. The browser
  test now captures synthetic source rows, worker state, browser errors and
  fixed-resource failures before closing its probe. This captures evidence;
  the root cause still requires reproduction.
- Ordinary links now open Home. Explicit routes and Back still work.
- Network Schematic has a top-level route at `#/network/schematic`. The old
  route remains an alias, including when restoring older saved navigation.
  Existing diagram geometry and engineering calculation paths are reused.
- Verification is the visible name for the existing Plots workflow. Both
  existing URL spellings remain usable. Home shortcuts open available workflows.
- The header mark is a vector adaptation of the approved charcoal/indigo
  concept. The pulse sweeps for 2.1 s and rests for 4.9 s. Reduced motion uses
  the static mark. The favicon is a fixed same-origin SVG.

The route change only adjusts the schematic dialog close condition in the
network-approved source. Fixed-resource downloads, data destinations, local
exports and storage semantics are unchanged. The updated evidence digests
reflect the reviewed deltas. Maintainer review is pending.

## Browser evidence

| Screen | Production baseline | Development preview |
| --- | --- | --- |
| Home, 1440 px | [Screenshot](uiux/evidence/v2-baseline/production-home.png) | [Screenshot](uiux/evidence/v2-baseline/preview-home.png) |
| Schematic, 1440 px | [Screenshot](uiux/evidence/v2-baseline/production-network.png) | [Screenshot](uiux/evidence/v2-baseline/preview-network.png) |

Chromium and Firefox passed the preview navigation and responsive shell suite,
including direct URLs, the legacy schematic URL, Home shortcuts, keyboard
activation, Back and reduced motion. Chromium passed the annual schematic
review and the 400-asset layout workflow. Those two suites monitored 114 and
86 requests respectively and found zero violations. The rendered spill-calendar
test reconciled 64 counts, allocated 9/30/25 across the fixture months, and
178.38/720/601.27 h of monthly physical duration for each series.

## Run locally

From the preview branch, build and serve the browser artifact.

```sh
GITHUB_EVENT_NAME=pull_request python scripts/build_pages.py
python -m http.server 8000 --bind 127.0.0.1 --directory _site
```

Open <http://127.0.0.1:8000/>. This is a development checkpoint. The network
context importer, governing assessment state, Event and Engineer Review,
Hydraulic Calculations, cross-workspace integrations, guided Import Review,
and integrated engineering and release acceptance are still outstanding.
