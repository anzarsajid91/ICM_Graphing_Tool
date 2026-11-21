# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Common-period comparison with independent spill, duration and volume evidence."""
from __future__ import annotations

import pandas as pd

from icm_workbench.analysis.exclusions import normalise_exclusions
from icm_workbench.analysis.network_spills import common_period_assessment
from icm_workbench.analysis.spill_inquiry import register_events
from icm_workbench.analysis.spills import detect_spill_intervals


def reporting_windows(start, end):
    left, last = pd.Timestamp(start), pd.Timestamp(end)
    if pd.isna(left) or pd.isna(last) or left.tzinfo is not None or last.tzinfo is not None or last <= left:
        raise ValueError("Select an increasing common period on the project clock.")
    while left < last:
        right = min(last, pd.Timestamp(year=left.year + 1, month=1, day=1))
        yield left, right
        left = right


def evaluate_scenario(spec, threshold, start, end, maximum_gap):
    frame, column, exclusions = spec["frame"], spec["column"], spec["exclusions"]
    row = {"start": start.isoformat(), "end": end.isoformat(), "year": start.year,
           "count": None, "duration_hours": None, "volume_m3": None, "unknown_hours": None,
           "excluded_hours": None, "count_status": "unavailable", "context_start": None,
           "exclusion_mask": [], "reason": ""}
    times = frame["timestamp"]
    if len(times) < 2 or start < times.iloc[0] or end > times.iloc[-1]:
        row["reason"] = "The requested dates fall outside this scenario's recorded range."
        return row

    core = common_period_assessment(frame, column, threshold, start, end, max_gap_seconds=maximum_gap, exclusions=exclusions)
    event_basis = detect_spill_intervals(frame, column, threshold, start=start, end=end,
                                        max_gap_seconds=maximum_gap, exclusions=exclusions)
    events = event_basis["events"]
    mask = [[max(start, pd.Timestamp(item.start)).isoformat(), min(end, pd.Timestamp(item.end)).isoformat()]
            for item in normalise_exclusions(exclusions) if item.start < end and item.end > start]
    row.update(count=core["spill_count"], duration_hours=sum(event["duration_seconds"] for event in events) / 3600,
               unknown_hours=core["unknown_hours"], excluded_hours=core["excluded_hours"], count_status=core["count_status"],
               context_start=core["context_start"], exclusion_mask=mask, reason=core["reason"])
    if core["unknown_hours"] > 1e-9 or core["valid_hours"] <= 0:
        row["duration_hours"] = None
    if spec.get("flow") is not None and row["duration_hours"] is not None:
        level = {"times": pd.DatetimeIndex(times).as_unit("ns"), "values": frame[column].to_numpy(dtype=float),
                 "convention": "instantaneous", "exclusions": exclusions}
        volumes = register_events(events, level, maximum_gap, flow_source=spec["flow"])
        if all(event["volume_m3"] is not None for event in volumes):
            row["volume_m3"] = sum(event["volume_m3"] for event in volumes)
    return row


def scenario_delta(baseline, proposed):
    """Withhold each delta independently when its evidence is incompatible."""
    matched = (baseline["start"], baseline["end"], baseline["exclusion_mask"]) == (
        proposed["start"], proposed["end"], proposed["exclusion_mask"])
    complete = all(row["duration_hours"] is not None for row in (baseline, proposed))
    count_basis = all(row["count_status"] == "definitive" and row["count"] is not None for row in (baseline, proposed))
    count_context = baseline["context_start"] == proposed["context_start"]
    volume_basis = all(row["volume_m3"] is not None for row in (baseline, proposed))
    if not matched:
        reason = "The scenario periods or applied exclusion masks differ."
    elif not complete:
        reason = "A scenario lacks valid level support for the requested period."
    else:
        reason = "Physical duration uses matched assessable support."
    return {"count": proposed["count"] - baseline["count"] if matched and complete and count_basis and count_context else None,
            "duration_hours": proposed["duration_hours"] - baseline["duration_hours"] if matched and complete else None,
            "volume_m3": proposed["volume_m3"] - baseline["volume_m3"] if matched and complete and volume_basis else None,
            "period_reason": reason,
            "count_reason": "Matched definitive count and context." if matched and complete and count_basis and count_context else
            "Count needs an eligible reporting period, complete evidence and matching prior time context.",
            "volume_reason": "Matched period and supported discharge flows." if matched and complete and volume_basis else
            "Volume needs confirmed flows with full support during all assessed discharges."}
