"""Calendar reporting for the schematic only; the shared spill rules are unchanged."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .spills import spill_assessment


def _uncertain_context(x, column, threshold, gap, start, reporting_start, exclusions):
    """Conservative phase check; unknown/excluded warm-up never implies dry.

    An occupied block can finish up to 24 h after discharge ends. Therefore
    48 h of uninterrupted known dry support guarantees a complete dry block
    regardless of an initially unknown counting phase.
    """
    times = x.timestamp.to_numpy(dtype="datetime64[ns]").astype(np.int64)
    values = pd.to_numeric(x[column], errors="coerce").to_numpy(dtype=float)
    t0, t1, v0, v1 = times[:-1], times[1:], values[:-1], values[1:]
    valid = np.isfinite(v0) & np.isfinite(v1) & ((t1-t0) <= gap*1e9)
    initial = np.isfinite(values[0]) and values[0] >= threshold
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
    dry = valid & (v0 < threshold) & (v1 < threshold) & (t0 >= after) & (t1 <= reporting_start.value)
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
    # The shared detector remains inclusive. Its next representable threshold
    # excludes equal-valued plateaus locally without rounding or a fixed epsilon.
    detection_threshold = np.nextafter(threshold, np.inf) if comparison == "gt" else threshold
    if not np.isfinite(detection_threshold):
        raise ValueError("Threshold is outside the supported numeric range.")
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
    result = spill_assessment(x, column, detection_threshold, start=start, end=context_end,
                              max_gap_seconds=gap, exclusions=exclusions)
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
        context_status = _uncertain_context(x, column, detection_threshold, gap, start, a, exclusions)
        if context_status and row["count_status"] == "definitive":
            row["count_status"] = context_status
        if not eligible:
            row["spill_count"] = row["duration_hours"] = None
        output.append(row)
    return dict(main_reporting_year=suggested, selected_years=selected, rows=output,
                context_start=start.isoformat(), context_end=context_end.isoformat(),
                policy="Schematic only: main year by date-span; overrides explicit; warm-up retained for counting context; no annualisation",
                method=result["method"], exclusions=[e.to_dict() for e in exclusions])
