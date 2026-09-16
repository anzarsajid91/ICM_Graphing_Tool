import numpy as np
import pandas as pd

from icm_workbench.analysis.review import rating_curve_fit,weekly_data_assessment,dry_weather_flow,event_response_summary


def test_rating_curve_recovers_power_law():
    h=pd.Series([0.2,0.3,0.5,0.8,1.0,1.4,1.8])
    q=2.5*h**1.6
    fit=rating_curve_fit(h,q)
    assert fit['ok']
    assert abs(fit['a']-2.5)<1e-9
    assert abs(fit['b']-1.6)<1e-9
    assert fit['r2']>0.999999


def test_weekly_assessment_flags_large_gap():
    t=pd.to_datetime(['2026-01-01 00:00','2026-01-01 00:02','2026-01-01 00:04','2026-01-01 01:00'])
    df=pd.DataFrame({'timestamp':t,'depth':[1,1.1,1.2,1.3]})
    out=weekly_data_assessment(df,max_gap_seconds=900)
    assert int(out.large_gap_count.sum())==1
    assert 'Amber' in set(out.rag) or 'Red' in set(out.rag)


def test_dwf_screening_uses_dry_days_and_adp_window():
    t=pd.date_range('2026-01-01',periods=10*24,freq='1h')
    flow=pd.DataFrame({'timestamp':t,'flow':0.10+0.02*np.sin(np.arange(len(t))*2*np.pi/24)})
    rain=pd.DataFrame({'timestamp':t,'rainfall':0.0})
    result=dry_weather_flow(flow,'flow',rain,'rainfall',dry_day_mm=1,baseline_days=28,min_dry_days=5,adp_hours=6)
    assert result['available']=='Yes'
    assert result['dry_days_used']>=5
    assert 0.07<result['average_dwf']<0.12


def test_event_response_reports_uplift_and_lag():
    t=pd.date_range('2026-01-01',periods=13,freq='30min')
    obs=pd.DataFrame({'timestamp':t,'flow':[1,1,1,1,1,2,4,3,2,1,1,1,1]})
    sim=pd.DataFrame({'timestamp':t,'flow':[1,1,1,1,1,1.5,2,4,3,2,1,1,1]})
    events=[{'event':1,'start':pd.Timestamp('2026-01-01 02:00'),'end':pd.Timestamp('2026-01-01 03:00'),'total_depth_mm':7.0}]
    row=event_response_summary(obs,sim,events,'flow','flow',baseline_hours=2,post_hours=2)[0]
    assert row['observed_uplift']>0
    assert row['modelled_uplift']>0
    assert row['peak_lag_minutes']==30.0
