from __future__ import annotations
import csv
from pathlib import Path
import pandas as pd
from .common import ParsedData,clean_numeric,detect_time_column,infer_quantity,canonical_unit,detect_unit

def _head(path,lines=100):return "\n".join(path.read_text(encoding="utf-8",errors="replace").splitlines()[:lines])
def is_icm_hyd_csv(path):
    text=_head(path).lower();return "p_datetime" in text and ("type=hyd" in text or "u_level" in text or "u_flow" in text or "u_velocity" in text)
def _quantity(path):
    text=_head(path).upper()
    if "U_VELOCITY" in text:return "velocity","m/s"
    if "U_FLOW" in text:return "flow","m³/s"
    if "U_LEVEL" in text or "M AD" in text or "MAOD" in text:return "level","m"
    return "depth","m"
def parse_icm_hyd_csv(path):
    lines=path.read_text(encoding="utf-8",errors="replace").splitlines(); start=next((i+1 for i,line in enumerate(lines) if line.strip().lower().startswith("p_datetime")),None)
    if start is None:raise ValueError("P_DATETIME section not found")
    rows=[]; malformed=0
    for line in lines[start:]:
        if not line.strip():continue
        try:parts=next(csv.reader([line]))
        except Exception:malformed+=1;continue
        if len(parts)<2:malformed+=1;continue
        t=pd.to_datetime(parts[0].strip(),errors="coerce",dayfirst=True)
        if pd.isna(t):malformed+=1;continue
        rows.append((t,parts[1].strip()))
    if not rows:raise ValueError("No valid P_DATETIME/value rows found")
    quantity,unit=_quantity(path); frame=pd.DataFrame(rows,columns=["timestamp","raw_value"]); values,audit=clean_numeric(frame.pop("raw_value")); frame["value"]=values; frame=frame.sort_values("timestamp")
    return ParsedData(frame,"icm_hyd_p_datetime_csv",{"quantity":quantity,"original_unit":unit,"canonical_unit":unit,"unit_status":"resolved","conversion_factor":1.0,"time_basis":"model clock/unspecified","timestamp_convention":"instantaneous"},{**audit,"malformed_rows":malformed,"duplicate_timestamps":int(frame.timestamp.duplicated().sum()),"rows":len(frame)})
def parse_tabular_csv(path):
    try:df=pd.read_csv(path,sep=None,engine="python")
    except Exception as exc:raise ValueError(f"Could not parse tabular CSV: {exc}") from exc
    df.columns=[str(c).strip() for c in df.columns]; tc=detect_time_column(df)
    if not tc:raise ValueError(f"Could not detect a timestamp column. Columns={list(df.columns)}")
    timestamps=pd.to_datetime(df[tc],errors="coerce",dayfirst=True); value_cols=[c for c in df.columns if c!=tc and pd.to_numeric(df[c],errors="coerce").notna().any()]
    if not value_cols:raise ValueError("No numeric value columns found")
    out=pd.DataFrame({"timestamp":timestamps}); audits={}; quantities={}; series_meta={}
    for c in value_cols:
        quantity=infer_quantity(c) or infer_quantity(path.stem)
        cleaned,audits[c]=clean_numeric(df[c]); quantities[c]=quantity
        original_unit=detect_unit(c,quantity) or detect_unit(path.stem,quantity)
        canonical,factor=canonical_unit(quantity,original_unit) if quantity and original_unit else (None,None)
        if canonical is not None and factor is not None:
            out[c]=cleaned*float(factor)
            unit_status="resolved"
        else:
            out[c]=cleaned
            unit_status="unresolved"
        series_meta[c]={
            "quantity":quantity,
            "original_unit":original_unit,
            "canonical_unit":canonical,
            "conversion_factor":factor,
            "unit_status":unit_status,
        }
    invalid=int(out.timestamp.isna().sum());out=out.dropna(subset=["timestamp"]).sort_values("timestamp")
    return ParsedData(out,"tabular_csv",{"columns":value_cols,"quantity_by_column":quantities,"series_metadata":series_meta,"time_basis":"model clock/unspecified","timestamp_convention":"instantaneous"},{ "invalid_timestamps":invalid,"duplicate_timestamps":int(out.timestamp.duplicated().sum()),"column_audit":audits,"rows":len(out)})
def parse_csv(path):
    p=Path(path);return parse_icm_hyd_csv(p) if is_icm_hyd_csv(p) else parse_tabular_csv(p)
