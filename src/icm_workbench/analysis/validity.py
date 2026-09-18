from __future__ import annotations

from typing import Mapping


VALIDITY_STATES = ("valid", "suspect", "invalid", "excluded", "missing", "unknown")
CALCULATION_STATUSES = ("complete", "partial", "unavailable")


def _non_negative(value: float | int | None) -> float:
    if value is None:
        return 0.0
    return max(0.0, float(value))


def validity_summary(
    *,
    requested_seconds: float,
    valid_seconds: float,
    suspect_seconds: float = 0.0,
    invalid_seconds: float = 0.0,
    excluded_seconds: float = 0.0,
    missing_seconds: float = 0.0,
    unknown_seconds: float = 0.0,
    uncovered_seconds: float | None = None,
    tolerance_seconds: float = 1e-6,
) -> dict:
    """Return the common validity/coverage contract used by engineering workflows.

    Time is classified into the canonical states valid, suspect, invalid,
    excluded, missing and unknown. Uncovered time is treated as unknown support
    and is also reported explicitly because it is useful for diagnosing source
    boundaries and telemetry gaps.

    Complete means all non-excluded requested support is valid. Partial means
    some valid support exists but one or more non-valid states remain.
    Unavailable means there is no usable support, or the whole request was
    excluded.
    """
    requested = _non_negative(requested_seconds)
    valid = _non_negative(valid_seconds)
    suspect = _non_negative(suspect_seconds)
    invalid = _non_negative(invalid_seconds)
    excluded = min(requested, _non_negative(excluded_seconds))
    missing = _non_negative(missing_seconds)
    unknown_explicit = _non_negative(unknown_seconds)
    assessable = max(0.0, requested - excluded)

    accounted = valid + suspect + invalid + missing + unknown_explicit
    if uncovered_seconds is None:
        uncovered = max(0.0, assessable - accounted)
    else:
        uncovered = _non_negative(uncovered_seconds)

    unknown_total = unknown_explicit + uncovered
    non_valid = suspect + invalid + missing + unknown_total

    if assessable <= tolerance_seconds or valid <= tolerance_seconds:
        status = "unavailable"
    elif non_valid <= tolerance_seconds and valid >= assessable - tolerance_seconds:
        status = "complete"
    else:
        status = "partial"

    coverage = min(1.0, valid / assessable) if assessable > tolerance_seconds else None
    requested_coverage = min(1.0, valid / requested) if requested > tolerance_seconds else None

    return {
        "model": "validity-v1",
        "states": {
            "valid": valid,
            "suspect": suspect,
            "invalid": invalid,
            "excluded": excluded,
            "missing": missing,
            "unknown": unknown_total,
        },
        "requested_seconds": requested,
        "assessable_seconds": assessable,
        "valid_seconds": valid,
        "suspect_seconds": suspect,
        "invalid_seconds": invalid,
        "excluded_seconds": excluded,
        "missing_seconds": missing,
        "unknown_seconds": unknown_total,
        "uncovered_seconds": uncovered,
        "coverage_fraction": coverage,
        "requested_coverage_fraction": requested_coverage,
        "calculation_status": status,
    }


def validity_status(summary: Mapping[str, object] | None) -> str:
    """Return a safe status from a validity-summary mapping."""
    if not summary:
        return "unavailable"
    value = str(summary.get("calculation_status", "unavailable"))
    return value if value in CALCULATION_STATUSES else "unavailable"
