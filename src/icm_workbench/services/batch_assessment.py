from __future__ import annotations
from datetime import datetime
from pathlib import Path
import json
from icm_workbench.analysis.alignment import pair_series
from icm_workbench.analysis.metrics import calibration_metrics
from icm_workbench.analysis.exclusions import apply_exclusions
from icm_workbench.domain import ExclusionPeriod
from icm_workbench.parsers import parse_file
from icm_workbench.services.catalogue import safe_source_path
from icm_workbench.services.batch import BatchItem,run_batch

def _parse_exclusions(raw):return [ExclusionPeriod(datetime.fromisoformat(x["start"]),datetime.fromisoformat(x["end"]),x["reason"],x.get("source","batch"),x.get("exclusion_id")) for x in (raw or [])]
def run_calibration_item(data_root,payload):
    required=["observed","observed_column","model","model_column"];missing=[k for k in required if not payload.get(k)]
    if missing:raise ValueError(f"Missing explicit batch mapping: {', '.join(missing)}")
    obs=parse_file(safe_source_path(data_root,payload["observed"])).frame;mod=parse_file(safe_source_path(data_root,payload["model"])).frame;exclusions=_parse_exclusions(payload.get("exclusions"));obs,_=apply_exclusions(obs,exclusions,[payload["observed_column"]]);mod,_=apply_exclusions(mod,exclusions,[payload["model_column"]]);paired=pair_series(obs,mod,payload["observed_column"],payload["model_column"],max_gap_seconds=float(payload.get("max_gap_seconds",900.0)),start=payload.get("start"),end=payload.get("end"));return {"metrics":calibration_metrics(paired),"paired_rows":int(len(paired)),"exclusions":[x.to_dict() for x in exclusions]}
def run_batch_config(data_root,config):
    raw=config.get("items") if isinstance(config,dict) else None
    if not isinstance(raw,list):raise ValueError("Batch config requires an explicit items list")
    items=[BatchItem(str(x.get("id") or f"item-{i+1}"),dict(x)) for i,x in enumerate(raw)];return run_batch(items,lambda payload:run_calibration_item(data_root,payload))
def run_batch_file(data_root,path):return run_batch_config(data_root,json.loads(Path(path).read_text(encoding="utf-8")))
