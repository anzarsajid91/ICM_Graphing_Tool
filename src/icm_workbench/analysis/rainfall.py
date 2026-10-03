from __future__ import annotations

import numpy as np
import pandas as pd

from icm_workbench.analysis.exclusions import normalise_exclusions
from icm_workbench.analysis.validity import validity_summary


def _split_support_interval(start, end, exclusions):
    """Split one support interval into excluded and retained pieces."""
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    boundaries = {start, end}
    normalised = normalise_exclusions(exclusions)
    for exc in normalised:
        a = max(start, pd.Timestamp(exc.start))
        b = min(end, pd.Timestamp(exc.end))
        if b > a:
            boundaries.add(a)
            boundaries.add(b)
    ordered = sorted(boundaries)
    pieces = []
    for a, b in zip(ordered[:-1], ordered[1:]):
        if b <= a:
            continue
        midpoint = a + (b - a) / 2
        excluded = any(
            pd.Timestamp(exc.start) <= midpoint < pd.Timestamp(exc.end)
            for exc in normalised
        )
        pieces.append((a, b, excluded))
    return pieces



def rainfall_support_segments(
    rain: pd.DataFrame,
    value_col: str,
    *,
    semantics: str = "intensity",
    declared_interval_minutes: float | None = None,
    max_gap_seconds: float | None = None,
    exclusions=(),
) -> pd.DataFrame:
    """Return explicit, exclusion-aware rainfall support intervals.

    Intensity values are interval-average rates in mm/h. Incremental-depth
    values are interval depths in mm and are apportioned by elapsed support when
    an exclusion splits the source interval. Excluded time remains represented
    explicitly so valid + missing + unknown + excluded support is conserved.
    """
    columns = [
        "start",
        "end",
        "value",
        "support_seconds",
        "depth_mm",
        "valid",
        "status",
    ]
    if rain is None or getattr(rain, "empty", True) or value_col not in rain.columns:
        return pd.DataFrame(columns=columns)
    if semantics not in {"intensity", "incremental_depth"}:
        raise ValueError(f"Unsupported rainfall semantics: {semantics}")

    x = rain[["timestamp", value_col]].copy()
    x["timestamp"] = pd.to_datetime(x["timestamp"], errors="coerce")
    x[value_col] = pd.to_numeric(x[value_col], errors="coerce")
    x = (
        x.dropna(subset=["timestamp"])
        .sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
        .reset_index(drop=True)
    )
    if x.empty:
        return pd.DataFrame(columns=columns)

    declared_seconds = None
    if declared_interval_minutes is not None:
        declared_seconds = float(declared_interval_minutes) * 60.0
        if not np.isfinite(declared_seconds) or declared_seconds <= 0:
            raise ValueError("declared_interval_minutes must be positive")

    rows: list[dict] = []
    for i, row in x.iterrows():
        start = pd.Timestamp(row["timestamp"])
        if i + 1 < len(x):
            end = pd.Timestamp(x.iloc[i + 1]["timestamp"])
        elif declared_seconds is not None:
            end = start + pd.to_timedelta(declared_seconds, unit="s")
        else:
            continue

        full_support = float((end - start).total_seconds())
        if full_support <= 0:
            continue

        raw_value = row[value_col]
        finite = bool(pd.notna(raw_value) and np.isfinite(float(raw_value)))
        base_status = "valid"
        base_valid = finite
        if max_gap_seconds is not None and full_support > float(max_gap_seconds):
            base_valid = False
            base_status = "unknown"
        elif not finite:
            base_status = "missing"

        for piece_start, piece_end, excluded in _split_support_interval(
            start, end, exclusions
        ):
            support = float((piece_end - piece_start).total_seconds())
            if support <= 0:
                continue
            if excluded:
                rows.append(
                    {
                        "start": piece_start,
                        "end": piece_end,
                        "value": None if not finite else float(raw_value),
                        "support_seconds": support,
                        "depth_mm": np.nan,
                        "valid": False,
                        "status": "excluded",
                    }
                )
                continue

            depth = np.nan
            if base_valid:
                value = max(float(raw_value), 0.0)
                if semantics == "intensity":
                    depth = value * support / 3600.0
                else:
                    depth = value * support / full_support
            rows.append(
                {
                    "start": piece_start,
                    "end": piece_end,
                    "value": None if not finite else float(raw_value),
                    "support_seconds": support,
                    "depth_mm": depth,
                    "valid": base_valid,
                    "status": base_status,
                }
            )
    return pd.DataFrame(rows, columns=columns)


def rainfall_accumulation(
    rain: pd.DataFrame,
    value_col: str,
    *,
    semantics: str = "intensity",
    declared_interval_minutes: float | None = None,
    max_gap_seconds: float | None = None,
    exclusions=(),
) -> dict:
    """Accumulate rainfall with explicit support and exclusion accounting."""
    seg = rainfall_support_segments(
        rain,
        value_col,
        semantics=semantics,
        declared_interval_minutes=declared_interval_minutes,
        max_gap_seconds=max_gap_seconds,
        exclusions=exclusions,
    )
    if seg.empty:
        validity = validity_summary(requested_seconds=0.0, valid_seconds=0.0)
        return {
            "total_depth_mm": None,
            "valid_seconds": 0.0,
            "unknown_seconds": 0.0,
            "missing_seconds": 0.0,
            "excluded_seconds": 0.0,
            "requested_seconds": 0.0,
            "coverage_fraction": None,
            "status": "unavailable",
            "validity": validity,
            "segments": seg,
            "semantics": semantics,
            "declared_interval_minutes": declared_interval_minutes,
        }

    requested = float(seg["support_seconds"].sum())
    valid = float(seg.loc[seg["valid"], "support_seconds"].sum())
    missing = float(seg.loc[seg["status"].eq("missing"), "support_seconds"].sum())
    explicit_unknown = float(seg.loc[seg["status"].eq("unknown"), "support_seconds"].sum())
    excluded = float(seg.loc[seg["status"].eq("excluded"), "support_seconds"].sum())
    total = float(seg.loc[seg["valid"], "depth_mm"].sum())

    validity = validity_summary(
        requested_seconds=requested,
        valid_seconds=valid,
        excluded_seconds=excluded,
        missing_seconds=missing,
        unknown_seconds=explicit_unknown,
        uncovered_seconds=0.0,
    )
    return {
        "total_depth_mm": total if valid > 0 else None,
        "valid_seconds": valid,
        "unknown_seconds": float(validity["unknown_seconds"]),
        "missing_seconds": missing,
        "excluded_seconds": excluded,
        "requested_seconds": requested,
        "coverage_fraction": validity["coverage_fraction"],
        "status": validity["calculation_status"],
        "validity": validity,
        "segments": seg,
        "semantics": semantics,
        "declared_interval_minutes": declared_interval_minutes,
    }


def daily_rainfall_support(
    rain: pd.DataFrame,
    value_col: str,
    *,
    semantics: str = "intensity",
    declared_interval_minutes: float | None = None,
    max_gap_seconds: float | None = None,
    exclusions=(),
) -> pd.DataFrame:
    """Split rainfall support at midnight and return daily depth/coverage."""
    seg = rainfall_support_segments(
        rain,
        value_col,
        semantics=semantics,
        declared_interval_minutes=declared_interval_minutes,
        max_gap_seconds=max_gap_seconds,
        exclusions=exclusions,
    )
    columns = [
        "day",
        "depth_mm",
        "valid_seconds",
        "missing_seconds",
        "unknown_seconds",
        "excluded_seconds",
        "coverage_fraction",
        "status",
    ]
    if seg.empty:
        return pd.DataFrame(columns=columns)

    daily: dict[pd.Timestamp, dict[str, float]] = {}
    for row in seg.itertuples(index=False):
        cursor = pd.Timestamp(row.start)
        stop = pd.Timestamp(row.end)
        while cursor < stop:
            midnight = cursor.normalize() + pd.Timedelta(days=1)
            part_end = min(stop, midnight)
            seconds = float((part_end - cursor).total_seconds())
            day = cursor.normalize()
            rec = daily.setdefault(
                day,
                {
                    "depth_mm": 0.0,
                    "valid_seconds": 0.0,
                    "missing_seconds": 0.0,
                    "unknown_seconds": 0.0,
                    "excluded_seconds": 0.0,
                },
            )
            if bool(row.valid):
                rec["valid_seconds"] += seconds
                rec["depth_mm"] += float(row.depth_mm) * seconds / float(row.support_seconds)
            elif row.status == "missing":
                rec["missing_seconds"] += seconds
            elif row.status == "excluded":
                rec["excluded_seconds"] += seconds
            else:
                rec["unknown_seconds"] += seconds
            cursor = part_end

    rows = []
    for day in sorted(daily):
        rec = daily[day]
        represented = (
            rec["valid_seconds"]
            + rec["missing_seconds"]
            + rec["unknown_seconds"]
            + rec["excluded_seconds"]
        )
        uncovered = max(0.0, 86400.0 - represented)
        validity = validity_summary(
            requested_seconds=86400.0,
            valid_seconds=rec["valid_seconds"],
            excluded_seconds=rec["excluded_seconds"],
            missing_seconds=rec["missing_seconds"],
            unknown_seconds=rec["unknown_seconds"],
            uncovered_seconds=uncovered,
        )
        rows.append(
            {
                "day": day,
                "depth_mm": float(rec["depth_mm"]),
                "valid_seconds": float(rec["valid_seconds"]),
                "missing_seconds": float(rec["missing_seconds"]),
                "unknown_seconds": float(validity["unknown_seconds"]),
                "excluded_seconds": float(rec["excluded_seconds"]),
                "coverage_fraction": validity["coverage_fraction"],
                "status": validity["calculation_status"],
            }
        )
    return pd.DataFrame(rows, columns=columns)

def multi_gauge_rainfall_assessment(
    gauges: dict,
    *,
    operational_coverage_fraction: float = 0.90,
    variability_cv_limit_percent: float = 40.0,
    wet_day_threshold_mm: float = 2.0,
    zero_tolerance_mm: float = 0.01,
    other_gauges_wet_fraction: float = 0.60,
    strikes_required: int = 2,
    rolling_window_days: int = 7,
) -> dict:
    """Screen multi-gauge rainfall coverage, spatial CV and repeated zero response.

    ``gauges`` maps a gauge label to ``(frame, value_column, interval_minutes)``.
    Flags are review evidence only and never remove or impute source data.
    """
    daily_by_gauge={}
    for name,spec in gauges.items():
        frame,column,interval=spec
        daily=daily_rainfall_support(
            frame,column,semantics="intensity",declared_interval_minutes=interval,
            max_gap_seconds=(float(interval)*90.0 if interval else None),
        )
        if not daily.empty:daily_by_gauge[str(name)]=daily.set_index("day")
    if not daily_by_gauge:return {"gauge_count":0,"daily":[],"gauges":[],"method":"rainfall-qc-v1"}

    days=sorted(set().union(*(set(x.index) for x in daily_by_gauge.values())))
    daily_rows=[];strike_days={name:[] for name in daily_by_gauge}
    for day in days:
        operational={}
        for name,table in daily_by_gauge.items():
            if day not in table.index:continue
            row=table.loc[day]
            if isinstance(row,pd.DataFrame):row=row.iloc[-1]
            if float(row.get("coverage_fraction",0.0) or 0.0)>=float(operational_coverage_fraction):
                operational[name]=float(row.get("depth_mm",0.0) or 0.0)
        depths=np.asarray(list(operational.values()),dtype=float)
        mean=float(np.mean(depths)) if len(depths) else np.nan
        cv=float(np.std(depths,ddof=0)/mean*100.0) if len(depths)>=2 and mean>0 else np.nan
        uniform=None if not np.isfinite(cv) else bool(cv<=float(variability_cv_limit_percent))
        strikes=[]
        if len(operational)>=2 and np.isfinite(mean) and mean>=float(wet_day_threshold_mm):
            for name,depth in operational.items():
                others=[v for other,v in operational.items() if other!=name]
                wet_fraction=float(np.mean(np.asarray(others)>0.0)) if others else 0.0
                if depth<=float(zero_tolerance_mm) and wet_fraction>=float(other_gauges_wet_fraction):
                    strikes.append(name);strike_days[name].append(pd.Timestamp(day))
        daily_rows.append({"day":pd.Timestamp(day),"operational_gauges":len(operational),"network_mean_depth_mm":None if not np.isfinite(mean) else mean,"spatial_cv_percent":None if not np.isfinite(cv) else cv,"uniform_within_limit":uniform,"zero_response_gauges":strikes})

    gauge_rows=[]
    for name,table in daily_by_gauge.items():
        operational_days=int((pd.to_numeric(table["coverage_fraction"],errors="coerce")>=float(operational_coverage_fraction)).sum())
        strikes=sorted(strike_days[name]);repeated=False
        for day in strikes:
            count=sum(1 for other in strikes if day-pd.Timedelta(days=int(rolling_window_days)-1)<=other<=day)
            if count>=int(strikes_required):repeated=True;break
        gauge_rows.append({"gauge":name,"days_assessed":int(len(table)),"operational_days":operational_days,"operational_coverage_percent":100.0*operational_days/max(1,len(table)),"zero_response_strikes":len(strikes),"repeated_zero_response":repeated,"status":"Amber" if repeated or operational_days<len(table) else "Green"})
    return {"gauge_count":len(daily_by_gauge),"daily":daily_rows,"gauges":gauge_rows,"non_uniform_day_count":sum(1 for row in daily_rows if row["uniform_within_limit"] is False),"criteria":{"operational_coverage_percent":operational_coverage_fraction*100.0,"variability_cv_limit_percent":variability_cv_limit_percent,"wet_day_threshold_mm":wet_day_threshold_mm,"zero_tolerance_mm":zero_tolerance_mm,"other_gauges_wet_fraction":other_gauges_wet_fraction,"strikes_required":strikes_required,"rolling_window_days":rolling_window_days},"method":"support-aware daily depth; operational gauge CV; repeated zero-response screening"}
