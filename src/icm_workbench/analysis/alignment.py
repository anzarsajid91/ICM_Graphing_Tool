from __future__ import annotations

import pandas as pd

from .exclusions import interval_excluded_seconds, normalise_exclusions
from .validity import validity_summary


def _subtract_interval(start, end, exclusions):
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


def _valid_segments(df, value_col, max_gap_seconds):
    x = df[["timestamp", value_col]].copy()
    x["timestamp"] = pd.to_datetime(x["timestamp"], errors="coerce")
    x[value_col] = pd.to_numeric(x[value_col], errors="coerce")
    x = (
        x.dropna(subset=["timestamp"])
        .sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
    )
    if x.empty:
        return []
    invalid = x[value_col].isna()
    dt = x["timestamp"].diff().dt.total_seconds()
    breaks = invalid | invalid.shift(fill_value=False) | dt.gt(float(max_gap_seconds))
    group = breaks.cumsum()
    return [
        g.dropna(subset=[value_col]).copy()
        for _, g in x.groupby(group)
        if not g.dropna(subset=[value_col]).empty
    ]


def interpolate_without_bridging(source, target_times, value_col, max_gap_seconds):
    result = pd.Series(index=target_times, dtype=float)
    for segment in _valid_segments(source, value_col, max_gap_seconds):
        if len(segment) == 1:
            t = pd.Timestamp(segment.iloc[0]["timestamp"])
            if t in result.index:
                result.loc[t] = float(segment.iloc[0][value_col])
            continue
        s0, s1 = segment["timestamp"].iloc[0], segment["timestamp"].iloc[-1]
        wanted = target_times[(target_times >= s0) & (target_times <= s1)]
        if len(wanted) == 0:
            continue
        base = segment.set_index("timestamp")[[value_col]]
        union = base.index.union(wanted).sort_values()
        vals = (
            base.reindex(union)
            .interpolate(method="time", limit_area="inside")
            .reindex(wanted)[value_col]
        )
        result.loc[wanted] = vals.to_numpy()
    return result


def pair_series(
    observed,
    modelled,
    obs_col,
    model_col,
    max_gap_seconds=900.0,
    start=None,
    end=None,
):
    obs = observed[["timestamp", obs_col]].copy()
    mod = modelled[["timestamp", model_col]].copy()
    for d, c in ((obs, obs_col), (mod, model_col)):
        d["timestamp"] = pd.to_datetime(d["timestamp"], errors="coerce")
        d[c] = pd.to_numeric(d[c], errors="coerce")
        d.dropna(subset=["timestamp"], inplace=True)
        d.sort_values("timestamp", inplace=True)
        d.drop_duplicates("timestamp", keep="last", inplace=True)
    if start is not None:
        obs = obs[obs.timestamp >= pd.Timestamp(start)]
        mod = mod[mod.timestamp >= pd.Timestamp(start)]
    if end is not None:
        obs = obs[obs.timestamp <= pd.Timestamp(end)]
        mod = mod[mod.timestamp <= pd.Timestamp(end)]
    obs = obs.dropna(subset=[obs_col])
    if obs.empty or mod.empty:
        return pd.DataFrame(columns=["timestamp", "obs", "sim"])
    a = max(obs.timestamp.min(), mod.timestamp.min())
    b = min(obs.timestamp.max(), mod.timestamp.max())
    obs = obs[(obs.timestamp >= a) & (obs.timestamp <= b)]
    target = pd.DatetimeIndex(obs.timestamp)
    sim = interpolate_without_bridging(mod, target, model_col, max_gap_seconds)
    return pd.DataFrame(
        {"timestamp": target, "obs": obs[obs_col].to_numpy(), "sim": sim.to_numpy()}
    ).dropna(subset=["obs", "sim"])


def time_coverage(
    df,
    value_col,
    start,
    end,
    max_gap_seconds=900.0,
    exclusions=(),
):
    """Return disjoint support coverage using the common validity-state contract."""
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    requested = max(float((e - s).total_seconds()), 0.0)
    if requested <= 0:
        validity = validity_summary(requested_seconds=0.0, valid_seconds=0.0)
        return {
            "requested_seconds": 0.0,
            "valid_seconds": 0.0,
            "missing_seconds": 0.0,
            "unknown_seconds": 0.0,
            "excluded_seconds": 0.0,
            "uncovered_seconds": 0.0,
            "coverage_fraction": None,
            "status": "unavailable",
            "validity": validity,
        }

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

    valid_seconds = 0.0
    missing_seconds = 0.0
    unknown_seconds = 0.0
    for i in range(len(x) - 1):
        t0 = pd.Timestamp(x.iloc[i]["timestamp"])
        t1 = pd.Timestamp(x.iloc[i + 1]["timestamp"])
        dt = float((t1 - t0).total_seconds())
        if dt <= 0:
            continue
        a, b = max(t0, s), min(t1, e)
        if b <= a:
            continue
        retained = float(
            sum(
                (q - p).total_seconds()
                for p, q in _subtract_interval(a, b, exclusions)
            )
        )
        if retained <= 0:
            continue
        v0 = x.iloc[i][value_col]
        v1 = x.iloc[i + 1][value_col]
        if dt > float(max_gap_seconds):
            unknown_seconds += retained
        elif pd.isna(v0) or pd.isna(v1):
            missing_seconds += retained
        else:
            valid_seconds += retained

    assessable = max(0.0, requested - excluded_seconds)
    uncovered_seconds = max(
        0.0,
        assessable - valid_seconds - missing_seconds - unknown_seconds,
    )
    validity = validity_summary(
        requested_seconds=requested,
        valid_seconds=valid_seconds,
        excluded_seconds=excluded_seconds,
        missing_seconds=missing_seconds,
        unknown_seconds=unknown_seconds,
        uncovered_seconds=uncovered_seconds,
    )
    return {
        "requested_seconds": requested,
        "valid_seconds": valid_seconds,
        "missing_seconds": missing_seconds,
        "unknown_seconds": validity["unknown_seconds"],
        "excluded_seconds": excluded_seconds,
        "uncovered_seconds": uncovered_seconds,
        "coverage_fraction": validity["coverage_fraction"],
        "status": validity["calculation_status"],
        "validity": validity,
    }
