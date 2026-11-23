# Hydra Bench ICM Export Toolkit v1.0.0

The six standalone scripts use InfoWorks ICM's desktop Ruby interface and
two Ruby standard libraries, CSV and Date. Run them inside the active
InfoWorks network. Autodesk documents **Network → Run Ruby script** and
published the database script editor in ICM 2026.1. Earlier versions with the
desktop Run Ruby script command can use the same workflow if they expose the
needed APIs. The scripts use Ruby 2.4-era language features. The compatibility
target is InfoWorks ICM 2026.1 and later. Verify the chosen build with a small
synthetic copy of the workflow before relying on output. These scripts have
syntax and mocked-contract checks. An Autodesk ICM runtime was unavailable
for an independent execution check. They have no ICM Exchange dependency.

## Run a script

1. Download the `.rb` script from Home. Keep the guide beside your script.
2. Open the correct InfoWorks network and scenario in GeoPlan. For result
   exports, open the completed simulation replay and select the objects of
   interest. Download cloud simulation results through ICM before opening
   their replay where required.
3. Use the current model's native unit definitions. Confirm the field codes,
   source units and datum against the ICM documentation and actual schema.
4. Run the file through **Network → Run Ruby script**. ICM 2026.1 and later
   also allow importing the Ruby file as a Ruby script item and running it
   from the script editor. The document action runs against the current network.
5. In the prompt, choose an existing local disk output folder. Choose
   `selected` for the current GeoPlan selection or `all` for the configured
   object tables. Enter the reviewed model revision and scenario. Enter a
   simulation ID, event and vertical datum for result scripts. Run each
   required simulation or scenario separately with its own identifiers.
6. Review progress and omitted fields in the result log. Use an output folder
   only after `hydra_export_complete.csv` appears. If a script reports an
   unsupported result or field, use the manual workflow below and record the
   ICM version and source units. Keep the summary CSV with the data.

Use local folders approved for the project. The script rejects UNC paths.
Drive mappings and sync clients can redirect file writes outside the device.
Choose a folder without either. The scripts read the ICM model through
published row APIs. They write only into their new output subdirectory.
They do not call ICM write, transaction, commit, simulation-launch or Exchange
methods. No network, shell command, package installation or code download
is part of the scripts.

## Selection, fields and clocks

The final line accepts an optional Ruby hash. `:link_tables` restricts the
geometry job. `:extra_fields` adds reviewed scalar geometry or catchment
field names by table. `:result_fields` replaces the documented default
table-to-attribute-and-unit mapping for a result job. Check the relevant
Autodesk data-field reference and units before passing any override. Choose
time-varying result fields that are available for replay. Compare report
maxima through the relevant ICM report workflow.

```ruby
HydraIcmExport.run(:simulation, {
  :result_fields => { 'hw_conduit' => { 'us_flow' => 'm³/s' } }
})
```

For result exports, choose `calendar` for calendar timestamps, `unix-seconds`
only if the numeric API clock represents Unix epoch seconds, or
`elapsed-seconds` with a confirmed origin. The script preserves calendar
wall-clock labels and writes millisecond project-clock times to CSV. It
requires strictly increasing exact output samples, including the optional
start and end. Confirm the time basis before aligning any model and
observed data. Output blanks represent unavailable values. Negative flow
keeps its sign and zero stays zero. Result export is limited to five million
native samples per selected table and attribute. Export a smaller object
selection or use the native CSV export for more data. The result log estimates
the approximate size of the numeric cells before writing each CSV.

## Output and manual CSV fallback

| Download | Script output and intended import | Native manual option |
| --- | --- | --- |
| Network geometry | `network_geometry.csv` with `**** hw_` sections, typed IDs, metric nodes, supported links and any readable bends. Selected links include their endpoint nodes. Import in Network Schematic. | Use Network → Export to CSV files with native units, field descriptions, unit labels and link vertices. Keep node and link tables together. |
| Simulation series | One results CSV per selected object table and attribute, with sample clock and units. Import mapped results in Network Schematic. Choose a single mapped column when using a conventional timeseries. | Use Results → CSV export with Results timestep, header, units and selected objects. Preserve the simulation and model revision metadata alongside it. |
| Formula A catchments | `formula_a_catchments.csv` with reviewed `hw_subcatchment` source fields. Import through Formula A. Pair with the matching `hw_land_use` CSV to review native population, connectivity and profile defaults. Review contributing systems and daily allowances separately. | Export `hw_subcatchment` and `hw_land_use` from the same revision with row flags, field descriptions and native units. Keep applicable wastewater and trade event settings as separate evidence. Use Formula A review to map supported confirmed values. |
| Spill, storage and continuation flow | Selected overflow and continuation link-end flow, levels and current total node volume where ICM exposes `VOLUME`. Engineers choose the effective discharge and continuation sides. Map node volume as Storage volume for exact replay. | Use Results → CSV export for overflow links, continuation links, storage levels and documented node volume. Export the storage curve where needed. Import each time series with its own observed or modelled quantity. |
| Monitoring results | Node levels and node inflow when available, plus conduit-end flow, depth and velocity. Review the installed host and sensor datum before mapping. | Export native ICM results for the monitored links or nodes and selected compatible quantities. Keep the flow survey observations and deployment mapping as independent inputs. |
| Detriment results | Node level and flooding results plus selected overflow flows. Freeboard requires compatible ground and water levels in the same datum. The time-series files support investigation. | Use ICM's appropriate flooding and level reports and export matched baseline and proposed evidence. Follow Hydra Bench Detriment's report field and scenario requirements for authoritative comparisons. |

Geometry and catchment native markers preserve textual identifiers such as
`00127`. A result CSV begins with a common time axis and one asset per column.
Use the accompanying `result_sources.csv` for the type, API code, units and
run metadata. A separate source is required for each location or quantity.

For indexed import, map `depnod` as an absolute node level with the reviewed
vertical datum. `qnode` is total node inflow. `flooddepth` is the difference
between the node level and the flood level at that timestamp. `floodvolume`
is the flood volume at that timestep. Autodesk describes the above-surface
volume for 2D nodes as notional. Preserve that interpretation when using
the series for investigation. Use the manual report workflow for
authoritative detriment summaries.

`VOLUME` is the total volume at the node at the recorded timestep. This
applies the documented result definition, including Autodesk's notional
above-surface volume for applicable 2D nodes. A recorded node volume does
not establish available tank capacity or spill discharge. Use the applicable
storage curve and hydraulic context to assess those quantities.

```csv
Timestamp,00127.B,00129.C
,m³/s,m³/s
2025-01-01 00:00:00.000,0,-0.01
2025-01-01 00:05:00.000,,0.02
```

The catchment export carries native model fields. Nominal trade flow and
model base flow require review before use as regulatory daily allowances.
Model system type does not establish separate-foul eligibility. Native flags
and inherited profiles remain a manual export dependency when the Ruby row
values cannot establish provenance. These scripts do not compute hydraulics,
inferred contributions, freeboard, regulatory counts or acceptance criteria.

Autodesk references checked 2026-11-21

- [Running Ruby scripts in InfoWorks ICM](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-57F599CF-9FDE-405D-8C78-030694266390.htm)
- [Desktop context and row object API](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-TechNotes-Refs/files/GUID-56DE9C80-5B41-4248-9F71-3404BE3302DA.htm)
- [Autodesk's simulation-result Ruby example](https://github.com/innovyze/Open-Source-Support/blob/main/01%20InfoWorks%20ICM/01%20Ruby/01%20InfoWorks/0062%20-%20Export%20simulation%20results%20to%20CSV/readme.md)
- [Native network export](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-85146D52-4303-412A-B9EE-149B9CAE1488.htm)
- [Subcatchment fields and inherited values](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-1F3FA957-FE1B-4BD6-A73C-3DF2F6ACD839.htm)
- [Native model result CSV dialog](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-30AFF9A8-86D6-418C-A17F-127D09EC8B4D.htm)
- [Node result field definitions](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-18FD4962-1E97-491A-AD6E-6DF35191301D.htm)
- [Link result field definitions](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-174D9482-C7A3-4A12-B8E3-993F2C088F46.htm)
