"""Hand-calculated ICM-format fixtures for storage's dimensional/support contract."""
import json

import pandas as pd
import pytest

from icm_workbench import browser_api as api, advanced_api
from icm_workbench.parsers.csv import parse_icm_hyd_csv


def pair(tmp_path, seconds, levels, flows, origin="2026-01-01", level_unit="m"):
    stamps = pd.Timestamp(origin) + pd.to_timedelta(seconds, unit="s")
    paths = []
    for name, column, values in [("level", f"Level ({level_unit})", levels), ("flow", "Flow (L/s)", flows)]:
        path = tmp_path / f"{name}.csv"
        pd.DataFrame({"timestamp": stamps, column: values}).to_csv(path, index=False)
        paths.append(str(path))
    return dict(level_path=paths[0], level_col=f"Level ({level_unit})", flow_path=paths[1],
                flow_col="Flow (L/s)", threshold=1, target_count=0, max_gap_seconds=900)


def result(args):
    return json.loads(api.storage_result(**args))


def test_long_episode_preserves_three_counts_when_screening_target_one(tmp_path):
    args = pair(tmp_path, range(0, 144001, 900), [2]*161, [100]*161)
    r = result({**args, "target_count": 1})
    assert r["blocks"][0]["compatibility_spill_count"] == 3
    # Whole-episode capture: 0.1 m3/s * 40 h, rather than a false zero capacity.
    assert r["screening"][0]["required_storage_m3"] == pytest.approx(14400)
    assert r["screening"][0]["remaining_spill_count"] == 0
    assert result({**args, "target_count": 3})["screening"][0]["required_storage_m3"] == 0


@pytest.mark.parametrize("quantity,unit,raw,want", [("U_FLOW", "L/s", 100, .1), ("U_LEVEL", "mm", 2000, 2)])
def test_native_hyd_values_use_u_values_not_u_level(tmp_path, quantity, unit, raw, want):
    path = tmp_path / "native.csv"
    path.write_text(f"FILE,TYPE=HYD\nUserSettings,{quantity},U_VALUES\nUserSettingsValues,m AD,{unit}\nP_DATETIME,P_VALUE\n01/01/2026 00:00:00,{raw}\n01/01/2026 00:10:00,{raw}\n")
    parsed = parse_icm_hyd_csv(path)
    assert parsed.frame.value.tolist() == pytest.approx([want, want])
    assert parsed.metadata["original_unit"] == unit


def test_resolved_mm_threshold_is_converted_independently_of_canonical_values(tmp_path):
    args = pair(tmp_path, [0, 600], [2000, 2000], [100, 100], level_unit="mm")
    r = result({**args, "threshold": 1000})
    assert r["threshold_canonical_m"] == 1
    assert r["screening"][0]["required_storage_m3"] == pytest.approx(60)
    assert result({**args, "threshold": 1, "threshold_unit": "m"})["screening"][0]["required_storage_m3"] == pytest.approx(60)
    assert result({**args, "threshold": 2500})["blocks"] == []


def test_native_hyd_lps_and_mm_produce_si_volume_end_to_end(tmp_path):
    paths=[]
    for name,quantity,unit,value in [("level","U_LEVEL","mm",2000),("flow","U_FLOW","L/s",100)]:
        path=tmp_path/f"{name}.csv"
        path.write_text(f"FILE,TYPE=HYD\nUserSettings,{quantity},U_VALUES\nUserSettingsValues,m AD,{unit}\nP_DATETIME,P_VALUE\n01/01/2026 00:00:00,{value}\n01/01/2026 00:10:00,{value}\n")
        paths.append(str(path))
    r=result(dict(level_path=paths[0],level_col="value",flow_path=paths[1],flow_col="value",threshold=1000,target_count=0))
    assert r["threshold_canonical_m"] == 1
    assert r["screening"][0]["required_storage_m3"] == pytest.approx(60)


def test_user_assigned_mm_units_do_not_double_convert_threshold_or_values(tmp_path):
    args=pair(tmp_path,[0,600],[2000,2000],[100,100])
    path=tmp_path/"unlabelled.csv"
    pd.DataFrame({"Time":["01/01/2026 00:00:00","01/01/2026 00:10:00"],"Seconds":[0,600],"CSO01.1":[2000,2000]}).to_csv(path,index=False)
    api.set_series_quantity(str(path),"CSO01.1","level","mm")
    r=result({**args,"level_path":str(path),"level_col":"CSO01.1","threshold":1000})
    assert r["threshold_canonical_m"] == 1
    assert r["screening"][0]["required_storage_m3"] == pytest.approx(60)


def test_excluded_period_retains_volume_but_withholds_annual_sizing(tmp_path):
    args = pair(tmp_path, [0, 300, 600], [2]*3, [100]*3)
    args["exclusions_json"] = json.dumps([{"start": "2026-01-01T00:02:00", "end": "2026-01-01T00:04:00", "reason": "outage"}])
    r = result(args)
    assert sum(x["volume_m3"] for x in r["blocks"]) == pytest.approx(48)
    assert r["calculation_status"] == "partial"
    assert r["screening"][0]["required_storage_m3"] is None
    monthly = json.loads(advanced_api.monthly_spill_volume_result(**args))["rows"][0]
    assert monthly["volume_m3"] is None
    assert monthly["volume_m3_partial"] == pytest.approx(48)
    assert monthly["assessment_excluded_seconds"] == 120
    assert monthly["coverage_fraction"] == pytest.approx(.8)
    assert monthly["status"] == "partial"


def test_year_boundary_reports_calendar_volume_separately_from_episode_attribution(tmp_path):
    args = pair(tmp_path, [0, 900, 1800, 2700, 3600], [2]*5, [100]*5, origin="2025-12-31 23:30")
    r = result(args)
    assert r["screening"][0]["annual_block_volume_m3"] == pytest.approx(360)
    assert [(x["year"], x["volume_m3"]) for x in r["calendar_volumes"]] == [(2025, 180), (2026, 180)]


def test_exclusion_during_dry_period_still_withholds_whole_period_target(tmp_path):
    args = pair(tmp_path, [0, 300, 600, 900, 1200], [2, 2, 0, 0, 0], [100]*5)
    args["exclusions_json"] = json.dumps([{"start": "2026-01-01T00:15:00", "end": "2026-01-01T00:17:00", "reason": "outage"}])
    assert result(args)["screening"][0]["required_storage_m3"] is None
