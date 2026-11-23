# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Enrich already assessed physical intervals with local supporting evidence."""
from __future__ import annotations

import numpy as np
import pandas as pd

from icm_workbench.analysis.series_transform import integrate_periods


def register_events(events, threshold_source, max_gap_s, *, flow_source=None, rain_source=None):
    if not isinstance(events, list) or len(events) > 20_000:
        raise ValueError("Select a shorter assessment period. Review up to 20,000 physical discharge intervals at once.")
    if not events:
        return []
    starts = pd.DatetimeIndex([pd.Timestamp(event["start"]) for event in events]).as_unit("ns")
    stops = pd.DatetimeIndex([pd.Timestamp(event["end"]) for event in events]).as_unit("ns")
    if (starts.tz is not None or stops.tz is not None or starts.hasnans or stops.hasnans
            or (stops <= starts).any() or (starts[1:] < stops[:-1]).any()):
        raise ValueError("Physical discharge intervals must be ordered, nonoverlapping project-clock periods.")
    origin_s, origin_ns = divmod(starts[0].value, 10**9)

    def seconds(value):
        whole, part = np.divmod(value, 10**9)
        return whole - origin_s + (part - origin_ns) / 1e9

    def boundary_seconds(value):
        # Keep epoch-nanosecond scalars in Python. WebAssembly's NumPy
        # integer inference can coerce a Python int through a 32-bit C long.
        whole, part = divmod(pd.Timestamp(value).value, 10**9)
        return whole - origin_s + (part - origin_ns) / 1e9

    edge_ns = np.union1d(starts.asi8, stops.asi8)
    edges = seconds(edge_ns)
    begin = np.searchsorted(edge_ns, starts.asi8)
    start_seconds, stop_seconds = seconds(starts.asi8), seconds(stops.asi8)
    durations = stop_seconds - start_seconds

    def evidence(source, *, positive_only=False):
        return integrate_periods(seconds(source["times"].asi8), source["values"], edges,
                                 convention=source["convention"], maximum_gap=max_gap_s,
                                 trailing_support=source.get("trailing_support"), positive_only=positive_only,
                                 exclusions=tuple((boundary_seconds(item.start), boundary_seconds(item.end))
                                                  for item in source["exclusions"]))

    _, measured = evidence(threshold_source)
    flow, flow_support = evidence(flow_source, positive_only=True) if flow_source else (None, None)
    rain, rain_support = evidence(rain_source) if rain_source else (None, None)

    def supported_total(totals, support, slot, duration):
        return float(totals[slot]) if totals is not None and np.isclose(support[slot], duration, rtol=1e-12, atol=1e-8) else None

    results = []
    for i, slot in enumerate(begin):
        previous_gap = None if not i else float(start_seconds[i] - stop_seconds[i - 1])
        gap_support = None if previous_gap is None else (float(measured[slot - 1]) if previous_gap else 0.0)
        results.append({"number": i + 1, "start": starts[i].isoformat(), "end": stops[i].isoformat(),
                        "duration_s": float(durations[i]), "source_support_s": float(measured[slot]),
                        "previous_gap_s": previous_gap, "previous_gap_support_s": gap_support,
                        "volume_m3": supported_total(flow, flow_support, slot, durations[i]),
                        "flow_support_s": float(flow_support[slot]) if flow_support is not None else None,
                        "rain_mm": supported_total(rain, rain_support, slot, durations[i]),
                        "rain_support_s": float(rain_support[slot]) if rain_support is not None else None})
    return results
