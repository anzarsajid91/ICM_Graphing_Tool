# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Project tolerance checks for authoritative event comparisons."""
from __future__ import annotations

from math import isfinite


def verification_event_criteria(event, quantity, criteria):
    """Attribute individual criterion states while retaining the native evidence."""
    if quantity not in {"flow", "depth"}:
        raise ValueError("Verification needs matching resolved flow or depth channels.")

    def limit(key, *, minimum=0, maximum=None):
        value = criteria.get(key)
        if (type(value) not in (int, float) or not isfinite(value) or value < minimum
                or (maximum is not None and value > maximum)):
            raise ValueError(f"Review the project setting {key.replace('_', ' ')}.")
        return float(value)

    covered = event["common_support_seconds"]
    duration = event["requested_seconds"]
    if not isfinite(duration) or duration <= 0 or not isfinite(covered) or covered < 0:
        raise ValueError("The event period requires finite shared temporal support.")
    coverage = min(100.0, 100.0 * (covered / duration))
    coverage_limit = limit("minimum_coverage_percent", minimum=.001, maximum=100)
    support_complete = (event["status"] == "complete" and event["excluded_seconds"] == 0
                        and abs(covered - duration) <= max(1e-6, duration * 1e-12))

    def finite(value):
        return type(value) in (float, int) and isfinite(value)

    def upper_gate(value, tolerance, unit, reason=None):
        if not finite(value) or reason:
            return {"value": value if finite(value) else None, "unit": unit, "tolerance": tolerance,
                    "status": "Withheld", "reason": reason or "This event metric is unavailable."}
        return {"value": value, "unit": unit, "tolerance": tolerance,
                "status": "Meets" if abs(value) <= tolerance + max(1e-12, tolerance * 1e-12) else "Outside tolerance", "reason": None}

    def relative(difference, reference, floor):
        if not finite(difference) or not finite(reference) or reference <= floor:
            return None
        result = 100 * (difference / reference)
        return result if finite(result) else None

    readings = {"coverage": {"value": coverage, "unit": "%", "tolerance": coverage_limit,
                             "status": "Meets" if coverage >= coverage_limit - 1e-10 else "Below requirement",
                             "reason": "Share of the entire event window with valid observations and model results."}}
    problem = None if support_complete else "Full event evidence is incomplete or contains excluded time."
    if quantity == "flow":
        peak_floor = limit("flow_peak_floor_m3_s", minimum=1e-12)
        volume_floor = limit("flow_volume_floor_m3", minimum=1e-9)
        peak = relative(event.get("peak_error"), event.get("observed_peak"), peak_floor)
        observed_volume, model_volume = event.get("observed_volume_m3"), event.get("modelled_volume_m3")
        difference = model_volume - observed_volume if finite(observed_volume) and finite(model_volume) else None
        volume = relative(difference, observed_volume, volume_floor)
        readings["peak"] = upper_gate(peak, limit("flow_peak_error_percent"), "%",
                                       problem or ("The observed peak is below the reviewed positive reference floor." if peak is None else None))
        readings["volume"] = upper_gate(volume, limit("flow_volume_error_percent"), "%",
                                         problem or ("The observed volume is below the reviewed positive reference floor." if volume is None else None))
    else:
        readings["peak"] = upper_gate(event.get("peak_error"), limit("depth_peak_error_m"), "m", problem)
    readings["timing"] = upper_gate(event.get("peak_lag_minutes"), limit("peak_offset_minutes"), "min",
                                     problem or ("At least one record has tied peak times on the common event support."
                                                 if event.get("peak_time_ambiguous") else None))
    return {"method": "project-event-screens-v1", "checks": readings, "support_complete": support_complete}
