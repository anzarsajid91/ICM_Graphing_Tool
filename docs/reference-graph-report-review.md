# Reference graph and report review — 20 September 2026

Base reviewed: `466d5b0045c641ee28398bce14403130a76dc9c8`.

The files under `reference/current-tool` are representative examples, not a format specification or a restriction on supported projects. All five Station A HTML Plotly payloads were inspected. Their observation/model colours are `#ff0000` and `#0008ff`. The FDV screenshot uses aligned rainfall, flow, depth and velocity panels with statistics below.

## Changes

- One layout function serves the live hydraulic graph and four-period exports. FDV variables occupy separate aligned panels; rainfall occupies a reversed upper band. No overview range slider is added.
- New-session observed/model defaults follow the supplied reports. Saved explicit colours are preserved. Observed hydraulic traces remain red across quantities; panel labels distinguish variables.
- Assessment time-series and all four-period graphs are interactive Plotly figures with the application Plotly bundle embedded in the downloaded HTML. No external script is required to reopen the report. Initial export must retrieve the bundle; retrieval failure stops export with an error.
- Period traces are fetched within each period before display reduction. Explicit null gap separators survive; samples use an exclusive end. Statistics use native data, with source intervals clipped to report boundaries.
- Statistics show source and quantity, units, extrema, arithmetic average, time-weighted mean, valid-support totals, hours, coverage and status. Flow totals use trapezoidal integration; declared rainfall intensity uses left-held interval means. Unresolved units suppress dimensional totals. These are raw source statistics: exclusion shading does not imply that raw statistics have been filtered. Analytical spill/comparison outputs keep their existing masks and methodology.
- Report zoom changes the view, not the fixed statistics period. Source provenance, exclusions and settings accompany four-period outputs.

## Independent checks completed locally

- All nine FDV files and all four rainfall `.R` files parsed. Station A EDM parsed to 105,216 rows; rainfall CSV parsed to 349,387 rows.
- FM01 screenshot reconciliation: flow min/max/average 0.039 / 0.769 / 0.128931055 m³/s; depth 0.113 / 0.470 / 0.188228510 m; velocity 0.42 / 1.48 / 0.880464263 m/s. RG01 total 85 mm. Native FM01 flow volume is 311,912.16 m³ over 28 days by an independent trapezoidal calculation.
- Station A rainfall CSV has unresolved units and discontinuous timestamp support. Its dimensional total is withheld; missing intervals are not reported as dry.
- Six numerical tests cover irregular intervals, boundary clipping, exclusive sample membership, rainfall interval averaging, gaps, unknown units and empty windows. Node regression checks cover shared layout, safe report payloads, zero scaling, worker recovery, masks, workspace migration and registry behaviour. Pages packaging succeeded.

## Release gate

This session lacks installed Chromium, pytest and Plotly Python dependencies. Local checks therefore do not constitute a full browser or complete Python-suite pass. The GitHub pull-request gate runs the complete existing suite plus these new numerical and real-reference tests, including parsing the CSV/HYD members of the model ZIP. Browser smoke additionally imports real FM01/RG01, checks the independently reconciled values, validates stacked domains, and opens exported reports with HTTPS blocked to verify embedded Plotly and layout containment.

The example legacy spill counts are not asserted as authoritative expected values: their support conventions and zero/missing handling differ from the current validity-aware engine. Existing spill/exclusion regression gates remain in force. Deployment and live verification must succeed before describing this revision as ready for review.
