from __future__ import annotations
import numpy as np
import pandas as pd
from icm_workbench.analysis.exclusions import apply_exclusions


def detect_rainfall_events(rain,*,intensity_col="rainfall",minimum_intensity=5.0,minimum_intensity_duration_min=6.0,minimum_depth_mm=5.0,minimum_event_duration_min=60.0,dry_gap_min=15.0,exclusions=()):
    if rain is None or rain.empty:return []
    r,_=apply_exclusions(rain,exclusions,[intensity_col]); r=r[["timestamp",intensity_col]].copy(); r["timestamp"]=pd.to_datetime(r.timestamp,errors="coerce"); r[intensity_col]=pd.to_numeric(r[intensity_col],errors="coerce"); r=r.dropna(subset=["timestamp"]).sort_values("timestamp"); deltas=r.timestamp.diff().dropna().dt.total_seconds().div(60); dt=float(deltas[deltas>0].median()) if (deltas>0).any() else 2.0
    events=[]; vals=[]; times=[]; dry=0.0; active=False
    def close():
        if not vals or not times:return
        arr=np.asarray(vals,dtype=float); valid=np.isfinite(arr)
        if not valid.any():return
        duration=len(arr)*dt; depth=float(np.nansum(np.maximum(arr,0.0))*dt/60.0); peak=float(np.nanmax(arr)); cur=best=0.0
        for v in arr:
            if np.isfinite(v) and v>=minimum_intensity: cur+=dt; best=max(best,cur)
            else: cur=0.0
        if duration>=minimum_event_duration_min and depth>=minimum_depth_mm and best>=minimum_intensity_duration_min:
            events.append({"event":len(events)+1,"start":times[0],"end":times[-1],"duration_min":duration,"total_depth_mm":depth,"peak_intensity":peak,"intensity_streak_min":best,"criteria":{"min_intensity":minimum_intensity,"min_intensity_duration_min":minimum_intensity_duration_min,"min_depth_mm":minimum_depth_mm,"min_event_duration_min":minimum_event_duration_min,"dry_gap_min":dry_gap_min}})
    for t,raw in zip(r.timestamp,r[intensity_col]):
        if pd.isna(raw):
            if active: close(); vals=[]; times=[]; active=False; dry=0.0
            continue
        v=float(raw)
        if not active and v>0: active=True; vals=[v]; times=[pd.Timestamp(t)]; dry=0.0
        elif active:
            vals.append(v); times.append(pd.Timestamp(t)); dry=dry+dt if v<=0 else 0.0
            if dry>=dry_gap_min:
                n=max(1,int(round(dry/dt))); vals,times=vals[:-n],times[:-n]; close(); vals=[]; times=[]; active=False; dry=0.0
    if active: close()
    return events
