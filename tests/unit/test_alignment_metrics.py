import pandas as pd
from icm_workbench.analysis.alignment import pair_series
from icm_workbench.analysis.metrics import calibration_metrics

def test_alignment_does_not_bridge_long_gap():
    obs=pd.DataFrame({"timestamp":pd.to_datetime(["2026-01-01 00:00","2026-01-01 00:05","2026-01-01 00:10"]),"o":[0,5,10]});mod=pd.DataFrame({"timestamp":pd.to_datetime(["2026-01-01 00:00","2026-01-01 00:10"]),"m":[0,10]});paired=pair_series(obs,mod,"o","m",max_gap_seconds=300);assert list(paired.timestamp)==[pd.Timestamp("2026-01-01 00:00"),pd.Timestamp("2026-01-01 00:10")]

def test_constant_observation_has_undefined_nse_not_perfect_score():
    paired=pd.DataFrame({"timestamp":pd.date_range("2026-01-01",periods=3,freq="min"),"obs":[1,1,1],"sim":[1,1,1]});result=calibration_metrics(paired);assert result["nse"] is None;assert result["correlation"] is None
