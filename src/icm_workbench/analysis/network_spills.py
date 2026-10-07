"""Calendar reporting for the schematic only; the shared spill rules are unchanged."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .spills import spill_assessment, detect_spill_intervals


def _uncertain_context(x, column, threshold, gap, start, reporting_start, exclusions, comparison="ge"):
    """Conservative phase check; unknown/excluded warm-up never implies dry.

    An occupied block can finish up to 24 h after discharge ends. Therefore
    48 h of uninterrupted known dry support guarantees a complete dry block
    regardless of an initially unknown counting phase.
    """
    times = x.timestamp.to_numpy(dtype="datetime64[ns]").astype(np.int64)
    values = pd.to_numeric(x[column], errors="coerce").to_numpy(dtype=float)
    t0, t1, v0, v1 = times[:-1], times[1:], values[:-1], values[1:]
    valid = np.isfinite(v0) & np.isfinite(v1) & ((t1-t0) <= gap*1e9)
    initial = np.isfinite(values[0]) and (values[0] > threshold if comparison == "gt" else values[0] >= threshold)
    uncertain = [start.value] if initial else []
    bad = (~valid) & (t0 < reporting_start.value)
    if bad.any():
        uncertain.append(min(int(t1[bad].max()), reporting_start.value))
    for exc in exclusions:
        a, b = pd.Timestamp(exc.start), pd.Timestamp(exc.end)
        if a < reporting_start and b > start:
            uncertain.append(min(b.value, reporting_start.value))
    if not uncertain:
        return ""
    after = max(uncertain)
    below0 = v0 <= threshold if comparison == "gt" else v0 < threshold
    below1 = v1 <= threshold if comparison == "gt" else v1 < threshold
    dry = valid & below0 & below1 & (t0 >= after) & (t1 <= reporting_start.value)
    indices = np.flatnonzero(dry)
    if len(indices):
        groups = np.split(indices, np.flatnonzero(np.diff(indices) > 1)+1)
        if any(t1[g[-1]]-t0[g[0]] >= 48*3600*1e9 for g in groups):
            return ""
    return "partial/left-censored-context" if initial and len(uncertain) == 1 else "partial/warm-up-context"


def main_reporting_year(start, end):
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    if start.tzinfo is not None or end.tzinfo is not None:
        raise ValueError("Resolve timestamps to the model clock before selecting a reporting year.")
    if end <= start:
        raise ValueError("A source needs at least two distinct timestamps.")
    years = range(start.year, (end - pd.Timedelta(nanoseconds=1)).year + 1)
    return max(years, key=lambda y: (
        (min(end, pd.Timestamp(y+1, 1, 1))-max(start, pd.Timestamp(y, 1, 1))).total_seconds(), y
    ))


def schematic_spill_assessment(frame, column, threshold, *, years=None, max_gap_seconds=900, exclusions=(), comparison="ge"):
    """Report selected years without restarting occupied blocks at 1 January.

    Warm-up contributes counting context, never displayed duration or eligibility.
    Three calendar months of valid support are required, rather than three months
    containing spills. Gaps/exclusions remain explicit and counts provisional.
    """
    threshold, gap = float(threshold), float(max_gap_seconds)
    if not np.isfinite(threshold) or not np.isfinite(gap) or gap <= 0:
        raise ValueError("Threshold must be finite and the maximum gap must be positive.")
    if comparison not in ("ge", "gt"):
        raise ValueError("Threshold rule must be ge (at or above) or gt (above).")
    if column not in frame.columns:
        raise ValueError("Select an existing value channel.")
    x = frame[["timestamp", column]].copy()
    x["timestamp"] = pd.to_datetime(x.timestamp, errors="coerce")
    if getattr(x.timestamp.dt, "tz", None) is not None:
        raise ValueError("Resolve timestamps to the model clock before spill assessment.")
    x = x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    if len(x) < 2:
        raise ValueError("A source needs at least two distinct timestamps.")
    start, end = x.timestamp.iloc[0], x.timestamp.iloc[-1]
    suggested = main_reporting_year(start, end)
    selected = [suggested] if years is None else list(years)
    if not selected or any(isinstance(y, bool) or not isinstance(y, (int, np.integer)) or y < 1900 or y > 2200 for y in selected):
        raise ValueError("Select at least one valid reporting year (1900–2200).")
    selected = sorted(set(int(y) for y in selected))
    # Calculate once at native resolution, retaining preceding warm-up context.
    context_end = min(end, pd.Timestamp(max(selected)+1, 1, 1))
    if context_end <= start:
        raise ValueError("Selected years are outside this source's period.")
    result = spill_assessment(x, column, threshold, start=start, end=context_end,
                              max_gap_seconds=gap, exclusions=exclusions, comparison=comparison)
    annual = {int(row["year"]): row for row in result["yearly_summary"].to_dict("records")}
    output = []
    for year in selected:
        a, b = max(start, pd.Timestamp(year, 1, 1)), min(end, pd.Timestamp(year+1, 1, 1))
        if b <= a:
            output.append(dict(year=year, eligible=False, reason="No source data in this year", spill_count=None,
                               duration_hours=None, analysis_start=None, analysis_end=None))
            continue
        row = dict(annual[year])
        minimum = ((a + pd.DateOffset(months=3)) - a).total_seconds()/3600
        eligible = row["valid_hours"] + 1e-8 >= minimum
        row.update(eligible=eligible, minimum_valid_hours=minimum,
                   reason="" if eligible else "Less than three calendar months of valid reporting data",
                   partial_year=(a != pd.Timestamp(year, 1, 1) or b != pd.Timestamp(year+1, 1, 1)),
                   counting_basis=result["count_policy"], threshold=threshold, comparison=comparison)
        values = pd.to_numeric(x.loc[(x.timestamp >= a) & (x.timestamp <= b), column], errors="coerce")
        values = values[np.isfinite(values)]
        row.update(value_min=float(values.min()) if len(values) else None,
                   value_max=float(values.max()) if len(values) else None,
                   continuous_spill=bool(row["valid_hours"] > 0 and
                       abs(row["duration_hours"] - row["valid_hours"]) < 1e-8))
        context_status = _uncertain_context(x, column, threshold, gap, start, a, exclusions, comparison)
        if context_status and row["count_status"] == "definitive":
            row["count_status"] = context_status
        if not eligible:
            row["spill_count"] = row["duration_hours"] = None
        output.append(row)
    return dict(main_reporting_year=suggested, selected_years=selected, rows=output,
                context_start=start.isoformat(), context_end=context_end.isoformat(),
                policy="Schematic only: main year by date-span; overrides explicit; warm-up retained for counting context; no annualisation",
                method=result["method"], exclusions=[e.to_dict() for e in exclusions])


def common_period_assessment(frame, column, threshold, start, end, *, max_gap_seconds=900,
                             exclusions=(), comparison="ge"):
    """Assess an explicit within-year window, retaining preceding counting context.

    Count timestamps are filtered from the full-context calculation. Cutting the
    source at the requested start would restart the 12/24 sequence incorrectly.
    Unsupported windows remain provisional; common dates do not prove support.
    """
    a, b = pd.Timestamp(start), pd.Timestamp(end)
    if a.tzinfo is not None or b.tzinfo is not None or b <= a or (b-pd.Timedelta(nanoseconds=1)).year != a.year:
        raise ValueError("Common period must be an increasing model-clock window within one reporting year.")
    x = frame[["timestamp", column]].copy()
    x["timestamp"] = pd.to_datetime(x.timestamp, errors="coerce")
    if getattr(x.timestamp.dt, "tz", None) is not None:
        raise ValueError("Resolve timestamps to the model clock before spill assessment.")
    x = x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    if len(x) < 2 or a < x.timestamp.iloc[0] or b > x.timestamp.iloc[-1]:
        raise ValueError("Common period is outside this source's temporal support.")
    context_start = x.timestamp.iloc[0]
    result = spill_assessment(x, column, threshold, start=context_start, end=b,
                             max_gap_seconds=max_gap_seconds, exclusions=exclusions, comparison=comparison)
    coverage = detect_spill_intervals(x, column, threshold, start=a, end=b,
                                     max_gap_seconds=max_gap_seconds, exclusions=exclusions, comparison=comparison)
    stamps = [pd.Timestamp(t) for row in result["counting_windows"].to_dict("records") for t in row["count_timestamps"]]
    count = sum(a <= t < b for t in stamps)
    duration = sum(max(0, (min(b, pd.Timestamp(e["end"]))-max(a, pd.Timestamp(e["start"]))).total_seconds())
                   for e in result["events"])/3600
    valid = coverage["valid_seconds"]/3600
    eligible = valid+1e-8 >= ((a+pd.DateOffset(months=3))-a).total_seconds()/3600
    status = "unavailable" if not valid else "partial/unknown-gap" if coverage["unknown_seconds"] > 1e-6 else "partial/excluded-window" if coverage["excluded_seconds"] > 1e-6 else "definitive"
    context_status = _uncertain_context(x, column, threshold, float(max_gap_seconds), context_start, a, exclusions, comparison)
    if context_status and status == "definitive":
        status = context_status
    return dict(year=a.year, eligible=eligible, spill_count=count if eligible else None,
                duration_hours=duration if eligible else None, analysis_start=a.isoformat(), analysis_end=b.isoformat(),
                valid_hours=valid, unknown_hours=coverage["unknown_seconds"]/3600,
                excluded_hours=coverage["excluded_seconds"]/3600, requested_hours=(b-a).total_seconds()/3600,
                count_status=status, threshold=float(threshold), comparison=comparison,
                counting_basis=result["count_policy"], context_start=context_start.isoformat(),
                reason="" if eligible else "Less than three calendar months of valid reporting data", basis="common-period")
