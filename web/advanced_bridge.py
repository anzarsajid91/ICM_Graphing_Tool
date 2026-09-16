from __future__ import annotations

import json
import pandas as pd

import python_bridge
from icm_workbench.analysis import (
    pair_series,rating_curve_fit,detect_spill_intervals,integrate_series,split_interval_by_month,
    detect_rainfall_events,dry_weather_flow,
)


def rating_sources_result(obs_depth_path,obs_depth_col,obs_flow_path,obs_flow_col,model_depth_path=None,model_depth_col=None,model_flow_path=None,model_flow_col=None,max_gap_seconds=900.0):
    def fit(depth_path,depth_col,flow_path,flow_col):
        depth=python_bridge._load(depth_path).frame; flow=python_bridge._load(flow_path).frame
        paired=pair_series(depth,flow,depth_col,flow_col,max_gap_seconds=float(max_gap_seconds))
        if paired.empty:return {"ok":False,"n":0,"message":"No bounded depth/flow pairs available."}
        result=rating_curve_fit(paired["obs"],paired["sim"]); result["points"]=python_bridge._records(paired.rename(columns={"obs":"depth","sim":"flow"}))
        return result
    observed=fit(obs_depth_path,obs_depth_col,obs_flow_path,obs_flow_col)
    modelled=None
    if model_depth_path and model_flow_path and model_depth_col and model_flow_col:modelled=fit(model_depth_path,model_depth_col,model_flow_path,model_flow_col)
    payload={"observed":observed,"modelled":modelled}
    if observed.get("ok") and modelled and modelled.get("ok"):
        payload["coefficient_difference_percent"]=100.0*(modelled["a"]-observed["a"])/observed["a"] if observed["a"] else None
        payload["exponent_difference"]=modelled["b"]-observed["b"]
    return json.dumps(python_bridge._jsonable(payload),ensure_ascii=False)


def rainfall_event_scaled(path,column,conversion_factor=1.0,minimum_intensity=5.0,minimum_intensity_duration_min=6.0,minimum_depth_mm=5.0,minimum_event_duration_min=60.0,dry_gap_min=15.0,exclusions_json="[]"):
    frame=python_bridge._load(path).frame.copy(); frame[column]=pd.to_numeric(frame[column],errors="coerce")*float(conversion_factor)
    events=detect_rainfall_events(frame,intensity_col=column,minimum_intensity=float(minimum_intensity),minimum_intensity_duration_min=float(minimum_intensity_duration_min),minimum_depth_mm=float(minimum_depth_mm),minimum_event_duration_min=float(minimum_event_duration_min),dry_gap_min=float(dry_gap_min),exclusions=python_bridge._exclusions(exclusions_json))
    return json.dumps(python_bridge._jsonable({"events":events,"count":len(events),"criteria":{"minimum_intensity":float(minimum_intensity),"minimum_intensity_duration_min":float(minimum_intensity_duration_min),"minimum_depth_mm":float(minimum_depth_mm),"minimum_event_duration_min":float(minimum_event_duration_min),"dry_gap_min":float(dry_gap_min),"conversion_factor":float(conversion_factor)}}),ensure_ascii=False)


def dwf_scaled(flow_path,flow_col,rain_path=None,rain_col="rainfall",rain_factor=1.0,dry_day_mm=1.0,baseline_days=28,min_dry_days=5,adp_hours=6.0):
    flow=python_bridge._load(flow_path).frame; rain=None
    if rain_path:
        rain=python_bridge._load(rain_path).frame.copy(); rain[rain_col]=pd.to_numeric(rain[rain_col],errors="coerce")*float(rain_factor)
    result=dry_weather_flow(flow,flow_col,rain,rain_col,dry_day_mm=float(dry_day_mm),baseline_days=int(baseline_days),min_dry_days=int(min_dry_days),adp_hours=float(adp_hours))
    result["rain_conversion_factor"]=float(rain_factor)
    return json.dumps(python_bridge._jsonable(result),ensure_ascii=False)


def monthly_spill_volume_result(level_path,level_col,flow_path,flow_col,threshold,exclusions_json="[]",max_gap_seconds=900.0):
    level=python_bridge._load(level_path).frame; flow=python_bridge._load(flow_path).frame; exclusions=python_bridge._exclusions(exclusions_json)
    physical=detect_spill_intervals(level,level_col,float(threshold),max_gap_seconds=float(max_gap_seconds),exclusions=exclusions)
    monthly={}
    for event in physical.get("events",[]):
        for start,end in split_interval_by_month(event["start"],event["end"]):
            result=integrate_series(flow,flow_col,start,end,semantics="instantaneous",max_gap_seconds=float(max_gap_seconds),exclusions=exclusions,positive_only=True)
            key=(int(pd.Timestamp(start).year),int(pd.Timestamp(start).month)); rec=monthly.setdefault(key,{"year":key[0],"month":key[1],"volume_m3":0.0,"valid_seconds":0.0,"gap_seconds":0.0,"excluded_seconds":0.0})
            rec["volume_m3"]+=float(result["integral"]); rec["valid_seconds"]+=float(result["valid_seconds"]); rec["gap_seconds"]+=float(result["gap_seconds"]); rec["excluded_seconds"]+=float(result["excluded_seconds"])
    return json.dumps(python_bridge._jsonable({"rows":[monthly[k] for k in sorted(monthly)]}),ensure_ascii=False)
