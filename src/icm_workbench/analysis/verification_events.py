"""Event metrics on common piecewise-linear hydraulic support."""
import numpy as np
import pandas as pd

from .alignment import _subtract_interval, _valid_segments
from .exclusions import interval_excluded_seconds


def joint_support_intervals(observed, modelled, obs_col, model_col, start, end, gap_seconds, exclusions):
    """Yield disjoint positive intervals and their bracketing native series."""
    def segments(frame, column):
        return [group.set_index("timestamp")[column] for group in _valid_segments(frame, column, gap_seconds)
                if len(group) > 1]

    obs, mod = segments(observed, obs_col), segments(modelled, model_col)
    i = j = 0
    while i < len(obs) and j < len(mod):
        left, right = obs[i], mod[j]
        lo, hi = max(start, left.index[0], right.index[0]), min(end, left.index[-1], right.index[-1])
        if lo < hi:
            for a, b in _subtract_interval(lo, hi, exclusions):
                yield a, b, left, right
        if left.index[-1] <= right.index[-1]:
            i += 1
        if right.index[-1] <= left.index[-1]:
            j += 1


def compare_event_support(observed, modelled, obs_col, model_col, start, end, gap_seconds, exclusions=()):
    """Integrate and compare peaks on the intersection of both native supports."""
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    if pd.isna(start) or pd.isna(end) or end <= start:
        raise ValueError("Event end must follow its start.")
    if not np.isfinite(gap_seconds) or gap_seconds <= 0:
        raise ValueError("Maximum interpolation gap must be positive and finite.")

    support = 0.0
    obs_integral = sim_integral = 0.0
    obs_peak = sim_peak = None
    obs_peak_tied = sim_peak_tied = False
    for a, b, left, right in joint_support_intervals(
        observed, modelled, obs_col, model_col, start, end, gap_seconds, exclusions
    ):
        knots = left.index[(left.index > a) & (left.index < b)].union(
            right.index[(right.index > a) & (right.index < b)]
        ).union(pd.DatetimeIndex([a, b])).sort_values()
        # Use local elapsed seconds to avoid floating-point loss at epoch scale.
        base = a.value
        x = (knots.as_unit("ns").asi8 - base) / 1e9
        y_obs = np.interp(x, (left.index.as_unit("ns").asi8 - base) / 1e9, left.to_numpy())
        y_sim = np.interp(x, (right.index.as_unit("ns").asi8 - base) / 1e9, right.to_numpy())
        dt = np.diff(x)
        support += float(dt.sum())
        obs_integral += float(np.dot(dt, (y_obs[:-1] + y_obs[1:]) * .5))
        sim_integral += float(np.dot(dt, (y_sim[:-1] + y_sim[1:]) * .5))
        for values, peak, tied in [(y_obs, obs_peak, obs_peak_tied), (y_sim, sim_peak, sim_peak_tied)]:
            index = int(values.argmax())
            candidate = (float(values[index]), knots[index])
            if peak is None or candidate[0] > peak[0]:
                peak = candidate
                tied = np.count_nonzero(values == candidate[0]) > 1
            elif candidate[0] == peak[0]:
                tied = tied or candidate[1] != peak[1] or np.count_nonzero(values == candidate[0]) > 1
            if values is y_obs:
                obs_peak, obs_peak_tied = peak, tied
            else:
                sim_peak, sim_peak_tied = peak, tied

    excluded = float(interval_excluded_seconds(start, end, exclusions))
    requested = float((end - start).total_seconds())
    eligible = max(0, requested - excluded)
    return {
        "status": "unavailable" if support == 0 else "complete" if abs(support - eligible) < 1e-6 else "partial",
        "requested_seconds": requested,
        "excluded_seconds": excluded,
        "common_support_seconds": support,
        "coverage_fraction": min(1.0, support / eligible) if eligible else None,
        "observed_peak": obs_peak[0] if obs_peak else None,
        "observed_peak_time": obs_peak[1] if obs_peak else None,
        "modelled_peak": sim_peak[0] if sim_peak else None,
        "modelled_peak_time": sim_peak[1] if sim_peak else None,
        "peak_error": sim_peak[0] - obs_peak[0] if obs_peak and sim_peak else None,
        "peak_lag_minutes": (sim_peak[1] - obs_peak[1]).total_seconds() / 60 if obs_peak and sim_peak else None,
        "peak_time_ambiguous": bool(obs_peak_tied or sim_peak_tied),
        "observed_integral": obs_integral if support else None,
        "modelled_integral": sim_integral if support else None,
    }
