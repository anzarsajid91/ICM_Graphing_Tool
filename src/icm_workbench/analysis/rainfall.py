from __future__ import annotations

import numpy as np
import pandas as pd

from icm_workbench.analysis.validity import validity_summary


def rainfall_support_segments(
    rain: pd.DataFrame,
    value_col: str,
    *,
    semantics: str = "intensity",
    declared_interval_minutes: float | None = None,
    max_gap_seconds: float | None = None,
) -> pd.DataFrame:
    """Return explicit rainfall support intervals.

    Intensity values are treated as interval-average rates in mm/h and are
    integrated over each actual timestamp interval. Incremental-depth values
    are treated as interval depths in mm. The final intensity sample is only
    assigned support when a declared regular interval is supplied.
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

        support = float((end - start).total_seconds())
        if support <= 0:
            continue

        value = row[value_col]
        status = "valid"
        valid = bool(pd.notna(value))
        if max_gap_seconds is not None and support > float(max_gap_seconds):
            valid = False
            status = "unknown"
        elif not valid:
            status = "missing"

        depth = np.nan
        if valid:
            v = max(float(value), 0.0)
            if semantics == "intensity":
                depth = v * support / 3600.0
            else:
                depth = v

        rows.append(
            {
                "start": start,
                "end": end,
                "value": None if pd.isna(value) else float(value),
                "support_seconds": support,
                "depth_mm": depth,
                "valid": valid,
                "status": status,
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
) -> dict:
    """Accumulate rainfall with explicit support and the common validity model."""
    seg = rainfall_support_segments(
        rain,
        value_col,
        semantics=semantics,
        declared_interval_minutes=declared_interval_minutes,
        max_gap_seconds=max_gap_seconds,
    )
    if seg.empty:
        validity = validity_summary(requested_seconds=0.0, valid_seconds=0.0)
        return {
            "total_depth_mm": None,
            "valid_seconds": 0.0,
            "unknown_seconds": 0.0,
            "missing_seconds": 0.0,
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
    explicit_unknown = float(seg.loc[seg["status"].eq("unknown_gap"), "support_seconds"].sum())
    total = float(seg.loc[seg["valid"], "depth_mm"].sum())

    validity = validity_summary(
        requested_seconds=requested,
        valid_seconds=valid,
        missing_seconds=missing,
        unknown_seconds=explicit_unknown,
        uncovered_seconds=0.0,
    )
    return {
        "total_depth_mm": total if valid > 0 else None,
        "valid_seconds": valid,
        # Preserve the legacy aggregate while exposing the detailed state split.
        "unknown_seconds": max(0.0, requested - valid),
        "missing_seconds": missing,
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
) -> pd.DataFrame:
    """Split rainfall support at midnight and return daily depth/coverage."""
    seg = rainfall_support_segments(
        rain,
        value_col,
        semantics=semantics,
        declared_interval_minutes=declared_interval_minutes,
        max_gap_seconds=max_gap_seconds,
    )
    columns = [
        "day",
        "depth_mm",
        "valid_seconds",
        "missing_seconds",
        "unknown_seconds",
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
                },
            )
            if bool(row.valid):
                rec["valid_seconds"] += seconds
                if semantics == "intensity":
                    rec["depth_mm"] += max(float(row.value), 0.0) * seconds / 3600.0
                else:
                    rec["depth_mm"] += (
                        float(row.depth_mm) * seconds / float(row.support_seconds)
                    )
            elif row.status == "missing":
                rec["missing_seconds"] += seconds
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
        )
        uncovered = max(0.0, 86400.0 - represented)
        validity = validity_summary(
            requested_seconds=86400.0,
            valid_seconds=rec["valid_seconds"],
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
                "coverage_fraction": validity["coverage_fraction"],
                "status": validity["calculation_status"],
            }
        )
    return pd.DataFrame(rows, columns=columns)
