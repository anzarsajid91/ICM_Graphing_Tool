from datetime import datetime

import numpy as np
import pandas as pd

from icm_workbench.analysis.integration import integrate_series
from icm_workbench.analysis.survey_context import (
    _integrate_instantaneous_no_exclusions,
    _integration_support_window,
    classify_volume_balance,
    fsat_event_response_assessment,
    merge_authoritative_associations,
    normalise_association_table,
    survey_volume_balance,
)
from icm_workbench.domain import ExclusionPeriod


def test_fm_rg_assoc_normalisation_and_workbook_precedence():
    parsed = normalise_association_table(
        ["FDV_Name", "RG", "Pipe Diameter (mm)", "Upstream Trace"],
        [
            ["FM03", "RG02", "600", "FM01, FM02"],
            ["FM01", "RG01", 450, ""],
            ["FM02", "RG01", 450, ""],
        ],
    )
    assert parsed["status"] == "ok"
    assert parsed["records"][0] == {
        "monitor": "FM03",
        "rain_gauge": "RG02",
        "diameter_mm": 600.0,
        "diameter_raw": "600",
        "diameter_source_unit": "mm",
        "upstream": ["FM01", "FM02"],
        "source": "fm_rg_assoc.xlsx",
        "row": 2,
    }

    merged = merge_authoritative_associations(
        parsed["records"],
        {"FM03": {"diameter_mm": 525, "rain_gauge": "RG99"}},
    )
    fm03 = merged["records"][0]
    assert fm03["diameter_mm"] == 600.0
    assert fm03["rain_gauge"] == "RG02"
    assert {x["field"] for x in merged["conflicts"]} == {
        "diameter_mm",
        "rain_gauge",
    }
    assert all(x["resolution"] == "workbook" for x in merged["conflicts"])


def test_fm_rg_assoc_duplicate_self_and_unknown_upstream_are_audited():
    result = normalise_association_table(
        ["monitor", "rain gauge", "diameter", "upstream flow monitors"],
        [
            ["FM01", "RG01", 450, "FM01; FM99"],
            ["FM01", "RG02", 500, ""],
        ],
    )
    messages = [x["message"] for x in result["issues"]]
    assert result["status"] == "error"
    assert any("Conflicting duplicate" in x for x in messages)
    assert any("cannot reference itself" in x for x in messages)
    assert any("FM99" in x for x in messages)


def test_weekly_integration_support_window_preserves_authoritative_integral_and_validity():
    ts = pd.to_datetime([
        "2026-02-01 23:58",
        "2026-02-02 00:00",
        "2026-02-02 00:02",
        "2026-02-02 00:04",
        "2026-02-02 00:20",  # deliberate >15 min gap
        "2026-02-08 23:58",
        "2026-02-09 00:00",
        "2026-02-09 00:02",
    ])
    frame = pd.DataFrame(
        {
            "timestamp": ts,
            "flow": [0.4, 0.5, 0.6, np.nan, 0.8, 0.7, 0.6, 0.5],
        }
    )
    start = pd.Timestamp("2026-02-02 00:01")
    end = pd.Timestamp("2026-02-09 00:01")
    exclusions = [
        ExclusionPeriod(
            start=datetime(2026, 2, 8, 23, 57),
            end=datetime(2026, 2, 8, 23, 59),
            reason="maintenance",
        )
    ]

    full = integrate_series(
        frame,
        "flow",
        start,
        end,
        semantics="instantaneous",
        max_gap_seconds=900.0,
        exclusions=exclusions,
    )
    window = _integration_support_window(frame, start, end)
    sliced = integrate_series(
        window,
        "flow",
        start,
        end,
        semantics="instantaneous",
        max_gap_seconds=900.0,
        exclusions=exclusions,
    )

    for key in (
        "integral",
        "requested_seconds",
        "valid_seconds",
        "excluded_seconds",
        "gap_seconds",
        "uncovered_seconds",
        "coverage_fraction",
    ):
        assert np.isclose(float(sliced[key]), float(full[key]), equal_nan=True)
    assert sliced["status"] == full["status"]
    assert window["timestamp"].min() == pd.Timestamp("2026-02-02 00:00")
    assert window["timestamp"].max() == pd.Timestamp("2026-02-09 00:02")


def test_fast_no_exclusion_volume_integral_matches_authoritative_integrator():
    rng = np.random.default_rng(260926)
    timestamps = [pd.Timestamp("2026-02-01 23:57")]
    for step in rng.integers(60, 480, size=300):
        timestamps.append(timestamps[-1] + pd.Timedelta(seconds=int(step)))
    values = rng.normal(loc=0.4, scale=0.15, size=len(timestamps))
    values[[11, 89, 190]] = np.nan
    frame = pd.DataFrame({"timestamp": timestamps, "flow": values})

    for start, end, max_gap in [
        (
            pd.Timestamp("2026-02-02 00:01:13"),
            pd.Timestamp("2026-02-02 07:42:19"),
            900.0,
        ),
        (
            pd.Timestamp("2026-02-01 23:50"),
            pd.Timestamp("2026-02-02 01:05"),
            180.0,
        ),
        (
            pd.Timestamp("2026-02-02 12:00"),
            pd.Timestamp("2026-02-03 12:00"),
            900.0,
        ),
    ]:
        support = _integration_support_window(frame, start, end)
        expected = integrate_series(
            support,
            "flow",
            start,
            end,
            semantics="instantaneous",
            max_gap_seconds=max_gap,
            exclusions=[],
        )
        actual = _integrate_instantaneous_no_exclusions(
            support,
            "flow",
            start,
            end,
            max_gap_seconds=max_gap,
        )
        for key in (
            "integral",
            "requested_seconds",
            "valid_seconds",
            "excluded_seconds",
            "gap_seconds",
            "uncovered_seconds",
        ):
            assert np.isclose(
                float(actual[key]), float(expected[key]),
                atol=1e-8, rtol=1e-12,
            ), (key, actual[key], expected[key])
        assert actual["coverage_fraction"] == expected["coverage_fraction"]
        assert actual["status"] == expected["status"]


def test_fast_no_exclusion_volume_integral_preserves_boundary_interpolation():
    frame = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                [
                    "2026-02-01 23:58",
                    "2026-02-02 00:02",
                    "2026-02-02 00:06",
                ]
            ),
            "flow": [0.0, 4.0, 8.0],
        }
    )
    start = pd.Timestamp("2026-02-02 00:00")
    end = pd.Timestamp("2026-02-02 00:04")
    expected = integrate_series(
        frame, "flow", start, end,
        semantics="instantaneous", max_gap_seconds=900.0,
    )
    actual = _integrate_instantaneous_no_exclusions(
        frame, "flow", start, end, max_gap_seconds=900.0
    )
    assert np.isclose(actual["integral"], expected["integral"])
    assert np.isclose(actual["integral"], 4.0 * 240.0)
    assert actual["status"] == expected["status"] == "complete"


def test_weekly_integration_support_window_handles_domain_outside_source():
    frame = _constant_flow("2026-02-02 00:00", [1.0, 1.0, 1.0], freq="2min")
    start = pd.Timestamp("2026-01-25")
    end = pd.Timestamp("2026-01-26")
    window = _integration_support_window(frame, start, end)
    full = integrate_series(frame, "flow", start, end)
    sliced = integrate_series(window, "flow", start, end)
    assert sliced["integral"] == full["integral"] == 0.0
    assert sliced["valid_seconds"] == full["valid_seconds"] == 0.0
    assert sliced["uncovered_seconds"] == full["uncovered_seconds"]


def test_volume_balance_rag_thresholds_are_explicit():
    assert classify_volume_balance(110.0, 100.0)["rag"] == "Green"
    amber = classify_volume_balance(95.0, 100.0)
    assert amber["rag"] == "Amber"
    assert amber["deficit_percent"] == 5.0
    assert classify_volume_balance(80.0, 100.0)["rag"] == "Red"
    assert classify_volume_balance(80.0, 100.0, complete=False)["rag"] == "Grey"


def _constant_flow(start, values, freq="5min"):
    return pd.DataFrame(
        {
            "timestamp": pd.date_range(start, periods=len(values), freq=freq),
            "flow": np.asarray(values, dtype=float),
        }
    )


def test_weekly_volume_balance_preserves_fsat_status_and_enhances_rag():
    flows = {
        "FM03": _constant_flow("2026-01-05 00:00", [1.9, 1.9, 1.9, 1.9]),
        "FM01": _constant_flow("2026-01-05 00:00", [1.0, 1.0, 1.0, 1.0]),
        "FM02": _constant_flow("2026-01-05 00:00", [1.0, 1.0, 1.0, 1.0]),
    }
    result = survey_volume_balance(
        flows,
        [
            {
                "monitor": "FM03",
                "rain_gauge": "RG01",
                "diameter_mm": 600.0,
                "upstream": ["FM01", "FM02"],
            }
        ],
        amber_tolerance_percent=10.0,
    )
    assert len(result["rows"]) == 1
    row = result["rows"][0]
    assert row["legacy_fsat_status"] == "Not OK"
    assert row["rag"] == "Amber"
    assert abs(row["balance_ratio"] - 0.95) < 1e-9
    assert "not proof of fault" in row["likely_source"]
    assert "diagnostic" in row["recommendation"]
    assert result["criteria"]["week_grouping"] == "W-SUN"


def test_volume_balance_exclusions_are_removed_not_counted_as_non_flow():
    flows = {
        "FM02": _constant_flow("2026-01-05 00:00", [2.0, 2.0, 2.0, 2.0, 2.0]),
        "FM01": _constant_flow("2026-01-05 00:00", [1.0, 1.0, 1.0, 1.0, 1.0]),
    }
    exclusion = ExclusionPeriod(
        datetime(2026, 1, 5, 0, 5),
        datetime(2026, 1, 5, 0, 10),
        "known telemetry issue",
    )
    result = survey_volume_balance(
        flows,
        [{"monitor": "FM02", "upstream": ["FM01"]}],
        exclusions=[exclusion],
        max_gap_seconds=600,
    )
    row = result["rows"][0]
    assert row["rag"] == "Green"
    assert row["minimum_coverage_fraction"] == 1.0
    weeks = {
        x["monitor"]: x for x in result["monitor_weeks"]
    }
    assert weeks["FM01"]["excluded_seconds"] == 300.0
    assert weeks["FM02"]["excluded_seconds"] == 300.0


def test_fsat_event_response_uses_workbook_diameter_gates_and_ratio_thresholds():
    ts = pd.date_range("2026-01-01 00:00", periods=2 * 24 * 12 + 30, freq="5min")
    flow = np.full(len(ts), 0.10)
    depth = np.full(len(ts), 0.20)
    velocity = np.full(len(ts), 0.30)
    event_start = pd.Timestamp("2026-01-03 00:00")
    rain_peak = pd.Timestamp("2026-01-03 00:10")
    peak_flow = pd.Timestamp("2026-01-03 00:20")

    flow[ts.get_loc(peak_flow)] = 1.00
    depth[(ts >= rain_peak) & (ts <= peak_flow)] = 0.35
    velocity[(ts >= rain_peak) & (ts <= peak_flow)] = 0.50

    hydraulic = pd.DataFrame(
        {
            "timestamp": ts,
            "depth": depth,
            "velocity": velocity,
            "flow": flow,
        }
    )
    rain_values = np.zeros(len(ts))
    rain_values[ts.get_loc(rain_peak)] = 12.0
    rain = pd.DataFrame({"timestamp": ts, "rainfall": rain_values})

    result = fsat_event_response_assessment(
        hydraulic,
        rain,
        rain_col="rainfall",
        rain_interval_min=5.0,
        diameter_mm=600.0,
        network_wapug_events=[
            {
                "event": 1,
                "start": event_start,
                "end": event_start + pd.Timedelta(minutes=30),
                "qualifies_network_wapug": True,
                "operational_gauges": 2,
                "spatial_cv_percent": 5.0,
            }
        ],
        depth_col="depth",
        velocity_col="velocity",
        flow_col="flow",
        monitor_type="FM",
    )
    row = result["rows"][0]
    assert row["depth_velocity_response"].startswith("Yes")
    assert row["min_depth_threshold_m"] == 0.150
    assert row["min_depth_pass"] is True
    assert row["response_ratio_threshold"] == 5.0
    assert row["response_ratio"] > 5.0
    assert row["response_ratio_pass"] is True
