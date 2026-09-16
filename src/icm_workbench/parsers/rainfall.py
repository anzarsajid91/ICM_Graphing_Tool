from __future__ import annotations
from pathlib import Path
import re
import numpy as np
import pandas as pd
from .common import ParsedData,clean_numeric

def _dt10(token):
    if not re.fullmatch(r"\d{10}",token):return pd.NaT
    yy=int(token[:2]);year=2000+yy if yy<=79 else 1900+yy
    try:return pd.Timestamp(year,int(token[2:4]),int(token[4:6]),int(token[6:8]),int(token[8:10]))
    except ValueError:return pd.NaT
def parse_rainfall_r(path):
    p=Path(path);lines=p.read_text(encoding="utf-8",errors="replace").splitlines();cstart=cend=None
    for i,line in enumerate(lines):
        s=line.strip().upper()
        if s=="*CSTART":cstart=i
        elif s=="*CEND":cend=i;break
    if cstart is None or cend is None:raise ValueError("Rainfall R file missing CSTART/CEND")
    control=[]
    for line in lines[cstart+1:cend]:control.extend(line.split())
    dates=[x for x in control if re.fullmatch(r"\d{10}",x)]
    if not dates:raise ValueError("Rainfall R start timestamp missing")
    start=_dt10(dates[0]);interval=None
    if len(dates)>1:
        try:j=control.index(dates[1]);interval=float(control[j+1])
        except Exception:pass
    if interval is None or interval<=0:raise ValueError("Rainfall R interval is ambiguous or invalid")
    tokens=[]
    for line in lines[cend+1:]:tokens.extend(re.findall(r"[-+]?\d*\.\d+|[-+]?\d+",line))
    if not tokens:raise ValueError("Rainfall R contains no data")
    clean,audit=clean_numeric(pd.Series(np.asarray(tokens,dtype=float)));out=pd.DataFrame({"timestamp":pd.date_range(start=start,periods=len(clean),freq=pd.Timedelta(minutes=interval)),"rainfall":clean})
    return ParsedData(out,"rainfall_r_ascii",{"interval_min":interval,"quantity":"rainfall","original_unit":"unknown","canonical_unit":None,"time_basis":"model clock/unspecified","timestamp_convention":"interval_average/confirm"},{**audit,"rows":len(out)})
