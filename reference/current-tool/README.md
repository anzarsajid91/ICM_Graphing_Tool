# Current Tool Reference Library

This folder contains **reference material from the current assessment / graphing workflow** used to steer the design and verification of the ICM Graphing Tool.

These files are examples and evidence only. They are **not runtime application dependencies** and must not be required by the production browser application or GitHub Pages build.

## Folder structure

```text
reference/current-tool/
├── README.md
├── reports/
│   ├── html/
│   ├── pdf/
│   └── screenshots/
├── graph-exports/
│   ├── fdv/
│   ├── rainfall/
│   ├── model-verification/
│   └── spills-edm/
└── sample-data/
    ├── fdv/
    ├── rainfall/
    └── other/
```

## What to upload

### reports/
Upload representative final outputs from the current tool:
- HTML engineering reports
- PDF reports
- screenshots of report pages or sections that show the intended composition

### graph-exports/
Upload representative graph outputs showing the presentation that should guide the new workbench:
- FDV: inverted rainfall, Flow, Depth and Velocity presentation
- rainfall: gauge / accumulation / event-response plots
- model-verification: observed vs modelled comparisons, residuals, rating / scatter or related diagnostics
- spills-edm: thresholds, spill periods, duration / count summaries and EDM-oriented visualisations

### sample-data/
Optional, sanitised source files that make a reference output reproducible:
- FDV / telemetry data
- rainfall series
- other small supporting datasets

Prefer a **small representative sample** rather than large production datasets.

## What the references will be used for

The examples will be reviewed for:
- graph order and relative panel proportions
- shared time-axis behaviour
- axis labels, units and scaling
- rainfall inversion and event representation
- observed / model trace hierarchy and colours
- threshold placement and semantics
- legends and annotation density
- statistics shown beneath graphs
- assessment tables and engineering terminology
- report hierarchy, page composition and section ordering
- print / export spacing and pagination
- audit / evidence information that genuinely helps a hydraulic modeller

The findings should be converted into explicit graphing/reporting specifications and regression acceptance criteria rather than copied blindly.

## Guardrails

1. Do **not** import anything in this folder from production JavaScript, Python or HTML.
2. Do **not** make the Pages build depend on these files.
3. Reference presentation does not automatically override the canonical engineering calculation methodology.
4. Any calculation-method change still requires separate engineering validation and regression evidence.
5. Preserve original reference files where possible; do not overwrite them with generated workbench outputs.

## Confidentiality and sanitisation

Before uploading, remove or anonymise material that should not be committed to the repository, including where applicable:
- client-confidential project or asset names
- precise site / asset coordinates
- personal information
- credentials, access tokens or internal URLs
- commercially sensitive contractual information

Monitor names may be anonymised consistently (for example `FM01`, `FM02`, `RG01`) while preserving the engineering relationships needed to understand the example.

## Suggested naming

Use descriptive filenames where practical, for example:

```text
FDV_reference_rain-flow-depth-velocity.pdf
model-verification_observed-vs-modelled.html
rainfall_event-assessment_reference.png
spills_EDM_summary_reference.pdf
```

If several files belong to one example, prefix them consistently so they remain easy to associate.
