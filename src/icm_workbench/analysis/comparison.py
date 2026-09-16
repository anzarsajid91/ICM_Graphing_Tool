from __future__ import annotations
import pandas as pd
from .alignment import pair_series
from .metrics import calibration_metrics


def compare_scenarios(observed,obs_col,scenarios,*,max_gap_seconds=900.0,start=None,end=None,common_valid_domain=False):
    pairs={name:pair_series(observed,frame,obs_col,col,max_gap_seconds=max_gap_seconds,start=start,end=end) for name,(frame,col) in scenarios.items()}; common=None
    if common_valid_domain and pairs:
        for frame in pairs.values():
            ts=set(pd.to_datetime(frame.timestamp)); common=ts if common is None else common&ts
    rows=[]
    for name,paired in pairs.items():
        if common is not None: paired=paired[pd.to_datetime(paired.timestamp).isin(common)]
        rows.append({"scenario":name,**calibration_metrics(paired),"comparison_domain":"common valid pairs" if common_valid_domain else "scenario valid pairs"})
    return pd.DataFrame(rows)


def preview_time_offset(observed,modelled,obs_col,model_col,offset_minutes,*,max_gap_seconds=900.0):
    before=pair_series(observed,modelled,obs_col,model_col,max_gap_seconds=max_gap_seconds); shifted=modelled.copy(); shifted["timestamp"]=pd.to_datetime(shifted["timestamp"])+pd.to_timedelta(float(offset_minutes),unit="min"); after=pair_series(observed,shifted,obs_col,model_col,max_gap_seconds=max_gap_seconds)
    return {"offset_minutes":float(offset_minutes),"sign_convention":"positive shifts model later in clock time","before":calibration_metrics(before),"after_preview":calibration_metrics(after),"applied":False}
