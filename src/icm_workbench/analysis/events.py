from __future__ import annotations

import numpy as np
import pandas as pd

from icm_workbench.analysis.exclusions import apply_exclusions
from icm_workbench.analysis.rainfall import rainfall_support_segments


def detect_rainfall_events(
    rain,
    *,
    intensity_col="rainfall",
    minimum_intensity=5.0,
    minimum_intensity_duration_min=6.0,
    minimum_depth_mm=5.0,
    minimum_event_duration_min=60.0,
    dry_gap_min=15.0,
    exclusions=(),
    semantics="intensity",
    declared_interval_minutes=None,
    max_gap_seconds=None,
):
    """Detect rainfall events using actual timestamp support.

    Missing or unsupported intervals terminate an event. A final intensity
    value contributes only when a declared regular interval is supplied.
    """
    if rain is None or getattr(rain, "empty", True):
        return []

    r, _ = apply_exclusions(rain, exclusions, [intensity_col])
    segments = rainfall_support_segments(
        r,
        intensity_col,
        semantics=semantics,
        declared_interval_minutes=declared_interval_minutes,
        max_gap_seconds=max_gap_seconds,
    )
    if segments.empty:
        return []

    events: list[dict] = []
    active: list[dict] = []
    dry_start = None
    dry_seconds = 0.0

    def close(end_override=None):
        nonlocal active, dry_start, dry_seconds
        if not active:
            dry_start = None
            dry_seconds = 0.0
            return

        event_start = pd.Timestamp(active[0]["start"])
        event_end = pd.Timestamp(end_override) if end_override is not None else pd.Timestamp(active[-1]["end"])
        if event_end <= event_start:
            active = []
            dry_start = None
            dry_seconds = 0.0
            return

        selected = [x for x in active if pd.Timestamp(x["start"]) < event_end]
        if not selected:
            active = []
            dry_start = None
            dry_seconds = 0.0
            return

        duration_min = float((event_end - event_start).total_seconds() / 60.0)
        total_depth = 0.0
        peak = -np.inf
        streak = best_streak = 0.0
        for seg in selected:
            a = pd.Timestamp(seg["start"])
            b = min(pd.Timestamp(seg["end"]), event_end)
            seconds = max(0.0, float((b - a).total_seconds()))
            if seconds <= 0:
                continue
            value = float(seg["value"])
            peak = max(peak, value)
            if semantics == "intensity":
                total_depth += max(value, 0.0) * seconds / 3600.0
            else:
                total_depth += max(float(seg["depth_mm"]), 0.0) * seconds / float(seg["support_seconds"])
            if value >= float(minimum_intensity):
                streak += seconds / 60.0
                best_streak = max(best_streak, streak)
            else:
                streak = 0.0

        if (
            duration_min >= float(minimum_event_duration_min)
            and total_depth >= float(minimum_depth_mm)
            and best_streak >= float(minimum_intensity_duration_min)
        ):
            events.append(
                {
                    "event": len(events) + 1,
                    "start": event_start,
                    "end": event_end,
                    "duration_min": duration_min,
                    "total_depth_mm": float(total_depth),
                    "peak_intensity": float(peak) if np.isfinite(peak) else None,
                    "intensity_streak_min": float(best_streak),
                    "coverage_status": "complete",
                    "rainfall_semantics": semantics,
                    "criteria": {
                        "min_intensity": float(minimum_intensity),
                        "min_intensity_duration_min": float(minimum_intensity_duration_min),
                        "min_depth_mm": float(minimum_depth_mm),
                        "min_event_duration_min": float(minimum_event_duration_min),
                        "dry_gap_min": float(dry_gap_min),
                    },
                }
            )
        active = []
        dry_start = None
        dry_seconds = 0.0

    for row in segments.to_dict("records"):
        if not bool(row["valid"]):
            if active:
                close(pd.Timestamp(row["start"]))
            continue

        value = float(row["value"])
        if not active:
            if value > 0:
                active = [row]
                dry_start = None
                dry_seconds = 0.0
            continue

        active.append(row)
        if value <= 0:
            if dry_start is None:
                dry_start = pd.Timestamp(row["start"])
            dry_seconds += float(row["support_seconds"])
            if dry_seconds / 60.0 >= float(dry_gap_min):
                close(dry_start)
        else:
            dry_start = None
            dry_seconds = 0.0

    if active:
        close()
    return events
