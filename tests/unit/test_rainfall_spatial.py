# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
import numpy as np
import pytest

from icm_workbench.analysis.rainfall_spatial import compare_rainfall


def gauge(values, *, step=60, depth=True, exclusions=(), trailing=True):
    return {"times": np.arange(len(values), dtype=float) * step, "samples": np.asarray(values, dtype=float),
            "trailing": step if trailing else None, "convention": "interval_depth" if depth else "interval_average",
            "exclusions": exclusions}


def test_complete_depth_spatial_variability_signed_peak_and_pearson():
    # Integrate one-minute depths and thirty-second interval-average rates.
    # The four common bins are [0, 2, 4, 0] and [0, 4, 0, 8] mm.
    first = gauge([0, 2, 4, 0])
    second = gauge([0, 0, 4/60, 4/60, 0, 0, 8/60, 8/60], step=30, depth=False)
    result = compare_rainfall([first, second], duration=240, interval=60, maximum_gap=60, suspect_rate=300)
    a, b = result["gauges"]
    assert a["event_depth_mm"] == 6 and b["event_depth_mm"] == 12
    assert a["peak_rate_mm_h"] == 240 and b["peak_rate_mm_h"] == 480
    assert b["suspect_intervals"] == 1
    assert result["pairs"][0] == {"left": 0, "right": 1, "common_intervals": 4,
                                   "correlation": pytest.approx(-5/11), "peak_offset_seconds": 60}
    assert result["spatial_cv_percent"] == pytest.approx(100/3)


def test_missing_negative_and_excluded_periods_are_explicit():
    result = compare_rainfall([gauge([1, 2, 3, 4, 5], exclusions=((75, 90),)),
                               gauge([0, np.nan, -1, 2, 4], trailing=False)],
                              duration=300, interval=60, maximum_gap=60)
    left, right = result["gauges"]
    assert left["valid_seconds"] == 285 and left["complete_intervals"] == 4
    assert left["intervals"][1] == [1.5, 45, None, False]
    assert left["intervals"][2] == [3, 60, 5.5, False]
    assert right["intervals"][0] == [0, 60, 0, False]
    assert right["intervals"][1] == right["intervals"][2] == right["intervals"][4] == [None, 0, None, False]
    assert right["negative_source_samples"] == 1 and right["supported_depth_mm"] == 2
    assert right["event_depth_mm"] is None and left["event_depth_mm"] is None
    assert result["pairs"][0]["common_intervals"] == 2
    assert result["pairs"][0]["correlation"] is result["pairs"][0]["peak_offset_seconds"] is None
    assert result["spatial_cv_percent"] is None


def test_unequal_final_bin_and_nonunique_peaks_are_qualified():
    result = compare_rainfall([gauge([1, 1, 1]), gauge([0, 0, 1])], duration=150, interval=60, maximum_gap=60)
    assert result["endpoints_seconds"] == [0, 60, 120, 150]
    assert result["gauges"][0]["event_depth_mm"] == 2.5
    assert result["gauges"][0]["peak_interval"] is None
    assert result["gauges"][1]["peak_interval"] == 2
    assert result["pairs"][0]["common_intervals"] == 2
    assert result["pairs"][0]["peak_offset_seconds"] is None


def test_long_gap_and_input_bounds():
    one = gauge([1, 2, 3], step=120)
    result = compare_rainfall([one, one], duration=360, interval=60, maximum_gap=60)
    assert result["gauges"][0]["valid_seconds"] == 0
    assert result["gauges"][0]["supported_depth_mm"] is None
    with pytest.raises(ValueError, match="two to eight"):
        compare_rainfall([one], duration=60, interval=60, maximum_gap=60)
    with pytest.raises(ValueError, match="10,000"):
        compare_rainfall([one, one], duration=10001, interval=1, maximum_gap=60)
    with pytest.raises(ValueError, match="positive finite"):
        compare_rainfall([one, one], duration=60, interval=60, maximum_gap=60, suspect_rate=float('nan'))
