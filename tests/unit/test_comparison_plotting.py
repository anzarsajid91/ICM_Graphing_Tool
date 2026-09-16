import pandas as pd
from icm_workbench.analysis.comparison import compare_scenarios,preview_time_offset
from icm_workbench.plotting import downsample_gap_aware

def test_scenario_table_has_same_named_method_without_ranking():
    t=pd.date_range("2026-01-01",periods=4,freq="min");obs=pd.DataFrame({"timestamp":t,"q":[1,2,3,4]});a=pd.DataFrame({"timestamp":t,"q":[1,2,3,4]});b=pd.DataFrame({"timestamp":t,"q":[1,2,2,4]});out=compare_scenarios(obs,"q",{"A":(a,"q"),"B":(b,"q")},common_valid_domain=True);assert set(out.scenario)=={"A","B"};assert "comparison_domain" in out.columns;assert not any(c.lower() in {"rank","winner","score"} for c in out.columns)

def test_offset_preview_does_not_mutate_source():
    t=pd.date_range("2026-01-01",periods=4,freq="min");obs=pd.DataFrame({"timestamp":t,"q":[1,2,3,4]});mod=pd.DataFrame({"timestamp":t+pd.Timedelta(minutes=1),"q":[1,2,3,4]});original=mod.timestamp.copy();result=preview_time_offset(obs,mod,"q","q",-1,max_gap_seconds=120);assert result["applied"] is False;assert mod.timestamp.equals(original)

def test_downsampling_retains_gap_separator():
    t=pd.date_range("2026-01-01",periods=8,freq="min");x,y=downsample_gap_aware(t,[0,1,2,float("nan"),float("nan"),3,4,5],max_points=4);assert None in x and None in y
