# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Time support and declared instrument-range screens for verification review."""
from __future__ import annotations

from math import isfinite

import numpy as np

from icm_workbench.analysis.series_transform import integrate_periods


def supported_monitor_range(times, values, *, duration, gap, exclusions=(), minimum=None, maximum=None):
    """Require both bracketing samples inside an engineering range for each retained interval."""
    if not isfinite(duration) or duration <= 0:
        raise ValueError("Choose a positive verification review period.")
    if any(bound is not None and not isfinite(bound) for bound in (minimum, maximum)):
        raise ValueError("Review the finite instrument range.")
    if minimum is not None and maximum is not None and minimum > maximum:
        raise ValueError("The instrument range requires a minimum no greater than its maximum.")
    values = np.asarray(values, dtype=float)
    weights = np.zeros(len(values), dtype=float)
    finite = np.isfinite(values)
    test = {"convention": "instantaneous", "maximum_gap": gap, "exclusions": exclusions}
    edges = np.asarray([0.0, duration])
    _, support = integrate_periods(times, np.where(finite, weights, np.nan), edges, **test)
    within = finite.copy()
    if minimum is not None:
        within &= values >= minimum
    if maximum is not None:
        within &= values <= maximum
    _, usable = integrate_periods(times, np.where(within, weights, np.nan), edges, **test)
    return {"supported_seconds": float(support[0]), "in_range_seconds": float(usable[0]),
            "range_verified": minimum is not None and maximum is not None}


def assess_verification_period(channels, *, duration, rain_seconds, rain_qualified, minimum_percent,
                               measurement_review, flow_required=True):
    """Explain independent coverage, rainfall and reviewed measurement checks."""
    if not isfinite(duration) or duration <= 0 or not isfinite(minimum_percent) or not 0 < minimum_percent <= 100:
        raise ValueError("Review the period and choose a coverage requirement above 0% and at most 100%.")
    if measurement_review not in {"unreviewed", "reviewed", "hold"}:
        raise ValueError("Choose a supported site and sensor review status.")
    seconds_required = duration * minimum_percent / 100
    tolerance = max(1e-8, duration * 1e-12)

    def coverage(value):
        if value is None or value <= tolerance:
            return "Unavailable"
        return "Meets" if value >= seconds_required - tolerance else "Below requirement"

    rain_status = "Meets" if rain_qualified is True else "Does not qualify" if rain_qualified is False else "Unavailable"
    checks = {"rainfall_qualification": rain_status,
              "mapped_gauge_coverage": coverage(rain_seconds)}
    for quantity in ("depth", "velocity", "flow"):
        if quantity == "flow" and not flow_required:
            continue
        entry = channels.get(quantity) or {}
        raw = coverage(entry.get("supported_seconds"))
        checks[quantity+"_coverage"] = raw
        if quantity != "flow":
            checks[quantity+"_range"] = coverage(entry.get("in_range_seconds")) if entry.get("range_verified") else "Review missing"
    checks["site_measurement_review"] = {"reviewed": "Meets", "hold": "Investigation required", "unreviewed": "Review missing"}[measurement_review]
    return {"checks": checks, "status": "Candidate for verification" if all(value == "Meets" for value in checks.values())
            else "Hold for review"}
