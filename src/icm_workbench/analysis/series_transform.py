# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Immutable resampling onto a reviewed project-clock grid."""
from __future__ import annotations

import math

import numpy as np


MAX_OUTPUT_PERIODS = 25_000
MAX_SOURCE_SAMPLES = 500_000


def period_boundaries(duration: float, interval: float) -> np.ndarray:
    """Cover the whole window, retaining a shorter final period when needed."""
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Choose an increasing transformation period.")
    if not math.isfinite(interval) or interval < 0.001:
        raise ValueError("The output period must be at least 0.001 seconds.")
    ratio = duration / interval
    if ratio > MAX_OUTPUT_PERIODS:
        raise ValueError("Choose a shorter period or larger timestep. The output limit is 25,000 periods.")
    edges = np.arange(max(1, math.ceil(ratio)), dtype=float) * interval
    return np.append(edges[edges < duration], duration)


def integrate_periods(
    times: np.ndarray,
    values: np.ndarray,
    edges: np.ndarray,
    *,
    convention: str,
    maximum_gap: float,
    trailing_support: float | None = None,
    exclusions: tuple[tuple[float, float], ...] = (),
) -> tuple[np.ndarray, np.ndarray]:
    """Return signed integrals and valid seconds for each half-open period.

    Times and edges use seconds on the same clock. Interval averages and
    depths are left-labelled. The input unit for rainfall rates here is
    depth/second. No source values or timestamps are modified.
    """
    if convention not in {"instantaneous", "interval_average", "interval_depth"}:
        raise ValueError("The source temporal support is unresolved.")
    if not math.isfinite(maximum_gap) or maximum_gap < 0.001:
        raise ValueError("The valid source gap must be at least 0.001 seconds.")
    if trailing_support is not None and (not math.isfinite(trailing_support) or trailing_support <= 0):
        raise ValueError("Invalid declared interval support.")
    if len(times) != len(values) or len(times) > MAX_SOURCE_SAMPLES:
        raise ValueError("A transformation supports up to 500,000 source samples.")
    if not np.isfinite(times).all() or np.any(np.diff(times) <= 0):
        raise ValueError("Resolve invalid, out-of-order and duplicate source timestamps before transforming.")

    left, right = times[:-1], times[1:]
    opening, closing = values[:-1], values[1:]
    if convention != "instantaneous" and trailing_support is not None and len(times):
        left, right = times, np.append(right, times[-1] + trailing_support)
        opening = values
    if not len(left):
        return np.zeros(len(edges) - 1), np.zeros(len(edges) - 1)

    # Insert every internal source/segment boundary, so each elementary
    # piece lies within one source interval and one requested period.
    first, last = edges[0], edges[-1]
    trimmed_exclusions = [(max(first, a), min(last, b)) for a, b in exclusions if a < last and b > first and b > a]
    source_boundaries = times[(times > first) & (times < last)]
    final = [right[-1]] if first < right[-1] < last else []
    points = np.unique(np.concatenate((edges, source_boundaries, final, np.ravel(trimmed_exclusions))))
    a, b = points[:-1], points[1:]
    index = np.searchsorted(left, a, side="right") - 1
    safe = np.clip(index, 0, len(left) - 1)
    period = np.searchsorted(edges, a, side="right") - 1
    duration = right[safe] - left[safe]
    opened = opening[safe]
    keep = (index >= 0) & (b <= right[safe]) & (duration <= maximum_gap) & np.isfinite(opened)
    if trimmed_exclusions:
        # Difference marking computes the union of overlapping exclusions
        # without scanning every source sample for each decision.
        excluded = np.zeros(len(points), dtype=np.int64)
        starts, ends = np.asarray(trimmed_exclusions, dtype=float).T
        np.add.at(excluded, np.searchsorted(points, starts), 1)
        np.add.at(excluded, np.searchsorted(points, ends), -1)
        keep &= np.cumsum(excluded[:-1]) == 0
    if convention == "instantaneous":
        keep &= np.isfinite(closing[safe])
    else:
        keep &= opened >= 0  # Negative rainfall is invalid support.

    safe, duration, opened = safe[keep], duration[keep], opened[keep]
    widths = b[keep] - a[keep]
    if convention == "instantaneous":
        fraction = ((a[keep] - left[safe]) + widths / 2) / duration
        mean = opened * (1 - fraction) + closing[safe] * fraction
    else:
        mean = opened / duration if convention == "interval_depth" else opened
    count = len(edges) - 1
    totals = np.bincount(period[keep], weights=mean * widths, minlength=count)
    support = np.bincount(period[keep], weights=widths, minlength=count)
    if not np.isfinite(totals).all():
        raise ValueError("A resampled integral exceeded the finite supported range.")
    return totals, support
