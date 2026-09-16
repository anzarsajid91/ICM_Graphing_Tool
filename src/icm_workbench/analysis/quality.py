from __future__ import annotations
import pandas as pd

def quality_findings(df: pd.DataFrame,value_columns:list[str]|None=None,*,max_gap_seconds:float=900.0)->pd.DataFrame:
    """Time-localised audit findings; observations, not assertions of sensor fault."""
    columns=["finding_id","kind","column","start","end","count","detail"]
    if df is None or df.empty or "timestamp" not in df.columns:return pd.DataFrame(columns=columns)
    x=df.copy();x["timestamp"]=pd.to_datetime(x["timestamp"],errors="coerce");findings=[];invalid=x["timestamp"].isna()
    if invalid.any():findings.append({"finding_id":"invalid-timestamps","kind":"invalid_timestamp","column":"timestamp","start":None,"end":None,"count":int(invalid.sum()),"detail":"Timestamp values could not be parsed."})
    valid=x.dropna(subset=["timestamp"]).sort_values("timestamp");dup=valid[valid["timestamp"].duplicated(keep=False)]
    if not dup.empty:findings.append({"finding_id":"duplicates","kind":"duplicate_timestamp","column":"timestamp","start":dup.timestamp.min(),"end":dup.timestamp.max(),"count":int(len(dup)),"detail":"Duplicate timestamp rows detected before policy selection."})
    unique=valid.drop_duplicates("timestamp",keep="first")
    if len(unique)>=2:
        gaps=unique.timestamp.diff().dt.total_seconds()
        for idx in gaps[gaps>max_gap_seconds].index:
            pos=unique.index.get_loc(idx);prev=unique.iloc[pos-1].timestamp;cur=unique.loc[idx,"timestamp"];findings.append({"finding_id":f"gap:{prev.isoformat()}:{cur.isoformat()}","kind":"timestamp_gap","column":"timestamp","start":prev,"end":cur,"count":1,"detail":f"Elapsed gap {(cur-prev).total_seconds()/60:.1f} min exceeds configured {max_gap_seconds/60:.1f} min."})
    for col in value_columns or [c for c in x.columns if c!="timestamp"]:
        if col not in valid.columns:continue
        missing=pd.to_numeric(valid[col],errors="coerce").isna().to_numpy();start_i=None
        for i,miss in enumerate(missing.tolist()+[False]):
            if miss and start_i is None:start_i=i
            elif not miss and start_i is not None:
                run=valid.iloc[start_i:i];findings.append({"finding_id":f"missing:{col}:{run.timestamp.iloc[0].isoformat()}","kind":"missing_values","column":col,"start":run.timestamp.iloc[0],"end":run.timestamp.iloc[-1],"count":int(len(run)),"detail":"Missing/non-numeric values retained as unavailable."});start_i=None
    return pd.DataFrame(findings,columns=columns)
