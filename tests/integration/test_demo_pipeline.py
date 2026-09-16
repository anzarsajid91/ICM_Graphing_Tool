from datetime import datetime
from pathlib import Path
from icm_workbench.parsers import parse_file
from icm_workbench.services.workspace import load_workspace
from icm_workbench.domain import ExclusionPeriod
from icm_workbench.analysis.spills import spill_assessment

def test_synthetic_demo_spill_pipeline():
    root=Path(__file__).parents[2]/"examples"/"demo";parsed=parse_file(root/"observed.csv");ws=load_workspace(root/"demo.workspace.json");exclusions=[ExclusionPeriod(datetime.fromisoformat(x["start"]),datetime.fromisoformat(x["end"]),x["reason"],x.get("source","user"),x.get("exclusion_id")) for x in ws.exclusions];result=spill_assessment(parsed.frame,"depth",1.0,max_gap_seconds=900,exclusions=exclusions);assert result["excluded_seconds"]>0;assert result["exclusion_audit"][0]["reason"].startswith("Synthetic EDM")
