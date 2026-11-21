import json
from math import pi

import numpy as np
import pandas as pd
import pytest

from icm_workbench.analysis.pipe_capacity import circular_wetted_area
from icm_workbench.analysis.survey_monitor_diagnostics import monitor_diagnostics
from icm_workbench.browser_api import review_monitor_channels
from icm_workbench.domain import ExclusionPeriod


CRITERIA = {"max_gap_s": 60, "diameter_m": 1, "geometry_confirmed": True,
            "depth_min_m": .01, "depth_max_m": .9, "velocity_min_m_s": -.8, "velocity_max_m_s": 1,
            "velocity_step_m_s": .7, "flat_depth_amplitude_m": .005, "flat_duration_s": 120,
            "flat_velocity_swing_m_s": .8, "rise_depth_m": .2, "rise_velocity_ceiling_m_s": .1,
            "downstream_positive": True, "flow_relative_tolerance_percent": 20, "flow_floor_m3_s": .01,
            "flow_basis_confirmed": True}


def data():
    return pd.DataFrame({"timestamp": pd.date_range("2025-01-01", periods=7, freq="min"),
                         "depth": [.5, .5, .5, .8, 1.1, np.nan, .5],
                         "velocity": [.2, 1.2, .6, -.2, -1, .2, 1],
                         "flow": [pi/40, .9, 3*pi/40, np.nan, .5, .1, pi/8]})


def test_independent_area_and_paired_pattern_evidence():
    assert circular_wetted_area(1, .5) == pytest.approx(pi / 8)
    assert circular_wetted_area(1, 0) == 0
    assert circular_wetted_area(1, 1) == pytest.approx(pi / 4)
    result = monitor_diagnostics(data(), "depth", "velocity", "flow", settings=CRITERIA)
    assert result["paired_samples"] == 6
    assert result["flow_checked_samples"] == 4
    by_kind = {row["kind"]: row for row in result["findings"]}
    assert by_kind.keys() == {"velocity-range", "velocity-change", "depth-range", "crown", "rising-low-velocity", "flat-depth", "flow-consistency"}
    assert by_kind["flat-depth"]["observed"] == pytest.approx(1)
    assert by_kind["crown"]["observed"] == pytest.approx(1.1)
    assert by_kind["flow-consistency"]["observed"] == pytest.approx((.9 - 1.2*pi/8) / (1.2*pi/8)*100)


def test_excluded_interval_breaks_adjacent_support_even_without_excluded_sample():
    frame = data()
    exclusions = (ExclusionPeriod(pd.Timestamp("2025-01-01T00:01:20"), pd.Timestamp("2025-01-01T00:01:40"), "synthetic review"),)
    result = monitor_diagnostics(frame, "depth", "velocity", "flow", settings=CRITERIA, exclusions=exclusions)
    assert result["excluded_samples"] == 0
    assert "flat-depth" not in result["counts"]
    for key, message in [("geometry_confirmed", "circular pipe section"), ("downstream_positive", "positive downstream"),
                         ("flow_basis_confirmed", "mean velocity with a common sign")]:
        with pytest.raises(ValueError, match=message):
            monitor_diagnostics(frame, "depth", "velocity", "flow", settings={**CRITERIA, key: False})


def test_browser_operation_preserves_source_and_checks_dimensions(tmp_path):
    file = tmp_path / "synthetic-monitor.csv"
    frame = data().rename(columns={"depth": "Depth (m)", "velocity": "Velocity (m/s)", "flow": "Flow (m3/s)"})
    frame.to_csv(file, index=False)
    original = file.read_bytes()
    checked = json.loads(review_monitor_channels(str(file), "Depth (m)", "Velocity (m/s)", CRITERIA, "Flow (m3/s)"))
    assert checked["rows"] == len(frame)
    assert checked["counts"]["flow-consistency"] == 1
    assert file.read_bytes() == original
    with pytest.raises(ValueError, match="resolved canonical units"):
        review_monitor_channels(str(file), "Flow (m3/s)", "Velocity (m/s)", CRITERIA)
