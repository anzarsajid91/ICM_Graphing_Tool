from pathlib import Path
import pandas as pd
import pytest
from icm_workbench.parsers.csv import parse_tabular_csv,parse_icm_hyd_csv
from icm_workbench.parsers.fdv import parse_fdv
from icm_workbench.parsers.rainfall import parse_rainfall_r

def test_csv_sentinel_is_missing_not_zero(tmp_path:Path):
    p=tmp_path/"depth.csv";p.write_text("timestamp,depth\n2026-01-01 00:00,1.2\n2026-01-01 00:02,9999\n",encoding="utf-8");parsed=parse_tabular_csv(p);assert pd.isna(parsed.frame.depth.iloc[1]);assert parsed.audit["column_audit"]["depth"]["sentinel_count"]==1

def test_csv_year_first_timestamp_preserves_full_month(tmp_path:Path):
    p=tmp_path/"dense.csv"
    rows=["timestamp,level"]+[f"2026-01-{day:02d} 00:00,{day}" for day in range(1,32)]
    p.write_text("\n".join(rows)+"\n",encoding="utf-8")
    parsed=parse_tabular_csv(p)
    assert len(parsed.frame)==31
    assert parsed.frame.timestamp.min()==pd.Timestamp("2026-01-01 00:00")
    assert parsed.frame.timestamp.max()==pd.Timestamp("2026-01-31 00:00")
    assert parsed.audit["invalid_timestamps"]==0


def test_csv_day_first_timestamp_still_uses_uk_convention(tmp_path:Path):
    p=tmp_path/"uk.csv"
    p.write_text("timestamp,depth\n02/01/2026 00:00,1.0\n13/01/2026 00:00,2.0\n",encoding="utf-8")
    parsed=parse_tabular_csv(p)
    assert parsed.frame.timestamp.tolist()==[pd.Timestamp("2026-01-02 00:00"),pd.Timestamp("2026-01-13 00:00")]


def test_icm_hyd_year_first_timestamp_is_not_day_month_swapped(tmp_path:Path):
    p=tmp_path/"Depth.csv"
    p.write_text("!Version=1,Type=HYD\nUserSettings,U_LEVEL,m AD\nP_DATETIME,Value\n2026-02-01T00:00:00,1.2\n2026-02-13T00:00:00,1.3\n",encoding="utf-8")
    parsed=parse_icm_hyd_csv(p)
    assert parsed.frame.timestamp.tolist()==[pd.Timestamp("2026-02-01 00:00"),pd.Timestamp("2026-02-13 00:00")]

def test_icm_hyd_metadata_distinguishes_overflow_level_from_flow(tmp_path:Path):
    p=tmp_path/"Overflow_Level.csv";p.write_text("!Version=1,Type=HYD\nUserSettings,U_LEVEL,m AD\nP_DATETIME,Value\n01/01/2026 00:00,1.2\n01/01/2026 00:02,1.3\n",encoding="utf-8");parsed=parse_icm_hyd_csv(p);assert parsed.metadata["quantity"]=="level";assert parsed.metadata["canonical_unit"]=="m";assert parsed.metadata["vertical_reference"]=="AD";assert parsed.metadata["source_unit_label"]=="m AD"

def test_fdv_rejects_truncated_field_record(tmp_path:Path):
    p=tmp_path/"x.fdv";p.write_text("**FIELD: 1,FLOW,DEPTH\n**UNITS: 1,m3/s,m\n*CSTART\n2601010000 2601010002 2\n*CEND\n1.0 2.0 3.0\n",encoding="utf-8")
    with pytest.raises(ValueError,match="field-count mismatch"):parse_fdv(p)

def test_fdv_constants_continuations_and_scientific_notation(tmp_path:Path):
    p=tmp_path/"FM01.fdv";p.write_text("**IDENTIFIER: 1,FM01\n**FIELD: 2,FLOW,DEPTH\n*+ VELOCITY\n**UNITS: 2,L/s,mm\n*+ m/s\n**CONSTANTS: 3,START,END,INTERVAL\n*CSTART\n2601010000 2601010004 2\n*CEND\n1e3 500 2.5e-1\n2e3 600 3e-1\n",encoding="utf-8")
    parsed=parse_fdv(p)
    assert list(parsed.frame.columns)==["timestamp","flow","depth","velocity"]
    assert parsed.frame.flow.tolist()==pytest.approx([1.0,2.0])
    assert parsed.frame.depth.tolist()==pytest.approx([0.5,0.6])
    assert parsed.frame.velocity.tolist()==pytest.approx([0.25,0.3])
    assert parsed.metadata["constants"]["INTERVAL"]=="2"

def test_r_parser_preserves_header_contract_and_exponents(tmp_path:Path):
    p=tmp_path/"RG01.R";p.write_text("**FIELD: 1,RAINFALL\n**UNITS: 1,mm/hr\n**CONSTANTS: 3,START,END,INTERVAL\n*CSTART\n2601010000 2601010004 2\n*CEND\n1e1 2.5e0\n",encoding="utf-8")
    parsed=parse_rainfall_r(p)
    assert parsed.frame.rainfall.tolist()==pytest.approx([10.0,2.5])
    assert parsed.metadata["canonical_unit"]=="mm/h"
    assert parsed.metadata["interval_min"]==2


def test_infer_quantity_does_not_confuse_level_with_velocity():
    from icm_workbench.parsers.common import infer_quantity
    assert infer_quantity("level") == "level"
    assert infer_quantity("Water Level (m AOD)") == "level"
    assert infer_quantity("vel (m/s)") == "velocity"
    assert infer_quantity("velocity_m_s") == "velocity"
