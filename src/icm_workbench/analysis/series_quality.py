# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Configurable diagnostic evidence for a local, instantaneous series."""
from collections import Counter
from math import isfinite

import numpy as np
import pandas as pd

METHOD = "series-diagnostics-v1"
REVIEW_LIMIT = 1500


def _setting(value, label, *, floor=None):
    if type(value) not in (int, float) or not isfinite(value) or (floor is not None and value < floor):
        raise ValueError(f"Specify a valid finite {label}.")
    return float(value)


def _optional(value, label, *, floor=None):
    return None if value is None else _setting(value, label, floor=floor)


def _runs(mask):
    changes = np.flatnonzero(np.diff(np.r_[False, mask, False]))
    return zip(changes[::2], changes[1::2] - 1)


def inspect_series(frame, column, *, expected_step_s, jitter_s, flat_amplitude=None,
                   flat_seconds=None, change_limit=None, lower=None, upper=None,
                   rejected_time_rows=0):
    """Generate suspect periods without changing values or source exclusions."""
    expected = _setting(expected_step_s, "expected timestep", floor=0.001)
    jitter = _setting(jitter_s, "timestep tolerance", floor=0)
    amplitude = _optional(flat_amplitude, "flatline amplitude", floor=0)
    flat_min = _optional(flat_seconds, "minimum flatline duration", floor=0.001)
    change = _optional(change_limit, "abrupt change threshold", floor=0)
    lower = _optional(lower, "lower screening bound")
    upper = _optional(upper, "upper screening bound")
    if jitter >= expected or (amplitude is None) != (flat_min is None) or (lower is not None and upper is not None and lower > upper):
        raise ValueError("Review the paired flatline settings, value bounds and timestep tolerance.")
    values = pd.to_numeric(frame[column], errors="coerce").to_numpy(dtype=float)
    timestamps = pd.to_datetime(frame["timestamp"], errors="coerce")
    if not len(values) or timestamps.isna().any() or not timestamps.is_monotonic_increasing:
        raise ValueError("Resolve invalid or out-of-order dates before reviewing this source.")
    steps = timestamps.diff().dt.total_seconds().to_numpy()[1:]
    finite = np.isfinite(values)
    supported = (steps > 0) & (np.abs(steps - expected) <= jitter)
    result, counts = [], Counter()

    def add(kind, first, last, observed, unit_basis):
        counts[kind] += 1
        if len(result) < REVIEW_LIMIT:
            observed = float(observed)
            result.append(dict(kind=kind, start=None if first is None else timestamps.iloc[first].isoformat(),
                               end=None if last is None else timestamps.iloc[last].isoformat(),
                               observed=observed if isfinite(observed) else None, basis=unit_basis))

    if rejected_time_rows:
        add("unlocated-timestamps", None, None, rejected_time_rows, "source rows without a valid time")
    for first, last in _runs(steps == 0):
        add("duplicate-timestamp", first, last + 1, last - first + 2, "rows at the same timestamp")
    for first, last in _runs(~finite):
        add("missing-values", first, last, last - first + 1, "missing or nonnumeric samples")
    for index in np.flatnonzero(steps > expected + jitter):
        add("long-timestep", index, index + 1, steps[index], "seconds without intermediate samples")
    for index in np.flatnonzero((steps > 0) & (steps < expected - jitter)):
        add("short-timestep", index, index + 1, steps[index], "seconds between samples")

    if amplitude is not None:
        first = 0
        lo = hi = values[0]
        for index in range(1, len(values)):
            value = values[index]
            if supported[index - 1] and finite[index - 1] and finite[index] and max(hi, value) - min(lo, value) <= amplitude:
                lo, hi = min(lo, value), max(hi, value)
                continue
            if first < index - 1 and (timestamps.iloc[index - 1] - timestamps.iloc[first]).total_seconds() >= flat_min:
                add("flatline", first, index - 1, hi - lo, "peak-to-peak amplitude")
            first, lo, hi = index, value, value
        if first < len(values) - 1 and (timestamps.iloc[-1] - timestamps.iloc[first]).total_seconds() >= flat_min:
            add("flatline", first, len(values) - 1, hi - lo, "peak-to-peak amplitude")

    if change is not None:
        differences = np.diff(values)
        valid = supported & finite[:-1] & finite[1:]
        jumps = valid & (np.abs(differences) > change)
        if len(differences) > 1:
            spike = jumps[:-1] & jumps[1:] & ((differences[:-1] > 0) != (differences[1:] > 0))
            spike &= np.abs(values[2:] - values[:-2]) <= change
            for left in np.flatnonzero(spike):
                add("isolated-spike", left, left + 2, abs(differences[left]), "change to middle sample")
        for index in np.flatnonzero(jumps):
            add("abrupt-change", index, index + 1, differences[index], "signed adjacent change")

    if lower is not None:
        for first, last in _runs(finite & (values < lower)):
            add("below-screening-bound", first, last, min(values[first:last + 1]), "minimum observed value")
    if upper is not None:
        for first, last in _runs(finite & (values > upper)):
            add("above-screening-bound", first, last, max(values[first:last + 1]), "maximum observed value")

    result.sort(key=lambda finding: (finding["start"] or "", finding["kind"], finding["end"] or ""))
    return dict(method=METHOD, rows=int(len(values)), first=timestamps.iloc[0].isoformat(),
                last=timestamps.iloc[-1].isoformat(), valid_values=int(finite.sum()), findings=result,
                diagnostics_by_kind=dict(counts), candidate_count=sum(counts.values()),
                displayed_limit=REVIEW_LIMIT,
                criteria=dict(expected_step_s=expected, jitter_s=jitter, flat_amplitude=amplitude,
                              flat_seconds=flat_min, change_limit=change, lower=lower, upper=upper))


def clock_candidates(primary, reference, column, reference_column, expected_step_s, search_steps):
    """Check exact shifted comparisons between two records of the same signal."""
    size = _setting(expected_step_s, "expected timestep", floor=0.001)
    if size > 86400 or type(search_steps) is not int or not 1 <= search_steps <= 24:
        raise ValueError("Choose 1–24 lag-search steps at intervals of at most one day.")
    interval = round(size * 1_000_000_000)
    time = primary["timestamp"].to_numpy(dtype="datetime64[ns]", copy=False).view(np.int64)
    other_time = reference["timestamp"].to_numpy(dtype="datetime64[ns]", copy=False).view(np.int64)
    if (not len(time) or not len(other_time) or (time[1:]<=time[:-1]).any() or (other_time[1:]<=other_time[:-1]).any()):
        raise ValueError("The clock comparison requires unique, ordered timestamps in both records.")
    x = pd.to_numeric(primary[column], errors="coerce").to_numpy(dtype=float)
    y = pd.to_numeric(reference[reference_column], errors="coerce").to_numpy(dtype=float)
    lower, upper = max(int(time[0]),int(other_time[0])), min(int(time[-1]),int(other_time[-1]))
    if lower >= upper:
        return {"status":"no-overlap", "early":None, "late":None, "change_in_candidate_shift_s":None}
    middle = lower + (upper - lower) // 2

    def test_span(start, stop, include_stop):
        x_mask = (time >= start) & ((time <= stop) if include_stop else (time < stop))
        main_time, main = time[x_mask], x[x_mask]
        scores = []
        for count in range(-search_steps, search_steps + 1):
            seconds = count * size
            # Simulation results are never interpolated. Only timestamps that
            # are exactly present after the trial reference shift can contribute.
            offset = interval * count
            safe = ((main_time >= np.iinfo(np.int64).min + max(0, offset)) &
                    (main_time <= np.iinfo(np.int64).max + min(0, offset)))
            indices = np.flatnonzero(safe)
            target = main_time[indices] - offset
            matched = other_time.searchsorted(target)
            in_bounds = matched < len(other_time)
            indices, target, matched = indices[in_bounds], target[in_bounds], matched[in_bounds]
            both = (other_time[matched] == target) & np.isfinite(main[indices]) & np.isfinite(y[matched])
            a, b = main[indices[both]], y[matched[both]]
            if len(a)<20:
                continue
            # Demean after scaling to prevent overflow on invalid extreme magnitudes.
            scale_a, scale_b = np.abs(a).max(), np.abs(b).max()
            if not scale_a or not scale_b:
                continue
            a, b = a/scale_a, b/scale_b
            a, b = a-a.mean(), b-b.mean()
            norm = np.linalg.norm(a) * np.linalg.norm(b)
            if norm:
                score = float(np.clip(np.dot(a,b)/norm, -1, 1))
                scores.append({"reference_shift_s":seconds, "correlation":score, "sample_pairs":len(a)})
        scores.sort(key=lambda item: (-item["correlation"], abs(item["reference_shift_s"])))
        leader = scores[0] if scores else None
        if leader is None or leader["correlation"]<.7 or len(scores)<2 or leader["correlation"]-scores[1]["correlation"]<.05:
            return {"status":"insufficient-distinction", "best":leader}
        return {"status":"candidate", "best":leader}

    early, late = test_span(lower, middle, False), test_span(middle, upper, True)
    distinct = all(section["status"]=="candidate" for section in (early,late))
    change = late["best"]["reference_shift_s"] - early["best"]["reference_shift_s"] if distinct else None
    return {"status":"review-candidates" if distinct else "inconclusive", "early":early, "late":late,
            "change_in_candidate_shift_s":change, "step_s":size,
            "start":pd.Timestamp(lower).isoformat(), "end":pd.Timestamp(upper).isoformat()}
