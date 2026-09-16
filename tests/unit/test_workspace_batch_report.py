from datetime import datetime
from pathlib import Path
import pandas as pd
from icm_workbench.domain import Workspace,ExclusionPeriod
from icm_workbench.services.workspace import save_workspace,load_workspace
from icm_workbench.services.batch import BatchItem,run_batch
from icm_workbench.services.reports import assessment_html

def test_workspace_roundtrip_preserves_multiple_exclusions(tmp_path:Path):
    w=Workspace(schema_version=1,name="x");w.add_exclusion(ExclusionPeriod(datetime(2026,1,1),datetime(2026,1,1,1),"EDM fault"));w.add_exclusion(ExclusionPeriod(datetime(2026,1,2),datetime(2026,1,2,2),"model gap"));path=tmp_path/"x.json";save_workspace(w,path);loaded=load_workspace(path);assert [x["reason"] for x in loaded.exclusions]==["EDM fault","model gap"]

def test_batch_keeps_valid_items_when_one_fails():
    def runner(p):
        if p["x"]<0:raise ValueError("invalid pair")
        return p["x"]*2
    out=run_batch([BatchItem("a",{"x":2}),BatchItem("bad",{"x":-1}),BatchItem("b",{"x":3})],runner);assert [x["status"] for x in out]==["ok","error","ok"]

def test_html_report_escapes_untrusted_text_and_contains_exclusion_audit():
    text=assessment_html(title="<unsafe>",summary={"file":"<script>"},tables={"Counts":pd.DataFrame([{"x":1}])},exclusions=[{"start":"a","end":"b","reason":"<bad>","source":"user","exclusion_id":"e"}]);assert "<unsafe>" not in text and "&lt;unsafe&gt;" in text;assert "&lt;bad&gt;" in text;assert "Exclusion audit" in text
