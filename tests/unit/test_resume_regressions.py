from datetime import datetime, timedelta
import pandas as pd
from icm_workbench.analysis.spills import spill_assessment
from icm_workbench.domain import ExclusionPeriod


def test_all_excluded_unavailable_and_original_audit_retained():
    s=datetime(2026,1,1)
    frame=pd.DataFrame({'timestamp':[s,s+timedelta(seconds=600)],'level':[2,2]})
    exclusions=[ExclusionPeriod(s,s+timedelta(seconds=400),'first'),ExclusionPeriod(s+timedelta(seconds=300),s+timedelta(seconds=600),'second')]
    r=spill_assessment(frame,'level',1,exclusions=exclusions)
    assert r['status']=='unavailable'
    assert r['total_spill_count'] is None
    assert r['coverage_fraction'] is None
    assert len(r['exclusion_audit'])==2
    assert r['excluded_seconds']==600
    assert pd.isna(r['yearly_summary'].iloc[0].spill_count)


def test_half_open_year_and_independent_coverage():
    frame=pd.DataFrame({'timestamp':pd.to_datetime(['2025-12-31T23:30','2026-01-01T00:00']), 'level':[2,2]})
    r=spill_assessment(frame,'level',1,max_gap_seconds=3600)
    assert list(r['yearly_summary'].year)==[2025]
    assert r['yearly_summary'].iloc[0].duration_hours==0.5
    assert r['yearly_summary'].iloc[0].valid_hours==0.5


def test_masked_count_not_definitive_and_exact_support():
    s=datetime(2026,1,1)
    frame=pd.DataFrame({'timestamp':[s,s+timedelta(seconds=600)],'level':[2,2]})
    exc=[ExclusionPeriod(s+timedelta(seconds=120),s+timedelta(seconds=180),'one'),ExclusionPeriod(s+timedelta(seconds=150),s+timedelta(seconds=240),'two')]
    r=spill_assessment(frame,'level',1,exclusions=exc)
    assert r['valid_seconds']==480
    assert r['excluded_seconds']==120
    assert r['unknown_seconds']==0
    assert r['total_spill_duration_hours']==480/3600
    assert r['count_status']=='partial/excluded-window'
    assert r['requested_coverage_fraction']==0.8


def test_cumulative_linear_triangle_uses_trapezoids():
    from icm_workbench.analysis.diagnostics import cumulative_volume
    frame=pd.DataFrame({'timestamp':pd.date_range('2026-01-01',periods=3,freq='60s'),'obs':[0,2,0],'sim':[1,1,1]})
    r=cumulative_volume(frame)
    assert r.obs_cumulative_m3.iloc[-1]==120
    assert r.sim_cumulative_m3.iloc[-1]==120
