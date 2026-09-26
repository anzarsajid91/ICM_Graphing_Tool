from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from icm_workbench.analysis.events import detect_rainfall_events
from icm_workbench.analysis.rainfall import daily_rainfall_support, rainfall_support_segments


WAPUG_MIN_INTENSITY_MM_H = 5.0
WAPUG_MIN_DEPTH_MM = 5.0
WAPUG_DRY_GAP_MIN = 15.0
NETWORK_CV_LIMIT_PERCENT = 40.0
OPERATIONAL_COVERAGE_FRACTION = 0.90
MIN_OPERATIONAL_GAUGES = 2

FAULTY_ZERO_TOL_MM = 0.01
FAULTY_OTHER_WET_FRACTION = 0.60
FAULTY_WET_DAY_THRESHOLD_MM = 2.0
FAULTY_ROLLING_WINDOW_DAYS = 7
FAULTY_STRIKES_IN_WINDOW = 2
DAILY_SIGNIFICANT_RAIN_MM = 4.5
DAILY_LOW_SUM_TOTAL_MM = 1.5
DAILY_PER_GAUGE_MAX_MM = 1.0

MAX_LAG_HOURS = 12.0
RAIN_MIN_MM_FOR_CORRELATION = 5.0
WET_OVERLAP_MIN_POINTS = 12
WET_MIN_RAIN_MM = 0.05
ACTIVE_COVERAGE_FRACTION = 0.30

DEPTH_ACTIVE_EPS_M = 0.01
VELOCITY_ACTIVE_EPS_MS = 0.05
FLOW_ACTIVE_EPS_M3S = 0.005

DRY_DAY_RAIN_MM = 1.0
ADP_HOURS = 6.0
BASELINE_WINDOW_DAYS = 28
BASELINE_SMOOTH_MIN = 60
MIN_DRY_DAYS_FOR_BASELINE = 5

EVENT_LINK_WINDOW_HOURS = 18.0
EVENT_GAP_MIN = 60.0
DEPTH_RISE_RESID_M = 0.05
DEPTH_RISE_RAW_M = 0.10
VELOCITY_RISE_RESID_MS = 0.10
VELOCITY_RISE_RAW_MS = 0.15
FLOW_RISE_REL_MIN = 0.30
FLOW_RISE_ABS_MIN_M3S = 0.01
LINK_MIN_EVENTS = 2
LINK_MIN_FRACTION = 0.50

FLATLINE_MOD_MIN = 360.0
FLATLINE_SEV_MIN = 2880.0
EVENT_FLATLINE_MIN = 60.0
EVENT_FLATLINE_OVERLAP_FRACTION = 0.50
WEEK_FLATLINE_SUPPRESS_MIN = 5760.0


def wapug_population_preset(population_above_50k: bool) -> dict[str, float]:
    """Return the companion-repository WAPUG duration preset."""
    return {
        "minimum_intensity_mm_h": WAPUG_MIN_INTENSITY_MM_H,
        "minimum_intensity_duration_min": 6.0 if bool(population_above_50k) else 4.0,
        "minimum_depth_mm": WAPUG_MIN_DEPTH_MM,
        "minimum_event_duration_min": 60.0 if bool(population_above_50k) else 30.0,
        "dry_gap_min": WAPUG_DRY_GAP_MIN,
    }


def _normalise_frame(frame: pd.DataFrame, column: str) -> pd.DataFrame:
    if frame is None or getattr(frame, "empty", True) or column not in frame.columns:
        return pd.DataFrame(columns=["timestamp", column])
    x = frame[["timestamp", column]].copy()
    x["timestamp"] = pd.to_datetime(x["timestamp"], errors="coerce")
    x[column] = pd.to_numeric(x[column], errors="coerce")
    return (
        x.dropna(subset=["timestamp"])
        .sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
        .reset_index(drop=True)
    )



def _exclusion_mask(timestamps: pd.Series, exclusions: list[Any] | None) -> pd.Series:
    ts = pd.to_datetime(timestamps, errors="coerce")
    mask = pd.Series(False, index=timestamps.index, dtype=bool)
    for exc in exclusions or []:
        if isinstance(exc, dict):
            start, end = exc.get("start"), exc.get("end")
        else:
            start, end = getattr(exc, "start", None), getattr(exc, "end", None)
        if start is None or end is None:
            continue
        start_ts, end_ts = pd.Timestamp(start), pd.Timestamp(end)
        if end_ts <= start_ts:
            continue
        mask |= (ts >= start_ts) & (ts < end_ts)
    return mask


def _median_step_minutes(timestamps: pd.Series) -> float:
    ts = pd.to_datetime(timestamps, errors="coerce").dropna().sort_values()
    delta = ts.diff().dt.total_seconds().div(60.0)
    delta = delta[delta > 0]
    return float(delta.median()) if len(delta) else np.nan


def _merge_windows(windows: list[tuple[pd.Timestamp, pd.Timestamp]]) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    clean = sorted(
        [
            (pd.Timestamp(a), pd.Timestamp(b))
            for a, b in windows
            if pd.notna(a) and pd.notna(b) and pd.Timestamp(b) > pd.Timestamp(a)
        ],
        key=lambda x: x[0],
    )
    if not clean:
        return []
    merged = [clean[0]]
    for start, end in clean[1:]:
        prev_start, prev_end = merged[-1]
        if start <= prev_end:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))
    return merged


def _support_for_window(
    frame: pd.DataFrame,
    column: str,
    start: pd.Timestamp,
    end: pd.Timestamp,
    interval_min: float | None,
) -> dict[str, float | bool]:
    duration = max(0.0, float((pd.Timestamp(end) - pd.Timestamp(start)).total_seconds()))
    if duration <= 0:
        return {
            "depth_mm": 0.0,
            "valid_seconds": 0.0,
            "coverage_fraction": 0.0,
            "operational": False,
        }
    seg = rainfall_support_segments(
        frame,
        column,
        semantics="intensity",
        declared_interval_minutes=interval_min,
        max_gap_seconds=(float(interval_min) * 90.0 if interval_min else None),
    )
    depth = 0.0
    valid_seconds = 0.0
    for row in seg.itertuples(index=False):
        left = max(pd.Timestamp(row.start), pd.Timestamp(start))
        right = min(pd.Timestamp(row.end), pd.Timestamp(end))
        seconds = max(0.0, float((right - left).total_seconds()))
        if seconds <= 0 or not bool(row.valid):
            continue
        valid_seconds += seconds
        depth += max(float(row.value), 0.0) * seconds / 3600.0
    coverage = min(1.0, valid_seconds / duration) if duration else 0.0
    return {
        "depth_mm": float(depth),
        "valid_seconds": float(valid_seconds),
        "coverage_fraction": float(coverage),
        "operational": bool(coverage >= OPERATIONAL_COVERAGE_FRACTION),
    }


def _network_daily_rows(daily_by_gauge: dict[str, pd.DataFrame]) -> list[dict[str, Any]]:
    if not daily_by_gauge:
        return []
    days = sorted(set().union(*(set(table.index) for table in daily_by_gauge.values())))
    rows: list[dict[str, Any]] = []
    zero_run = 0
    low_run = 0
    for day in days:
        operational: dict[str, float] = {}
        represented: dict[str, float] = {}
        for name, table in daily_by_gauge.items():
            if day not in table.index:
                continue
            row = table.loc[day]
            if isinstance(row, pd.DataFrame):
                row = row.iloc[-1]
            coverage = float(row.get("coverage_fraction", 0.0) or 0.0)
            depth = float(row.get("depth_mm", 0.0) or 0.0)
            represented[name] = depth
            if coverage >= OPERATIONAL_COVERAGE_FRACTION:
                operational[name] = depth

        depths = np.asarray(list(operational.values()), dtype=float)
        mean_depth = float(np.mean(depths)) if len(depths) else np.nan
        total_depth = float(np.sum(depths)) if len(depths) else np.nan
        cv = (
            float(np.std(depths, ddof=0) / mean_depth * 100.0)
            if len(depths) >= MIN_OPERATIONAL_GAUGES and mean_depth > 1e-12
            else np.nan
        )
        all_significant = bool(
            len(operational)
            and all(v >= DAILY_SIGNIFICANT_RAIN_MM for v in operational.values())
        )
        all_zero = bool(len(operational) and all(v <= 1e-12 for v in operational.values()))
        low_day = bool(
            len(operational)
            and total_depth <= DAILY_LOW_SUM_TOTAL_MM
            and all(v <= DAILY_PER_GAUGE_MAX_MM for v in operational.values())
        )
        zero_run = zero_run + 1 if all_zero else 0
        low_run = low_run + 1 if low_day else 0
        dry_low = "Yes" if zero_run >= 5 else ("Maybe" if low_run >= 3 else "No")
        rows.append(
            {
                "day": pd.Timestamp(day),
                "operational_gauges": int(len(operational)),
                "network_mean_depth_mm": None if not np.isfinite(mean_depth) else mean_depth,
                "network_total_depth_mm": None if not np.isfinite(total_depth) else total_depth,
                "spatial_cv_percent": None if not np.isfinite(cv) else cv,
                "uniform_within_limit": None
                if not np.isfinite(cv)
                else bool(cv <= NETWORK_CV_LIMIT_PERCENT),
                "potential_rain_event": all_significant,
                "dry_low_rain_spell": dry_low,
                "gauge_depths_mm": operational,
                "represented_gauge_depths_mm": represented,
            }
        )
    return rows


def _daily_fault_history(
    daily_rows: list[dict[str, Any]],
    gauge_names: list[str],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    strikes: dict[str, list[pd.Timestamp]] = {name: [] for name in gauge_names}
    histories: list[dict[str, Any]] = []
    states: dict[str, str] = {name: "Operational" for name in gauge_names}
    first_fault: dict[str, pd.Timestamp | None] = {name: None for name in gauge_names}
    recovered: dict[str, pd.Timestamp | None] = {name: None for name in gauge_names}

    for row in daily_rows:
        day = pd.Timestamp(row["day"])
        depths = {
            k: float(v)
            for k, v in (row.get("gauge_depths_mm") or {}).items()
            if v is not None
        }
        for name in gauge_names:
            if name not in depths:
                histories.append(
                    {
                        "day": day,
                        "gauge": name,
                        "strike": False,
                        "status": "Unknown",
                        "reason": "Gauge day not sufficiently represented.",
                    }
                )
                continue
            others = [v for other, v in depths.items() if other != name]
            wet_fraction = (
                float(np.mean(np.asarray(others) > 0.0)) if others else 0.0
            )
            network_wet = bool(
                others and float(np.mean(others)) >= FAULTY_WET_DAY_THRESHOLD_MM
            )
            strike = bool(
                depths[name] <= FAULTY_ZERO_TOL_MM
                and network_wet
                and wet_fraction >= FAULTY_OTHER_WET_FRACTION
            )
            if strike:
                strikes[name].append(day)
            window_start = day - pd.Timedelta(days=FAULTY_ROLLING_WINDOW_DAYS - 1)
            recent = [d for d in strikes[name] if window_start <= d <= day]
            wet_proof = bool(
                depths[name] >= FAULTY_WET_DAY_THRESHOLD_MM and network_wet
            )

            previous = states[name]
            if previous != "Faulty" and len(recent) >= FAULTY_STRIKES_IN_WINDOW:
                states[name] = "Faulty"
                if first_fault[name] is None:
                    first_fault[name] = day
            elif previous == "Faulty":
                if len(recent) == 0 and wet_proof:
                    states[name] = "Recovered"
                    recovered[name] = day
            elif previous == "Recovered" and len(recent) >= FAULTY_STRIKES_IN_WINDOW:
                states[name] = "Faulty"

            histories.append(
                {
                    "day": day,
                    "gauge": name,
                    "strike": strike,
                    "rolling_strikes": int(len(recent)),
                    "wet_proof": wet_proof,
                    "status": states[name],
                    "reason": (
                        "Near-zero response while the surrounding operational gauges were wet."
                        if strike
                        else (
                            "No strike; wet response provides recovery evidence."
                            if wet_proof
                            else "No strike."
                        )
                    ),
                }
            )

    summary = {
        name: {
            "daily_strikes": int(len(strikes[name])),
            "first_fault_day": first_fault[name],
            "recovery_day": recovered[name],
            "current_dynamic_status": states[name],
        }
        for name in gauge_names
    }
    return histories, summary


def network_rainfall_assessment(
    gauges: dict[str, tuple[pd.DataFrame, str, float | None]],
    *,
    population_above_50k: bool = True,
    apply_fault_cutoff: bool = False,
) -> dict[str, Any]:
    """Professional multi-gauge rainfall assessment derived from the companion tools.

    Source data stays immutable. A two-strike event cutoff is returned as evidence
    and is applied to network WAPUG qualification only when explicitly requested.
    """
    preset = wapug_population_preset(population_above_50k)
    clean: dict[str, tuple[pd.DataFrame, str, float | None]] = {}
    daily_by_gauge: dict[str, pd.DataFrame] = {}
    gauge_events: dict[str, list[dict[str, Any]]] = {}
    candidate_windows: list[tuple[pd.Timestamp, pd.Timestamp]] = []

    for name, spec in gauges.items():
        frame, column, interval = spec
        x = _normalise_frame(frame, column)
        if x.empty:
            continue
        interval_value = float(interval) if interval is not None else None
        clean[str(name)] = (x, column, interval_value)
        daily = daily_rainfall_support(
            x,
            column,
            semantics="intensity",
            declared_interval_minutes=interval_value,
            max_gap_seconds=(interval_value * 90.0 if interval_value else None),
        )
        daily_by_gauge[str(name)] = (
            daily.set_index("day") if not daily.empty else pd.DataFrame()
        )
        events = detect_rainfall_events(
            x,
            intensity_col=column,
            minimum_intensity=preset["minimum_intensity_mm_h"],
            minimum_intensity_duration_min=preset[
                "minimum_intensity_duration_min"
            ],
            minimum_depth_mm=preset["minimum_depth_mm"],
            minimum_event_duration_min=preset["minimum_event_duration_min"],
            dry_gap_min=preset["dry_gap_min"],
            semantics="intensity",
            declared_interval_minutes=interval_value,
            max_gap_seconds=(interval_value * 90.0 if interval_value else None),
        )
        gauge_events[str(name)] = events
        candidate_windows.extend(
            (pd.Timestamp(e["start"]), pd.Timestamp(e["end"])) for e in events
        )

    if not clean:
        return {
            "gauge_count": 0,
            "criteria": {
                **preset,
                "population_above_50k": bool(population_above_50k),
            },
            "daily": [],
            "gauge_summary": [],
            "fault_history": [],
            "significant_windows": [],
            "qualified_wapug_events": [],
            "method": "network-rainfall-v2",
        }

    daily_rows = _network_daily_rows(daily_by_gauge)
    for row in daily_rows:
        if row["potential_rain_event"]:
            start = pd.Timestamp(row["day"])
            candidate_windows.append((start, start + pd.Timedelta(days=1)))

    significant_windows = _merge_windows(candidate_windows)

    event_streak = {name: 0 for name in clean}
    suggested_cutoff: dict[str, pd.Timestamp | None] = {
        name: None for name in clean
    }
    event_fault_history: list[dict[str, Any]] = []
    for event_index, (start, end) in enumerate(significant_windows, 1):
        support = {
            name: _support_for_window(frame, col, start, end, interval)
            for name, (frame, col, interval) in clean.items()
        }
        operational = {
            name: value
            for name, value in support.items()
            if bool(value["operational"])
        }
        if len(operational) < 2:
            continue
        for name, value in operational.items():
            if suggested_cutoff[name] is not None:
                continue
            others = [x for other, x in operational.items() if other != name]
            other_wet_fraction = (
                float(np.mean([float(x["depth_mm"]) > 0.0 for x in others]))
                if others
                else 0.0
            )
            strike = bool(
                float(value["depth_mm"]) <= FAULTY_ZERO_TOL_MM
                and other_wet_fraction >= FAULTY_OTHER_WET_FRACTION
            )
            event_streak[name] = event_streak[name] + 1 if strike else 0
            if event_streak[name] >= 2:
                suggested_cutoff[name] = pd.Timestamp(end)
            event_fault_history.append(
                {
                    "event": event_index,
                    "start": start,
                    "end": end,
                    "gauge": name,
                    "depth_mm": float(value["depth_mm"]),
                    "strike": strike,
                    "consecutive_strikes": int(event_streak[name]),
                    "suggested_cutoff": suggested_cutoff[name],
                }
            )

    qualified: list[dict[str, Any]] = []
    event_rows: list[dict[str, Any]] = []
    merged_wapug_candidates = _merge_windows(
        [
            (pd.Timestamp(e["start"]), pd.Timestamp(e["end"]))
            for events in gauge_events.values()
            for e in events
        ]
    )
    for event_index, (start, end) in enumerate(merged_wapug_candidates, 1):
        support: dict[str, dict[str, Any]] = {}
        for name, (frame, col, interval) in clean.items():
            cutoff = suggested_cutoff.get(name)
            if (
                bool(apply_fault_cutoff)
                and cutoff is not None
                and pd.Timestamp(start) >= pd.Timestamp(cutoff)
            ):
                continue
            value = _support_for_window(frame, col, start, end, interval)
            if bool(value["operational"]):
                support[name] = value
        depths = np.asarray(
            [float(v["depth_mm"]) for v in support.values()], dtype=float
        )
        mean_depth = float(np.mean(depths)) if len(depths) else np.nan
        cv = (
            float(np.std(depths, ddof=0) / mean_depth * 100.0)
            if len(depths) >= MIN_OPERATIONAL_GAUGES and mean_depth > 1e-12
            else np.nan
        )
        qualifies = bool(
            len(depths) >= MIN_OPERATIONAL_GAUGES
            and np.isfinite(cv)
            and cv <= NETWORK_CV_LIMIT_PERCENT
        )
        row = {
            "event": event_index,
            "start": start,
            "end": end,
            "duration_min": float((end - start).total_seconds() / 60.0),
            "operational_gauges": int(len(depths)),
            "mean_depth_mm": None
            if not np.isfinite(mean_depth)
            else mean_depth,
            "spatial_cv_percent": None if not np.isfinite(cv) else cv,
            "qualifies_network_wapug": qualifies,
            "gauge_depths_mm": {
                name: float(v["depth_mm"]) for name, v in support.items()
            },
        }
        event_rows.append(row)
        if qualifies:
            qualified.append(dict(row))

    daily_fault_history, dynamic_summary = _daily_fault_history(
        daily_rows, list(clean)
    )
    gauge_summary: list[dict[str, Any]] = []
    for name, table in daily_by_gauge.items():
        if table is None or table.empty:
            days = operational = 0
        else:
            days = int(len(table))
            operational = int(
                (
                    pd.to_numeric(
                        table["coverage_fraction"], errors="coerce"
                    )
                    >= OPERATIONAL_COVERAGE_FRACTION
                ).sum()
            )
        dyn = dynamic_summary.get(name, {})
        cutoff = suggested_cutoff.get(name)
        operational_coverage = float(operational / max(1, days))
        status = (
            "Amber"
            if cutoff is not None
            or dyn.get("current_dynamic_status") == "Faulty"
            or operational_coverage < OPERATIONAL_COVERAGE_FRACTION
            else "Green"
        )
        gauge_summary.append(
            {
                "gauge": name,
                "days_assessed": days,
                "operational_days": operational,
                "operational_coverage_percent": 100.0 * operational_coverage,
                "event_strike_count": int(
                    sum(
                        1
                        for x in event_fault_history
                        if x["gauge"] == name and x["strike"]
                    )
                ),
                "suggested_fault_cutoff": cutoff,
                **dyn,
                "status": status,
            }
        )

    return {
        "gauge_count": int(len(clean)),
        "criteria": {
            **preset,
            "population_above_50k": bool(population_above_50k),
            "operational_coverage_percent": OPERATIONAL_COVERAGE_FRACTION
            * 100.0,
            "spatial_cv_limit_percent": NETWORK_CV_LIMIT_PERCENT,
            "minimum_operational_gauges": MIN_OPERATIONAL_GAUGES,
            "daily_significant_rain_mm": DAILY_SIGNIFICANT_RAIN_MM,
            "fault_zero_tolerance_mm": FAULTY_ZERO_TOL_MM,
            "fault_other_wet_fraction": FAULTY_OTHER_WET_FRACTION,
            "fault_daily_rolling_window_days": FAULTY_ROLLING_WINDOW_DAYS,
            "fault_daily_strikes_in_window": FAULTY_STRIKES_IN_WINDOW,
            "apply_fault_cutoff": bool(apply_fault_cutoff),
        },
        "daily": daily_rows,
        "gauge_summary": gauge_summary,
        "fault_history": daily_fault_history,
        "event_fault_history": event_fault_history,
        "significant_windows": [
            {"event": i + 1, "start": a, "end": b}
            for i, (a, b) in enumerate(significant_windows)
        ],
        "candidate_wapug_events": event_rows,
        "qualified_wapug_events": qualified,
        "qualified_wapug_event_count": int(len(qualified)),
        "non_uniform_day_count": int(
            sum(
                1
                for row in daily_rows
                if row["uniform_within_limit"] is False
            )
        ),
        "dry_low_rain_days": int(
            sum(
                1
                for row in daily_rows
                if row["dry_low_rain_spell"] != "No"
            )
        ),
        "method": (
            "support-aware multi-gauge rainfall + population WAPUG + "
            "spatial CV + event/daily fault evidence"
        ),
    }


def _align_rain_to_timestamps(
    timestamps: pd.Series,
    rain_frame: pd.DataFrame,
    rain_col: str,
    rain_interval_min: float | None,
) -> pd.Series:
    target = pd.DataFrame(
        {"timestamp": pd.to_datetime(timestamps, errors="coerce")}
    )
    rain = _normalise_frame(rain_frame, rain_col)
    if target.empty or rain.empty:
        return pd.Series(np.nan, index=target.index, dtype=float)
    interval = (
        float(rain_interval_min)
        if rain_interval_min is not None
        else _median_step_minutes(rain["timestamp"])
    )
    tolerance = (
        pd.Timedelta(minutes=max(interval * 1.5, 1.0))
        if np.isfinite(interval) and interval > 0
        else None
    )
    merged = pd.merge_asof(
        target.sort_values("timestamp"),
        rain.rename(columns={rain_col: "_rain"}),
        on="timestamp",
        direction="backward",
        tolerance=tolerance,
    )
    return pd.Series(
        merged["_rain"].to_numpy(dtype=float), index=merged.index
    )


def _dry_mask_for_hydraulic_times(
    timestamps: pd.Series,
    aligned_rain_intensity: pd.Series,
    rain_frame: pd.DataFrame,
    rain_col: str,
    rain_interval_min: float | None,
) -> tuple[pd.Series, set[pd.Timestamp]]:
    daily = daily_rainfall_support(
        rain_frame,
        rain_col,
        semantics="intensity",
        declared_interval_minutes=rain_interval_min,
        max_gap_seconds=(
            float(rain_interval_min) * 90.0 if rain_interval_min else None
        ),
    )
    dry_days: set[pd.Timestamp] = set()
    if not daily.empty:
        for row in daily.itertuples(index=False):
            if (
                row.status == "complete"
                and float(row.coverage_fraction) >= 0.999999
                and float(row.depth_mm) <= DRY_DAY_RAIN_MM
            ):
                dry_days.add(pd.Timestamp(row.day))
    ts = pd.to_datetime(timestamps, errors="coerce")
    dt = _median_step_minutes(ts)
    aligned = pd.Series(
        pd.to_numeric(aligned_rain_intensity, errors="coerce").to_numpy(
            dtype=float
        ),
        index=ts,
    )
    if np.isfinite(dt) and dt > 0:
        incremental = aligned.clip(lower=0.0) * dt / 60.0
        recent = incremental.rolling(
            f"{ADP_HOURS}h", min_periods=1
        ).sum()
        recent_dry = recent.fillna(np.inf).eq(0.0)
    else:
        recent_dry = aligned.fillna(np.inf).eq(0.0)
    day_dry = pd.Series(
        [
            pd.Timestamp(t).floor("D") in dry_days
            if pd.notna(t)
            else False
            for t in ts
        ],
        index=ts,
    )
    return (day_dry & recent_dry).reset_index(drop=True), dry_days


def _diurnal_baseline(
    timestamps: pd.Series,
    values: pd.Series,
    dry_mask: pd.Series,
) -> pd.Series:
    ts = pd.to_datetime(timestamps, errors="coerce")
    vals = pd.to_numeric(values, errors="coerce")
    end = ts.max()
    if pd.isna(end):
        return pd.Series(np.nan, index=values.index, dtype=float)
    start = end - pd.Timedelta(days=BASELINE_WINDOW_DAYS)
    mask = (
        (ts >= start)
        & (ts <= end)
        & dry_mask.to_numpy(dtype=bool)
        & vals.notna()
    )
    dry_days = pd.Series(ts[mask]).dt.floor("D").nunique()
    if dry_days < MIN_DRY_DAYS_FOR_BASELINE:
        return pd.Series(np.nan, index=values.index, dtype=float)
    minute = ts.dt.hour * 60 + ts.dt.minute
    template = (
        pd.DataFrame({"minute": minute[mask], "value": vals[mask]})
        .groupby("minute")["value"]
        .median()
    )
    baseline = minute.map(template).astype(float)
    dt = _median_step_minutes(ts)
    if np.isfinite(dt) and dt > 0:
        window = max(1, int(round(BASELINE_SMOOTH_MIN / dt)))
        baseline = baseline.rolling(
            window=window, min_periods=1, center=True
        ).median()
    return baseline


def _longest_flatline_minutes(
    values: pd.Series, timestamps: pd.Series, tolerance: float
) -> float:
    """Return the longest contiguous near-constant run duration in minutes.

    This is intentionally equivalent to the original pair-by-pair scan, but
    uses NumPy arrays rather than pandas .iloc inside a Python loop. The helper
    is called repeatedly for each weekly channel and event-response window, so
    the vectorised form materially reduces Pyodide execution time without
    changing the flatline engineering criterion.
    """
    vals = pd.to_numeric(values, errors="coerce").to_numpy(dtype=float)
    if vals.size < 2:
        return 0.0

    ts = pd.to_datetime(timestamps, errors="coerce")
    ts_ns = ts.to_numpy(dtype="datetime64[ns]").astype("int64", copy=False)
    nat = np.iinfo(np.int64).min
    valid_ts = ts_ns != nat
    finite = np.isfinite(vals)
    same = (
        finite[:-1]
        & finite[1:]
        & valid_ts[:-1]
        & valid_ts[1:]
        & (np.abs(vals[1:] - vals[:-1]) <= float(tolerance))
    )
    if not bool(np.any(same)):
        return 0.0

    # A True run from pair index a..b means the constant-value point run spans
    # timestamps a..b+1, matching the former run_start=i-1 implementation.
    padded = np.concatenate(
        ([False], same.astype(bool, copy=False), [False])
    )
    changes = np.flatnonzero(padded[1:] != padded[:-1])
    starts = changes[0::2]
    ends = changes[1::2]  # point index at the end of each True pair run
    durations = (
        ts_ns[ends] - ts_ns[starts]
    ).astype(np.float64) / 60_000_000_000.0
    finite_duration = durations[np.isfinite(durations)]
    if finite_duration.size == 0:
        return 0.0
    return float(max(0.0, np.max(finite_duration)))


def _cross_corr_positive_lag(
    rain_increment: pd.Series,
    response: pd.Series,
    dt_minutes: float,
    max_lag_hours: float = MAX_LAG_HOURS,
) -> tuple[float | None, float | None]:
    """Return the strongest Pearson correlation for non-negative response lag.

    The original implementation rebuilt pandas slices and called np.corrcoef
    for every candidate lag. At 2-minute survey resolution and an 18-hour lag
    window that can mean 541 full passes per channel, per wet week. In Pyodide
    this dominates a multi-monitor Flow Survey assessment.

    This implementation evaluates the same pairwise-finite Pearson terms for all
    positive lags with FFT cross-correlations. The winning/near-tied candidates
    are then recomputed with the original direct np.corrcoef calculation so FFT
    rounding cannot change the selected engineering lag.
    """
    a = pd.to_numeric(rain_increment, errors="coerce").to_numpy(dtype=float)
    b = pd.to_numeric(response, errors="coerce").to_numpy(dtype=float)
    if a.size != b.size:
        raise ValueError("Rainfall and response series must have equal length.")
    n = int(a.size)
    if n < 5:
        return None, None

    max_steps = int(
        round(
            max_lag_hours
            * 60.0
            / max(float(dt_minutes), 1e-6)
        )
    )
    max_steps = min(max(0, max_steps), n - 1)
    lags = np.arange(max_steps + 1, dtype=int)
    positions = (n - 1) - lags

    finite_a = np.isfinite(a)
    finite_b = np.isfinite(b)
    mask_a = finite_a.astype(float)
    mask_b = finite_b.astype(float)
    a0 = np.where(finite_a, a, 0.0)
    b0 = np.where(finite_b, b, 0.0)
    a2 = a0 * a0
    b2 = b0 * b0

    full_size = 2 * n - 1
    fft_size = 1 << max(0, (full_size - 1).bit_length())

    fa = np.fft.rfft(a0, fft_size)
    fma = np.fft.rfft(mask_a, fft_size)
    fa2 = np.fft.rfft(a2, fft_size)
    fb_rev = np.fft.rfft(b0[::-1], fft_size)
    fmb_rev = np.fft.rfft(mask_b[::-1], fft_size)
    fb2_rev = np.fft.rfft(b2[::-1], fft_size)

    def cross_values(left_fft, right_fft):
        values = np.fft.irfft(
            left_fft * right_fft, fft_size
        )[:full_size]
        return values[positions]

    counts = np.rint(
        np.clip(cross_values(fma, fmb_rev), 0.0, None)
    ).astype(int)
    sum_a = cross_values(fa, fmb_rev)
    sum_b = cross_values(fma, fb_rev)
    sum_a2 = cross_values(fa2, fmb_rev)
    sum_b2 = cross_values(fma, fb2_rev)
    sum_ab = cross_values(fa, fb_rev)

    enough = counts >= 5
    safe_count = np.where(enough, counts, 1).astype(float)
    variance_a = np.maximum(
        0.0, sum_a2 - (sum_a * sum_a) / safe_count
    )
    variance_b = np.maximum(
        0.0, sum_b2 - (sum_b * sum_b) / safe_count
    )
    std_a = np.sqrt(variance_a / safe_count)
    std_b = np.sqrt(variance_b / safe_count)
    denominator = np.sqrt(variance_a * variance_b)

    usable = (
        enough
        & (std_a > 1e-12)
        & (std_b > 1e-12)
        & (denominator > 0.0)
    )
    correlations = np.full(max_steps + 1, np.nan, dtype=float)
    correlations[usable] = (
        sum_ab[usable]
        - (sum_a[usable] * sum_b[usable]) / safe_count[usable]
    ) / denominator[usable]
    correlations[usable] = np.clip(
        correlations[usable], -1.0, 1.0
    )

    finite_candidates = np.flatnonzero(np.isfinite(correlations))
    if finite_candidates.size == 0:
        return None, None

    approximate_best = float(
        np.nanmax(correlations[finite_candidates])
    )
    # Recheck near ties with the original direct calculation. This preserves
    # deterministic earliest-lag behaviour where correlations are effectively
    # equal while keeping the expensive direct work to a tiny candidate set.
    candidate_lags = finite_candidates[
        correlations[finite_candidates] >= approximate_best - 1e-8
    ]

    best_corr = -np.inf
    best_lag = 0
    for lag in candidate_lags:
        lag = int(lag)
        aa = a[:-lag] if lag else a
        bb = b[lag:] if lag else b
        valid = np.isfinite(aa) & np.isfinite(bb)
        if int(valid.sum()) < 5:
            continue
        av = aa[valid]
        bv = bb[valid]
        if np.std(av) <= 1e-12 or np.std(bv) <= 1e-12:
            continue
        corr = float(np.corrcoef(av, bv)[0, 1])
        if np.isfinite(corr) and corr > best_corr:
            best_corr = corr
            best_lag = lag

    if best_corr == -np.inf:
        return None, None
    return float(best_corr), float(best_lag * dt_minutes)


def _correlation_assessment(
    rain_increment: pd.Series,
    response: pd.Series,
    raw_response: pd.Series,
    dt_minutes: float,
    rain_total_mm: float,
    active_eps: float,
) -> dict[str, Any]:
    if float(rain_total_mm) < RAIN_MIN_MM_FOR_CORRELATION:
        return {"assessed": False, "reason": "rain < 5 mm"}
    steps = max(
        1,
        int(
            np.ceil(
                MAX_LAG_HOURS
                * 60.0
                / max(dt_minutes, 1e-6)
            )
        ),
    )
    wet = (
        pd.to_numeric(rain_increment, errors="coerce")
        .fillna(0.0)
        .ge(WET_MIN_RAIN_MM)
        .astype(int)
    )
    influence = wet.rolling(
        window=steps, min_periods=1
    ).sum().gt(0)
    valid = (
        influence
        & rain_increment.notna()
        & response.notna()
    )
    overlap = int(valid.sum())
    if overlap < WET_OVERLAP_MIN_POINTS:
        return {
            "assessed": False,
            "reason": "too few wet points",
            "wet_overlap": overlap,
        }
    raw = pd.to_numeric(
        raw_response, errors="coerce"
    )[valid]
    resp = pd.to_numeric(response, errors="coerce")[valid]
    rain = pd.to_numeric(
        rain_increment, errors="coerce"
    )[valid]
    raw_std = float(raw.std(skipna=True))
    resp_std = float(resp.std(skipna=True))
    if not np.isfinite(raw_std) or raw_std <= 1e-12:
        return {
            "assessed": False,
            "reason": "raw response too uniform",
            "wet_overlap": overlap,
        }
    if not np.isfinite(resp_std) or resp_std <= 1e-12:
        return {
            "assessed": False,
            "reason": "response too uniform",
            "wet_overlap": overlap,
        }
    active = (
        float((raw > float(active_eps)).mean())
        if len(raw)
        else 0.0
    )
    if active < ACTIVE_COVERAGE_FRACTION:
        return {
            "assessed": False,
            "reason": "insufficient active response",
            "wet_overlap": overlap,
            "active_fraction": active,
        }
    corr, lag = _cross_corr_positive_lag(
        rain.reset_index(drop=True),
        resp.reset_index(drop=True),
        dt_minutes,
    )
    return {
        "assessed": corr is not None,
        "reason": "" if corr is not None else "invalid correlation",
        "correlation": corr,
        "lag_minutes": lag,
        "wet_overlap": overlap,
        "active_fraction": active,
    }


def _segment_rain_events(
    rain_increment: pd.Series,
    timestamps: pd.Series,
    dt_minutes: float,
) -> list[tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp]]:
    r = pd.Series(
        pd.to_numeric(
            rain_increment, errors="coerce"
        ).fillna(0.0).to_numpy(dtype=float),
        index=pd.to_datetime(timestamps, errors="coerce"),
    )
    r = r[~r.index.isna()]
    if r.empty:
        return []
    wet = r > WET_MIN_RAIN_MM
    gap_steps = max(
        1,
        int(
            round(
                EVENT_GAP_MIN / max(dt_minutes, 1e-6)
            )
        ),
    )
    events = []
    i = 0
    while i < len(r):
        if not bool(wet.iloc[i]):
            i += 1
            continue
        start_i = i
        dry_run = 0
        i += 1
        while i < len(r):
            if bool(wet.iloc[i]):
                dry_run = 0
            else:
                dry_run += 1
            if dry_run >= gap_steps:
                end_i = max(start_i, i - dry_run)
                break
            i += 1
        else:
            end_i = len(r) - 1
        segment = r.iloc[start_i : end_i + 1]
        peak_time = segment.idxmax()
        events.append(
            (
                pd.Timestamp(r.index[start_i]),
                pd.Timestamp(r.index[end_i]),
                pd.Timestamp(peak_time),
            )
        )
        i = max(i + 1, end_i + 1)
    return events


def _event_linkage(
    values: pd.Series,
    raw_values: pd.Series,
    timestamps: pd.Series,
    rain_increment: pd.Series,
    dt_minutes: float,
    *,
    quantity: str,
    use_residual: bool,
) -> dict[str, Any]:
    events = _segment_rain_events(
        rain_increment, timestamps, dt_minutes
    )
    if not events:
        return {
            "events": 0,
            "linked": 0,
            "skipped": 0,
            "fraction": 0.0,
        }
    ts = pd.to_datetime(timestamps, errors="coerce")
    series = pd.Series(
        pd.to_numeric(values, errors="coerce").to_numpy(dtype=float),
        index=ts,
    )
    raw = pd.Series(
        pd.to_numeric(
            raw_values, errors="coerce"
        ).to_numpy(dtype=float),
        index=ts,
    )
    tolerance = (
        1e-4
        if quantity == "depth"
        else (1e-3 if quantity == "velocity" else 1e-6)
    )
    flat = _longest_flatline_minutes(
        raw.reset_index(drop=True),
        pd.Series(ts).reset_index(drop=True),
        tolerance,
    )
    if flat >= WEEK_FLATLINE_SUPPRESS_MIN:
        return {
            "events": 0,
            "linked": 0,
            "skipped": len(events),
            "fraction": 0.0,
            "week_suppressed": True,
        }

    kept = linked = skipped = 0
    rows = []
    for start, end, peak_time in events:
        response_end = peak_time + pd.Timedelta(
            hours=EVENT_LINK_WINDOW_HOURS
        )
        win = raw.loc[peak_time:response_end]
        flat_window = 0.0
        if not win.empty:
            flat_window = _longest_flatline_minutes(
                win.reset_index(drop=True),
                pd.Series(win.index).reset_index(drop=True),
                tolerance,
            )
        if (
            flat_window
            >= EVENT_LINK_WINDOW_HOURS
            * 60.0
            * EVENT_FLATLINE_OVERLAP_FRACTION
            and flat_window >= EVENT_FLATLINE_MIN
        ):
            skipped += 1
            rows.append(
                {
                    "rain_start": start,
                    "rain_peak": peak_time,
                    "linked": None,
                    "reason": "flatline overlap",
                }
            )
            continue
        kept += 1
        antecedent = series.loc[
            max(
                series.index.min(),
                peak_time - pd.Timedelta(hours=1),
            ) : peak_time
        ].dropna()
        post = series.loc[peak_time:response_end].dropna()
        if antecedent.empty or post.empty:
            rows.append(
                {
                    "rain_start": start,
                    "rain_peak": peak_time,
                    "linked": False,
                    "reason": "insufficient response support",
                }
            )
            continue
        reference = float(antecedent.min())
        rise = float(post.max() - reference)
        is_linked = False
        if quantity == "depth":
            threshold = (
                DEPTH_RISE_RESID_M
                if use_residual
                else DEPTH_RISE_RAW_M
            )
            is_linked = rise >= threshold
        elif quantity == "velocity":
            threshold = (
                VELOCITY_RISE_RESID_MS
                if use_residual
                else VELOCITY_RISE_RAW_MS
            )
            is_linked = rise >= threshold
        elif quantity == "flow":
            threshold = FLOW_RISE_ABS_MIN_M3S
            relative = rise / max(abs(reference), 1e-9)
            is_linked = (
                rise >= FLOW_RISE_ABS_MIN_M3S
                and relative >= FLOW_RISE_REL_MIN
            )
        else:
            threshold = np.nan
        if is_linked:
            linked += 1
        rows.append(
            {
                "rain_start": start,
                "rain_peak": peak_time,
                "response_end": response_end,
                "reference": reference,
                "rise": rise,
                "threshold": threshold,
                "linked": bool(is_linked),
            }
        )
    fraction = float(linked / kept) if kept else 0.0
    return {
        "events": kept,
        "linked": linked,
        "skipped": skipped,
        "fraction": fraction,
        "rows": rows,
    }


def _score_channel(
    values: pd.Series,
    *,
    active_eps: float,
    flatline_minutes: float,
    rain_total_mm: float,
    responsive: bool,
) -> int:
    x = pd.to_numeric(values, errors="coerce")
    coverage = float(x.notna().mean()) if len(x) else 0.0
    active = (
        float((x.dropna() > active_eps).mean())
        if x.notna().any()
        else 0.0
    )
    score = (
        round(50.0 * coverage)
        + round(15.0 * active)
        + 20
    )
    if flatline_minutes >= FLATLINE_SEV_MIN:
        score -= 15
    elif flatline_minutes >= FLATLINE_MOD_MIN:
        score -= 8
    if (1.0 - coverage) > 0.20:
        score -= 5
    score += (
        (15 if responsive else 2)
        if rain_total_mm >= RAIN_MIN_MM_FOR_CORRELATION
        else 8
    )
    return int(max(0, min(100, score)))


def _weekly_rag(
    rain_total_mm: float,
    coverage: dict[str, float],
    flatline: dict[str, float],
    responsive: dict[str, bool],
    expected: tuple[str, ...],
    short_week: bool,
) -> tuple[str, str]:
    severe = any(
        (1.0 - coverage.get(name, 0.0)) > 0.40
        for name in expected
    ) or any(
        flatline.get(name, 0.0) >= FLATLINE_SEV_MIN
        for name in expected
    )
    moderate = short_week or any(
        (1.0 - coverage.get(name, 0.0)) > 0.20
        for name in expected
    ) or any(
        flatline.get(name, 0.0) >= FLATLINE_MOD_MIN
        for name in expected
    )
    if severe:
        return (
            "Red",
            "Severe data-quality evidence (coverage or flatline).",
        )
    if rain_total_mm >= RAIN_MIN_MM_FOR_CORRELATION:
        if any(responsive.get(name, False) for name in expected):
            if moderate:
                return (
                    "Amber",
                    "Wet week shows hydraulic response, capped to Amber by moderate data-quality evidence.",
                )
            return (
                "Green",
                "Wet week with at least one expected hydraulic response.",
            )
        return (
            "Amber",
            "Wet week without sufficient event-linked response in the expected channels.",
        )
    if moderate:
        return (
            "Amber",
            "Low-rain week with moderate data-quality evidence.",
        )
    return (
        "Green",
        "Low-rain week with no major weekly data-quality evidence.",
    )


def monitor_weekly_assessment(
    hydraulic: pd.DataFrame,
    rain_frame: pd.DataFrame,
    *,
    rain_col: str,
    rain_interval_min: float | None = None,
    depth_col: str | None = None,
    velocity_col: str | None = None,
    flow_col: str | None = None,
    population_above_50k: bool = True,
    network_wapug_events: list[dict[str, Any]] | None = None,
    analysis_start: Any = None,
    analysis_end: Any = None,
    exclusions: list[Any] | None = None,
    rain_exclusions: list[Any] | None = None,
) -> dict[str, Any]:
    """Assess mapped FDV channels against mapped rainfall on a weekly basis."""
    if (
        hydraulic is None
        or getattr(hydraulic, "empty", True)
        or "timestamp" not in hydraulic.columns
    ):
        return {
            "weeks": [],
            "reason": "Hydraulic data unavailable.",
            "method": "monitor-weekly-v2",
        }
    hydraulic_exclusions = list(exclusions or [])
    rainfall_exclusions = (
        hydraulic_exclusions
        if rain_exclusions is None
        else list(rain_exclusions or [])
    )
    rain = _normalise_frame(rain_frame, rain_col)
    if not rain.empty and rainfall_exclusions:
        rain.loc[
            _exclusion_mask(rain["timestamp"], rainfall_exclusions),
            rain_col,
        ] = np.nan
    if rain.empty:
        return {
            "weeks": [],
            "reason": "Mapped rainfall unavailable.",
            "method": "monitor-weekly-v2",
        }

    use_cols = [
        c
        for c in [depth_col, velocity_col, flow_col]
        if c and c in hydraulic.columns
    ]
    if not use_cols:
        return {
            "weeks": [],
            "reason": "No mapped hydraulic channel available.",
            "method": "monitor-weekly-v2",
        }

    h = hydraulic[["timestamp", *use_cols]].copy()
    h["timestamp"] = pd.to_datetime(
        h["timestamp"], errors="coerce"
    )
    for col in use_cols:
        h[col] = pd.to_numeric(h[col], errors="coerce")
    h = (
        h.dropna(subset=["timestamp"])
        .sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
        .reset_index(drop=True)
    )
    if h.empty:
        return {
            "weeks": [],
            "reason": "No valid hydraulic timestamps.",
            "method": "monitor-weekly-v2",
        }

    h["_excluded"] = _exclusion_mask(h["timestamp"], hydraulic_exclusions)
    if bool(h["_excluded"].any()):
        for col in use_cols:
            h.loc[h["_excluded"], col] = np.nan

    dt_minutes = _median_step_minutes(h["timestamp"])
    if not np.isfinite(dt_minutes) or dt_minutes <= 0:
        dt_minutes = float(
            rain_interval_min
            or _median_step_minutes(rain["timestamp"])
            or 2.0
        )

    aligned_intensity = _align_rain_to_timestamps(
        h["timestamp"], rain, rain_col, rain_interval_min
    )
    aligned_increment = (
        pd.to_numeric(aligned_intensity, errors="coerce")
        * dt_minutes
        / 60.0
    )
    dry_mask, dry_days = _dry_mask_for_hydraulic_times(
        h["timestamp"],
        aligned_intensity,
        rain,
        rain_col,
        rain_interval_min,
    )

    channel_meta = {}
    if depth_col:
        channel_meta["depth"] = (
            depth_col,
            DEPTH_ACTIVE_EPS_M,
        )
    if velocity_col:
        channel_meta["velocity"] = (
            velocity_col,
            VELOCITY_ACTIVE_EPS_MS,
        )
    if flow_col:
        channel_meta["flow"] = (
            flow_col,
            FLOW_ACTIVE_EPS_M3S,
        )

    for quantity, (col, _) in channel_meta.items():
        if quantity in {"depth", "velocity"}:
            baseline = _diurnal_baseline(
                h["timestamp"], h[col], dry_mask
            )
            h[f"_{quantity}_baseline"] = baseline
            h[f"_{quantity}_residual"] = (
                pd.to_numeric(h[col], errors="coerce")
                - baseline
            )

    h["_rain_intensity"] = aligned_intensity.to_numpy(
        dtype=float
    )
    h["_rain_increment"] = aligned_increment.to_numpy(
        dtype=float
    )
    h["_week"] = (
        h["timestamp"]
        .dt.to_period("W-SUN")
        .dt.end_time
        .dt.floor("D")
    )

    preset = wapug_population_preset(population_above_50k)
    single_events = detect_rainfall_events(
        rain,
        intensity_col=rain_col,
        minimum_intensity=preset["minimum_intensity_mm_h"],
        minimum_intensity_duration_min=preset[
            "minimum_intensity_duration_min"
        ],
        minimum_depth_mm=preset["minimum_depth_mm"],
        minimum_event_duration_min=preset[
            "minimum_event_duration_min"
        ],
        dry_gap_min=preset["dry_gap_min"],
        semantics="intensity",
        declared_interval_minutes=rain_interval_min,
        max_gap_seconds=(
            float(rain_interval_min) * 90.0
            if rain_interval_min
            else None
        ),
    )
    wapug_events = (
        network_wapug_events
        if network_wapug_events
        else single_events
    )

    rows: list[dict[str, Any]] = []
    for week, g in h.groupby("_week"):
        g = g.copy().reset_index(drop=True)
        if g.empty:
            continue
        start = pd.Timestamp(g["timestamp"].min())
        end = pd.Timestamp(g["timestamp"].max())
        if analysis_start is not None and end < pd.Timestamp(analysis_start):
            continue
        if analysis_end is not None and start > pd.Timestamp(analysis_end):
            continue
        assessable = ~g["_excluded"].astype(bool)
        rain_total = float(
            pd.to_numeric(
                g.loc[assessable, "_rain_increment"], errors="coerce"
            )
            .fillna(0.0)
            .sum()
        )
        short_week = (
            float(
                (end - start).total_seconds() / 86400.0
            )
            <= 3.0
        )
        coverage: dict[str, float] = {}
        flatline: dict[str, float] = {}
        correlation: dict[str, dict[str, Any]] = {}
        linkage: dict[str, dict[str, Any]] = {}
        scores: dict[str, int] = {}
        methods: dict[str, str] = {}
        responsive: dict[str, bool] = {}

        for quantity, (col, active_eps) in channel_meta.items():
            raw = pd.to_numeric(g[col], errors="coerce")
            raw_assessable = raw.where(assessable)
            assessable_count = int(assessable.sum())
            coverage[quantity] = (
                float(raw_assessable.notna().sum() / assessable_count)
                if assessable_count
                else 0.0
            )
            tolerance = (
                1e-4
                if quantity == "depth"
                else (
                    1e-3
                    if quantity == "velocity"
                    else 1e-6
                )
            )
            flatline[quantity] = _longest_flatline_minutes(
                raw_assessable, g["timestamp"], tolerance
            )
            if quantity in {"depth", "velocity"}:
                residual_col = f"_{quantity}_residual"
                use_residual = (
                    residual_col in g.columns
                    and assessable_count > 0
                    and float(
                        g.loc[assessable, residual_col].notna().sum()
                        / assessable_count
                    )
                    > 0.60
                )
                response = (
                    pd.to_numeric(
                        g[residual_col], errors="coerce"
                    )
                    if use_residual
                    else raw
                )
                methods[quantity] = (
                    "residual"
                    if use_residual
                    else "raw"
                )
            else:
                response = raw
                use_residual = False
                methods[quantity] = "raw"

            response_assessable = pd.to_numeric(response, errors="coerce").where(assessable)
            rain_assessable = pd.to_numeric(
                g["_rain_increment"], errors="coerce"
            ).where(assessable)
            correlation[quantity] = _correlation_assessment(
                rain_assessable,
                response_assessable,
                raw_assessable,
                dt_minutes,
                rain_total,
                active_eps,
            )
            linkage[quantity] = _event_linkage(
                response_assessable,
                raw_assessable,
                g["timestamp"],
                rain_assessable,
                dt_minutes,
                quantity=quantity,
                use_residual=use_residual,
            )
            responsive[quantity] = bool(
                linkage[quantity].get("events", 0)
                >= LINK_MIN_EVENTS
                and float(
                    linkage[quantity].get(
                        "fraction", 0.0
                    )
                )
                >= LINK_MIN_FRACTION
            )
            scores[quantity] = _score_channel(
                raw_assessable,
                active_eps=active_eps,
                flatline_minutes=flatline[quantity],
                rain_total_mm=rain_total,
                responsive=responsive[quantity],
            )

        expected = tuple(channel_meta)
        rag, decision = _weekly_rag(
            rain_total,
            coverage,
            flatline,
            responsive,
            expected,
            short_week,
        )
        wapug_in_week = any(
            pd.Timestamp(e["start"]) <= end
            and pd.Timestamp(e["end"]) >= start
            for e in (wapug_events or [])
        )
        iw_suitable = (
            bool(
                rain_total
                >= RAIN_MIN_MM_FOR_CORRELATION
                and linkage.get("depth", {}).get(
                    "linked", 0
                )
                >= 1
            )
            if "depth" in linkage
            else False
        )

        def metric(quantity: str, key: str) -> Any:
            return (correlation.get(quantity) or {}).get(key)

        def link_metric(quantity: str, key: str) -> Any:
            return (linkage.get(quantity) or {}).get(key)

        rows.append(
            {
                "week_ending": pd.Timestamp(week),
                "start": start,
                "end": end,
                "rain_total_mm": rain_total,
                "wapug_storm": wapug_in_week,
                "iw_suitability": iw_suitable,
                "depth_coverage_percent": 100.0
                * coverage.get("depth", np.nan),
                "velocity_coverage_percent": 100.0
                * coverage.get("velocity", np.nan),
                "flow_coverage_percent": 100.0
                * coverage.get("flow", np.nan),
                "depth_correlation": metric(
                    "depth", "correlation"
                ),
                "depth_lag_min": metric(
                    "depth", "lag_minutes"
                ),
                "velocity_correlation": metric(
                    "velocity", "correlation"
                ),
                "velocity_lag_min": metric(
                    "velocity", "lag_minutes"
                ),
                "depth_linked_events": link_metric(
                    "depth", "linked"
                ),
                "depth_link_events": link_metric(
                    "depth", "events"
                ),
                "velocity_linked_events": link_metric(
                    "velocity", "linked"
                ),
                "velocity_link_events": link_metric(
                    "velocity", "events"
                ),
                "flow_linked_events": link_metric(
                    "flow", "linked"
                ),
                "flow_link_events": link_metric(
                    "flow", "events"
                ),
                "depth_score": scores.get("depth"),
                "velocity_score": scores.get("velocity"),
                "flow_score": scores.get("flow"),
                "depth_method": methods.get("depth"),
                "velocity_method": methods.get("velocity"),
                "rag": rag,
                "decision_path": decision,
                "dry_baseline_days_available": int(
                    len(dry_days)
                ),
                "excluded_samples": int(g["_excluded"].sum()),
                "assessable_samples": int(assessable.sum()),
                "diagnostics": {
                    "correlation": correlation,
                    "event_linkage": linkage,
                    "coverage": coverage,
                    "flatline_minutes": flatline,
                    "responsive": responsive,
                },
            }
        )

    return {
        "weeks": rows,
        "criteria": {
            **preset,
            "rain_min_mm_for_correlation": RAIN_MIN_MM_FOR_CORRELATION,
            "max_lag_hours": MAX_LAG_HOURS,
            "event_link_window_hours": EVENT_LINK_WINDOW_HOURS,
            "dry_day_rain_mm": DRY_DAY_RAIN_MM,
            "adp_hours": ADP_HOURS,
            "baseline_window_days": BASELINE_WINDOW_DAYS,
            "minimum_dry_days_for_baseline": MIN_DRY_DAYS_FOR_BASELINE,
            "link_min_events": LINK_MIN_EVENTS,
            "link_min_fraction": LINK_MIN_FRACTION,
        },
        "hydraulic_timestep_min": float(dt_minutes),
        "dry_baseline_days_available": int(len(dry_days)),
        "analysis_controls": {
            "start": analysis_start,
            "end": analysis_end,
            "hydraulic_exclusion_count": int(len(hydraulic_exclusions)),
            "rainfall_exclusion_count": int(len(rainfall_exclusions)),
            "excluded_samples_removed_from_coverage_denominator": True,
            "scoped_exclusions": True,
        },
        "method": (
            "weekly FDV QA + rainfall lag/correlation + "
            "dry-weather residuals + 18 h event linkage + evidence score/RAG"
        ),
    }
