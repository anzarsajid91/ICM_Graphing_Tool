from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
from icm_workbench.domain import ExclusionPeriod,Workspace
SCHEMA_VERSION=1

def workspace_from_dict(data):
    if not isinstance(data,dict):raise ValueError("Workspace must be a JSON object")
    version=int(data.get("schema_version",0))
    if version!=SCHEMA_VERSION:raise ValueError(f"Unsupported workspace schema_version={version}; supported={SCHEMA_VERSION}")
    allowed={"schema_version","name","source_references","mappings","analysis","exclusions","annotations","presentation"};unknown=sorted(set(data)-allowed)
    if unknown:raise ValueError(f"Unknown workspace keys: {unknown}")
    exclusions=[]
    for raw in data.get("exclusions",[]):
        if not isinstance(raw,dict):raise ValueError("Each exclusion must be an object")
        exc=ExclusionPeriod(datetime.fromisoformat(str(raw["start"])),datetime.fromisoformat(str(raw["end"])),str(raw["reason"]),str(raw.get("source","user")),raw.get("exclusion_id"));exclusions.append(exc.to_dict())
    return Workspace(SCHEMA_VERSION,str(data.get("name") or "Untitled workspace"),dict(data.get("source_references") or {}),dict(data.get("mappings") or {}),dict(data.get("analysis") or {}),exclusions,list(data.get("annotations") or []),dict(data.get("presentation") or {}))
def load_workspace(path):return workspace_from_dict(json.loads(Path(path).read_text(encoding="utf-8")))
def save_workspace(workspace,path):
    target=Path(path);target.parent.mkdir(parents=True,exist_ok=True);tmp=target.with_suffix(target.suffix+".tmp");tmp.write_text(json.dumps(workspace.to_dict(),indent=2,sort_keys=True,default=str),encoding="utf-8");tmp.replace(target)
