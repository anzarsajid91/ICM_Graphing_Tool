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

def _unit_key(unit):
    if unit is None:return ""
    u=str(unit).strip().lower().replace("³","3").replace("²","2")
    u=u.replace("per","/").replace("·","").replace(" ","")
    u=u.replace("sec","s").replace("second","s").replace("seconds","s")
    u=u.replace("hour","h").replace("hours","h").replace("hr","h")
    u=u.replace("day","d").replace("days","d")
    u=u.replace("litres","l").replace("liters","l").replace("litre","l").replace("liter","l")
    u=u.replace("metres","m").replace("meters","m").replace("metre","m").replace("meter","m")
    return u

def canonical_unit(quantity,unit):
    u=_unit_key(unit)
    if quantity in ("depth","level"):
        if u in {"m","m_ad","mad","maod"}:return "m",1.0
        if u in {"mm","millimetre","millimetres","millimeter","millimeters"}:return "m",0.001
    if quantity=="flow":
        if u in {"m3/s","m3s","cumec","cumecs"}:return "m³/s",1.0
        if u in {"l/s","ls","lps"}:return "m³/s",0.001
        if u in {"ml/d","mld","megalitre/d","megalitres/d","megaliter/d","megaliters/d"}:return "m³/s",1000.0/86400.0
        if u in {"m3/d","m3d"}:return "m³/s",1.0/86400.0
    if quantity=="velocity" and u in {"m/s","ms","mps"}:return "m/s",1.0
    if quantity=="rainfall":
        if u in {"mm/h","mmh","mm/h"}:return "mm/h",1.0
        if u in {"mm"}:return "mm",1.0
    return None,None

def detect_unit(text,quantity=None):
    """Extract a defensible engineering unit from a header/label.

    Returns the original unit spelling when recognized, otherwise None.
    """
    raw=str(text or "").strip()
    bracketed=re.findall(r"[\(\[]\s*([^\)\]]+?)\s*[\)\]]",raw)
    candidates=list(reversed(bracketed))
    low=raw.lower().replace("³","3")
    patterns=[
        (r"(?i)\bml\s*/\s*d\b","Ml/d"),
        (r"(?i)\bm\s*3\s*/\s*s\b","m3/s"),
        (r"(?i)\bl\s*/\s*s\b","L/s"),
        (r"(?i)\bm\s*3\s*/\s*d\b","m3/d"),
        (r"(?i)\bmm\s*/\s*(?:h|hr|hour)\b","mm/h"),
        (r"(?i)\bm\s*/\s*s\b","m/s"),
    ]
    for pat,label in patterns:
        if re.search(pat,raw):candidates.append(label)
    n=normalise(low)
    suffixes=[
        ("ml_d","Ml/d"),("mld","Ml/d"),("m3_s","m3/s"),("m_3_s","m3/s"),
        ("l_s","L/s"),("lps","L/s"),("m3_d","m3/d"),("mm_h","mm/h"),
        ("mm_hr","mm/h"),("m_s","m/s"),("mps","m/s"),
    ]
    for suffix,label in suffixes:
        if n.endswith(suffix):candidates.append(label)
    if quantity in {"depth","level"}:
        if re.search(r"(?i)(?:^|[\(\[\s_])mm(?:$|[\)\]\s_])",raw):candidates.append("mm")
        elif re.search(r"(?i)(?:^|[\(\[\s_])m(?:$|[\)\]\s_])",raw):candidates.append("m")
    if quantity=="rainfall" and re.search(r"(?i)(?:^|[\(\[\s_])mm(?:$|[\)\]\s_])",raw):
        candidates.append("mm")
    for candidate in candidates:
        canon,_=canonical_unit(quantity,candidate)
        if canon is not None:return str(candidate).strip()
    return None
