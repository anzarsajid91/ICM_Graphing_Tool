from __future__ import annotations
from dataclasses import dataclass,field
from typing import Any
import re
import numpy as np
import pandas as pd

INVALID_SENTINELS={9999.0,-9999.0,99999.0,-99999.0}; TIME_NAMES={"time","date","datetime","timestamp","p_datetime"}

@dataclass
class ParsedData:
    frame:pd.DataFrame
    format_name:str
    metadata:dict[str,Any]=field(default_factory=dict)
    audit:dict[str,Any]=field(default_factory=dict)

def normalise(text):return re.sub(r"[^a-z0-9]+","_",str(text or "").strip().lower()).strip("_")

def clean_numeric(series):
    raw=pd.to_numeric(series,errors="coerce"); sentinel=raw.isin(INVALID_SENTINELS); invalid=raw.isna()&series.notna(); cleaned=raw.mask(sentinel,np.nan)
    return cleaned,{"sentinel_count":int(sentinel.sum()),"non_numeric_count":int(invalid.sum()),"missing_count_after_clean":int(cleaned.isna().sum())}

def detect_time_column(df):
    for c in df.columns:
        n=normalise(c)
        if n in TIME_NAMES or any(t in n for t in TIME_NAMES):return str(c)
    best,count=None,0
    for c in df.columns:
        n=int(pd.to_datetime(df[c],errors="coerce",dayfirst=True).notna().sum())
        if n>count:best,count=str(c),n
    return best if count>=max(2,int(0.5*len(df))) else None

def infer_quantity(text):
    n=normalise(text)
    if "rain" in n:return "rainfall"
    if "velocity" in n or "vel" in n:return "velocity"
    if any(t in n for t in ["flow_m3_s","flow","discharge"]) and "overflow" not in n:return "flow"
    if any(t in n for t in ["level","stage","maod","mald","water_level"]):return "level"
    if "depth" in n:return "depth"
    return None

def canonical_unit(quantity,unit):
    u=normalise(unit).replace("_per_","_") if unit else ""
    if quantity in ("depth","level"):
        if u in {"m","metre","metres","meter","meters","m_ad","maod"}:return "m",1.0
        if u in {"mm","millimetre","millimetres","millimeter","millimeters"}:return "m",0.001
    if quantity=="flow":
        if u in {"m3_s","m3s","m_3_s","cumec","cumecs"}:return "m³/s",1.0
        if u in {"l_s","ls","lps","litre_s","litres_s"}:return "m³/s",0.001
    if quantity=="velocity" and u in {"m_s","ms","mps"}:return "m/s",1.0
    if quantity=="rainfall":
        if u in {"mm_h","mm_hr","mm_hour","mm_per_h"}:return "mm/h",1.0
        if u in {"mm","millimetres","millimeters"}:return "mm",1.0
    return None,None
