from __future__ import annotations
from pathlib import Path
import re
import numpy as np
import pandas as pd
from .common import ParsedData,clean_numeric,canonical_unit

_NUMBER = re.compile(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")


def _header_values(lines, marker):
    """Read a comma header and any ICM ``*+`` continuation records."""
    values=[]
    for i,line in enumerate(lines):
        if not line.strip().upper().startswith(marker):
            continue
        text=line.split(":",1)[1].strip() if ":" in line else ""
        text=text.split(",",1)[1] if "," in text else text
        values.extend(x.strip() for x in text.split(",") if x.strip())
        j=i+1
        while j<len(lines) and lines[j].lstrip().startswith("*+"):
            tail=lines[j].lstrip()[2:].strip().lstrip(",")
            values.extend(x.strip() for x in tail.split(",") if x.strip())
            j+=1
        break
    return values


def _control_contract(lines,cstart,cend):
    names=[x.upper() for x in _header_values(lines,"**CONSTANTS:")]
    tokens=[]
    for line in lines[cstart+1:cend]:tokens.extend(line.split())
    mapping={name:tokens[i] for i,name in enumerate(names[:len(tokens)])}
    dates=[x for x in tokens if re.fullmatch(r"\d{10}",x)]
    start=_dt10(mapping.get("START",dates[0] if dates else ""))
    interval_token=mapping.get("INTERVAL")
    if interval_token is None and len(dates)>1:
        try:interval_token=tokens[tokens.index(dates[-1])+1]
        except (ValueError,IndexError):interval_token=None
    try:interval=float(interval_token)
    except (TypeError,ValueError):interval=None
    return start,interval,mapping

def _dt10(token):
    if not re.fullmatch(r"\d{10}",token):return pd.NaT
    yy=int(token[:2]);year=2000+yy if yy<=79 else 1900+yy
    try:return pd.Timestamp(year,int(token[2:4]),int(token[4:6]),int(token[6:8]),int(token[8:10]))
    except ValueError:return pd.NaT

def parse_fdv(path):
    p=Path(path);lines=p.read_text(encoding="utf-8-sig",errors="replace").splitlines();fields=[];units=[];cstart=cend=None;monitor=p.stem
    for i,line in enumerate(lines):
        s=line.strip()
        if s.startswith("**IDENTIFIER:"):
            try:monitor=line.split(":",1)[1].strip().split(",",1)[1].strip()
            except Exception:pass
        elif s=="*CSTART":cstart=i
        elif s=="*CEND":cend=i;break
    fields=[x.upper() for x in _header_values(lines,"**FIELD:")]
    units=_header_values(lines,"**UNITS:")
    if cstart is None or cend is None or not fields:raise ValueError("FDV header is incomplete: FIELD/CSTART/CEND required")
    units += [""]*(len(fields)-len(units));control=[]
    start,interval,constants=_control_contract(lines,cstart,cend)
    if pd.isna(start):raise ValueError("FDV start timestamp not found")
    if interval is None or interval<=0:raise ValueError("FDV interval is ambiguous or invalid; explicit valid interval required")
    tokens=[]
    for line in lines[cend+1:]:
        if not line.lstrip().startswith("*"):tokens.extend(_NUMBER.findall(line))
    if len(tokens)%len(fields):raise ValueError(f"FDV field-count mismatch/truncated record: {len(tokens)} values for {len(fields)} fields")
    if not tokens:raise ValueError("FDV contains no data records")
    arr=np.asarray(tokens,dtype=float).reshape((-1,len(fields)));out=pd.DataFrame({"timestamp":pd.date_range(start=start,periods=len(arr),freq=pd.Timedelta(minutes=interval))});meta={};total=0
    for j,field in enumerate(fields):
        quantity={"FLOW":"flow","DEPTH":"depth","VELOCITY":"velocity","LEVEL":"level"}.get(field,field.lower());canon,factor=canonical_unit(quantity,units[j])
        if canon is None:raise ValueError(f"Unknown/unsupported FDV unit for {field}: {units[j]!r}")
        clean,audit=clean_numeric(pd.Series(arr[:,j]));total+=audit["sentinel_count"];col=quantity;out[col]=clean*float(factor);meta[col]={"field":field,"quantity":quantity,"original_unit":units[j],"canonical_unit":canon,"factor":factor,"audit":audit}
    return ParsedData(out,"fdv_ascii",{"monitor":monitor,"interval_min":interval,"channels":meta,"constants":constants,"time_basis":"model clock/unspecified","timestamp_convention":"instantaneous"},{"rows":len(out),"sentinel_count":total,"field_count":len(fields),"duplicate_timestamps":0})
