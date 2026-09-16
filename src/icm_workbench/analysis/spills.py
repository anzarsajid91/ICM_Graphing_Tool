from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Iterable
import numpy as np
import pandas as pd
from icm_workbench.analysis.exclusions import normalise_exclusions
from icm_workbench.domain import ExclusionPeriod


@dataclass(frozen=True)
class SpillInterval:
    start: pd.Timestamp
    end: pd.Timestamp
    duration_seconds: float
    def to_dict(self): return {"start":self.start,"end":self.end,"duration_seconds":self.duration_seconds}


def _subtract(start,end,exclusions):
    pieces=[(pd.Timestamp(start),pd.Timestamp(end))]
    for exc in normalise_exclusions(exclusions):
        es,ee=pd.Timestamp(exc.start),pd.Timestamp(exc.end); nxt=[]
        for a,b in pieces:
            if ee<=a or es>=b: nxt.append((a,b)); continue
            if es>a: nxt.append((a,min(es,b)))
            if ee<b: nxt.append((max(ee,a),b))
        pieces=[(a,b) for a,b in nxt if b>a]
    return pieces


def _above(t0,t1,v0,v1,threshold):
    a0,a1=v0>=threshold,v1>=threshold
    if a0 and a1: return t0,t1
    if not a0 and not a1: return None
    if v1==v0: return (t0,t1) if a0 else None
    frac=float(np.clip((threshold-v0)/(v1-v0),0.0,1.0)); crossing=t0+(t1-t0)*frac
    return (t0,crossing) if a0 else (crossing,t1)


def _merge(intervals):
    if not intervals: return []
    intervals=sorted((pd.Timestamp(a),pd.Timestamp(b)) for a,b in intervals if b>a)
    merged=[[intervals[0][0],intervals[0][1]]]
    for a,b in intervals[1:]:
        if a<=merged[-1][1]+pd.Timedelta(microseconds=1): merged[-1][1]=max(merged[-1][1],b)
        else: merged.append([a,b])
    return [SpillInterval(a,b,(b-a).total_seconds()) for a,b in merged]


def detect_spill_intervals(df,value_col,threshold,*,start=None,end=None,max_gap_seconds=900.0,exclusions=()):
    x=df[["timestamp",value_col]].copy(); x["timestamp"]=pd.to_datetime(x.timestamp,errors="coerce")
    x[value_col]=pd.to_numeric(x[value_col],errors="coerce")
    x=x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp",keep="last")
    if x.empty: return {"events":[],"unknown_seconds":0.0,"excluded_seconds":0.0,"analysis_seconds":0.0,"coverage_fraction":0.0,"status":"unavailable"}
    s=pd.Timestamp(start) if start is not None else pd.Timestamp(x.timestamp.min()); e=pd.Timestamp(end) if end is not None else pd.Timestamp(x.timestamp.max())
    if e<=s: raise ValueError("end must be after start")
    requested=(e-s).total_seconds(); ex=normalise_exclusions(exclusions); valid=[]; spill=[]
    for i in range(len(x)-1):
        t0,t1=pd.Timestamp(x.iloc[i].timestamp),pd.Timestamp(x.iloc[i+1].timestamp); a,b=max(t0,s),min(t1,e)
        if b<=a: continue
        v0,v1=x.iloc[i][value_col],x.iloc[i+1][value_col]; dt=(t1-t0).total_seconds()
        if dt<=0 or dt>max_gap_seconds or pd.isna(v0) or pd.isna(v1): continue
        valid.extend(_subtract(a,b,ex)); above=_above(t0,t1,float(v0),float(v1),float(threshold))
        if above:
            aa,bb=max(above[0],a),min(above[1],b)
            if bb>aa: spill.extend(_subtract(aa,bb,ex))
    events=_merge(spill); valid_seconds=sum((b-a).total_seconds() for a,b in valid)
    retained=sum((b-a).total_seconds() for a,b in _subtract(s,e,ex)); excluded=requested-retained
    assessable=max(0.0,requested-excluded); unknown=max(0.0,assessable-valid_seconds)
    coverage=min(1.0,valid_seconds/assessable) if assessable>0 else 0.0
    return {"events":[ev.to_dict() for ev in events],"unknown_seconds":float(unknown),"excluded_seconds":float(excluded),
            "analysis_seconds":float(requested),"assessable_seconds":float(assessable),"coverage_fraction":float(coverage),
            "status":"complete" if unknown<=1e-6 else "partial","threshold":float(threshold),"method":"instantaneous-linear-threshold-v1"}


def _ceil_positive(x): return int(math.ceil(float(x))) if x>0 else 0


def apply_12_24_counting(events):
    rows=[]; prev_E=None; prev_F=0; prev_G=None
    for idx,event in enumerate(sorted(events,key=lambda e:pd.Timestamp(e["start"]))):
        A,B=pd.Timestamp(event["start"]),pd.Timestamp(event["end"]); C=max(0.0,(B-A).total_seconds()/60.0)
        D=A+pd.Timedelta(hours=12) if C<720 else A+pd.Timedelta(hours=12)+pd.Timedelta(days=_ceil_positive((C-720)/1440))
        if idx==0: E,F,G,J=D,1,A.year,(0 if C==0 else (1 if C<720 else _ceil_positive(((C-720)/1440)+1)))
        else:
            if (A-prev_E)>pd.Timedelta(days=1): E=D
            elif B<prev_E: E=prev_E
            elif B<(prev_E+pd.Timedelta(days=1)): E=prev_E+pd.Timedelta(days=1)
            else: E=prev_E+pd.Timedelta(days=_ceil_positive((B-prev_E).total_seconds()/86400))
            F=prev_F+1 if A>(prev_E+pd.Timedelta(days=1)) else prev_F; G=A.year if (F==prev_F or A.year!=prev_G) else prev_G
            if F!=prev_F: J=1 if C<720 else _ceil_positive(((C-720)/1440)+1)
            else: J=0 if E==prev_E else (1 if B==prev_E else _ceil_positive((B-prev_E).total_seconds()/86400))
        rows.append({"spill_start":A,"spill_stop":B,"duration_min":C,"block_end_this":E,"spill_event":F,"year_start":int(G),"month_start":int(A.month),"spills":int(J)})
        prev_E,prev_F,prev_G=E,F,G
    return pd.DataFrame(rows)


def monthly_spill_durations(events):
    totals={}
    for event in events:
        start,end=pd.Timestamp(event["start"]),pd.Timestamp(event["end"]); cursor=start
        while cursor<end:
            stop=min(end,(cursor.to_period("M")+1).start_time); key=(cursor.year,cursor.month)
            totals[key]=totals.get(key,0.0)+(stop-cursor).total_seconds()/3600.0; cursor=stop
    return pd.DataFrame([{"year":y,"month":m,"duration_hours":h} for (y,m),h in sorted(totals.items())],columns=["year","month","duration_hours"])


def monthly_spill_counts(counting):
    if counting is None or counting.empty: return pd.DataFrame(columns=["year","month","spill_count"])
    return counting.groupby(["year_start","month_start"],as_index=False)["spills"].sum().rename(columns={"year_start":"year","month_start":"month","spills":"spill_count"})


def spill_assessment(df,value_col,threshold,*,start=None,end=None,max_gap_seconds=900.0,exclusions=()):
    physical=detect_spill_intervals(df,value_col,threshold,start=start,end=end,max_gap_seconds=max_gap_seconds,exclusions=exclusions)
    counting=apply_12_24_counting(physical["events"]); durations=monthly_spill_durations(physical["events"]); counts=monthly_spill_counts(counting)
    return {**physical,"counting_windows":counting,"monthly_counts":counts,"monthly_durations":durations,
            "total_spill_count":int(counting["spills"].sum()) if not counting.empty else 0,
            "total_spill_duration_hours":float(sum(e["duration_seconds"] for e in physical["events"])/3600.0),
            "count_status":"definitive" if physical["status"]=="complete" else "partial/unknown-gap",
            "exclusion_audit":[e.to_dict() for e in normalise_exclusions(exclusions)]}
