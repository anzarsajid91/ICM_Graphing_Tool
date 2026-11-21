import json

import numpy as np
import pytest

from icm_workbench.analysis.series_transform import integrate_periods, period_boundaries
from icm_workbench.browser_api import series_data, transform_local_series


def test_grid_preserves_signed_integral_and_partial_final_period():
    times = np.array([0., 20., 65., 100.])
    values = np.array([0., 2., 2., -2.])
    edges = period_boundaries(100, 30)
    totals, support = integrate_periods(times, values, edges, convention="instantaneous", maximum_gap=60)
    assert edges.tolist() == [0, 30, 60, 90, 100]
    assert totals == pytest.approx([40, 60, 170 / 7, -100 / 7])
    assert sum(totals) == pytest.approx(110)
    assert support.tolist() == [30, 30, 30, 10]


def test_grid_intersects_gaps_and_exclusions_at_actual_boundaries():
    times = np.array([0., 10., 20., 40., 50.])
    values = np.array([1., 1., 1., 1., 1.])
    totals, support = integrate_periods(times, values, np.array([-5., 15., 35., 55.]),
                                        convention="instantaneous", maximum_gap=12, exclusions=((8, 12), (10, 14)))
    assert support.tolist() == [9, 5, 10]
    assert totals.tolist() == [9, 5, 10]


def test_interval_depth_and_intensity_are_conservative_and_do_not_invent_dry_support():
    times = np.array([0., 120., 360.])
    edges = np.array([0., 60., 180., 300., 480.])
    for convention, values in [("interval_depth", [2., 12., -1.]), ("interval_average", [2/120, .05, -1.])]:
        totals, support = integrate_periods(times, np.array(values), edges, convention=convention,
                                            maximum_gap=240, trailing_support=120, exclusions=((180, 240),))
        assert totals == pytest.approx([1, 4, 3, 3])
        assert support.tolist() == [60, 120, 60, 60]


def local_csv(tmp_path, name, channel, values):
    path = tmp_path / name
    path.write_text(f"timestamp,{channel}\n" + "\n".join(f"2025-01-01 00:{time},{value}" for time, value in values))
    return {"path": str(path), "column": channel}


def test_browser_transform_keeps_source_bytes_and_derives_on_common_supported_period(tmp_path):
    a = local_csv(tmp_path, "a.csv", "Flow (L/s)", [("00:00", 0), ("01:00", 1200), ("02:00", 0)])
    b = local_csv(tmp_path, "b.csv", "Flow (m3/s)", [("00:30", .2), ("01:30", .2), ("02:30", .2)])
    before = json.loads(series_data(a["path"], a["column"]))
    b["shift_s"] = -30
    answer = json.loads(transform_local_series(a, 40, 90, "subtract", b, "total", "L"))
    assert answer["unit"] == "L"
    assert answer["inputs"][1]["shift_s"] == -30
    assert [row[2] for row in answer["rows"]] == pytest.approx([8000, 32000, 8000])
    assert answer["rows"][0][0] == "2025-01-01T00:00:00"
    assert answer["rows"][-1][1] == "2025-01-01T00:02:00"
    assert json.loads(series_data(a["path"], a["column"]))["value"] == before["value"]
    rates = json.loads(transform_local_series(a, 40, 90, unit="L/s"))
    assert [row[2] for row in rates["rows"]] == pytest.approx([400, 1000, 400])


def test_browser_transform_reports_missing_operand_and_rejects_bad_units_datum_and_duplicate(tmp_path):
    level = local_csv(tmp_path, "level.csv", "Level (m)", [("00:00", 1), ("01:00", 2), ("03:00", 3)])
    other = local_csv(tmp_path, "other.csv", "Level (mm)", [("00:00", 10), ("01:00", 10), ("03:00", 10)])
    with pytest.raises(ValueError, match="common vertical datum"):
        transform_local_series(level, 60, 90, "subtract", other)
    result = json.loads(transform_local_series(level, 60, 90, "subtract", other, datum="AOD", unit="mm"))
    assert [row[2] for row in result["rows"]] == [1490, None, None]
    assert [row[3:] for row in result["rows"]] == [[60, 60], [0, 0], [0, 0]]
    with pytest.raises(ValueError, match="incompatible"):
        transform_local_series(level, 40, 90, unit="L/s")
    duplicate = local_csv(tmp_path, "duplicate.csv", "Flow (L/s)", [("00:00", 1), ("00:00", 2), ("01:00", 3)])
    with pytest.raises(ValueError, match="invalid or duplicate"):
        transform_local_series(duplicate, 60, 90)
    with pytest.raises(ValueError, match="output limit"):
        period_boundaries(25001, 1)


@pytest.mark.parametrize(("unit", "samples"), [("mm/h", "6 12 0 3"), ("mm", ".2 .4 0 .1")])
def test_browser_transform_preserves_native_rainfall_final_support(tmp_path, unit, samples):
    source = tmp_path / "local.R"
    source.write_text(f"**UNITS: 1,{unit}\n*CSTART\n2601010000 2601010006 2\n*CEND\n{samples}\n")
    result = json.loads(transform_local_series({"path": str(source), "column": "rainfall"}, 60, 120, output="total"))
    assert result["unit"] == "mm"
    assert result["complete_periods"] == 8
    assert result["rows"][-1][1] == "2026-01-01T00:08:00"
    assert [row[2] for row in result["rows"]] == pytest.approx([.1, .1, .2, .2, 0, 0, .05, .05])
