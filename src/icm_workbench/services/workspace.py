from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
from icm_workbench.domain import ExclusionPeriod,Workspace

SCHEMA_VERSION=3


def migrate_workspace_dict(data):
    """Migrate supported legacy Python workspace schemas to schema v3.

    Browser workspaces already use v3. The Python service retains its compact
    domain representation while accepting legacy v1/v2 and browser-style
    mapping input without silently changing analytical values.
    """
    if not isinstance(data,dict):raise ValueError("Workspace must be a JSON object")
    raw=dict(data)
    try:version=int(raw.get("schema_version",1))
    except Exception as exc:raise ValueError("Workspace schema_version must be an integer") from exc
    if version not in {1,2,3}:raise ValueError(f"Unsupported workspace schema_version={version}; supported legacy=1/2 and current=3")

    if "mapping" in raw and "mappings" not in raw:
        raw["mappings"]=raw.get("mapping") or {}
    if version<=1:
        raw.setdefault("annotations",[])
        raw.setdefault("presentation",{})
        version=2
    if version<=2:
        version=3
    raw["schema_version"]=SCHEMA_VERSION
    return raw


def workspace_from_dict(data):
    raw=migrate_workspace_dict(data)
    exclusions=[]
    for item in raw.get("exclusions",[]):
        if not isinstance(item,dict):raise ValueError("Each exclusion must be an object")
        exc=ExclusionPeriod(
            datetime.fromisoformat(str(item["start"])),
            datetime.fromisoformat(str(item["end"])),
            str(item["reason"]),
            str(item.get("source","user")),
            item.get("exclusion_id",item.get("id")),
        )
        exclusions.append(exc.to_dict())
    return Workspace(
        SCHEMA_VERSION,
        str(raw.get("name") or "Untitled workspace"),
        raw.get("source_references") or {},
        dict(raw.get("mappings") or {}),
        dict(raw.get("analysis") or {}),
        exclusions,
        list(raw.get("annotations") or []),
        dict(raw.get("presentation") or {}),
    )


def load_workspace(path):return workspace_from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


def save_workspace(workspace,path):
    data=migrate_workspace_dict(workspace.to_dict())
    target=Path(path);target.parent.mkdir(parents=True,exist_ok=True);tmp=target.with_suffix(target.suffix+".tmp")
    tmp.write_text(json.dumps(data,indent=2,sort_keys=True,default=str),encoding="utf-8");tmp.replace(target)
