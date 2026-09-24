from __future__ import annotations
import csv
import io
from pathlib import Path
import pandas as pd
from .common import ParsedData,clean_numeric,detect_time_column,infer_quantity,canonical_unit,detect_unit

def _read_text(path):
    """Decode common engineering CSV exports without treating encoding as format semantics."""
    data=Path(path).read_bytes()
    if data.startswith((b"\xff\xfe",b"\xfe\xff")):
        return data.decode("utf-16"),"utf-16"
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig"),"utf-8-sig"
    # Some logger/Excel exports are UTF-16 without a BOM. A strong NUL-byte
    # pattern is safer than trying UTF-16 speculatively on arbitrary 8-bit CSV.
    sample=data[:4096]
    if sample and sample.count(b"\x00")>=max(2,len(sample)//8):
        even=sum(1 for i in range(0,len(sample),2) if sample[i]==0)
        odd=sum(1 for i in range(1,len(sample),2) if sample[i]==0)
        encoding="utf-16be" if even>odd else "utf-16le"
        return data.decode(encoding),encoding
    try:
        return data.decode("utf-8"),"utf-8"
    except UnicodeDecodeError:
        return data.decode("cp1252"),"cp1252"

def _head(path,lines=100):
    text,_=_read_text(path)
    return "\n".join(text.splitlines()[:lines])
def is_icm_hyd_csv(path):
    text=_head(path).lower();return "p_datetime" in text and ("type=hyd" in text or "u_level" in text or "u_flow" in text or "u_velocity" in text)
def _parse_timestamps(values):
    """Parse UK-style timestamps without corrupting explicit year-first/ISO dates.

    Pandas dayfirst=True can reinterpret YYYY-MM-DD values (for example 2026-02-01
    as 2026-01-02) and can invalidate vectorised dates after day 12. Resolve each
    group by its explicit lexical shape instead.
    """
    raw=pd.Series(values,dtype="string").str.strip()
    year_first=raw.str.match(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T\s]|$)",na=False)
    out=pd.Series(pd.NaT,index=raw.index,dtype="datetime64[ns]")
    if year_first.any():
        out.loc[year_first]=pd.to_datetime(
            raw.loc[year_first],errors="coerce",format="mixed",yearfirst=True,dayfirst=False
        ).to_numpy()
    other=~year_first
    if other.any():
        out.loc[other]=pd.to_datetime(
            raw.loc[other],errors="coerce",format="mixed",dayfirst=True
        ).to_numpy()
    return out


def _quantity(path):
    text=_head(path).upper()
    if "U_VELOCITY" in text:return "velocity","m/s"
    if "U_FLOW" in text:return "flow","m³/s"
    if "U_LEVEL" in text or "M AD" in text or "MAOD" in text:return "level","m"
    return "depth","m"

def _vertical_reference(path, quantity):
    if quantity != "level":
        return None
    text=_head(path).upper()
    if "M AOD" in text or "MAOD" in text:
        return "AOD"
    if "M AD" in text:
        return "AD"
    return None

def parse_icm_hyd_csv(path):
    text,source_encoding=_read_text(path); lines=text.splitlines(); start=next((i+1 for i,line in enumerate(lines) if line.strip().lower().startswith("p_datetime")),None)
    if start is None:raise ValueError("P_DATETIME section not found")
    rows=[]; malformed=0
    for line in lines[start:]:
        if not line.strip():continue
        try:parts=next(csv.reader([line]))
        except Exception:malformed+=1;continue
        if len(parts)<2:malformed+=1;continue
        rows.append((parts[0].strip(),parts[1].strip()))
    if not rows:raise ValueError("No P_DATETIME/value rows found")
    quantity,unit=_quantity(path); frame=pd.DataFrame(rows,columns=["raw_timestamp","raw_value"])
    frame["timestamp"]=_parse_timestamps(frame.pop("raw_timestamp"))
    invalid=int(frame.timestamp.isna().sum());malformed+=invalid;frame=frame.dropna(subset=["timestamp"])
    if frame.empty:raise ValueError("No valid P_DATETIME/value rows found")
    values,audit=clean_numeric(frame.pop("raw_value")); frame["value"]=values; frame=frame.sort_values("timestamp")
    reference=_vertical_reference(path,quantity)
    metadata={"quantity":quantity,"original_unit":unit,"canonical_unit":unit,"unit_status":"resolved","conversion_factor":1.0,"source_encoding":source_encoding,"time_basis":"model clock/unspecified","timestamp_convention":"instantaneous"}
    if reference is not None:
        metadata["vertical_reference"]=reference
        metadata["source_unit_label"]=f"{unit} {reference}"
    return ParsedData(frame,"icm_hyd_p_datetime_csv",metadata,{**audit,"malformed_rows":malformed,"duplicate_timestamps":int(frame.timestamp.duplicated().sum()),"rows":len(frame)})
def parse_tabular_csv(path):
    try:
        text,source_encoding=_read_text(path)
        df=pd.read_csv(io.StringIO(text),sep=None,engine="python")
    except Exception as exc:raise ValueError(f"Could not parse tabular CSV: {exc}") from exc
    df.columns=[str(c).strip() for c in df.columns]; tc=detect_time_column(df)
    if not tc:raise ValueError(f"Could not detect a timestamp column. Columns={list(df.columns)}")
    timestamps=_parse_timestamps(df[tc]); value_cols=[c for c in df.columns if c!=tc and pd.to_numeric(df[c],errors="coerce").notna().any()]
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
    return ParsedData(out,"tabular_csv",{"columns":value_cols,"quantity_by_column":quantities,"series_metadata":series_meta,"source_encoding":source_encoding,"time_basis":"model clock/unspecified","timestamp_convention":"instantaneous"},{ "invalid_timestamps":invalid,"duplicate_timestamps":int(out.timestamp.duplicated().sum()),"column_audit":audits,"rows":len(out)})
def parse_csv(path):
    p=Path(path);return parse_icm_hyd_csv(p) if is_icm_hyd_csv(p) else parse_tabular_csv(p)
