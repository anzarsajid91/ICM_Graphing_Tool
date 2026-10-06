import json
import numpy as np
import pandas as pd
import pytest

from icm_workbench.analysis.network_spills import main_reporting_year, schematic_spill_assessment
from icm_workbench.analysis.spills import spill_assessment
from icm_workbench import browser_api
from icm_workbench.domain import ExclusionPeriod


def source(start="2023-12-01", end="2025-01-01", value=0.0):
    times = pd.date_range(start, end, freq="h")
    return pd.DataFrame({"timestamp": times, "depth": np.full(len(times), value)})


def assess(frame, **kwargs):
    return schematic_spill_assessment(frame, "depth", 1, max_gap_seconds=3700, **kwargs)


def test_default_main_year_omits_warmup_and_end_boundary():
    result = assess(source())
    assert result["main_reporting_year"] == 2024
    assert [r["year"] for r in result["rows"]] == [2024]
    row = result["rows"][0]
    assert row["eligible"] and row["spill_count"] == 0
    assert row["analysis_start"] == "2024-01-01T00:00:00"
    assert row["duration_hours"] == 0
    assert not row["partial_year"]


def test_main_year_uses_duration_not_row_density_or_last_timestamp():
    assert main_reporting_year("2023-12-01", "2025-01-01") == 2024
    assert main_reporting_year("2022-01-01", "2023-01-01") == 2022
    assert main_reporting_year("2022-01-01", "2024-01-01") == 2023


def test_explicit_multi_year_override_and_unavailable_year():
    rows = assess(source("2022-01-01", "2025-01-01"), years=[2022, 2023, 2024, 2025])["rows"]
    assert [r["year"] for r in rows] == [2022, 2023, 2024, 2025]
    assert all(r["eligible"] for r in rows[:3])
    assert rows[3]["spill_count"] is None


def test_three_month_gate_uses_valid_support_not_events_or_warmup():
    short = assess(source("2023-12-01", "2024-02-01", 0))["rows"]
    assert len(short) == 1 and not short[0]["eligible"]
    assert short[0]["spill_count"] is None
    full = assess(source("2024-01-01", "2024-04-01"))["rows"][0]
    assert full["eligible"] and full["spill_count"] == 0
    frame = source("2024-01-01", "2024-04-01")
    frame.loc[30:100, "depth"] = np.nan
    assert not assess(frame)["rows"][0]["eligible"]


def test_native_context_counts_match_existing_engine_across_year():
    frame = source()
    frame.loc[(frame.timestamp >= "2023-12-31T18:00") & (frame.timestamp < "2024-01-04"), "depth"] = 2
    whole = spill_assessment(frame, "depth", 1, max_gap_seconds=3700)
    row = assess(frame)["rows"][0]
    expected = whole["yearly_summary"].set_index("year").loc[2024]
    assert row["spill_count"] == expected.spill_count
    assert row["duration_hours"] == pytest.approx(expected.duration_hours)
    # Restarting at Jan 1 is deliberately not the reference counting policy.
    assert row["analysis_start"] == "2024-01-01T00:00:00"


def test_full_year_with_gap_remains_provisional():
    frame = source()
    frame.loc[2000:2050, "depth"] = np.nan
    row = assess(frame)["rows"][0]
    assert row["eligible"] and row["unknown_hours"] > 0
    assert row["count_status"] == "partial/unknown-gap"


def test_exclusion_reduces_reporting_support_and_duration():
    from datetime import datetime
    exclusion = ExclusionPeriod(datetime(2024, 5, 1), datetime(2024, 5, 2), "Fault")
    frame = source(value=2)
    a = assess(frame)["rows"][0]
    b = assess(frame, exclusions=[exclusion])["rows"][0]
    assert b["excluded_hours"] == 24
    assert b["duration_hours"] == a["duration_hours"] - 24


def test_left_censored_spilling_is_not_definitive():
    row = assess(source(value=2))["rows"][0]
    assert row["eligible"]
    assert row["count_status"] == "partial/left-censored-context"


def test_unknown_warmup_cannot_establish_dry_reset():
    frame = source()
    frame.loc[(frame.timestamp >= "2023-12-31T12:00") & (frame.timestamp < "2024-01-01"), "depth"] = np.nan
    row = assess(frame)["rows"][0]
    assert row["unknown_hours"] == 0  # Year itself has complete support.
    assert row["count_status"] == "partial/warm-up-context"


def test_known_dry_warmup_recovers_from_earlier_unknown_context():
    frame = source()
    frame.loc[(frame.timestamp >= "2023-12-01") & (frame.timestamp < "2023-12-03"), "depth"] = np.nan
    assert assess(frame)["rows"][0]["count_status"] == "definitive"
    frame.loc[0:12, "depth"] = 2
    assert assess(frame)["rows"][0]["count_status"] == "definitive"


def test_excluded_warmup_cannot_establish_dry_reset():
    from datetime import datetime
    exclusion = ExclusionPeriod(datetime(2023, 12, 31), datetime(2024, 1, 1), "Warm-up fault")
    row = assess(source(), exclusions=[exclusion])["rows"][0]
    assert row["excluded_hours"] == 0
    assert row["count_status"] == "partial/warm-up-context"


@pytest.mark.parametrize("years", [[], [2024.5], [True], [1700], ["2024"]])
def test_invalid_years_rejected(years):
    with pytest.raises(ValueError):
        assess(source(), years=years)


def test_browser_api_is_additive_and_preserves_regular_spill_result(tmp_path):
    path = tmp_path / "depth.csv"
    frame = source()
    frame.rename(columns={"depth": "depth (m)"}).to_csv(path, index=False)
    parsed = json.loads(browser_api.parse_source(str(path)))
    column = parsed["columns"][0]
    before = browser_api.spill_result(str(path), column, 1, max_gap_seconds=3700)
    new = json.loads(browser_api.network_spill_result(str(path), column, 1, max_gap_seconds=3700))
    assert [r["year"] for r in new["rows"]] == [2024]
    assert browser_api.spill_result(str(path), column, 1, max_gap_seconds=3700) == before


def test_timezone_requires_explicit_resolution():
    frame = source()
    frame["timestamp"] = frame.timestamp.dt.tz_localize("UTC")
    with pytest.raises(ValueError, match="model clock"):
        assess(frame)


def test_zero_overflow_flow_is_dry_with_strict_threshold():
    frame = source('2024-01-01', '2025-01-01')
    frame.loc[(frame.timestamp >= '2024-05-01') & (frame.timestamp < '2024-05-01T06:00'), 'depth'] = 2
    inclusive = schematic_spill_assessment(frame, 'depth', 0, max_gap_seconds=3700)
    strict = schematic_spill_assessment(frame, 'depth', 0, max_gap_seconds=3700, comparison='gt')
    a, b = inclusive['rows'][0], strict['rows'][0]
    assert a['spill_count'] == 367 and a['duration_hours'] == 8784
    assert a['continuous_spill']
    assert b['spill_count'] == 1
    assert b['duration_hours'] == pytest.approx(7)  # Native linear ramps at either edge.
    assert not b['continuous_spill']
    assert b['threshold'] == 0 and b['comparison'] == 'gt'
    assert b['value_min'] == 0 and b['value_max'] == 2


def test_strict_threshold_excludes_equal_positive_plateau():
    frame = source('2024-01-01', '2025-01-01', value=1)
    row = schematic_spill_assessment(frame, 'depth', 1, max_gap_seconds=3700, comparison='gt')['rows'][0]
    assert row['spill_count'] == 0 and row['duration_hours'] == 0
    assert row['count_status'] == 'definitive'


def test_source_threshold_is_used_instead_of_zero_default():
    frame = source('2024-01-01', '2025-01-01', value=10)
    frame.loc[(frame.timestamp >= '2024-06-01') & (frame.timestamp < '2024-06-01T06:00'), 'depth'] = 14
    row = schematic_spill_assessment(frame, 'depth', 12, max_gap_seconds=3700)['rows'][0]
    assert row['spill_count'] == 1 and row['duration_hours'] == pytest.approx(6)
    assert row['threshold'] == 12 and row['comparison'] == 'ge'


def test_strict_threshold_keeps_unknown_and_excluded_support():
    from datetime import datetime
    frame = source('2024-01-01', '2025-01-01')
    frame.loc[100:110, 'depth'] = np.nan
    exclusion = ExclusionPeriod(datetime(2024, 5, 1), datetime(2024, 5, 2), 'Fault')
    row = schematic_spill_assessment(frame, 'depth', 0, max_gap_seconds=3700,
        exclusions=[exclusion], comparison='gt')['rows'][0]
    assert row['spill_count'] == 0 and row['duration_hours'] == 0
    assert row['unknown_hours'] == 12 and row['excluded_hours'] == 24
    assert row['count_status'] != 'definitive'


def test_network_endpoint_passes_explicit_threshold_rule(tmp_path):
    path = tmp_path / 'flow.csv'
    source('2024-01-01', '2025-01-01').rename(columns={'depth': 'Flow (L/s)'}).to_csv(path, index=False)
    column = json.loads(browser_api.parse_source(str(path)))['columns'][0]
    network = json.loads(browser_api.network_spill_result(str(path), column, 0,
        max_gap_seconds=3700, comparison='gt'))['rows'][0]
    shared = json.loads(browser_api.spill_result(str(path), column, 0, max_gap_seconds=3700))
    assert network['spill_count'] == 0
    assert shared['yearly_summary'][0]['spill_count'] == 367  # Shared compatibility rule remains inclusive.


def test_invalid_threshold_rule_rejected():
    with pytest.raises(ValueError, match='Threshold rule'):
        schematic_spill_assessment(source(), 'depth', 0, comparison='guess')


def test_strict_rule_keeps_exact_crossings_for_adjacent_floating_values():
    frame = source('2024-01-01', '2025-01-01', value=1.0)
    frame.loc[100, 'depth'] = np.nextafter(1.0, np.inf)
    row = schematic_spill_assessment(frame, 'depth', 1, max_gap_seconds=3700, comparison='gt')['rows'][0]
    # Both linear ramps are > 1 throughout their open interior, so their full
    # two-hour support spills. Moving the threshold by one ULP would lose it.
    assert row['spill_count'] == 1
    assert row['duration_hours'] == pytest.approx(2)
    assert row['threshold'] == 1
