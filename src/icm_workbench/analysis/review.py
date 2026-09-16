from __future__ import annotations

import numpy as np
import pandas as pd


def rating_curve_fit(depth, flow):
    """Fit Q=a*H**b using positive finite depth/flow pairs in log10 space."""
    d=pd.to_numeric(depth,errors="coerce"); q=pd.to_numeric(flow,errors="coerce")
    mask=d.notna()&q.notna()&(d>0)&(q>0); d=d[mask].astype(float); q=q[mask].astype(float)
    if len(d)<5:return {"ok":False,"n":int(len(d)),"message":"At least 5 positive depth-flow pairs are required."}
    x=np.log10(d.to_numpy()); y=np.log10(q.to_numpy()); b,loga=np.polyfit(x,y,1); pred=loga+b*x
    ss_res=float(np.sum((y-pred)**2)); ss_tot=float(np.sum((y-y.mean())**2)); r2=float(1-ss_res/ss_tot) if ss_tot>0 else np.nan
    return {"ok":True,"n":int(len(d)),"a":float(10**loga),"b":float(b),"r2":r2,"depth_min":float(d.min()),"depth_max":float(d.max())}


def weekly_data_assessment(df,max_gap_seconds=900.0):
    """Time-localised weekly completeness/range/gap findings for each numeric channel."""
    if df is None or getattr(df,"empty",True) or "timestamp" not in df.columns:return pd.DataFrame()
    x=df.copy(); x["timestamp"]=pd.to_datetime(x["timestamp"],errors="coerce"); x=x.dropna(subset=["timestamp"]).sort_values("timestamp")
    channels=[c for c in x.columns if c!="timestamp" and pd.to_numeric(x[c],errors="coerce").notna().any()]
    if not channels:return pd.DataFrame()
    dt=x.timestamp.diff().dt.total_seconds(); positive=dt[dt>0]; median=float(positive.median()) if len(positive) else np.nan
    rows=[]
    for week,g in x.groupby(pd.Grouper(key="timestamp",freq="W-SUN",label="right",closed="right")):
        if g.empty:continue
        for col in channels:
            vals=pd.to_numeric(g[col],errors="coerce"); valid=vals.notna(); gaps=pd.to_datetime(g.timestamp).diff().dt.total_seconds(); gap_count=int((gaps>float(max_gap_seconds)).sum())
            if np.isfinite(median) and median>0 and len(g)>1:
                span=max((g.timestamp.max()-g.timestamp.min()).total_seconds(),median); expected=max(1,int(round(span/median))+1); coverage=min(100.0,100.0*int(valid.sum())/expected)
            else: coverage=100.0*float(valid.mean()) if len(valid) else 0.0
            notes=[]
            if coverage<60:notes.append("low coverage")
            elif coverage<90:notes.append("partial coverage")
            if gap_count:notes.append(f"{gap_count} gap(s) > {float(max_gap_seconds)/60:g} min")
            rag="Red" if coverage<60 else ("Amber" if coverage<90 or gap_count else "Green")
            rows.append({"week_ending":pd.Timestamp(week),"channel":str(col),"rows":int(len(g)),"valid_values":int(valid.sum()),"coverage_percent":float(coverage),"minimum":float(vals.min()) if valid.any() else np.nan,"maximum":float(vals.max()) if valid.any() else np.nan,"large_gap_count":gap_count,"rag":rag,"comment":"; ".join(notes) if notes else "No major weekly completeness issue detected."})
    return pd.DataFrame(rows)


def dry_weather_flow(flow_df,flow_col,rainfall_df=None,rain_col="rainfall",dry_day_mm=1.0,baseline_days=28,min_dry_days=5,adp_hours=6.0):
    """Screening DWF baseline: dry day <= threshold, recent baseline, daily minimum ADP rolling mean."""
    if flow_df is None or getattr(flow_df,"empty",True) or flow_col not in flow_df.columns:return {"available":"No","reason":"Observed flow unavailable."}
    f=flow_df[["timestamp",flow_col]].copy(); f["timestamp"]=pd.to_datetime(f.timestamp,errors="coerce"); f[flow_col]=pd.to_numeric(f[flow_col],errors="coerce"); f=f.dropna(subset=["timestamp",flow_col]).sort_values("timestamp")
    if f.empty:return {"available":"No","reason":"No valid observed flow."}
    d=f.timestamp.diff().dt.total_seconds().div(60); d=d[d>0]; step=float(d.median()) if len(d) else np.nan
    f["day"]=f.timestamp.dt.floor("D")
    if rainfall_df is None or getattr(rainfall_df,"empty",True) or rain_col not in rainfall_df.columns:
        return {"available":"Partial","reason":"Rainfall unavailable; all flow records used.","average_dwf":float(f[flow_col].mean()),"dry_days_used":None}
    r=rainfall_df[["timestamp",rain_col]].copy(); r["timestamp"]=pd.to_datetime(r.timestamp,errors="coerce"); r[rain_col]=pd.to_numeric(r[rain_col],errors="coerce").fillna(0.0); r=r.dropna(subset=["timestamp"]).sort_values("timestamp")
    rd=r.timestamp.diff().dt.total_seconds().div(3600); rd=rd[rd>0]; rain_step_h=float(rd.median()) if len(rd) else 0.0
    # Rain parser may represent intensity or depth; this is explicitly a screening approximation matching the legacy workbench convention.
    daily=r.assign(day=r.timestamp.dt.floor("D")).groupby("day")[rain_col].sum()*(rain_step_h if rain_step_h>0 else 1.0)
    dry=set(daily[daily<=float(dry_day_mm)].index); cutoff=f.day.max()-pd.Timedelta(days=int(baseline_days)); chosen=sorted(day for day in dry if day>=cutoff and day<=f.day.max())
    use=f[f.day.isin(chosen)].copy(); daily_min=[]
    if np.isfinite(step) and step>0:
        window=max(1,int(round(float(adp_hours)*60.0/step)))
        for _,g in use.groupby("day"):
            s=pd.to_numeric(g[flow_col],errors="coerce").rolling(window=window,min_periods=max(1,window//2)).mean()
            if s.notna().any():daily_min.append(float(s.min()))
    value=float(np.nanmean(daily_min)) if daily_min else (float(use[flow_col].mean()) if not use.empty else np.nan)
    return {"available":"Yes" if len(chosen)>=int(min_dry_days) else "Low confidence","average_dwf":value if np.isfinite(value) else None,"dry_days_used":int(len(chosen)),"dry_day_threshold_mm":float(dry_day_mm),"baseline_days":int(baseline_days),"minimum_dry_days":int(min_dry_days),"adp_hours":float(adp_hours)}


def event_response_summary(observed,modelled,events,obs_col,model_col,baseline_hours=3.0,post_hours=6.0):
    """Per-rainfall-event peak uplift and timing comparison without assigning a subjective pass/fail score."""
    rows=[]
    if not events:return rows
    for event in events:
        start=pd.Timestamp(event["start"]); end=pd.Timestamp(event["end"]); b0=start-pd.Timedelta(hours=float(baseline_hours)); r1=end+pd.Timedelta(hours=float(post_hours))
        def stats(df,col):
            x=df[["timestamp",col]].copy(); x["timestamp"]=pd.to_datetime(x.timestamp,errors="coerce"); x[col]=pd.to_numeric(x[col],errors="coerce"); x=x.dropna().sort_values("timestamp")
            base=x[(x.timestamp>=b0)&(x.timestamp<start)][col]; resp=x[(x.timestamp>=start)&(x.timestamp<=r1)]
            if resp.empty:return None
            baseline=float(base.median()) if not base.empty else float(resp[col].quantile(.10)); idx=resp[col].idxmax(); peak=float(resp.loc[idx,col]); return {"baseline":baseline,"peak":peak,"uplift":peak-baseline,"peak_time":pd.Timestamp(resp.loc[idx,"timestamp"])}
        o=stats(observed,obs_col); m=stats(modelled,model_col)
        row={"event":event.get("event"),"rain_start":start,"rain_end":end,"rain_depth_mm":event.get("total_depth_mm"),"observed_baseline":o["baseline"] if o else np.nan,"observed_uplift":o["uplift"] if o else np.nan,"modelled_uplift":m["uplift"] if m else np.nan,"uplift_error_percent":np.nan,"peak_lag_minutes":np.nan}
        if o and m and abs(o["uplift"])>1e-12:row["uplift_error_percent"]=float((m["uplift"]-o["uplift"])/o["uplift"]*100.0)
        if o and m:row["peak_lag_minutes"]=float((m["peak_time"]-o["peak_time"]).total_seconds()/60.0)
        rows.append(row)
    return rows
