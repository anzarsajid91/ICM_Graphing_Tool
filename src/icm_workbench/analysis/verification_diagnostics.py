# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Evidence-based screening of measured and modelled hydrograph phases."""
from __future__ import annotations

from math import isclose, isfinite


def _finite(value):
    return type(value) in (float, int) and isfinite(value)


def _complete(record):
    if not record or record.get("status") != "complete" or record.get("excluded_seconds") != 0:
        return False
    requested, supported = record.get("requested_seconds"), record.get("common_support_seconds")
    return _finite(requested) and requested > 0 and _finite(supported) and isclose(requested, supported, abs_tol=1e-6, rel_tol=1e-12)


def investigate_calibration(storm, *, settings, dry=None, rainfall=None, recovery=None, depth=None):
    """Preserve the measured comparisons and identify possible investigations."""
    limits = {}
    for key in ("dry_rain_mm", "dry_mean_m3_s", "storm_excess_m3", "recovery_mean_m3_s", "depth_difference_m"):
        limit = settings.get(key)
        if limit is not None and (not _finite(limit) or limit < 0):
            raise ValueError(f"Review the finite non-negative setting {key.replace('_', ' ')}.")
        limits[key] = limit

    def compare(before, after, unit, tolerance, missing=None):
        if missing or not _finite(before) or not _finite(after):
            return {"observed": before if _finite(before) else None, "modelled": after if _finite(after) else None,
                    "difference": None, "unit": unit, "threshold": tolerance, "status": "Withheld", "basis": missing or "Compatible period evidence is unavailable."}
        difference = after - before
        if not _finite(difference):
            raise ValueError("A diagnostic calculation exceeded the finite numeric range.")
        status = "Recorded evidence" if tolerance is None else (
            "Review difference" if abs(difference) > tolerance + max(1e-12, tolerance * 1e-12) else "Within review range"
        )
        return {"observed": before, "modelled": after, "difference": difference, "unit": unit, "threshold": tolerance,
                "status": status, "basis": None}

    def flow_volumes(record):
        values = [record.get(key) for key in ("observed_volume_m3", "modelled_volume_m3")] if _complete(record) else [None, None]
        return values if all(_finite(value) for value in values) else [None, None]

    def means(record):
        return [value / record["requested_seconds"] if value is not None else None for value in flow_volumes(record)]

    periods = {}
    rain_complete = (isinstance(rainfall, dict) and _finite(rainfall.get("depth_mm")) and rainfall["depth_mm"] >= 0
                     and _finite(rainfall.get("valid_seconds")) and _finite(rainfall.get("requested_seconds"))
                     and rainfall["requested_seconds"] > 0
                     and isclose(rainfall["valid_seconds"], rainfall["requested_seconds"], abs_tol=1e-6, rel_tol=1e-12))
    dry_error = None
    if not rain_complete:
        dry_error = "Review a preceding period with complete mapped rainfall support and confirmed antecedent conditions."
    elif limits["dry_rain_mm"] is None:
        dry_error = "Enter a reviewed antecedent rainfall limit for this period."
    elif rainfall["depth_mm"] > limits["dry_rain_mm"]:
        dry_error = "Recorded rain exceeds the selected antecedent limit."
    elif not _complete(dry):
        dry_error = "Observed and modelled flow require complete common support in the preceding period."
    elif not isclose(rainfall["requested_seconds"], dry["requested_seconds"], abs_tol=1e-6, rel_tol=1e-12):
        dry_error = "The rainfall evidence must cover the same time as the preceding flow comparison."

    base = means(dry)
    periods["dry_mean"] = compare(*base, "m³/s", limits["dry_mean_m3_s"], dry_error)
    periods["dry_mean"]["investigate"] = "Compare foul loading, diurnal patterns, trade inputs and independent infiltration evidence across several dry periods."
    storm_flow = storm.get("values")
    storm_volume = flow_volumes(storm_flow)
    antecedent_qualified = periods["dry_mean"]["status"] != "Withheld"
    if antecedent_qualified and all(value is not None for value in storm_volume):
        event_seconds = storm_flow["requested_seconds"]
        excess = [value - rate * event_seconds for value, rate in zip(storm_volume, base)]
    else:
        excess = [None, None]
    periods["storm_excess"] = compare(*excess, "m³", limits["storm_excess_m3"],
                                      None if antecedent_qualified else "A reviewed, rain-qualified preceding mean is required.")
    periods["storm_excess"]["investigate"] = "Compare storm coverage, effective contributing area and runoff assumptions. Excess above the preceding mean also reflects other changing inflows."

    for key, suggestion in (("peak", "Check the recorded rain shape, hydraulic controls, data quality and whether nearby monitors support the peak difference."),
                            ("timing", "Check logger and simulation clocks, gauge timing and catchment response before adjusting hydraulic parameters.")):
        metric = storm.get("checks", {}).get(key)
        if metric:
            source = storm_flow or {}
            before, after, unit = None, None, None
            if key == "peak":
                before, after, unit = source.get("observed_peak"), source.get("modelled_peak"), source.get("unit")
            elif not source.get("peak_time_ambiguous"):
                before, after = source.get("observed_peak_time"), source.get("modelled_peak_time")
            periods[key] = {**metric, "observed": before, "modelled": after, "source_unit": unit,
                            "basis": metric.get("reason"), "investigate": suggestion}

    trailing_means = means(recovery)
    if antecedent_qualified and all(value is not None for value in trailing_means):
        trailing_means = [value - reference for value, reference in zip(trailing_means, base)]
    else:
        trailing_means = [None, None]
    periods["recovery"] = compare(*trailing_means, "m³/s", limits["recovery_mean_m3_s"],
                                  None if antecedent_qualified else "A reviewed, rain-qualified preceding mean is required.")
    periods["recovery"]["investigate"] = "Inspect the whole recession, continued rainfall, slower contributing areas, storage discharge and pump operation."

    if _complete(depth) and _complete(storm_flow):
        levels = [depth.get("observed_peak"), depth.get("modelled_peak")]
    else:
        levels = [None, None]
    periods["hydraulic_context"] = compare(*levels, "m", limits["depth_difference_m"],
                                           "Provide concurrent, compatible depth and flow evidence for the same location." if None in levels else None)
    periods["hydraulic_context"]["investigate"] = "Depth peaks can occur at different times. Compare concurrent depth–flow traces, surveyed section, control records and downstream levels when investigating restriction or backwater."
    return {"method": "verification-phase-investigation-v1", "findings": periods, "rainfall": rainfall, "preceding_reviewed": antecedent_qualified}
