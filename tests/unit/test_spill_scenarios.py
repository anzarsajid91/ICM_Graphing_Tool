import json

import numpy as np
import pandas as pd
import pytest

from icm_workbench.analysis.spill_scenarios import evaluate_scenario, reporting_windows, scenario_delta
from icm_workbench.browser_api import compare_spill_scenarios
from icm_workbench.domain import ExclusionPeriod


def case(wet_intervals, *, flow=True, missing=False, exclusions=()):
    times = pd.date_range("2025-01-01", "2025-04-01", freq="D")
    values = np.zeros(len(times))
    values[1:wet_intervals + 1] = 2
    if missing:
        values[10] = np.nan
    discharge = {"times": times, "values": np.full(len(times), .1), "convention": "instantaneous", "exclusions": ()}
    return {"frame": pd.DataFrame({"timestamp": times, "depth": values}), "column": "depth",
            "exclusions": exclusions, "flow": discharge if flow else None}


def assessment(spec):
    return evaluate_scenario(spec, 1, pd.Timestamp("2025-01-01"), pd.Timestamp("2025-04-01"), 86400)


def test_common_period_compares_count_duration_and_volume_independently():
    baseline, proposed = assessment(case(1)), assessment(case(2))
    assert [baseline["count"], proposed["count"]] == [2, 3]
    difference = scenario_delta(baseline, proposed)
    assert difference["count"] == 1
    assert difference["duration_hours"] == pytest.approx(24)
    assert difference["volume_m3"] == pytest.approx(8640)
    no_volume = scenario_delta(baseline, assessment(case(2, flow=False)))
    assert no_volume["volume_m3"] is None
    assert no_volume["count"] == 1


def test_unknown_coverage_and_unequal_masks_withhold_scenario_deltas():
    baseline = assessment(case(1))
    missing = scenario_delta(baseline, assessment(case(2, missing=True)))
    assert [missing[key] for key in ("count", "duration_hours", "volume_m3")] == [None, None, None]
    excluded = ExclusionPeriod(pd.Timestamp("2025-02-01"), pd.Timestamp("2025-02-02"), "synthetic review")
    result = scenario_delta(baseline, assessment(case(2, exclusions=(excluded,))))
    assert [result[key] for key in ("count", "duration_hours", "volume_m3")] == [None, None, None]
    assert "exclusion masks differ" in result["period_reason"]


def test_reporting_windows_include_year_boundaries_and_partial_edges():
    windows = list(reporting_windows("2024-06-01", "2026-03-01"))
    assert [(a.year, b.date().isoformat()) for a, b in windows] == [
        (2024, "2025-01-01"), (2025, "2026-01-01"), (2026, "2026-03-01")]
    with pytest.raises(ValueError, match="project clock"):
        list(reporting_windows("2025-01-01T00:00:00Z", "2025-04-01"))


def test_browser_contract_checks_project_cases_and_optional_flow(tmp_path):
    def write(name, spec, header="Depth (m)"):
        frame = spec["frame"].rename(columns={"depth": header})
        path = tmp_path / name
        frame.to_csv(path, index=False)
        return {"path": str(path), "column": header}

    base = write("baseline.csv", case(1))
    candidate = {**write("proposed.csv", case(2)), "name": "Growth"}
    asset = {"id": "00127", "threshold_m": 1, "baseline": base, "proposed": [candidate]}
    bounds = dict(start="2025-01-01", end="2025-04-01", baseline_name="Current", max_gap_s=86400)
    row, = json.loads(compare_spill_scenarios([asset], **bounds))["rows"]
    assert row["asset"] == "00127"
    assert row["delta"]["count"] == 1
    assert row["delta"]["volume_m3"] is None
    with pytest.raises(ValueError, match="unique scenario names"):
        compare_spill_scenarios([{**asset, "proposed": [{**candidate, "name": "Current"}]}], **bounds)
    with pytest.raises(ValueError, match="Confirm that each flow channel"):
        compare_spill_scenarios([{**asset, "proposed": [{**candidate, "flow": base}]}], **bounds)
    forecast = write("forecast.csv", case(2), "Level (m)")
    with pytest.raises(ValueError, match="common depth or level"):
        compare_spill_scenarios([{**asset, "datum": "AOD", "proposed": [{**forecast, "name": "Growth"}]}], **bounds)
