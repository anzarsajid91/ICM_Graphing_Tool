# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Continuity routing for a full-support, piecewise-linear inflow prefix."""
from itertools import pairwise
from math import fsum, isfinite

METHOD = "constant-cap-pass-forward-linear-inflow-v1"


def _validated(value, name, lower, upper):
    if type(value) not in (int, float) or not lower <= value <= upper or not isfinite(value):
        raise ValueError(f"{name} must be a finite value between {lower:g} and {upper:g}.")
    return value


def route_storage(times_s, inflow_m3_s, capacities_m3, initial_m3, release_m3_s, max_gap_s,
                  first_excluded_interval=None):
    """Route supported intervals until the first gap invalidates storage state."""
    capacities = list(capacities_m3)
    if not 1 <= len(capacities) <= 25:
        raise ValueError("Compare between 1 and 25 capacities.")
    capacities = [_validated(value, "Storage capacity in m³", 0, 1e9) for value in capacities]
    if capacities != sorted(set(capacities)):
        raise ValueError("Use strictly increasing, unique storage capacities.")
    initial = _validated(initial_m3, "Initial storage in m³", 0, min(capacities))
    release = _validated(release_m3_s, "Pass-forward flow in m³/s", 0, 10000)
    gap = _validated(max_gap_s, "Maximum supported timestep in seconds", 1e-3, 31557600)
    if len(times_s) != len(inflow_m3_s) or len(times_s) < 2:
        raise ValueError("Provide at least two timestamped inflow samples.")

    available = float(times_s[-1] - times_s[0])
    if not isfinite(available) or available <= 0:
        raise ValueError("Use finite, chronological timestamps.")
    for earlier, later in pairwise(times_s):
        if not isfinite(earlier) or not isfinite(later) or later <= earlier:
            raise ValueError("Resolve repeated or out-of-order timestamps before routing.")
    for value in inflow_m3_s:
        if isfinite(value) and not 0 <= value <= 10000:
            raise ValueError("Resolve negative or unsupported inflow samples before routing.")

    occupied = [initial] * len(capacities)
    spilled = [0.0] * len(capacities)
    passed = [0.0] * len(capacities)
    peak = occupied.copy()
    limited = [0.0] * len(capacities)
    inflow_volume = 0.0
    last_sample = 0
    stopped = None

    def advance(dt, q_start, q_end):
        nonlocal inflow_volume
        interval_volume = (q_start + q_end) * dt / 2
        nominal = release * dt
        net = interval_volume - nominal
        inflow_volume += interval_volume
        for i, capacity in enumerate(capacities):
            proposed = occupied[i] + net
            if proposed > capacity:
                spilled[i] += proposed - capacity
                occupied[i] = capacity
                passed[i] += nominal
            elif proposed < 0:
                # Use actual available volume when the regulated route draws the tank down.
                actual = occupied[i] + interval_volume
                passed[i] += actual
                limited[i] += nominal - actual
                occupied[i] = 0
            else:
                occupied[i] = proposed
                passed[i] += nominal
            peak[i] = max(peak[i], occupied[i])

    for index, ((t0, t1), (q0, q1)) in enumerate(zip(pairwise(times_s), pairwise(inflow_m3_s)), 1):
        dt = float(t1 - t0)
        if index == first_excluded_interval:
            stopped = "reviewed exclusion"
            break
        if dt > gap or not isfinite(q0) or not isfinite(q1):
            stopped = "unsupported gap" if dt > gap else "missing inflow sample"
            break
        if q0 < release < q1 or q1 < release < q0:
            fraction = (release - q0) / (q1 - q0)
            advance(dt * fraction, q0, release)
            advance(dt * (1 - fraction), release, q1)
        else:
            advance(dt, q0, q1)
        last_sample = index
    elapsed = float(times_s[last_sample] - times_s[0])
    if elapsed <= 0:
        failure = stopped or "no supported inflow"
        raise ValueError(f"The first interval has {failure}. Choose a reviewed continuous series or period.")
    results = []
    for i, capacity in enumerate(capacities):
        closure = fsum((inflow_volume, initial, -passed[i], -spilled[i], -occupied[i]))
        tolerance = max(1e-7, 1e-9 * max(1, inflow_volume + initial))
        if abs(closure) > tolerance:
            raise ValueError("Routing mass-balance check did not meet its numerical tolerance.")
        results.append(dict(
            capacity_m3=capacity, inflow_m3=inflow_volume, passed_m3=passed[i],
            spill_m3=spilled[i], final_m3=occupied[i], peak_m3=peak[i],
            release_shortfall_m3=limited[i], mass_residual_m3=closure,
        ))
    return dict(
        method=METHOD, rows=results, initial_m3=initial, release_m3_s=release,
        elapsed_s=elapsed, available_s=available, stop_reason=stopped, last_sample=last_sample,
    )
