# Detriment Assessment — engineering and interaction proposal

Status: design proposal only. This change does not implement a new workspace.

## Recommendation

Add **Detriment Assessment** as a primary workspace, with **Flooding**, **Level** and **Spill** tabs. Scenario A is the baseline; scenario B is the proposed case. Positive B minus A denotes deterioration. Reuse the current source pool, project asset registry, navigation, exclusion/provenance conventions and report styling. Keep report imports distinct from timestamp-series imports: worst-case and statistics reports have different row semantics.

Build the three tabs around one shared comparison contract, rather than three separate import workflows. The first version should support CSV upload and pasted spreadsheet/grid text, a mapping preview, asset matching, criteria, filtered results, evidence details and export. Coordinates and a map can follow if the exports contain defensible locations.

## ICM exports and import contracts

The fields below are **normalised app fields**, not claimed literal ICM column headings. Actual header aliases and clipboard layouts must be verified against representative exports and the user's ICM version.

| Assessment | ICM source | Required mapped fields | Evidence to preserve |
|---|---|---|---|
| Flooding | Node worst-case report, critical parameter Flood Volume | Asset ID; worst flood volume; volume unit | Critical simulation in each scenario; run; return period; storm duration; node type if available |
| Level | Separate node worst-case report, critical parameter Level | Asset ID; maximum water-level elevation; unit/datum | Critical simulation in each scenario; ground level from network export or supplied table; run/storm metadata |
| Spill | Statistics template: Summary plus Exceedance Detail; Simulation Summary for period evidence | CSO ID; attribute; scenario/run; authoritative spill count; actual total spilling duration; assessment period; counting mode | Threshold; minimum integral; duration/combine/split rules; detail start/end, duration, volume, block/count information when exported |

ICM's worst-case report chooses the critical simulation **for each asset**. Other fields in that row come from that same simulation. A Level column appearing alongside a flood worst case is therefore not necessarily that node's worst level across all storms. Separate flood and level reports are required. Different critical storms in A and B are acceptable for comparing matched worst-case envelopes, but both simulations must be shown. Comparing the same storm is a separate mode and requires matching simulation-level results.

Match return periods, climate allowances, storm sets, node selections, run completion and model purpose. A 2D node's reported flood quantity may represent cumulative discharge onto the surface; do not label it net surface retention. Summed node worst cases can arise from different storms and must not be presented as a simultaneous network flood total.

Statistics detail can contain physical exceedance rows **or block-spillage rows**, depending on the template. Exceedance count, spill count and row count are not interchangeable. Total period of exceedances can include dry gaps within blocks; use total duration of exceedances for actual spilling time. The app should preserve exported ICM spill counts from Summary, and use Detail for drill-down. If Detail alone does not contain sufficient count semantics, require Summary rather than guessing from the number of pasted rows.

An absent CSO detail row does not prove zero spills. A zero requires a complete selected inventory/summary and a confirmed period. Partial pasted results remain partial. Compare like-for-like periods and template configurations; expose differences before showing an assessment as comparable.

## Comparison rules

Apply rules to unrounded canonical values. Display rounding must not affect classification. Threshold equality is accepted in this proposal: a change must be **strictly greater** than its detriment tolerance; freeboard must be **strictly below** its minimum to breach it. State these rules beside the inputs.

| Tab | Calculation | Classification |
|---|---|---|
| Flooding | ΔV = V_B − V_A, m³ | Detriment when ΔV > user tolerance. Separately label newly flooded nodes where A = 0 and B > 0, even below tolerance. |
| Level | ΔH = H_B,max − H_A,max, m | Level detriment when ΔH > user tolerance. Require compatible elevations and vertical datum; depth cannot silently substitute for elevation. |
| Level / freeboard | F_A = GL_A − H_A,max; F_B = GL_B − H_B,max | Breach when F_B < required freeboard. New breach: A meets the requirement, B fails. Existing breach worsening: F_B < F_A. Existing breach improving/unchanged remains a risk but is not new deterioration. |
| Spill | ΔN = N_B − N_A; ΔT = T_B − T_A | Any ΔN > 0 is spill-count detriment. Show duration deterioration independently. Count reduction with longer duration is a mixed result, not an overall green pass. |

Freeboard is optional until ground levels and a required minimum are supplied. If ground levels change, show both values and the resulting freeboard changes. Offer an explicit common baseline-ground comparison when that is the agreed assessment basis; do not silently choose it. Do not infer ground level from maximum water level.

Duration-only deterioration should initially be flagged amber and filterable, with its exact increase shown. Whether it is a formal fail must be an explicit project policy. There is no universal utility detriment tolerance to hard-code. Spill counts should be compared by selected assessment year/period, with boundary attribution disclosed.

Match asset IDs as strings, retaining leading zeros. Reject duplicate keys unless the user chooses the intended run/attribute. Use an outer join: missing assets are **unmatched**, not zero. Renamed, new and removed assets require explicit mapping or a separate category. Preserve original IDs and values.

## Visual structure

**Top:** workspace title and the three tabs. **Comparison strip:** baseline A and proposed B names, source/report type, period/storm scope, matched assets and unmatched assets. **Collapsible criteria panel:** import/paste A and B, mapping preview, unit/datum checks and the relevant threshold inputs. Once validated, collapse it to leave most of the screen for results.

**Results:** four compact metrics (assessed assets, flagged assets, largest increase and unresolved assets), followed by a chart and the main sortable table. Default to flagged assets, with clear “All assets”, search, new-flooding/new-breach, worsening, improvement and unmatched filters. State when a chart shows only the top 20 changes; the table and export retain all results.

| Tab | Main visual | Core result columns |
|---|---|---|
| Flooding | Horizontal ΔV bars around zero, with the tolerance marked | Node; A m³; B m³; Δ m³; classification; critical simulation A/B |
| Level | Paired A/B levels; selected-node section with ground and minimum-freeboard line | Node; A/B level; Δ level; ground A/B; freeboard A/B; level flag; freeboard flag |
| Spill | Paired A/B count bars; separate duration graphic; selected-CSO event timeline | CSO; A/B count; Δ count; A/B duration; Δ duration; count/duration flags; comparability |

Use red for confirmed detriment/new breach, amber for deterioration within tolerance or persistent/mixed risk, green for improvement and grey for missing/incomparable data. Always pair colour with text, symbols and numeric changes. Give A and B consistent trace colours independent of result-status colours. Avoid dual axes combining spill count and duration.

Clicking a row opens an evidence drawer showing source values, the calculation, criterion, reason for the flag, critical simulation or spill events, and import provenance. Export filtered CSV and an assessment HTML report with scenario identities, all criteria, units/datum, matching exceptions, template settings and source fingerprints. Mark results stale after changing inputs.

## Hand-calculated acceptance examples

These are illustrative normalised data, not fabricated native ICM exports.

| Asset | Inputs | Expected result |
|---|---|---|
| MH001 | Flood A 2, B 8 m³; tolerance 5 m³ | Δ +6 m³, detriment |
| MH002 | Flood A 0, B 0.4 m³; tolerance 5 m³ | New flooding, below tolerance |
| MH003 | Flood A 10, B 3 m³ | Δ −7 m³, improvement |
| MH004 | Level A 99.35, B 99.65 m; ground 100 m; level tolerance 0.15 m; required freeboard 0.5 m | Level rise +0.30 m; freeboard 0.65 → 0.35 m; level detriment and new breach |
| MH005 | Level A 99.70, B 99.60 m; ground 100 m; required freeboard 0.5 m | Freeboard 0.30 → 0.40 m; existing breach improving |
| CSO01 | A 12 spills / 18 h; B 15 spills / 22 h; identical annual period/template | +3 spills and +4 h; count and duration deterioration |
| CSO02 | A 12 spills / 18 h; B 10 spills / 24 h | −2 spills, +6 h; mixed result |

Also verify threshold equality, millimetre conversion, changed ground level, datum mismatch, duplicate IDs, leading zeros, missing assets, incomplete runs, no-detail/zero-count evidence, long 12/24 spills and year-boundary events before implementation is considered complete.

## Inputs still needed before implementing report adapters

One representative flood worst-case export, one level worst-case export, a ground-level table and the user's actual Exceedance Detail/Summary template output. These establish real headers, whether detail is physical-event or block based, duration semantics and the available period/count evidence. The tab structure and engineering rules above can be agreed independently of those header details.

## Primary references

- [Autodesk: Worst Case Report View (2025)](https://help.autodesk.com/cloudhelp/2025/ENU/ICM-Help/files/GUID-6A81E877-D9EC-4B17-9657-88BFD165223A.htm)
- [Autodesk: Grid Reports (2025)](https://help.autodesk.com/cloudhelp/2025/ENU/ICM-Help/files/GUID-38A92D1C-94DF-4922-9746-60A8B246D6E6.htm)
- [Autodesk: Statistics Templates (2025)](https://help.autodesk.com/cloudhelp/2025/ENU/ICM-Help/files/GUID-5BE277F3-E11D-4BC0-93D5-2A4D0FF854D5.htm)
- [Autodesk: Statistical Report View (2027 documentation)](https://help.autodesk.com/cloudhelp/2027/ENU/ICM-Help/files/GUID-5BB2DE60-D4B8-465A-8883-9C942B791037.htm)
- [Autodesk: Producing Statistical Reports (2027 documentation)](https://help.autodesk.com/cloudhelp/2027/ENU/ICM-Help/files/GUID-4ACDB430-D42A-4E8D-95B3-7D0C9CEDEBB9.htm)
