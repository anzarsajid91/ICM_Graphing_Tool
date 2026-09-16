from pathlib import Path
import pandas as pd
from icm_workbench.analysis.quality import quality_findings
from icm_workbench.services.graph_reports import four_graph_report_html
from icm_workbench.services.batch_assessment import run_batch_config

def test_quality_findings_localise_missing_and_long_gap():
    df=pd.DataFrame({"timestamp":pd.to_datetime(["2026-01-01 00:00","2026-01-01 00:02","2026-01-01 01:00"]),"q":[1.0,float("nan"),2.0]});out=quality_findings(df,["q"],max_gap_seconds=300);assert {"missing_values","timestamp_gap"}.issubset(set(out.kind))
def test_four_graph_report_is_offline_and_has_legacy_period_shape():
    t=pd.date_range("2026-01-01",periods=4,freq="120D");obs=pd.DataFrame({"timestamp":t,"q":[1,2,3,4]});mod=pd.DataFrame({"timestamp":t,"q":[1.1,1.9,3.2,3.8]});text=four_graph_report_html(quantity="flow",unit="m³/s",year=2026,observed=obs,obs_col="q",scenarios={"Model":(mod,"q")},exclusions=[{"start":"2026-01-01","end":"2026-01-02","reason":"EDM fault"}]);assert "2026 Complete Period" in text and "2026 Jan-Apr" in text and "2026 May-Aug" in text and "2026 Sep-Dec" in text;assert '<script src="https://cdn.plot.ly' not in text;assert "EDM fault" in text
def test_batch_matches_explicit_single_mapping_and_isolates_bad_item():
    root=Path(__file__).parents[2]/"examples"/"demo";cfg={"items":[{"id":"ok","observed":"observed.csv","observed_column":"flow","model":"model.csv","model_column":"flow","max_gap_seconds":900},{"id":"bad","observed":"missing.csv","observed_column":"flow","model":"model.csv","model_column":"flow"}]};out=run_batch_config(root,cfg);assert out[0]["status"]=="ok" and out[0]["result"]["metrics"]["pairs"]>0;assert out[1]["status"]=="error"
