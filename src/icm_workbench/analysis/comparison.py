from __future__ import annotations

import pandas as pd

from .alignment import pair_series, time_coverage
from .metrics import calibration_metrics


def _bounds(frame):
    if frame is None or getattr(frame, "empty", True) or "timestamp" not in frame.columns:
        return None, None
    ts = pd.to_datetime(frame["timestamp"], errors="coerce").dropna()
    if ts.empty:
        return None, None
    return pd.Timestamp(ts.min()), pd.Timestamp(ts.max())


def _comparison_domain(observed, modelled, start=None, end=None):
    obs_start, obs_end = _bounds(observed)
    mod_start, mod_end = _bounds(modelled)
    if obs_start is None or mod_start is None:
        return None, None
    domain_start = pd.Timestamp(start) if start is not None else max(obs_start, mod_start)
    domain_end = pd.Timestamp(end) if end is not None else min(obs_end, mod_end)
    if domain_end <= domain_start:
        return None, None
    return domain_start, domain_end


def compare_scenarios(
    observed,
    obs_col,
    scenarios,
    *,
    max_gap_seconds=900.0,
    start=None,
    end=None,
    common_valid_domain=False,
):
    """Compare scenarios while reporting support validity alongside metrics."""
    pairs = {
        name: pair_series(
            observed,
            frame,
            obs_col,
            col,
            max_gap_seconds=max_gap_seconds,
            start=start,
            end=end,
        )
        for name, (frame, col) in scenarios.items()
    }
    common = None
    if common_valid_domain and pairs:
        for frame in pairs.values():
            ts = set(pd.to_datetime(frame.timestamp))
            common = ts if common is None else common & ts

    rows = []
    for name, paired in pairs.items():
        modelled, model_col = scenarios[name]
        if common is not None:
            paired = paired[pd.to_datetime(paired.timestamp).isin(common)]

        domain_start, domain_end = _comparison_domain(
            observed, modelled, start=start, end=end
        )
        if domain_start is None:
            obs_coverage = {
                "coverage_fraction": None,
                "status": "unavailable",
            }
            model_coverage = {
                "coverage_fraction": None,
                "status": "unavailable",
            }
            calculation_status = "unavailable"
        else:
            obs_coverage = time_coverage(
                observed,
                obs_col,
                domain_start,
                domain_end,
                max_gap_seconds=max_gap_seconds,
            )
            model_coverage = time_coverage(
                modelled,
                model_col,
                domain_start,
                domain_end,
                max_gap_seconds=max_gap_seconds,
            )
            if paired.empty:
                calculation_status = "unavailable"
            elif (
                obs_coverage["status"] == "complete"
                and model_coverage["status"] == "complete"
            ):
                calculation_status = "complete"
            else:
                calculation_status = "partial"

        rows.append(
            {
                "scenario": name,
                **calibration_metrics(paired),
                "comparison_domain": (
                    "common valid pairs"
                    if common_valid_domain
                    else "scenario valid pairs"
                ),
                "analysis_start": domain_start,
                "analysis_end": domain_end,
                "observed_coverage_fraction": obs_coverage["coverage_fraction"],
                "model_coverage_fraction": model_coverage["coverage_fraction"],
                "calculation_status": calculation_status,
                "validity_model": "validity-v1",
            }
        )
    return pd.DataFrame(rows)


def preview_time_offset(
    observed,
    modelled,
    obs_col,
    model_col,
    offset_minutes,
    *,
    max_gap_seconds=900.0,
):
    before = pair_series(
        observed,
        modelled,
        obs_col,
        model_col,
        max_gap_seconds=max_gap_seconds,
    )
    shifted = modelled.copy()
    shifted["timestamp"] = pd.to_datetime(shifted["timestamp"]) + pd.to_timedelta(
        float(offset_minutes), unit="min"
    )
    after = pair_series(
        observed,
        shifted,
        obs_col,
        model_col,
        max_gap_seconds=max_gap_seconds,
    )
    return {
        "offset_minutes": float(offset_minutes),
        "sign_convention": "positive shifts model later in clock time",
        "before": calibration_metrics(before),
        "after_preview": calibration_metrics(after),
        "applied": False,
    }
