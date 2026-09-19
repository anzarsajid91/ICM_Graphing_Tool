import numpy as np
import pandas as pd

from icm_workbench.analysis.survey_assessment import (
    monitor_weekly_assessment,
    network_rainfall_assessment,
    wapug_population_preset,
)


def _minute_gauge(start="2026-01-05 00:00", minutes=260, bad=False):
    ts = pd.date_range(start, periods=minutes, freq="1min")
    values = np.zeros(minutes, dtype=float)
    for offset in (0, 80, 160):
        if not bad:
            values[offset : offset + 40] = 8.0
    return (
        pd.DataFrame({"timestamp": ts, "rainfall": values}),
        "rainfall",
        1.0,
    )


def test_population_wapug_duration_preset_changes_network_qualification():
    gauges = {
        "RG1": _minute_gauge(minutes=70),
        "RG2": _minute_gauge(minutes=70),
    }
    small = network_rainfall_assessment(
        gauges, population_above_50k=False
    )
    large = network_rainfall_assessment(
        gauges, population_above_50k=True
    )
    assert (
        wapug_population_preset(False)["minimum_event_duration_min"]
        == 30.0
    )
    assert (
        wapug_population_preset(True)["minimum_event_duration_min"]
        == 60.0
    )
    assert small["qualified_wapug_event_count"] == 1
    assert large["qualified_wapug_event_count"] == 0


def test_two_strike_fault_cutoff_is_auditable_and_only_applied_when_requested():
    gauges = {
        "RG-good-1": _minute_gauge(),
        "RG-good-2": _minute_gauge(),
        "RG-zero": _minute_gauge(bad=True),
    }
    evidence_only = network_rainfall_assessment(
        gauges,
        population_above_50k=False,
        apply_fault_cutoff=False,
    )
    applied = network_rainfall_assessment(
        gauges,
        population_above_50k=False,
        apply_fault_cutoff=True,
    )

    zero = next(
        x
        for x in applied["gauge_summary"]
        if x["gauge"] == "RG-zero"
    )
    assert zero["event_strike_count"] >= 2
    assert zero["suggested_fault_cutoff"] is not None
    assert applied["criteria"]["apply_fault_cutoff"] is True
    assert (
        evidence_only["criteria"]["apply_fault_cutoff"] is False
    )
    assert evidence_only["qualified_wapug_event_count"] == 0
    assert applied["qualified_wapug_event_count"] >= 1
    assert (
        applied["qualified_wapug_events"][-1][
            "operational_gauges"
        ]
        == 2
    )


def test_daily_fault_detector_can_recover_after_clean_window_and_wet_proof():
    ts = pd.date_range(
        "2026-02-01", periods=10 * 24, freq="1h"
    )
    good = np.zeros(len(ts))
    bad = np.zeros(len(ts))
    for day in (0, 1, 8):
        good[day * 24 : (day + 1) * 24] = 0.1
    bad[8 * 24 : 9 * 24] = 0.1

    gauges = {
        "RG1": (
            pd.DataFrame(
                {"timestamp": ts, "rainfall": good}
            ),
            "rainfall",
            60.0,
        ),
        "RG2": (
            pd.DataFrame(
                {"timestamp": ts, "rainfall": good}
            ),
            "rainfall",
            60.0,
        ),
        "RG-bad": (
            pd.DataFrame(
                {"timestamp": ts, "rainfall": bad}
            ),
            "rainfall",
            60.0,
        ),
    }
    result = network_rainfall_assessment(
        gauges, population_above_50k=True
    )
    summary = next(
        x
        for x in result["gauge_summary"]
        if x["gauge"] == "RG-bad"
    )
    assert summary["daily_strikes"] >= 2
    assert summary["first_fault_day"] is not None
    assert summary["recovery_day"] is not None
    assert summary["current_dynamic_status"] == "Recovered"


def test_monitor_assessment_uses_dry_baseline_and_detects_lagged_event_response():
    ts = pd.date_range(
        "2026-01-05",
        periods=7 * 24 * 30,
        freq="2min",
    )
    minutes = np.arange(len(ts)) * 2.0
    diurnal = 0.02 * np.sin(
        2 * np.pi * (minutes % 1440) / 1440.0
    )
    depth = 0.30 + diurnal
    rain = np.zeros(len(ts), dtype=float)

    # Two wet events after five dry baseline days. Hydraulic response is
    # deliberately delayed by 10 minutes and has the same pulse shape.
    for start in (
        5 * 24 * 30 + 60,
        6 * 24 * 30 + 60,
    ):
        rain[start : start + 15] = 20.0
        response = start + 5
        depth[response : response + 15] += 0.10

    hydraulic = pd.DataFrame(
        {"timestamp": ts, "depth": depth}
    )
    rainfall = pd.DataFrame(
        {"timestamp": ts, "rainfall": rain}
    )
    result = monitor_weekly_assessment(
        hydraulic,
        rainfall,
        rain_col="rainfall",
        rain_interval_min=2.0,
        depth_col="depth",
        population_above_50k=True,
    )
    assert result["dry_baseline_days_available"] >= 5
    assert len(result["weeks"]) == 1
    week = result["weeks"][0]
    assert week["depth_method"] == "residual"
    assert week["depth_correlation"] is not None
    assert week["depth_correlation"] > 0.9
    assert 8 <= week["depth_lag_min"] <= 12
    assert week["depth_linked_events"] >= 2
    assert week["rag"] == "Green"
    assert week["depth_score"] >= 70



def test_monitor_assessment_exclusions_do_not_reduce_assessable_coverage():
    ts = pd.date_range("2026-01-05 00:00", periods=60, freq="2min")
    hydraulic = pd.DataFrame(
        {"timestamp": ts, "depth": np.full(len(ts), 0.30)}
    )
    rainfall = pd.DataFrame(
        {"timestamp": ts, "rainfall": np.zeros(len(ts))}
    )
    result = monitor_weekly_assessment(
        hydraulic,
        rainfall,
        rain_col="rainfall",
        rain_interval_min=2.0,
        depth_col="depth",
        exclusions=[
            {
                "start": pd.Timestamp("2026-01-05 00:20"),
                "end": pd.Timestamp("2026-01-05 00:40"),
            }
        ],
    )
    week = result["weeks"][0]
    assert week["excluded_samples"] == 10
    assert week["assessable_samples"] == 50
    assert week["depth_coverage_percent"] == 100.0
    assert result["analysis_controls"][
        "excluded_samples_removed_from_coverage_denominator"
    ] is True


def test_monitor_assessment_analysis_bounds_filter_output_weeks_not_antecedent_source():
    ts = pd.date_range("2026-01-05 00:00", periods=14 * 24, freq="1h")
    hydraulic = pd.DataFrame(
        {"timestamp": ts, "depth": np.full(len(ts), 0.30)}
    )
    rainfall = pd.DataFrame(
        {"timestamp": ts, "rainfall": np.zeros(len(ts))}
    )
    result = monitor_weekly_assessment(
        hydraulic,
        rainfall,
        rain_col="rainfall",
        rain_interval_min=60.0,
        depth_col="depth",
        analysis_start=pd.Timestamp("2026-01-12 00:00"),
        analysis_end=pd.Timestamp("2026-01-18 23:00"),
    )
    assert len(result["weeks"]) == 1
    assert pd.Timestamp(result["weeks"][0]["start"]) >= pd.Timestamp(
        "2026-01-12 00:00"
    )
    assert result["analysis_controls"]["start"] == pd.Timestamp(
        "2026-01-12 00:00"
    )
