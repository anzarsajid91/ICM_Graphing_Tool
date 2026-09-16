from datetime import datetime
import pandas as pd
import pytest
from icm_workbench.analysis.integration import integrate_series
from icm_workbench.domain import ExclusionPeriod

def test_constant_one_cumec_two_minutes_is_120_m3():
    df=pd.DataFrame({"timestamp":pd.to_datetime(["2026-01-01 00:00","2026-01-01 00:02"]),"q":[1.0,1.0]});result=integrate_series(df,"q",df.timestamp.iloc[0],df.timestamp.iloc[1],max_gap_seconds=180);assert result["integral"]==pytest.approx(120.0)

def test_linear_integration_splits_exactly_around_exclusion():
    df=pd.DataFrame({"timestamp":pd.to_datetime(["2026-01-01 00:00","2026-01-01 00:02"]),"q":[0.0,2.0]});exc=ExclusionPeriod(datetime(2026,1,1,0,1),datetime(2026,1,1,0,1,30),"sensor issue");result=integrate_series(df,"q",df.timestamp.iloc[0],df.timestamp.iloc[1],max_gap_seconds=180,exclusions=[exc]);assert result["integral"]==pytest.approx(82.5);assert result["excluded_seconds"]==pytest.approx(30.0)

def test_long_gap_not_integrated():
    df=pd.DataFrame({"timestamp":pd.to_datetime(["2026-01-01 00:00","2026-01-01 01:00"]),"q":[1.0,1.0]});result=integrate_series(df,"q",df.timestamp.iloc[0],df.timestamp.iloc[1],max_gap_seconds=300);assert result["integral"]==0;assert result["gap_seconds"]==3600
