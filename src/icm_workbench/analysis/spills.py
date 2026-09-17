from __future__ import annotations

from dataclasses import dataclass
import math
import numpy as np
import pandas as pd

from icm_workbench.analysis.exclusions import normalise_exclusions
from icm_workbench.domain import ExclusionPeriod


@dataclass(frozen=True)
class SpillInterval:
    start: pd.Timestamp
    end: pd.Timestamp
    duration_seconds: float

    def to_dict(self):
        return {"start": self.start, "end": self.end, "duration_seconds": self.duration_seconds}


def _subtract(start, end, exclusions):
    pieces = [(pd.Timestamp(start), pd.Timestamp(end))]
    for exc in normalise_exclusions(exclusions):
        es, ee = pd.Timestamp(exc.start), pd.Timestamp(exc.end)
        nxt = []
        for a, b in pieces:
            if ee <= a or es >= b:
                nxt.append((a, b))
                continue
            if es > a:
                nxt.append((a, min(es, b)))
            if ee < b:
                nxt.append((max(ee, a), b))
        pieces = [(a, b) for a, b in nxt if b > a]
    return pieces


def _merge(intervals):
    if not intervals:
        return []
    intervals = sorted((pd.Timestamp(a), pd.Timestamp(b)) for a, b in intervals if b > a)
    merged = [[intervals[0][0], intervals[0][1]]]
    for a, b in intervals[1:]:
        if a <= merged[-1][1] + pd.Timedelta(microseconds=1):
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return [SpillInterval(a, b, (b - a).total_seconds()) for a, b in merged]


def _valid_seconds_after_exclusions(a_ns, b_ns, exclusions):
    """Return covered seconds after subtracting already-normalised exclusions.

    ``a_ns`` and ``b_ns`` are non-overlapping valid source intervals in nanoseconds.
    This is intentionally vectorised because browser use routinely involves >1M rows.
    """
    if len(a_ns) == 0:
        return 0.0
    covered_ns = int(np.sum(b_ns - a_ns, dtype=np.int64))
    for exc in exclusions:
        es = int(pd.Timestamp(exc.start).value)
        ee = int(pd.Timestamp(exc.end).value)
        overlap = np.maximum(0, np.minimum(b_ns, ee) - np.maximum(a_ns, es))
        covered_ns -= int(np.sum(overlap, dtype=np.int64))
    return max(0.0, covered_ns / 1e9)


def detect_spill_intervals(df, value_col, threshold, *, start=None, end=None, max_gap_seconds=900.0, exclusions=()):
    """Detect physical spill intervals using linear threshold crossings.

    The previous implementation walked every pair with ``DataFrame.iloc``. That was
    correct for small data but prohibitively slow for million-row EDM/model exports in
    Pyodide. This implementation performs pair validity and threshold crossing with
    NumPy arrays, then only loops over the comparatively small number of merged spill
    events/exclusions. Numerical semantics are unchanged: gaps over ``max_gap_seconds``
    and missing values are unknown, exclusions are removed rather than treated as dry,
    and threshold crossings are linearly interpolated.
    """
    x = df[["timestamp", value_col]].copy()
    x["timestamp"] = pd.to_datetime(x["timestamp"], errors="coerce")
    x[value_col] = pd.to_numeric(x[value_col], errors="coerce")
    x = x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp", keep="last")

    if x.empty:
        return {
            "events": [],
            "unknown_seconds": 0.0,
            "excluded_seconds": 0.0,
            "analysis_seconds": 0.0,
            "assessable_seconds": 0.0,
            "coverage_fraction": 0.0,
            "status": "unavailable",
            "analysis_start": None,
            "analysis_end": None,
        }

    s = pd.Timestamp(start) if start is not None else pd.Timestamp(x["timestamp"].iloc[0])
    e = pd.Timestamp(end) if end is not None else pd.Timestamp(x["timestamp"].iloc[-1])
    if e <= s:
        raise ValueError("end must be after start")

    requested = float((e - s).total_seconds())
    ex = normalise_exclusions(exclusions)

    timestamps = x["timestamp"].to_numpy(dtype="datetime64[ns]").astype(np.int64)
    values = x[value_col].to_numpy(dtype=float)

    if len(timestamps) < 2:
        retained = sum((b - a).total_seconds() for a, b in _subtract(s, e, ex))
        excluded = requested - retained
        assessable = max(0.0, requested - excluded)
        return {
            "events": [],
            "unknown_seconds": float(assessable),
            "excluded_seconds": float(excluded),
            "analysis_seconds": requested,
            "assessable_seconds": float(assessable),
            "coverage_fraction": 0.0,
            "status": "partial" if assessable > 0 else "unavailable",
            "threshold": float(threshold),
            "method": "instantaneous-linear-threshold-v2-vectorised",
            "analysis_start": s,
            "analysis_end": e,
        }

    t0 = timestamps[:-1]
    t1 = timestamps[1:]
    v0 = values[:-1]
    v1 = values[1:]
    s_ns = int(s.value)
    e_ns = int(e.value)
    a_ns = np.maximum(t0, s_ns)
    b_ns = np.minimum(t1, e_ns)
    dt_ns = t1 - t0
    max_gap_ns = int(float(max_gap_seconds) * 1e9)

    valid = (
        (b_ns > a_ns)
        & (dt_ns > 0)
        & (dt_ns <= max_gap_ns)
        & np.isfinite(v0)
        & np.isfinite(v1)
    )
    valid_a = a_ns[valid]
    valid_b = b_ns[valid]
    valid_seconds = _valid_seconds_after_exclusions(valid_a, valid_b, ex)

    pair_index = np.flatnonzero(valid)
    candidate_intervals = []
    if len(pair_index):
        p_t0 = t0[pair_index]
        p_t1 = t1[pair_index]
        p_a = a_ns[pair_index]
        p_b = b_ns[pair_index]
        p_v0 = v0[pair_index]
        p_v1 = v1[pair_index]

        above0 = p_v0 >= float(threshold)
        above1 = p_v1 >= float(threshold)
        any_above = above0 | above1
        starts = p_t0.copy()
        stops = p_t1.copy()

        crossing = above0 ^ above1
        denominator = p_v1 - p_v0
        fraction = np.zeros_like(p_v0, dtype=float)
        usable_crossing = crossing & (denominator != 0)
        fraction[usable_crossing] = np.clip(
            (float(threshold) - p_v0[usable_crossing]) / denominator[usable_crossing],
            0.0,
            1.0,
        )
        # Pandas timestamps use nanosecond resolution. Flooring provides stable,
        # deterministic crossing timestamps without manufacturing time beyond a pair.
        crossing_ns = p_t0 + np.floor((p_t1 - p_t0) * fraction).astype(np.int64)
        starts = np.where(crossing & (~above0), crossing_ns, starts)
        stops = np.where(crossing & above0, crossing_ns, stops)
        starts = np.maximum(starts, p_a)
        stops = np.minimum(stops, p_b)

        keep = any_above & (stops > starts)
        starts = starts[keep]
        stops = stops[keep]

        if len(starts):
            # Source pairs are ordered and non-overlapping. Collapse adjacent candidate
            # pieces before applying exclusions; this avoids constructing one Python
            # object per raw timestep during long spills.
            group_starts = np.flatnonzero(np.r_[True, starts[1:] > stops[:-1] + 1000])
            merged_starts = starts[group_starts]
            merged_stops = np.maximum.reduceat(stops, group_starts)
            for aa, bb in zip(merged_starts, merged_stops):
                candidate_intervals.extend(_subtract(pd.Timestamp(int(aa)), pd.Timestamp(int(bb)), ex))

    events = _merge(candidate_intervals)
    retained = sum((b - a).total_seconds() for a, b in _subtract(s, e, ex))
    excluded = requested - retained
    assessable = max(0.0, requested - excluded)
    unknown = max(0.0, assessable - valid_seconds)
    coverage = min(1.0, valid_seconds / assessable) if assessable > 0 else 0.0

    return {
        "events": [ev.to_dict() for ev in events],
        "unknown_seconds": float(unknown),
        "excluded_seconds": float(excluded),
        "analysis_seconds": requested,
        "assessable_seconds": float(assessable),
        "coverage_fraction": float(coverage) if assessable > 0 else None,
        "valid_seconds": float(valid_seconds),
        "requested_coverage_fraction": valid_seconds / requested,
        "status": "unavailable" if valid_seconds <= 1e-6 else ("complete" if unknown <= 1e-6 else "partial"),
        "threshold": float(threshold),
        "method": "instantaneous-linear-threshold-v2-vectorised",
        "analysis_start": s,
        "analysis_end": e,
    }


def _ceil_positive(x):
    return int(math.ceil(float(x))) if x > 0 else 0


def apply_12_24_counting(events):
    rows = []
    prev_E = None
    prev_F = 0
    prev_G = None
    for idx, event in enumerate(sorted(events, key=lambda e: pd.Timestamp(e["start"]))):
        A, B = pd.Timestamp(event["start"]), pd.Timestamp(event["end"])
        C = max(0.0, (B - A).total_seconds() / 60.0)
        D = A + pd.Timedelta(hours=12) if C < 720 else A + pd.Timedelta(hours=12) + pd.Timedelta(days=_ceil_positive((C - 720) / 1440))
        if idx == 0:
            E, F, G, J = D, 1, A.year, (0 if C == 0 else (1 if C < 720 else _ceil_positive(((C - 720) / 1440) + 1)))
        else:
            if (A - prev_E) > pd.Timedelta(days=1):
                E = D
            elif B < prev_E:
                E = prev_E
            elif B < (prev_E + pd.Timedelta(days=1)):
                E = prev_E + pd.Timedelta(days=1)
            else:
                E = prev_E + pd.Timedelta(days=_ceil_positive((B - prev_E).total_seconds() / 86400))
            F = prev_F + 1 if A > (prev_E + pd.Timedelta(days=1)) else prev_F
            G = A.year if (F == prev_F or A.year != prev_G) else prev_G
            if F != prev_F:
                J = 1 if C < 720 else _ceil_positive(((C - 720) / 1440) + 1)
            else:
                J = 0 if E == prev_E else (1 if B == prev_E else _ceil_positive((B - prev_E).total_seconds() / 86400))
        rows.append({
            "spill_start": A,
            "spill_stop": B,
            "duration_min": C,
            "block_end_this": E,
            "spill_event": F,
            "year_start": int(G),
            "month_start": int(A.month),
            "spills": int(J),
        })
        prev_E, prev_F, prev_G = E, F, G
    return pd.DataFrame(rows)


def monthly_spill_durations(events):
    totals = {}
    for event in events:
        start, end = pd.Timestamp(event["start"]), pd.Timestamp(event["end"])
        cursor = start
        while cursor < end:
            stop = min(end, (cursor.to_period("M") + 1).start_time)
            key = (cursor.year, cursor.month)
            totals[key] = totals.get(key, 0.0) + (stop - cursor).total_seconds() / 3600.0
            cursor = stop
    return pd.DataFrame(
        [{"year": y, "month": m, "duration_hours": h} for (y, m), h in sorted(totals.items())],
        columns=["year", "month", "duration_hours"],
    )


def monthly_spill_counts(counting):
    if counting is None or counting.empty:
        return pd.DataFrame(columns=["year", "month", "spill_count"])
    return (
        counting.groupby(["year_start", "month_start"], as_index=False)["spills"]
        .sum()
        .rename(columns={"year_start": "year", "month_start": "month", "spills": "spill_count"})
    )


def yearly_spill_summary(counts, durations, start, end):
    """Return one row per calendar year, including years with zero spills."""
    if start is None or end is None:
        return pd.DataFrame(columns=["year", "spill_count", "duration_hours"])
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    count_map = {}
    duration_map = {}
    if counts is not None and not counts.empty:
        count_map = counts.groupby("year")["spill_count"].sum().to_dict()
    if durations is not None and not durations.empty:
        duration_map = durations.groupby("year")["duration_hours"].sum().to_dict()
    return pd.DataFrame([
        {
            "year": int(year),
            "spill_count": int(count_map.get(year, 0)),
            "duration_hours": float(duration_map.get(year, 0.0)),
        }
        for year in range(int(s.year), int((e - pd.Timedelta(nanoseconds=1)).year) + 1)
    ])


def spill_assessment(df, value_col, threshold, *, start=None, end=None, max_gap_seconds=900.0, exclusions=()):
    physical = detect_spill_intervals(
        df,
        value_col,
        threshold,
        start=start,
        end=end,
        max_gap_seconds=max_gap_seconds,
        exclusions=exclusions,
    )
    counting = apply_12_24_counting(physical["events"])
    durations = monthly_spill_durations(physical["events"])
    counts = monthly_spill_counts(counting)
    yearly = yearly_spill_summary(counts, durations, physical.get("analysis_start"), physical.get("analysis_end"))
    # Count uncertainty is separate from physical coverage. Exclusions cannot
    # establish a dry reset; compatibility counts are provisional in masked windows.
    def count_status(p):
        if p["status"] == "unavailable":
            return "unavailable"
        if p["unknown_seconds"] > 1e-6:
            return "partial/unknown-gap"
        if p["excluded_seconds"] > 1e-6:
            return "partial/excluded-window"
        return "definitive"

    yearly_rows = []
    for row in yearly.to_dict("records"):
        year = row["year"]
        ys = max(pd.Timestamp(physical["analysis_start"]), pd.Timestamp(year=year, month=1, day=1))
        ye = min(pd.Timestamp(physical["analysis_end"]), pd.Timestamp(year=year+1, month=1, day=1))
        coverage = detect_spill_intervals(df, value_col, threshold, start=ys, end=ye,
                                         max_gap_seconds=max_gap_seconds, exclusions=exclusions)
        valid = coverage.get("valid_seconds", 0.0)
        status = count_status(coverage)
        row.update(requested_hours=coverage["analysis_seconds"]/3600,
                   valid_hours=valid/3600, unknown_hours=coverage["unknown_seconds"]/3600,
                   excluded_hours=coverage["excluded_seconds"]/3600,
                   eligible_coverage=coverage["coverage_fraction"],
                   requested_coverage=valid/coverage["analysis_seconds"],
                   count_status=status)
        if status == "unavailable":
            row["spill_count"] = None
            row["duration_hours"] = None
        yearly_rows.append(row)
    yearly = pd.DataFrame(yearly_rows)
    return {
        **physical,
        "counting_windows": counting,
        "monthly_counts": counts,
        "monthly_durations": durations,
        "yearly_summary": yearly,
        "total_spill_count": None if physical["status"] == "unavailable" else (int(counting["spills"].sum()) if not counting.empty else 0),
        "total_spill_duration_hours": float(sum(e["duration_seconds"] for e in physical["events"]) / 3600.0),
        "count_status": count_status(physical),
        "count_policy": "compatibility-12-24; masked or unknown windows provisional; wall-clock retained",
        "exclusion_audit": [e.to_dict() for e in exclusions],
    }
