# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
import numpy as np
import pytest

from icm_workbench.analysis.survey_suitability import assess_verification_period, supported_monitor_range


def test_exact_supported_and_in_range_seconds_are_independent():
    # At 60 s depth exceeds its commissioned sensor range, invalidating both
    # touching support intervals for suitability. An exclusion clips the third.
    result = supported_monitor_range(np.array([0, 60, 120, 180, 240], dtype=float),
                                     [.2, 1.1, .5, .4, np.nan], duration=240, gap=60,
                                     minimum=.05, maximum=.9, exclusions=((130, 150),))
    assert result == {"supported_seconds": 160, "in_range_seconds": 40, "range_verified": True}


def test_partial_clock_boundaries_and_reverse_velocity():
    result = supported_monitor_range(np.array([-30, 30, 90], dtype=float), [-.8, -.5, 0],
                                     duration=60, gap=60, minimum=-1, maximum=.5)
    assert result == {"supported_seconds": 60, "in_range_seconds": 60, "range_verified": True}
    unsupported = supported_monitor_range(np.array([-30, 30, 90], dtype=float), [-.8, -.5, 0],
                                          duration=60, gap=30, minimum=-1)
    assert unsupported == {"supported_seconds": 0, "in_range_seconds": 0, "range_verified": False}


def test_candidate_requires_independent_rainfall_measurements_and_site_evidence():
    def support(raw, bounded=None):
        return {"supported_seconds": raw, "in_range_seconds": bounded, "range_verified": bounded is not None}

    channels = {"depth": support(100, 90), "velocity": support(95, 90), "flow": support(90)}
    kwargs = dict(duration=100, rain_seconds=90, rain_qualified=True, minimum_percent=90, measurement_review="reviewed")
    ready = assess_verification_period(channels, **kwargs)
    assert ready["status"] == "Candidate for verification" and set(ready["checks"].values()) == {"Meets"}
    for key, value, criterion, expected in [
        ("rain_qualified", False, "rainfall_qualification", "Does not qualify"),
        ("rain_qualified", None, "rainfall_qualification", "Unavailable"),
        ("rain_seconds", 0, "mapped_gauge_coverage", "Unavailable"),
        ("rain_seconds", 89, "mapped_gauge_coverage", "Below requirement"),
        ("measurement_review", "unreviewed", "site_measurement_review", "Review missing"),
        ("measurement_review", "hold", "site_measurement_review", "Investigation required"),
    ]:
        held = assess_verification_period(channels, **{**kwargs, key: value})
        assert held["status"] == "Hold for review" and held["checks"][criterion] == expected
    channels["velocity"]["range_verified"] = False
    assert assess_verification_period(channels, **kwargs)["checks"]["velocity_range"] == "Review missing"
    del channels["flow"]
    assert assess_verification_period(channels, **kwargs)["checks"]["flow_coverage"] == "Unavailable"
    assert "flow_coverage" not in assess_verification_period(channels, **kwargs, flow_required=False)["checks"]


def test_invalid_criteria_are_rejected():
    with pytest.raises(ValueError, match="instrument range"):
        supported_monitor_range(np.array([0., 60.]), [0, 1], duration=60, gap=60, minimum=2, maximum=1)
    with pytest.raises(ValueError, match="coverage requirement"):
        assess_verification_period({}, duration=60, rain_seconds=60, rain_qualified=True,
                                   minimum_percent=101, measurement_review="reviewed")
