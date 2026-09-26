import json
import numpy as np
import pandas as pd

from icm_workbench import advanced_api

from icm_workbench.analysis.survey_assessment import (
    _cross_corr_positive_lag,
    _longest_flatline_minutes,
    monitor_weekly_assessment,
    network_rainfall_assessment,
    wapug_population_preset,
)


def _legacy_longest_flatline_minutes(values, timestamps, tolerance):
    vals = pd.to_numeric(pd.Series(values), errors="coerce").to_numpy(dtype=float)
    ts = pd.to_datetime(pd.Series(timestamps), errors="coerce")
    longest = 0.0
    run_start = None
    for i in range(1, len(vals)):
        same = (
            np.isfinite(vals[i - 1])
            and np.isfinite(vals[i])
            and abs(vals[i] - vals[i - 1]) <= tolerance
            and pd.notna(ts.iloc[i - 1])
            and pd.notna(ts.iloc[i])
        )
        if same:
            if run_start is None:
                run_start = i - 1
            longest = max(
                longest,
                float((ts.iloc[i] - ts.iloc[run_start]).total_seconds() / 60.0),
            )
        else:
            run_start = None
    return longest


def test_vectorized_flatline_matches_legacy_for_missing_irregular_and_tolerance_cases():
    cases = [
        (
            [1.0, 1.0, 1.0, 2.0, 2.00005, 2.00009, np.nan, 3.0, 3.0],
            pd.to_datetime([
                "2026-02-01 00:00", "2026-02-01 00:02", "2026-02-01 00:04",
                "2026-02-01 00:09", "2026-02-01 00:11", "2026-02-01 00:14",
                "2026-02-01 00:16", "2026-02-01 00:20", "2026-02-01 00:27",
            ]),
            1e-4,
        ),
        (
            [0.4, 0.4, 0.4, 0.4],
            pd.to_datetime([
                "2026-02-01 00:00", "2026-02-01 00:01",
                None, "2026-02-01 00:05",
            ]),
            1e-6,
        ),
        (
            [1.0, 1.01, 1.02, 1.03],
            pd.date_range("2026-02-01", periods=4, freq="2min"),
            1e-4,
        ),
        (
            [5.0],
            pd.to_datetime(["2026-02-01 00:00"]),
            1e-4,
        ),
    ]
    for values, timestamps, tolerance in cases:
        expected = _legacy_longest_flatline_minutes(values, timestamps, tolerance)
        actual = _longest_flatline_minutes(
            pd.Series(values), pd.Series(timestamps), tolerance
        )
        assert np.isclose(actual, expected, atol=0.0, rtol=0.0)


def test_vectorized_flatline_matches_legacy_for_random_runs():
    rng = np.random.default_rng(260926)
    values = rng.normal(size=5000)
    values[200:900] = 1.2345
    values[1700:2250] = 2.0
    values[1800] = np.nan
    timestamps = pd.Series(pd.date_range("2026-02-01", periods=len(values), freq="2min"))
    timestamps.iloc[3100] = pd.NaT
    expected = _legacy_longest_flatline_minutes(values, timestamps, 1e-8)
    actual = _longest_flatline_minutes(
        pd.Series(values), timestamps, 1e-8
    )
    assert actual == expected


def _legacy_cross_corr_positive_lag(
    rain_increment,
    response,
    dt_minutes,
    max_lag_hours,
):
    a = pd.to_numeric(pd.Series(rain_increment), errors="coerce").reset_index(drop=True)
    b = pd.to_numeric(pd.Series(response), errors="coerce").reset_index(drop=True)
    max_steps = int(
        round(max_lag_hours * 60.0 / max(float(dt_minutes), 1e-6))
    )
    best_corr = -np.inf
    best_lag = 0
    for lag in range(max_steps + 1):
        aa = a.iloc[:-lag] if lag else a
        bb = b.iloc[lag:] if lag else b
        valid = aa.notna().to_numpy() & bb.notna().to_numpy()
        if int(valid.sum()) < 5:
            continue
        av = aa.to_numpy(dtype=float)[valid]
        bv = bb.to_numpy(dtype=float)[valid]
        if np.std(av) <= 1e-12 or np.std(bv) <= 1e-12:
            continue
        corr = float(np.corrcoef(av, bv)[0, 1])
        if np.isfinite(corr) and corr > best_corr:
            best_corr = corr
            best_lag = lag
    if best_corr == -np.inf:
        return None, None
    return float(best_corr), float(best_lag * dt_minutes)


def test_fft_positive_lag_correlation_matches_legacy_with_missing_values():
    rng = np.random.default_rng(260926)
    rain = rng.normal(size=512)
    response = np.full(512, np.nan)
    response[7:] = 1.8 * rain[:-7] + rng.normal(scale=0.03, size=505)
    rain[::37] = np.nan
    response[13::41] = np.nan

    expected = _legacy_cross_corr_positive_lag(
        rain, response, 2.0, 1.0
    )
    actual = _cross_corr_positive_lag(
        pd.Series(rain), pd.Series(response), 2.0, 1.0
    )

    assert actual[1] == expected[1] == 14.0
    assert np.isclose(actual[0], expected[0], atol=1e-12, rtol=1e-12)


def test_fft_positive_lag_correlation_matches_legacy_for_random_series():
    rng = np.random.default_rng(91)
    rain = rng.normal(size=431)
    response = rng.normal(size=431)
    rain[[3, 47, 213]] = np.nan
    response[[12, 47, 399]] = np.nan

    expected = _legacy_cross_corr_positive_lag(
        rain, response, 3.0, 2.0
    )
    actual = _cross_corr_positive_lag(
        pd.Series(rain), pd.Series(response), 3.0, 2.0
    )

    assert actual[1] == expected[1]
    assert np.isclose(actual[0], expected[0], atol=1e-12, rtol=1e-12)


def test_fft_positive_lag_correlation_preserves_earliest_tie_and_uniform_guard():
    repeating = np.tile([0.0, 1.0], 120)
    corr, lag = _cross_corr_positive_lag(
        pd.Series(repeating), pd.Series(repeating), 2.0, 1.0
    )
    assert np.isclose(corr, 1.0)
    assert lag == 0.0

    assert _cross_corr_positive_lag(
        pd.Series(repeating), pd.Series(np.ones_like(repeating)), 2.0, 1.0
    ) == (None, None)


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




def test_gauge_summary_stays_green_when_monthly_operational_coverage_exceeds_threshold():
    ts = pd.date_range("2026-02-01 00:00", periods=28 * 24 + 12, freq="1h")
    values = np.zeros(len(ts), dtype=float)
    # Add a representative wet spell to two otherwise complete gauges.
    values[5 * 24 : 5 * 24 + 8] = 8.0
    gauges = {
        "RG1": (pd.DataFrame({"timestamp": ts, "rainfall": values}), "rainfall", 60.0),
        "RG2": (pd.DataFrame({"timestamp": ts, "rainfall": values}), "rainfall", 60.0),
    }
    result = network_rainfall_assessment(gauges, population_above_50k=True)
    for row in result["gauge_summary"]:
        assert row["operational_coverage_percent"] >= 90.0
        assert row["current_dynamic_status"] != "Faulty"
        assert row["status"] == "Green"


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



def test_rainfall_scoped_exclusion_does_not_reduce_hydraulic_coverage():
    ts = pd.date_range("2026-01-05 00:00", periods=60, freq="2min")
    hydraulic = pd.DataFrame(
        {"timestamp": ts, "depth": np.full(len(ts), 0.30)}
    )
    rainfall = pd.DataFrame(
        {"timestamp": ts, "rainfall": np.full(len(ts), 2.0)}
    )
    result = monitor_weekly_assessment(
        hydraulic,
        rainfall,
        rain_col="rainfall",
        rain_interval_min=2.0,
        depth_col="depth",
        exclusions=[],
        rain_exclusions=[
            {
                "start": pd.Timestamp("2026-01-05 00:20"),
                "end": pd.Timestamp("2026-01-05 00:40"),
            }
        ],
    )
    week = result["weeks"][0]
    assert week["excluded_samples"] == 0
    assert week["depth_coverage_percent"] == 100.0
    assert result["analysis_controls"]["hydraulic_exclusion_count"] == 0
    assert result["analysis_controls"]["rainfall_exclusion_count"] == 1
    assert result["analysis_controls"]["scoped_exclusions"] is True


def test_standalone_rainfall_events_respect_selected_analysis_period(tmp_path):
    values = np.zeros(1441, dtype=float)
    values[0:10] = 12.0
    values[720:730] = 12.0
    source = tmp_path / "RG-period.R"
    source.write_text(
        "*CSTART\n2601010000 2601030000 2\n*CEND\n"
        + " ".join(str(float(v)) for v in values)
        + "\n",
        encoding="utf-8",
    )

    full = json.loads(
        advanced_api.rainfall_event_scaled(
            str(source),
            "rainfall",
            minimum_intensity=5.0,
            minimum_intensity_duration_min=4.0,
            minimum_depth_mm=1.0,
            minimum_event_duration_min=10.0,
            dry_gap_min=15.0,
        )
    )
    bounded = json.loads(
        advanced_api.rainfall_event_scaled(
            str(source),
            "rainfall",
            minimum_intensity=5.0,
            minimum_intensity_duration_min=4.0,
            minimum_depth_mm=1.0,
            minimum_event_duration_min=10.0,
            dry_gap_min=15.0,
            start="2026-01-02T00:00:00",
            end="2026-01-03T00:00:00",
        )
    )

    assert full["count"] == 2
    assert bounded["count"] == 1
    assert bounded["events"][0]["start"].startswith("2026-01-02")
    assert bounded["criteria"]["analysis_start"].startswith("2026-01-02")
    assert bounded["criteria"]["analysis_end_exclusive"].startswith("2026-01-03")
