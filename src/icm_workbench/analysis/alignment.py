from __future__ import annotations
import numpy as np
import pandas as pd


def _valid_segments(df,value_col,max_gap_seconds):
    x=df[["timestamp",value_col]].copy(); x["timestamp"]=pd.to_datetime(x["timestamp"],errors="coerce"); x[value_col]=pd.to_numeric(x[value_col],errors="coerce")
    x=x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp",keep="last")
    if x.empty:return []
    invalid=x[value_col].isna(); dt=x["timestamp"].diff().dt.total_seconds(); breaks=invalid|invalid.shift(fill_value=False)|dt.gt(float(max_gap_seconds)); group=breaks.cumsum()
    return [g.dropna(subset=[value_col]).copy() for _,g in x.groupby(group) if not g.dropna(subset=[value_col]).empty]


def interpolate_without_bridging(source,target_times,value_col,max_gap_seconds):
    result=pd.Series(index=target_times,dtype=float)
    for segment in _valid_segments(source,value_col,max_gap_seconds):
        if len(segment)==1:
            t=pd.Timestamp(segment.iloc[0]["timestamp"])
            if t in result.index: result.loc[t]=float(segment.iloc[0][value_col])
            continue
        s0,s1=segment["timestamp"].iloc[0],segment["timestamp"].iloc[-1]; wanted=target_times[(target_times>=s0)&(target_times<=s1)]
        if len(wanted)==0:continue
        base=segment.set_index("timestamp")[[value_col]]; union=base.index.union(wanted).sort_values(); vals=base.reindex(union).interpolate(method="time",limit_area="inside").reindex(wanted)[value_col]; result.loc[wanted]=vals.to_numpy()
    return result


def pair_series(observed,modelled,obs_col,model_col,max_gap_seconds=900.0,start=None,end=None):
    obs=observed[["timestamp",obs_col]].copy(); mod=modelled[["timestamp",model_col]].copy()
    for d,c in ((obs,obs_col),(mod,model_col)):
        d["timestamp"]=pd.to_datetime(d["timestamp"],errors="coerce"); d[c]=pd.to_numeric(d[c],errors="coerce"); d.dropna(subset=["timestamp"],inplace=True); d.sort_values("timestamp",inplace=True); d.drop_duplicates("timestamp",keep="last",inplace=True)
    if start is not None: obs=obs[obs.timestamp>=pd.Timestamp(start)]; mod=mod[mod.timestamp>=pd.Timestamp(start)]
    if end is not None: obs=obs[obs.timestamp<=pd.Timestamp(end)]; mod=mod[mod.timestamp<=pd.Timestamp(end)]
    obs=obs.dropna(subset=[obs_col])
    if obs.empty or mod.empty:return pd.DataFrame(columns=["timestamp","obs","sim"])
    a=max(obs.timestamp.min(),mod.timestamp.min()); b=min(obs.timestamp.max(),mod.timestamp.max()); obs=obs[(obs.timestamp>=a)&(obs.timestamp<=b)]; target=pd.DatetimeIndex(obs.timestamp); sim=interpolate_without_bridging(mod,target,model_col,max_gap_seconds)
    return pd.DataFrame({"timestamp":target,"obs":obs[obs_col].to_numpy(),"sim":sim.to_numpy()}).dropna(subset=["obs","sim"])


def time_coverage(df,value_col,start,end,max_gap_seconds=900.0):
    s,e=pd.Timestamp(start),pd.Timestamp(end); requested=max((e-s).total_seconds(),0.0)
    if requested<=0:return {"requested_seconds":0.0,"valid_seconds":0.0,"coverage_fraction":np.nan}
    x=df[["timestamp",value_col]].copy(); x["timestamp"]=pd.to_datetime(x.timestamp,errors="coerce"); x[value_col]=pd.to_numeric(x[value_col],errors="coerce"); x=x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp",keep="last"); x=x[(x.timestamp>=s)&(x.timestamp<=e)]
    valid=sum((seg.timestamp.iloc[-1]-seg.timestamp.iloc[0]).total_seconds() for seg in _valid_segments(x,value_col,max_gap_seconds) if len(seg)>=2)
    return {"requested_seconds":requested,"valid_seconds":valid,"coverage_fraction":min(valid/requested,1.0)}
