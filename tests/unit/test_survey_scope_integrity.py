from datetime import datetime

import pandas as pd

from icm_workbench.advanced_api import _survey_exclusions_for
from icm_workbench.analysis.survey_assessment import network_rainfall_assessment
from icm_workbench.analysis.survey_context import survey_volume_balance
from icm_workbench.domain import ExclusionPeriod


def _raw_exclusion(scope, start="2026-01-05T00:00:00", end="2026-01-05T01:00:00", reason="QA"):
    return {
        "enabled": True,
        "scope": scope,
        "start": start,
        "end": end,
        "reason": reason,
    }


def test_survey_exclusion_resolution_is_subject_and_channel_specific():
    raw = [
        _raw_exclusion("observed", reason="global hydraulic"),
        _raw_exclusion("survey:monitor:FM01:flow", reason="FM01 flow"),
        _raw_exclusion("survey:monitor:FM02:depth", reason="FM02 depth"),
        _raw_exclusion("survey:gauge:RG01:rainfall", reason="RG01 rain"),
    ]

    fm01_flow = _survey_exclusions_for(raw, "monitor", "FM01", "flow")
    fm01_depth = _survey_exclusions_for(raw, "monitor", "FM01", "depth")
    fm02_depth = _survey_exclusions_for(raw, "monitor", "FM02", "depth")
    rg01 = _survey_exclusions_for(raw, "gauge", "RG01", "rainfall")
    rg02 = _survey_exclusions_for(raw, "gauge", "RG02", "rainfall")

    assert {x.reason for x in fm01_flow} == {"global hydraulic", "FM01 flow"}
    assert {x.reason for x in fm01_depth} == {"global hydraulic"}
    assert {x.reason for x in fm02_depth} == {"global hydraulic", "FM02 depth"}
    # This helper receives the role-filtered rainfall collection in production.
    assert "RG01 rain" in {x.reason for x in rg01}
    assert "RG01 rain" not in {x.reason for x in rg02}


def test_volume_balance_exclusion_for_one_monitor_does_not_apply_to_another():
    timestamps = pd.date_range("2026-01-05", periods=25, freq="h")
    flows = {
        "FM01": pd.DataFrame({"timestamp": timestamps, "flow": 1.0}),
        "FM02": pd.DataFrame({"timestamp": timestamps, "flow": 1.0}),
    }
    associations = [
        {"monitor": "FM02", "upstream": ["FM01"], "rain_gauge": "RG01", "diameter_mm": 450}
    ]
    exclusion = ExclusionPeriod(
        datetime(2026, 1, 5, 6),
        datetime(2026, 1, 5, 8),
        "FM01 logger maintenance",
    )
    result = survey_volume_balance(
        flows,
        associations,
        start=pd.Timestamp("2026-01-05"),
        end=pd.Timestamp("2026-01-06"),
        exclusions=[],
        exclusions_by_monitor={"FM01": [exclusion], "FM02": []},
        max_gap_seconds=3700,
    )
    by_monitor = {row["monitor"]: row for row in result["monitor_weeks"]}
    assert by_monitor["FM01"]["excluded_seconds"] == 7200
    assert by_monitor["FM02"]["excluded_seconds"] == 0


def test_network_rainfall_exclusion_isolated_to_target_gauge():
    timestamps = pd.date_range("2026-01-05", periods=96, freq="15min")
    gauges = {
        "RG01": (pd.DataFrame({"timestamp": timestamps, "rainfall": 1.0}), "rainfall", 15.0),
        "RG02": (pd.DataFrame({"timestamp": timestamps, "rainfall": 1.0}), "rainfall", 15.0),
    }
    exclusion = ExclusionPeriod(
        datetime(2026, 1, 5, 0),
        datetime(2026, 1, 5, 12),
        "RG01 outage",
    )
    result = network_rainfall_assessment(
        gauges,
        gauge_exclusions={"RG01": [exclusion], "RG02": []},
    )
    summary = {row["gauge"]: row for row in result["gauge_summary"]}
    assert summary["RG01"]["operational_days"] == 0
    assert summary["RG02"]["operational_days"] == 1
