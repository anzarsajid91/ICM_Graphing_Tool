# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Spatial rainfall screening on a common, support-aware project clock."""
from __future__ import annotations

from itertools import combinations
from math import isfinite

import numpy as np

from icm_workbench.analysis.series_transform import integrate_periods, period_boundaries


def _correlation(first, second):
    if len(first) < 3 or np.min(first) == np.max(first) or np.min(second) == np.max(second):
        return None
    # Scaling before centring keeps the norm finite for unusual recorded values.
    left, right = first / max(first), second / max(second)
    left, right = left - left.mean(), right - right.mean()
    divisor = np.linalg.norm(left) * np.linalg.norm(right)
    if divisor == 0:
        return None
    return float(np.clip(np.dot(left, right) / divisor, -1, 1))


def compare_rainfall(gauges, *, duration, interval, maximum_gap, suspect_rate=None):
    """Compare independent gauge support and totals on one explicit window."""
    if not 2 <= len(gauges) <= 8:
        raise ValueError("Select two to eight distinct observed rainfall channels.")
    if suspect_rate is not None and (not isfinite(suspect_rate) or suspect_rate <= 0):
        raise ValueError("Enter a positive finite rainfall-intensity screen, or leave it blank.")
    edges = period_boundaries(duration, interval)
    if len(edges) > 10001:
        raise ValueError("Choose a shorter comparison window or a larger interval. This review supports up to 10,000 bins.")
    widths = np.diff(edges)
    equal_width = np.isclose(widths, interval, atol=1e-8, rtol=1e-12)
    records, grids = [], []
    for spec in gauges:
        values, support = integrate_periods(spec["times"], spec["samples"], edges, convention=spec["convention"],
                                            maximum_gap=maximum_gap, trailing_support=spec["trailing"],
                                            exclusions=spec["exclusions"])
        complete = np.isclose(support, widths, atol=1e-8, rtol=1e-12)
        rates = (values / widths) * 3600
        accumulated = np.cumsum(values)
        if not np.isfinite(rates).all() or not np.isfinite(accumulated).all():
            raise ValueError("A gauge result exceeds the finite numerical range.")
        has_coverage, fully_supported = bool(support.any()), bool(complete.all())
        peaks = np.flatnonzero(np.isclose(rates, rates.max(), atol=1e-10, rtol=1e-9))
        peak = int(peaks[0]) if fully_supported and rates.max() > 0 and len(peaks) == 1 else None
        suspect = rates > suspect_rate if suspect_rate is not None else np.zeros(len(rates), dtype=bool)
        observed = (spec["times"] >= 0) & (spec["times"] < duration)
        invalid = np.count_nonzero(observed & np.isfinite(spec["samples"]) & (spec["samples"] < 0))
        records.append({
            "valid_seconds": float(support.sum()), "complete_intervals": int(complete.sum()),
            "supported_depth_mm": float(accumulated[-1]) if has_coverage else None,
            "event_depth_mm": float(accumulated[-1]) if fully_supported else None,
            "peak_interval": peak, "peak_rate_mm_h": float(rates.max()) if peak is not None else None,
            "negative_source_samples": int(invalid), "suspect_intervals": int(np.count_nonzero(suspect & complete)),
            "intervals": [[float(values[i]) if support[i] > 0 else None, float(support[i]),
                           float(accumulated[i]) if complete[i] else None, bool(suspect[i] and complete[i])]
                          for i in range(len(widths))],
        })
        grids.append((rates, complete))

    pairs = []
    for i, j in combinations(range(len(records)), 2):
        left, right = records[i], records[j]
        (a, ac), (b, bc) = grids[i], grids[j]
        common = ac & bc & equal_width
        start, end = left["peak_interval"], right["peak_interval"]
        pairs.append({"left": i, "right": j, "common_intervals": int(common.sum()),
                      "correlation": _correlation(a[common], b[common]),
                      "peak_offset_seconds": float((edges[end] + edges[end + 1] - edges[start] - edges[start + 1]) / 2)
                      if start is not None and end is not None else None})
    event_depths = [record["event_depth_mm"] for record in records]
    spatial_cv = None
    if all(value is not None for value in event_depths) and max(event_depths) > 0:
        scaled = np.asarray(event_depths) / max(event_depths)
        spatial_cv = float(100 * scaled.std() / scaled.mean())
    return {"method": "rainfall-spatial-support-v1", "duration_seconds": duration, "endpoints_seconds": edges.tolist(), "gauges": records,
            "pairs": pairs, "spatial_cv_percent": spatial_cv}
