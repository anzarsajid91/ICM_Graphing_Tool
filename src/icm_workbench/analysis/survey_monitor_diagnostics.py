# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Explainable screens for concurrent depth, velocity and discharge records."""
from __future__ import annotations

from collections import Counter
from math import isfinite

import numpy as np
import pandas as pd

from icm_workbench.analysis.pipe_capacity import circular_wetted_area


def monitor_diagnostics(frame, depth_column, velocity_column, flow_column=None, *, settings, exclusions=()):
    def option(key, *, minimum=None, required=False):
        value = settings.get(key)
        if value is None and not required:
            return None
        if type(value) not in (float, int) or not isfinite(value) or (minimum is not None and value < minimum):
            raise ValueError(f"Review the finite engineering setting {key.replace('_', ' ')}.")
        return float(value)

    gap = option("max_gap_s", minimum=.001, required=True)
    diameter = option("diameter_m", minimum=.001)
    depth_min = option("depth_min_m", minimum=0)
    depth_max = option("depth_max_m", minimum=0)
    v_min, v_max = option("velocity_min_m_s"), option("velocity_max_m_s")
    velocity_step = option("velocity_step_m_s", minimum=0)
    flat = option("flat_depth_amplitude_m", minimum=0)
    flat_seconds = option("flat_duration_s", minimum=.001)
    velocity_swing = option("flat_velocity_swing_m_s", minimum=.001)
    rise = option("rise_depth_m", minimum=.000001)
    low_velocity = option("rise_velocity_ceiling_m_s", minimum=0)
    tolerance = option("flow_relative_tolerance_percent", minimum=0)
    discharge_floor = option("flow_floor_m3_s", minimum=1e-9)
    if (depth_min is not None and depth_max is not None and depth_min > depth_max
            or v_min is not None and v_max is not None and v_min > v_max):
        raise ValueError("Measurement-range minimums must not exceed maximums.")
    for group in [(flat, flat_seconds, velocity_swing), (rise, low_velocity), (tolerance, discharge_floor)]:
        if any(value is not None for value in group) and any(value is None for value in group):
            raise ValueError("Complete every setting in each selected diagnostic group.")
    if diameter is not None and settings.get("geometry_confirmed") is not True:
        raise ValueError("Confirm the reviewed circular pipe section before using diameter checks.")
    if diameter is not None and diameter > 20:
        raise ValueError("The circular section review supports diameters up to 20 m.")
    if rise is not None and settings.get("downstream_positive") is not True:
        raise ValueError("Confirm the positive downstream velocity convention before screening a rising-depth pattern.")
    if tolerance is not None and (diameter is None or flow_column is None or settings.get("flow_basis_confirmed") is not True):
        raise ValueError("Flow consistency needs a reviewed cross-section, discharge and mean velocity with a common sign convention.")

    stamps = pd.DatetimeIndex(frame["timestamp"]).as_unit("ns")
    if len(stamps) < 2 or len(stamps) > 250_000 or stamps.hasnans or stamps.tz is not None or not stamps.is_monotonic_increasing or stamps.has_duplicates:
        raise ValueError("Choose 2–250,000 uniquely timed samples on the reviewed project clock.")
    values = lambda column: pd.to_numeric(frame[column], errors="coerce").to_numpy(dtype=float)
    depth, velocity = values(depth_column), values(velocity_column)
    clock_steps = np.diff(stamps.asi8) / 1e9
    retained = np.ones(len(depth), dtype=bool)
    connected = clock_steps <= gap
    for exclusion in exclusions:
        a, b = pd.Timestamp(exclusion.start).value, pd.Timestamp(exclusion.end).value
        retained &= ~((stamps.asi8 >= a) & (stamps.asi8 < b))
        connected &= ~((stamps.asi8[:-1] < b) & (stamps.asi8[1:] > a))
    valid_depth, valid_velocity = retained & np.isfinite(depth), retained & np.isfinite(velocity)
    paired = valid_depth & valid_velocity
    candidates, counts = [], Counter()

    def record(kind, first, last, observed, basis):
        counts[kind] += 1
        if len(candidates) < 2000:
            candidates.append({"kind": kind, "start": stamps[first].isoformat(), "end": stamps[last].isoformat(),
                               "observed": float(observed) if isfinite(observed) else None, "basis": basis})

    def episodes(mask):
        indices = np.flatnonzero(mask)
        breaks = np.diff(indices) > 1
        if len(indices) > 1:
            breaks |= ~connected[indices[:-1]]
        cuts = np.flatnonzero(breaks) + 1
        for section in np.split(indices, cuts):
            if len(section):
                yield section[0], section[-1]

    def range_check(series, valid, bounds, kind, basis):
        low, high = bounds
        mask = valid & ((series < low if low is not None else False) | (series > high if high is not None else False))
        for first, last in episodes(mask):
            record(kind, first, last, last - first + 1, basis)

    range_check(depth, valid_depth, (depth_min, depth_max), "depth-range", "Samples outside the reviewed depth measurement range")
    range_check(velocity, valid_velocity, (v_min, v_max), "velocity-range", "Samples outside the reviewed signed velocity range")
    if velocity_step is not None:
        difference = np.diff(velocity)
        mask = connected & valid_velocity[:-1] & valid_velocity[1:] & (np.abs(difference) > velocity_step)
        for index in np.flatnonzero(mask):
            record("velocity-change", index, index + 1, difference[index], "Signed adjacent velocity change in m/s")
    if diameter is not None:
        for first, last in episodes(valid_depth & (depth >= diameter)):
            record("crown", first, last, np.max(depth[first:last + 1]) / diameter,
                   "Maximum depth to diameter ratio. Check geometry, datum or surcharge.")
    if rise is not None:
        change = np.diff(depth)
        mask = paired[:-1] & paired[1:] & connected & (change >= rise) & (velocity[1:] <= low_velocity)
        for index in np.flatnonzero(mask):
            record("rising-low-velocity", index, index + 1, change[index],
                   "Depth increase in metres with low or reverse downstream velocity. Investigate backwater, transient response or sensor conditions.")
    if flat is not None:
        first, lo, hi, v_lo, v_hi = 0, depth[0], depth[0], velocity[0], velocity[0]
        for index in range(1, len(depth) + 1):
            if index < len(depth) and connected[index - 1] and paired[index - 1] and paired[index] and max(hi, depth[index]) - min(lo, depth[index]) <= flat:
                lo, hi = min(lo, depth[index]), max(hi, depth[index])
                v_lo, v_hi = min(v_lo, velocity[index]), max(v_hi, velocity[index])
                continue
            last = index - 1
            if last > first and stamps.asi8[last] - stamps.asi8[first] >= flat_seconds * 1e9 and v_hi - v_lo >= velocity_swing:
                record("flat-depth", first, last, v_hi - v_lo,
                       "Paired velocity range in m/s during a near-flat depth. Inspect fouling, instrument response and site hydraulics.")
            if index < len(depth):
                first, lo, hi, v_lo, v_hi = index, depth[index], depth[index], velocity[index], velocity[index]
    compared = 0
    if tolerance is not None:
        flow = values(flow_column)
        eligible = paired & np.isfinite(flow) & (depth >= 0) & (depth < diameter)
        selected = np.flatnonzero(eligible)
        compared = len(selected)
        area = np.fromiter((circular_wetted_area(diameter, depth[index]) for index in selected), dtype=float, count=compared)
        expected = area * velocity[selected]
        denominator = np.maximum(np.abs(expected), discharge_floor)
        difference = np.full(len(depth), np.nan)
        difference[selected] = 100 * np.abs(flow[selected] - expected) / denominator
        for first, last in episodes(difference > tolerance):
            record("flow-consistency", first, last, np.max(difference[first:last + 1]),
                   "Maximum percentage deviation from area × reviewed mean velocity, using the declared near-zero denominator floor.")
    candidates.sort(key=lambda item: (item["start"], item["kind"]))
    return {"method": "paired-monitor-diagnostics-v1", "rows": len(depth), "paired_samples": int(paired.sum()),
            "excluded_samples": int(np.count_nonzero(~retained)),
            "flow_checked_samples": compared, "findings": candidates, "counts": dict(counts),
            "candidate_count": sum(counts.values()), "display_limit": 2000}
