from __future__ import annotations
from pathlib import Path
import re
import numpy as np
import pandas as pd
from .common import ParsedData,clean_numeric

_NUMBER=re.compile(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")

def _dt10(token):
    if not re.fullmatch(r"\d{10}",token):return pd.NaT
    yy=int(token[:2]);year=2000+yy if yy<=79 else 1900+yy
    try:return pd.Timestamp(year,int(token[2:4]),int(token[4:6]),int(token[6:8]),int(token[8:10]))
    except ValueError:return pd.NaT
def parse_rainfall_r(path):
    p=Path(path);lines=p.read_text(encoding="utf-8-sig",errors="replace").splitlines();cstart=cend=None;field=None;unit=None;constant_names=[]
    for i,line in enumerate(lines):
        s=line.strip().upper()
        if s.startswith("**FIELD:"):
            tail=line.split(":",1)[1];parts=[x.strip() for x in tail.split(",") if x.strip()];field=parts[-1] if parts else None
        elif s.startswith("**UNITS:"):
            tail=line.split(":",1)[1];parts=[x.strip() for x in tail.split(",") if x.strip()];unit=parts[-1] if parts else None
        elif s.startswith("**CONSTANTS:"):
            tail=line.split(":",1)[1];parts=[x.strip().upper() for x in tail.split(",") if x.strip()];constant_names=parts[1:] if parts and parts[0].isdigit() else parts
        if s=="*CSTART":cstart=i
        elif s=="*CEND":cend=i;break
    if cstart is None or cend is None:raise ValueError("Rainfall R file missing CSTART/CEND")
    control=[]
    for line in lines[cstart+1:cend]:control.extend(line.split())
    constants={name:control[i] for i,name in enumerate(constant_names[:len(control)])}
    dates=[x for x in control if re.fullmatch(r"\d{10}",x)]
    if not dates:raise ValueError("Rainfall R start timestamp missing")
    start=_dt10(constants.get("START",dates[0]));interval=None
    try:interval=float(constants.get("INTERVAL"))
    except (TypeError,ValueError):pass
    if interval is None and len(dates)>1:
        try:j=control.index(dates[-1]);interval=float(control[j+1])
        except (ValueError,IndexError):pass
    if interval is None or interval<=0:raise ValueError("Rainfall R interval is ambiguous or invalid")
    tokens=[]
    for line in lines[cend+1:]:
        if not line.lstrip().startswith("*"):tokens.extend(_NUMBER.findall(line))
    if not tokens:raise ValueError("Rainfall R contains no data")
    clean,audit=clean_numeric(pd.Series(np.asarray(tokens,dtype=float)));out=pd.DataFrame({"timestamp":pd.date_range(start=start,periods=len(clean),freq=pd.Timedelta(minutes=interval)),"rainfall":clean})
    normalised_unit=str(unit or "").strip().lower().replace(" ","")
    canonical="mm/h" if normalised_unit in {"mm/h","mm/hr","mmperhour"} else None
    return ParsedData(out,"rainfall_r_ascii",{"interval_min":interval,"quantity":"rainfall","field":field,"original_unit":unit or "unknown","canonical_unit":canonical,"constants":constants,"header_end":dates[-1] if len(dates)>1 else None,"time_basis":"model clock/unspecified","timestamp_convention":"interval_average/confirm"},{**audit,"rows":len(out)})
