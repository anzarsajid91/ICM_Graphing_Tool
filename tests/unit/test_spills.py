from datetime import datetime
import pandas as pd
import pytest
from icm_workbench.analysis.spills import spill_assessment,monthly_spill_durations,apply_12_24_counting
from icm_workbench.domain import ExclusionPeriod

def test_exclusion_splits_physical_spill_and_removes_duration():
    ts=pd.date_range("2026-01-01 00:00",periods=11,freq="min");df=pd.DataFrame({"timestamp":ts,"level":[0,0,2,2,2,2,2,2,2,0,0]});exc=ExclusionPeriod(datetime(2026,1,1,0,4),datetime(2026,1,1,0,6),"EDM data invalid");result=spill_assessment(df,"level",1.0,max_gap_seconds=120,exclusions=[exc]);assert len(result["events"])==2;assert result["excluded_seconds"]==pytest.approx(120.0);assert result["total_spill_duration_hours"]<7/60;assert result["exclusion_audit"][0]["reason"]=="EDM data invalid"

def test_missing_gap_makes_count_status_partial_not_zero_certainty():
    df=pd.DataFrame({"timestamp":pd.to_datetime(["2026-01-01 00:00","2026-01-01 00:01","2026-01-01 00:10"]),"level":[0,2,0]});result=spill_assessment(df,"level",1.0,max_gap_seconds=120);assert result["count_status"]=="partial/unknown-gap";assert result["unknown_seconds"]>0

def test_month_boundary_duration_is_split():
    out=monthly_spill_durations([{"start":pd.Timestamp("2026-01-31 23:30"),"end":pd.Timestamp("2026-02-01 00:30")}]);assert out[(out.year==2026)&(out.month==1)].duration_hours.iloc[0]==pytest.approx(0.5);assert out[(out.year==2026)&(out.month==2)].duration_hours.iloc[0]==pytest.approx(0.5)

def test_repeat_discharges_inside_count_window_keep_physical_events():
    events=[{"start":pd.Timestamp("2026-01-01 00:00"),"end":pd.Timestamp("2026-01-01 01:00")},{"start":pd.Timestamp("2026-01-01 02:00"),"end":pd.Timestamp("2026-01-01 03:00")}];counting=apply_12_24_counting(events);assert len(counting)==2;assert counting.duration_min.sum()==120

def test_screening_sums_later_zero_increment_discharge_volume():
    from icm_workbench.analysis.screening import spill_block_volumes
    events=[{"start":pd.Timestamp("2026-01-01 00:00"),"end":pd.Timestamp("2026-01-01 01:00")},{"start":pd.Timestamp("2026-01-01 02:00"),"end":pd.Timestamp("2026-01-01 03:00")}];flow=pd.DataFrame({"timestamp":pd.date_range("2026-01-01 00:00","2026-01-01 03:00",freq="h"),"q":[1.0,1.0,1.0,1.0]});blocks=spill_block_volumes(events,flow,"q",max_gap_seconds=3700);assert len(blocks)==1;assert blocks.iloc[0].physical_discharges==2;assert blocks.iloc[0].volume_m3==pytest.approx(7200.0)
