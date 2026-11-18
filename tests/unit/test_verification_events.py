import pandas as pd
import pytest

from icm_workbench.analysis.verification_events import compare_event_support
from icm_workbench.domain import ExclusionPeriod

T = pd.Timestamp("2026-01-01")


def stamp(seconds):
    return T + pd.Timedelta(seconds=seconds)


def series(seconds, values):
    return pd.DataFrame({"timestamp": [stamp(s) for s in seconds], "q": values})


def test_irregular_event_uses_common_knots_and_cuts_exact_exclusions():
    observed = series([0, 60, 150], [0, 2, 0])
    model = series([0, 90, 150], [0, 3, 0])
    exclusion = ExclusionPeriod(start=stamp(30), end=stamp(60), reason="Synthetic gap")
    result = compare_event_support(observed, model, "q", "q", T, stamp(150), 120, [exclusion])
    assert result["common_support_seconds"] == pytest.approx(120)
    assert result["excluded_seconds"] == pytest.approx(30)
    assert result["observed_integral"] == pytest.approx(150 - 45)
    assert result["modelled_integral"] == pytest.approx(225 - 45)
    assert result["observed_peak"] == pytest.approx(2)
    assert result["modelled_peak"] == pytest.approx(3)
    assert result["peak_lag_minutes"] == pytest.approx(.5)
    assert result["status"] == "complete"


def test_equal_separate_support_can_have_zero_common_support():
    observed = series([0, 30], [1, 1])
    model = series([60, 90], [2, 2])
    result = compare_event_support(observed, model, "q", "q", T, stamp(90), 30)
    assert result["coverage_fraction"] == 0
    assert result["observed_peak"] is None
    assert result["modelled_integral"] is None
    assert result["status"] == "unavailable"


def test_does_not_bridge_invalid_timestep_or_long_gap():
    observed = series([0, 30, 40, 60, 100, 130], [1, 1, None, 1, 1, 1])
    model = series([0, 30, 60, 90, 120, 130], [2]*6)
    result = compare_event_support(observed, model, "q", "q", T, stamp(130), 35)
    assert result["common_support_seconds"] == pytest.approx(60)
    assert result["observed_integral"] == pytest.approx(60)
    assert result["modelled_integral"] == pytest.approx(120)
    assert result["status"] == "partial"
