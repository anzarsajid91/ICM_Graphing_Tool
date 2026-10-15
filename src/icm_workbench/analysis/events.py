from __future__ import annotations

import numpy as np
import pandas as pd

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
    start=None,
    end=None,
):
    """Detect rainfall events using actual timestamp support.

    Missing or unsupported intervals terminate an event. A final intensity
    value contributes only when a declared regular interval is supplied.
    """
    if rain is None or getattr(rain, "empty", True):
        return []

    segments = rainfall_support_segments(
        rain,
        intensity_col,
        semantics=semantics,
        declared_interval_minutes=declared_interval_minutes,
        max_gap_seconds=max_gap_seconds,
        exclusions=exclusions,
    )
    if segments.empty:
        return []

    # Build native support before clipping. Interval depth and its effective
    # rate must retain the original support even when exclusions/window split it.
    clipped = []
    for row in segments.to_dict("records"):
        a = max(row["start"], pd.Timestamp(start)) if start is not None else row["start"]
        b = min(row["end"], pd.Timestamp(end)) if end is not None else row["end"]
        if b <= a:
            continue
        seconds = float((b - a).total_seconds())
        clipped.append({**row, "start": a, "end": b,
                        "depth_mm": row["depth_mm"] * seconds / row["support_seconds"],
                        "support_seconds": seconds})

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
            intensity = float(seg["depth_mm"]) * 3600.0 / float(seg["support_seconds"])
            peak = max(peak, intensity)
            total_depth += float(seg["depth_mm"]) * seconds / float(seg["support_seconds"])
            if intensity >= float(minimum_intensity):
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

    for row in clipped:
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
