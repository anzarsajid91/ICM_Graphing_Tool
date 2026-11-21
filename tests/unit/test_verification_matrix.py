# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
import pandas as pd
import pytest

from icm_workbench.analysis.verification_events import compare_event_support
from icm_workbench.analysis.verification_matrix import verification_event_criteria
from icm_workbench.browser_api import verification_matrix_event


CRITERIA = {"minimum_coverage_percent": 90, "flow_peak_floor_m3_s": .0001, "flow_volume_floor_m3": .01,
            "flow_peak_error_percent": 10, "flow_volume_error_percent": 5, "depth_peak_error_m": .05,
            "peak_offset_minutes": .5}
T0 = pd.Timestamp("2025-01-01")


def frame(seconds, values):
    return pd.DataFrame({"timestamp": T0 + pd.to_timedelta(seconds, unit="s"), "v": values})


def compare(observed, scenario, *, gap=60):
    result = compare_event_support(observed, scenario, "v", "v", T0, T0 + pd.Timedelta(seconds=120), gap)
    return {**result, "observed_volume_m3": result["observed_integral"], "modelled_volume_m3": result["modelled_integral"]}


def test_independent_peak_volume_timing_and_whole_event_support():
    observed = frame([0, 60, 120], [1, 2, 1])
    model = frame([0, 60, 120], [1, 2.2, 1])
    event = compare(observed, model)
    assert event["observed_volume_m3"] == 180
    assert event["modelled_volume_m3"] == 192
    result = verification_event_criteria(event, "flow", CRITERIA)
    assert result["support_complete"]
    checks = result["checks"]
    assert checks["coverage"]["value"] == 100
    assert checks["peak"]["value"] == pytest.approx(10)
    assert checks["peak"]["status"] == "Meets"
    assert checks["volume"]["value"] == pytest.approx(20/3)
    assert checks["volume"]["status"] == "Outside tolerance"
    assert checks["timing"]["value"] == 0
    reverse = verification_event_criteria(compare(model, observed), "flow", CRITERIA)["checks"]
    assert reverse["peak"]["value"] == pytest.approx(-100 / 11)
    assert reverse["volume"]["value"] == pytest.approx(-6.25)


def test_incomplete_event_preserves_support_and_withholds_full_event_criteria():
    event = compare(frame([0, 60, 120], [1, 2, 1]), frame([0, 60], [1, 2]))
    checks = verification_event_criteria(event, "flow", CRITERIA)["checks"]
    assert checks["coverage"]["value"] == 50
    assert checks["coverage"]["status"] == "Below requirement"
    assert {checks[x]["status"] for x in ("peak", "timing", "volume")} == {"Withheld"}
    assert checks["peak"]["value"] == 0


def test_repeated_peaks_and_zero_flow_withhold_timing_and_relative_terms():
    flat = frame([0, 60, 120], [0, 0, 0])
    event = compare(flat, flat)
    assert event["peak_time_ambiguous"]
    checks = verification_event_criteria(event, "flow", CRITERIA)["checks"]
    assert "tied peak" in checks["timing"]["reason"]
    assert "reference floor" in checks["peak"]["reason"]
    assert "reference floor" in checks["volume"]["reason"]


def test_depth_error_is_absolute_units_and_signed_offset_is_preserved():
    event = compare(frame([0, 30, 60, 120], [.1, .2, .3, .1]), frame([0, 60, 100, 120], [.1, .2, .36, .1]))
    checks = verification_event_criteria(event, "depth", CRITERIA)["checks"]
    assert "volume" not in checks
    assert checks["peak"]["unit"] == "m" and checks["peak"]["value"] == pytest.approx(.06)
    assert checks["timing"]["value"] == pytest.approx(40/60)
    assert checks["timing"]["status"] == "Outside tolerance"
    with pytest.raises(ValueError, match="minimum coverage"):
        verification_event_criteria(event, "depth", {**CRITERIA, "minimum_coverage_percent": 0})


def test_worker_slices_native_bounds_and_reuses_recorded_units_and_offset(tmp_path):
    import json

    def record(filename, values, times, unit):
        path = tmp_path / filename
        column = f"Flow ({unit})"
        path.write_text("Timestamp," + column + "\n" + "\n".join(
            f"{(T0 + pd.Timedelta(seconds=t)).isoformat()},{v}" for t, v in zip(times, values)))
        return {"path": str(path), "column": column}

    observed = record("observed.csv", [1, 2, 1, 8], [0, 60, 120, 600], "m3/s")
    scenario = record("model.csv", [1000, 2200, 1000, 4000], [-60, 0, 60, 540], "L/s")
    result = json.loads(verification_matrix_event(observed, scenario,
                        {"start": "2025-01-01T00:00:30", "end": "2025-01-01T00:01:30"}, CRITERIA, 60, 1))
    assert result["support_complete"]
    values = result["values"]
    assert values["observed_volume_m3"] == 105
    assert values["modelled_volume_m3"] == pytest.approx(114)
    assert values["peak_error"] == pytest.approx(.2)
    assert values["peak_lag_minutes"] == 0
