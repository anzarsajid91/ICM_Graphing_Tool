from __future__ import annotations

from datetime import datetime
import inspect

import numpy as np
import pandas as pd
import pytest

from icm_workbench import advanced_api
from icm_workbench.analysis.alignment import pair_series
from icm_workbench.analysis.events import detect_rainfall_events
from icm_workbench.analysis.integration import integrate_series
from icm_workbench.analysis.review import dry_weather_flow, event_response_summary
from icm_workbench.domain import ExclusionPeriod
from icm_workbench.parsers.csv import parse_tabular_csv


@pytest.mark.xfail(
    reason="A-01: DWF completeness currently does not enforce adequate daily flow support.",
    strict=False,
)
def test_a01_sparse_flow_cannot_produce_complete_dwf():
    # Six complete dry rainfall days but only one flow sample per day.
    flow = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01 12:00", periods=6, freq="D"),
            "flow": [0.10, 0.11, 0.09, 0.10, 0.12, 0.10],
        }
    )
    rain = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=6 * 24, freq="h"),
            "rainfall": 0.0,
        }
    )
    result = dry_weather_flow(
        flow,
        "flow",
        rain,
        "rainfall",
        dry_day_mm=1.0,
        baseline_days=28,
        min_dry_days=5,
        adp_hours=6.0,
        rain_semantics="intensity",
        rain_interval_min=60.0,
        rain_max_gap_seconds=5400.0,
    )
    assert result["calculation_status"] != "complete"


@pytest.mark.xfail(
    reason="A-02: browser rainfall bridges currently hard-code intensity semantics.",
    strict=False,
)
def test_a02_rainfall_bridges_expose_explicit_semantics_contract():
    for function in (
        advanced_api.rainfall_event_scaled,
        advanced_api.cumulative_rainfall_series,
        advanced_api.dwf_scaled,
    ):
        assert "rainfall_semantics" in inspect.signature(function).parameters


@pytest.mark.xfail(
    reason="A-03: an exclusion wholly between rainfall timestamps is currently invisible.",
    strict=False,
)
def test_a03_between_sample_rainfall_exclusion_breaks_event_support():
    rain = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                [
                    "2026-01-01 00:00",
                    "2026-01-01 00:15",
                    "2026-01-01 00:30",
                ]
            ),
            "rainfall": [6.0, 6.0, 6.0],
        }
    )
    exclusion = ExclusionPeriod(
        datetime(2026, 1, 1, 0, 5),
        datetime(2026, 1, 1, 0, 10),
        "known gauge fault",
    )
    events = detect_rainfall_events(
        rain,
        intensity_col="rainfall",
        minimum_intensity=0.0,
        minimum_intensity_duration_min=0.0,
        minimum_depth_mm=0.0,
        minimum_event_duration_min=0.0,
        dry_gap_min=60.0,
        exclusions=[exclusion],
        semantics="intensity",
        declared_interval_minutes=15.0,
        max_gap_seconds=900.0,
    )
    assert events
    assert all(
        not (
            pd.Timestamp(event["start"]) < pd.Timestamp(exclusion.end)
            and pd.Timestamp(event["end"]) > pd.Timestamp(exclusion.start)
        )
        for event in events
    )


@pytest.mark.xfail(
    reason="A-04: pair_series clips away model bracketing points before interpolation.",
    strict=False,
)
def test_a04_requested_start_keeps_model_bracket_for_interpolation():
    observed = pd.DataFrame(
        {"timestamp": pd.to_datetime(["2026-01-01 10:05"]), "value": [5.0]}
    )
    modelled = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                ["2026-01-01 10:00", "2026-01-01 10:10"]
            ),
            "value": [0.0, 10.0],
        }
    )
    paired = pair_series(
        observed,
        modelled,
        "value",
        "value",
        max_gap_seconds=900.0,
        start="2026-01-01 10:05",
    )
    assert len(paired) == 1
    assert paired.iloc[0]["sim"] == pytest.approx(5.0)


@pytest.mark.xfail(
    reason="A-05: timezone-aware CSV sources are not classified unresolved at import.",
    strict=False,
)
def test_a05_timezone_aware_csv_is_flagged_before_model_clock_calculation(tmp_path):
    source = tmp_path / "timezone-aware.csv"
    source.write_text(
        "timestamp,Flow (m3/s)\n"
        "2026-06-01T00:00:00+01:00,1.0\n"
        "2026-06-01T00:05:00+01:00,1.1\n",
        encoding="utf-8",
    )
    parsed = parse_tabular_csv(source)
    assert parsed.metadata["time_basis"] == "timezone-aware/unresolved"


@pytest.mark.xfail(
    reason="A-06: event response currently has no observed/model exclusion contract.",
    strict=False,
)
def test_a06_event_response_accepts_role_specific_hydraulic_exclusions():
    parameters = inspect.signature(event_response_summary).parameters
    assert "observed_exclusions" in parameters
    assert "model_exclusions" in parameters


@pytest.mark.xfail(
    reason="A-07: non-finite hydraulic values can currently retain complete support.",
    strict=False,
)
def test_a07_infinite_flow_invalidates_integration_support():
    frame = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                [
                    "2026-01-01 00:00",
                    "2026-01-01 00:01",
                    "2026-01-01 00:02",
                ]
            ),
            "flow": [1.0, np.inf, 1.0],
        }
    )
    result = integrate_series(
        frame,
        "flow",
        frame.timestamp.iloc[0],
        frame.timestamp.iloc[-1],
        max_gap_seconds=120.0,
    )
    assert result["status"] != "complete"
