from __future__ import annotations
from pathlib import Path
import re
import numpy as np
import pandas as pd
from .common import ParsedData,clean_numeric,canonical_unit

def _dt10(token):
    if not re.fullmatch(r"\d{10}",token):return pd.NaT
    yy=int(token[:2]);year=2000+yy if yy<=79 else 1900+yy
    try:return pd.Timestamp(year,int(token[2:4]),int(token[4:6]),int(token[6:8]),int(token[8:10]))
    except ValueError:return pd.NaT

def parse_fdv(path):
    p=Path(path);lines=p.read_text(encoding="utf-8",errors="replace").splitlines();fields=[];units=[];cstart=cend=None;monitor=p.stem
    for i,line in enumerate(lines):
        s=line.strip()
        if s.startswith("**IDENTIFIER:"):
            try:monitor=line.split(":",1)[1].strip().split(",",1)[1].strip()
            except Exception:pass
        elif s.startswith("**FIELD:"):
            text=line.split(":",1)[1].strip();text=text.split(",",1)[1] if "," in text else text;fields=[x.strip().upper() for x in text.split(",") if x.strip()]
        elif s.startswith("**UNITS:"):
            text=line.split(":",1)[1].strip();text=text.split(",",1)[1] if "," in text else text;units=[x.strip() for x in text.split(",") if x.strip()]
        elif s=="*CSTART":cstart=i
        elif s=="*CEND":cend=i;break
    if cstart is None or cend is None or not fields:raise ValueError("FDV header is incomplete: FIELD/CSTART/CEND required")
    units += [""]*(len(fields)-len(units));control=[]
    for line in lines[cstart+1:cend]:control.extend(line.split())
    dates=[x for x in control if re.fullmatch(r"\d{10}",x)]
    if not dates:raise ValueError("FDV start timestamp not found")
    start=_dt10(dates[0]);interval=None
    if len(dates)>1:
        try:j=control.index(dates[1]);interval=float(control[j+1])
        except Exception:pass
    if interval is None or interval<=0:raise ValueError("FDV interval is ambiguous or invalid; explicit valid interval required")
    tokens=[]
    for line in lines[cend+1:]:tokens.extend(re.findall(r"[-+]?\d*\.\d+|[-+]?\d+",line))
    if len(tokens)%len(fields):raise ValueError(f"FDV field-count mismatch/truncated record: {len(tokens)} values for {len(fields)} fields")
    if not tokens:raise ValueError("FDV contains no data records")
    arr=np.asarray(tokens,dtype=float).reshape((-1,len(fields)));out=pd.DataFrame({"timestamp":pd.date_range(start=start,periods=len(arr),freq=pd.Timedelta(minutes=interval))});meta={};total=0
    for j,field in enumerate(fields):
        quantity={"FLOW":"flow","DEPTH":"depth","VELOCITY":"velocity","LEVEL":"level"}.get(field,field.lower());canon,factor=canonical_unit(quantity,units[j])
        if canon is None:raise ValueError(f"Unknown/unsupported FDV unit for {field}: {units[j]!r}")
        clean,audit=clean_numeric(pd.Series(arr[:,j]));total+=audit["sentinel_count"];col=quantity;out[col]=clean*float(factor);meta[col]={"field":field,"quantity":quantity,"original_unit":units[j],"canonical_unit":canon,"factor":factor,"audit":audit}
    return ParsedData(out,"fdv_ascii",{"monitor":monitor,"interval_min":interval,"channels":meta,"time_basis":"model clock/unspecified","timestamp_convention":"instantaneous"},{"rows":len(out),"sentinel_count":total,"field_count":len(fields),"duplicate_timestamps":0})
