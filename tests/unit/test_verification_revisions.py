# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
from copy import deepcopy

import pytest

from icm_workbench.analysis.verification_revisions import compare_verification_revisions


def evidence(peak, volume, timing):
    return {"peak": {"value": peak, "unit": "%", "status": "Outside tolerance"},
            "volume": {"value": volume, "unit": "%", "status": "Meets"},
            "timing": {"value": timing, "unit": "min", "status": "Meets"}}


def snapshot(checks):
    return {"schema": "hydra-verification-snapshot-v1", "quantity": "flow", "method": "project-event-screens-v1",
            "rainfall_basis": "survey", "maximum_gap_seconds": 60, "model_offset_minutes": 0,
            "criteria": {"minimum_coverage_percent": 90, "peak_offset_minutes": 10, "flow_peak_floor_m3_s": .001,
                         "flow_volume_floor_m3": 1, "flow_peak_error_percent": 10, "flow_volume_error_percent": 5},
            "rows": [{"observed_sha256": "1" * 64, "observed_column": "flow", "model_sha256": "2" * 64, "model_column": "flow",
                      "start": "2025-01-01T00:00:00", "end": "2025-01-01T00:02:00", "rainfall_provenance": "3" * 64,
                      "complete_support": True, "checks": checks,"evidence": {"status": "complete", "requested_seconds": 120,
                       "common_support_seconds": 120, "excluded_seconds": 0, "observed_peak": 2, "observed_volume_m3": 180}}]}


def test_absolute_change_preserves_signed_before_and_after_and_independent_outcomes():
    baseline = snapshot(evidence(12, -2, .5))
    new = snapshot(evidence(-9, 4, -.5))
    new["rows"][0]["model_sha256"] = "4" * 64
    result = compare_verification_revisions(baseline, new)["rows"][0]
    assert result["baseline_row"] == result["candidate_row"] == 0
    assert result["checks"]["peak"] == {"status": "Improved", "baseline": 12, "candidate": -9,
                                        "change_in_error_magnitude": -3, "unit": "%", "reason": None}
    assert result["checks"]["volume"]["status"] == "Deteriorated"
    assert result["checks"]["timing"]["status"] == "Unchanged"


def test_changed_basis_missing_duplicate_or_partial_baselines_are_incomparable():
    baseline = snapshot(evidence(12, -2, .5))
    for key, changed in [("observed_sha256", "4" * 64), ("rainfall_provenance", "5" * 64),
                         ("end", "2025-01-01T00:03:00"), ("complete_support", False)]:
        candidate = deepcopy(baseline)
        candidate["rows"][0][key] = changed
        checks = compare_verification_revisions(baseline, candidate)["rows"][0]["checks"]
        assert {entry["status"] for entry in checks.values()} == {"Not comparable"}
    candidate = deepcopy(baseline)
    candidate["criteria"]["peak_offset_minutes"] = 1
    assert "same project basis" in compare_verification_revisions(baseline, candidate)["rows"][0]["checks"]["timing"]["reason"]
    candidate = deepcopy(baseline)
    candidate["rows"][0]["evidence"]["observed_peak"] = 2.5
    assert "observed peak" in compare_verification_revisions(baseline, candidate)["rows"][0]["checks"]["peak"]["reason"]
    candidate = deepcopy(baseline)
    candidate["rows"][0]["evidence"]["common_support_seconds"] = 60
    assert "complete event" in compare_verification_revisions(baseline, candidate)["rows"][0]["checks"]["peak"]["reason"]
    candidate = deepcopy(baseline)
    baseline["rows"].append(deepcopy(baseline["rows"][0]))
    assert "More than one baseline" in compare_verification_revisions(baseline, candidate)["rows"][0]["checks"]["timing"]["reason"]


def test_withheld_or_unit_mismatch_do_not_obscure_comparable_metrics():
    candidate = snapshot(evidence(6, 1, 0))
    baseline = snapshot(evidence(10, 0, 1))
    candidate["rows"][0]["checks"]["timing"]["status"] = "Withheld"
    candidate["rows"][0]["checks"]["volume"]["unit"] = "m³"
    decisions = compare_verification_revisions(baseline, candidate)["rows"][0]["checks"]
    assert decisions["peak"]["status"] == "Improved"
    assert decisions["volume"]["status"] == decisions["timing"]["status"] == "Not comparable"
    candidate["rows"][0]["start"] += "Z"
    with pytest.raises(ValueError, match="project-clock period"):
        compare_verification_revisions(baseline, candidate)
