# ICM Calibration Workbench — pilot user guide

## Start
On Windows run `scripts\install_workbench.bat` once, then:

```bat
scripts\launch_workbench.bat "C:\path\to\your\export-folder"
```

The new app binds to `127.0.0.1:8050`. The legacy application remains available via the original scripts during the pilot.

## Data
Use **Data → Refresh catalogue** to inspect supported files in the registered root. Preview shows detected parser, metadata, quality audit and sample rows. Ambiguous FDV interval/unit metadata is rejected rather than guessed.

## Compare
Choose observed and model/comparison sources and their value columns, then **Analyse**. Graph pan/zoom is presentation state and does not silently change metrics.

## Spills and exclusions
Choose source, value column, threshold and maximum valid gap. Under **Exclusion periods**, enter start/end as ISO local/model-clock text such as `2026-01-01T10:30`, add a mandatory reason, and click **Add exclusion**. Add as many intervals as needed. Individual intervals can be removed or all cleared.

After **Calculate spills**, review physical intervals, 12/24 count, physical duration, excluded assessment time, unknown unexcluded time, coverage/count status, and monthly counts/durations.

An exclusion is not zero or “no spill”: it removes that time from the assessment. Missing unexcluded data remains unknown.

## Report
The current spill report includes the exclusion audit and warns when unexcluded coverage is incomplete. Source data is not modified.
