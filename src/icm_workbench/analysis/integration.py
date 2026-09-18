from __future__ import annotations

import pandas as pd

from icm_workbench.analysis.exclusions import (
    interval_excluded_seconds,
    normalise_exclusions,
)
from icm_workbench.analysis.validity import validity_summary


def _linear(v0, v1, f):
    return v0 + (v1 - v0) * f


def _subtract(a, b, exclusions):
    pieces = [(pd.Timestamp(a), pd.Timestamp(b))]
    for exc in normalise_exclusions(exclusions):
        es, ee = pd.Timestamp(exc.start), pd.Timestamp(exc.end)
        nxt = []
        for p, q in pieces:
            if ee <= p or es >= q:
                nxt.append((p, q))
                continue
            if es > p:
                nxt.append((p, min(es, q)))
            if ee < q:
                nxt.append((max(ee, p), q))
        pieces = [(p, q) for p, q in nxt if q > p]
    return pieces


def _positive_linear(va, vb, seconds):
    if va <= 0 and vb <= 0:
        return 0.0
    if va >= 0 and vb >= 0:
        return (va + vb) * 0.5 * seconds
    frac = abs(va) / (abs(va) + abs(vb))
    return 0.5 * vb * seconds * (1 - frac) if va < 0 else 0.5 * va * seconds * frac


def integrate_series(
    df: pd.DataFrame,
    value_col: str,
    start,
    end,
    *,
    semantics="instantaneous",
    max_gap_seconds=900.0,
    exclusions=(),
    positive_only=False,
) -> dict:
    """Integrate a series while preserving disjoint support/validity accounting.

    Excluded time is removed from the requested domain before valid/gap coverage
    is classified. This prevents an excluded interval that overlaps missing data
    from being double-counted as both excluded and unknown.
    """
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    if e <= s:
        raise ValueError("end must be after start")
    if semantics not in {"instantaneous", "interval_average"}:
        raise ValueError(f"Unsupported semantics: {semantics}")

    requested_seconds = float((e - s).total_seconds())
    exclusions = normalise_exclusions(exclusions)
    excluded_seconds = float(interval_excluded_seconds(s, e, exclusions))

    x = df[["timestamp", value_col]].copy()
    x["timestamp"] = pd.to_datetime(x.timestamp, errors="coerce")
    x[value_col] = pd.to_numeric(x[value_col], errors="coerce")
    x = (
        x.dropna(subset=["timestamp"])
        .sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
    )

    total = 0.0
    valid_seconds = 0.0
    gap_seconds = 0.0
    segments = []

    for i in range(len(x) - 1):
        t0, t1 = pd.Timestamp(x.iloc[i].timestamp), pd.Timestamp(x.iloc[i + 1].timestamp)
        v0, v1 = x.iloc[i][value_col], x.iloc[i + 1][value_col]
        dt = float((t1 - t0).total_seconds())
        if dt <= 0:
            continue

        a, b = max(t0, s), min(t1, e)
        if b <= a:
            continue

        support = float((b - a).total_seconds())
        pieces = _subtract(a, b, exclusions)
        retained_seconds = float(sum((q - p).total_seconds() for p, q in pieces))
        pair_excluded_seconds = max(0.0, support - retained_seconds)

        invalid_pair = (
            dt > float(max_gap_seconds)
            or pd.isna(v0)
            or (semantics == "instantaneous" and pd.isna(v1))
        )
        if invalid_pair:
            gap_seconds += retained_seconds
            segments.append(
                {
                    "start": a,
                    "end": b,
                    "support_seconds": support,
                    "valid_seconds": 0.0,
                    "gap_seconds": retained_seconds,
                    "excluded_seconds": pair_excluded_seconds,
                    "contribution": 0.0,
                    "status": "unknown",
                }
            )
            continue

        segment_total = 0.0
        for p, q in pieces:
            seconds = float((q - p).total_seconds())
            if semantics == "interval_average":
                val = max(float(v0), 0.0) if positive_only else float(v0)
                contrib = val * seconds
            else:
                fp = float((p - t0).total_seconds()) / dt
                fq = float((q - t0).total_seconds()) / dt
                vp = _linear(float(v0), float(v1), fp)
                vq = _linear(float(v0), float(v1), fq)
                contrib = (
                    _positive_linear(vp, vq, seconds)
                    if positive_only
                    else (vp + vq) * 0.5 * seconds
                )
            total += contrib
            segment_total += contrib
            valid_seconds += seconds

        segments.append(
            {
                "start": a,
                "end": b,
                "support_seconds": support,
                "valid_seconds": retained_seconds,
                "gap_seconds": 0.0,
                "excluded_seconds": pair_excluded_seconds,
                "contribution": segment_total,
                "status": "valid" if retained_seconds > 0 else "excluded",
            }
        )

    assessable_seconds = max(0.0, requested_seconds - excluded_seconds)
    uncovered_seconds = max(0.0, assessable_seconds - valid_seconds - gap_seconds)
    validity = validity_summary(
        requested_seconds=requested_seconds,
        valid_seconds=valid_seconds,
        excluded_seconds=excluded_seconds,
        unknown_seconds=gap_seconds,
        uncovered_seconds=uncovered_seconds,
    )

    return {
        "integral": float(total),
        "requested_seconds": requested_seconds,
        "valid_seconds": float(valid_seconds),
        "excluded_seconds": float(excluded_seconds),
        "gap_seconds": float(gap_seconds),
        "uncovered_seconds": float(uncovered_seconds),
        "coverage_fraction": validity["coverage_fraction"],
        "status": validity["calculation_status"],
        "validity": validity,
        "segments": segments,
        "semantics": semantics,
    }


def split_interval_by_month(start, end):
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    out = []
    cursor = s
    while cursor < e:
        stop = min(e, (cursor.to_period("M") + 1).start_time)
        out.append((cursor, stop))
        cursor = stop
    return out
