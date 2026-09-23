from __future__ import annotations

from pathlib import Path

import json

import pandas as pd
import pytest

from icm_workbench.analysis import (
    detect_rainfall_events,
    dry_weather_flow,
    rainfall_accumulation,
    spill_block_volumes,
    idealised_storage_screening,
    integrate_series,
    time_coverage,
    validity_summary,
    compare_scenarios,
)
from icm_workbench.parsers.csv import parse_tabular_csv
from icm_workbench.services.workspace import SCHEMA_VERSION, migrate_workspace_dict, workspace_from_dict
from icm_workbench.advanced_api import dwf_scaled


def test_generic_csv_lps_is_converted_once_to_canonical_flow(tmp_path: Path):
    p=tmp_path/"flow.csv"
    p.write_text(
        "timestamp,Flow (L/s)\n"
        "2026-01-01 00:00,1000\n"
        "2026-01-01 00:01,1000\n",
        encoding="utf-8",
    )
    parsed=parse_tabular_csv(p)
    col="Flow (L/s)"
    assert parsed.frame[col].tolist()==pytest.approx([1.0,1.0])
    meta=parsed.metadata["series_metadata"][col]
    assert meta["quantity"]=="flow"
    assert meta["original_unit"]=="L/s"
    assert meta["canonical_unit"]=="m³/s"
    assert meta["unit_status"]=="resolved"


def test_generic_csv_mld_is_converted_to_cumecs(tmp_path: Path):
    p=tmp_path/"flow.csv"
    p.write_text(
        "timestamp,Flow [Ml/d]\n"
        "2026-01-01 00:00,86.4\n"
        "2026-01-01 00:01,172.8\n",
        encoding="utf-8",
    )
    parsed=parse_tabular_csv(p)
    assert parsed.frame["Flow [Ml/d]"].tolist()==pytest.approx([1.0,2.0])
    assert parsed.metadata["series_metadata"]["Flow [Ml/d]"]["canonical_unit"]=="m³/s"


def test_generic_csv_unresolved_flow_unit_remains_unresolved(tmp_path: Path):
    p=tmp_path/"flow.csv"
    p.write_text(
        "timestamp,flow\n"
        "2026-01-01 00:00,1\n"
        "2026-01-01 00:01,2\n",
        encoding="utf-8",
    )
    parsed=parse_tabular_csv(p)
    assert parsed.frame["flow"].tolist()==pytest.approx([1.0,2.0])
    assert parsed.metadata["series_metadata"]["flow"]["canonical_unit"] is None
    assert parsed.metadata["series_metadata"]["flow"]["unit_status"]=="unresolved"


def test_irregular_rainfall_uses_actual_support_not_median_timestep():
    rain=pd.DataFrame(
        {
            "timestamp":pd.to_datetime([
                "2026-01-01 00:00",
                "2026-01-01 00:02",
                "2026-01-01 00:12",
            ]),
            "rainfall":[6.0,6.0,6.0],
        }
    )
    accumulation=rainfall_accumulation(rain,"rainfall",semantics="intensity")
    assert accumulation["total_depth_mm"]==pytest.approx(1.2)
    assert accumulation["valid_seconds"]==pytest.approx(12*60)
    events=detect_rainfall_events(
        rain,
        intensity_col="rainfall",
        minimum_intensity=5,
        minimum_intensity_duration_min=6,
        minimum_depth_mm=1,
        minimum_event_duration_min=10,
        dry_gap_min=15,
    )
    assert len(events)==1
    assert events[0]["duration_min"]==pytest.approx(12.0)
    assert events[0]["total_depth_mm"]==pytest.approx(1.2)


def test_rainfall_gap_is_reported_as_unknown_in_validity_audit():
    rain=pd.DataFrame(
        {
            "timestamp":pd.to_datetime([
                "2026-01-01 00:00",
                "2026-01-01 00:02",
                "2026-01-01 00:12",
            ]),
            "rainfall":[6.0,6.0,6.0],
        }
    )
    accumulation=rainfall_accumulation(
        rain,
        "rainfall",
        semantics="intensity",
        max_gap_seconds=300,
    )
    assert accumulation["status"]=="partial"
    assert accumulation["coverage_fraction"]==pytest.approx(2/12)
    assert accumulation["unknown_seconds"]==pytest.approx(10*60)
    assert accumulation["validity"]["states"]["unknown"]==pytest.approx(10*60)


def test_declared_interval_is_only_basis_for_final_rainfall_support():
    rain=pd.DataFrame(
        {
            "timestamp":pd.to_datetime(["2026-01-01 00:00","2026-01-01 00:02"]),
            "rainfall":[6.0,6.0],
        }
    )
    no_final=rainfall_accumulation(rain,"rainfall")
    declared=rainfall_accumulation(rain,"rainfall",declared_interval_minutes=2)
    assert no_final["total_depth_mm"]==pytest.approx(0.2)
    assert declared["total_depth_mm"]==pytest.approx(0.4)


def test_missing_rainfall_day_is_unknown_not_dry():
    t=pd.date_range("2026-01-01",periods=3*24+1,freq="1h")
    flow=pd.DataFrame({"timestamp":t,"flow":1.0})
    rain=pd.DataFrame({"timestamp":t,"rainfall":0.0})
    rain.loc[(rain.timestamp>=pd.Timestamp("2026-01-02 12:00"))&(rain.timestamp<pd.Timestamp("2026-01-02 13:00")),"rainfall"]=float("nan")
    result=dry_weather_flow(
        flow,
        "flow",
        rain,
        "rainfall",
        dry_day_mm=1.0,
        baseline_days=10,
        min_dry_days=1,
    )
    by_day={pd.Timestamp(x["day"]).date():x for x in result["candidate_days"]}
    assert by_day[pd.Timestamp("2026-01-02").date()]["status"]=="unknown"
    assert "incomplete" in by_day[pd.Timestamp("2026-01-02").date()]["reason"].lower()


def test_dwf_scaled_applies_shared_period_units_and_role_exclusions(tmp_path: Path):
    flow=tmp_path/"flow.csv"
    rain=tmp_path/"rain.csv"
    times=pd.date_range("2026-01-01 00:00",periods=4*24+1,freq="1h")
    pd.DataFrame({"timestamp":times,"Flow [L/s]":[100.0]*len(times)}).to_csv(flow,index=False)
    pd.DataFrame({"timestamp":times,"Rainfall [mm/hr]":[0.0]*len(times)}).to_csv(rain,index=False)

    flow_exclusions=[{
        "enabled":True,
        "start":"2026-01-02T06:00:00",
        "end":"2026-01-02T08:00:00",
        "reason":"flow QA",
        "scope":"observed",
    }]
    rain_exclusions=[{
        "enabled":True,
        "start":"2026-01-03T00:00:00",
        "end":"2026-01-04T00:00:00",
        "reason":"rain gauge outage",
        "scope":"rainfall",
    }]
    result=json.loads(dwf_scaled(
        str(flow),"Flow [L/s]",
        str(rain),"Rainfall [mm/hr]",
        start="2026-01-02T00:00:00",
        end="2026-01-04T00:00:00",
        flow_exclusions_json=json.dumps(flow_exclusions),
        rainfall_exclusions_json=json.dumps(rain_exclusions),
        min_dry_days=1,
    ))
    assert result["flow_unit"]=="m³/s"
    assert result["flow_contract"]["canonical_unit"]=="m³/s"
    assert result["analysis_start"]=="2026-01-02T00:00:00"
    assert result["analysis_end"]=="2026-01-04T00:00:00"
    assert result["excluded_flow_rows"]==2
    assert result["excluded_rainfall_rows"]==24
    by_day={pd.Timestamp(x["day"]).date():x for x in result["candidate_days"]}
    assert set(by_day)=={pd.Timestamp("2026-01-02").date(),pd.Timestamp("2026-01-03").date(),pd.Timestamp("2026-01-04").date()}
    assert by_day[pd.Timestamp("2026-01-03").date()]["status"]=="unknown"
    assert result["average_dwf"]==pytest.approx(0.1)


def test_dwf_scaled_withholds_unresolved_flow_units_without_override(tmp_path: Path):
    flow=tmp_path/"flow.csv"
    rain=tmp_path/"rain.csv"
    times=pd.date_range("2026-01-01",periods=25,freq="1h")
    pd.DataFrame({"timestamp":times,"flow":[1.0]*len(times)}).to_csv(flow,index=False)
    pd.DataFrame({"timestamp":times,"Rainfall [mm/hr]":[0.0]*len(times)}).to_csv(rain,index=False)
    with pytest.raises(ValueError,match="resolve .* to m³/s"):
        dwf_scaled(str(flow),"flow",str(rain),"Rainfall [mm/hr]",min_dry_days=1)


def test_storage_screening_withholds_partial_flow_volume():
    events=[{"start":pd.Timestamp("2026-01-01 00:00"),"end":pd.Timestamp("2026-01-01 01:00")}]
    flow=pd.DataFrame(
        {
            "timestamp":pd.to_datetime(["2026-01-01 00:00","2026-01-01 00:10"]),
            "flow":[1.0,1.0],
        }
    )
    blocks=spill_block_volumes(events,flow,"flow",max_gap_seconds=900)
    assert blocks.iloc[0]["status"]=="partial"
    assert blocks.iloc[0]["uncovered_seconds"]>0
    screening=idealised_storage_screening(blocks,target_count=0)
    assert screening.iloc[0]["status"]=="partial"
    assert pd.isna(screening.iloc[0]["required_storage_m3"])


@pytest.mark.parametrize("version",[1,2,3])
def test_workspace_v1_v2_v3_migrate_to_v3(version):
    data={
        "schema_version":version,
        "name":"legacy",
        "source_references":{},
        "mappings":{},
        "analysis":{},
        "exclusions":[],
    }
    migrated=migrate_workspace_dict(data)
    assert migrated["schema_version"]==SCHEMA_VERSION==3
    workspace=workspace_from_dict(data)
    assert workspace.schema_version==3



def test_validity_contract_has_canonical_states_and_status():
    summary=validity_summary(
        requested_seconds=600,
        valid_seconds=420,
        excluded_seconds=60,
        missing_seconds=60,
        unknown_seconds=30,
        uncovered_seconds=30,
    )
    assert tuple(summary["states"])==("valid","suspect","invalid","excluded","missing","unknown")
    assert summary["assessable_seconds"]==pytest.approx(540)
    assert summary["states"]["unknown"]==pytest.approx(60)
    assert summary["coverage_fraction"]==pytest.approx(420/540)
    assert summary["calculation_status"]=="partial"


def test_integration_exclusion_over_missing_support_is_not_double_counted():
    t0=pd.Timestamp("2026-01-01 00:00")
    frame=pd.DataFrame(
        {
            "timestamp":[t0,t0+pd.Timedelta(minutes=10)],
            "flow":[1.0,float("nan")],
        }
    )
    from icm_workbench.domain import ExclusionPeriod
    result=integrate_series(
        frame,
        "flow",
        t0,
        t0+pd.Timedelta(minutes=10),
        max_gap_seconds=900,
        exclusions=[ExclusionPeriod(t0+pd.Timedelta(minutes=2),t0+pd.Timedelta(minutes=4),"bad telemetry")],
    )
    assert result["excluded_seconds"]==pytest.approx(120)
    assert result["gap_seconds"]==pytest.approx(480)
    assert result["uncovered_seconds"]==pytest.approx(0)
    assert result["validity"]["states"]["unknown"]==pytest.approx(480)
    assert result["status"]=="unavailable"


def test_time_coverage_reports_missing_and_uncovered_support():
    t0=pd.Timestamp("2026-01-01 00:00")
    frame=pd.DataFrame(
        {
            "timestamp":[t0,t0+pd.Timedelta(minutes=5),t0+pd.Timedelta(minutes=10)],
            "level":[1.0,float("nan"),1.0],
        }
    )
    result=time_coverage(frame,"level",t0,t0+pd.Timedelta(minutes=15),max_gap_seconds=600)
    assert result["missing_seconds"]==pytest.approx(600)
    assert result["uncovered_seconds"]==pytest.approx(300)
    assert result["valid_seconds"]==pytest.approx(0)
    assert result["status"]=="unavailable"


def test_scenario_metrics_expose_validity_coverage():
    t=pd.date_range("2026-01-01",periods=4,freq="5min")
    observed=pd.DataFrame({"timestamp":t,"flow":[1.0,1.0,1.0,1.0]})
    modelled=pd.DataFrame({"timestamp":t,"flow":[1.0,1.1,0.9,1.0]})
    result=compare_scenarios(
        observed,
        "flow",
        {"base":(modelled,"flow")},
        max_gap_seconds=600,
    )
    row=result.iloc[0]
    assert row["calculation_status"]=="complete"
    assert row["observed_coverage_fraction"]==pytest.approx(1.0)
    assert row["model_coverage_fraction"]==pytest.approx(1.0)
    assert row["validity_model"]=="validity-v1"



def test_time_coverage_exclusion_and_missing_are_disjoint():
    from icm_workbench.domain import ExclusionPeriod
    t0=pd.Timestamp("2026-01-01 00:00")
    frame=pd.DataFrame(
        {
            "timestamp":[t0,t0+pd.Timedelta(minutes=10)],
            "level":[1.0,float("nan")],
        }
    )
    result=time_coverage(
        frame,
        "level",
        t0,
        t0+pd.Timedelta(minutes=10),
        max_gap_seconds=900,
        exclusions=[
            ExclusionPeriod(
                t0+pd.Timedelta(minutes=2),
                t0+pd.Timedelta(minutes=4),
                "known bad telemetry",
            )
        ],
    )
    assert result["excluded_seconds"]==pytest.approx(120)
    assert result["missing_seconds"]==pytest.approx(480)
    assert result["unknown_seconds"]==pytest.approx(0)
    assert result["uncovered_seconds"]==pytest.approx(0)
    assert result["status"]=="unavailable"
    assert sum(result["validity"]["states"].values())==pytest.approx(600)
