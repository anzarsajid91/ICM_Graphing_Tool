from __future__ import annotations

import json
import pandas as pd

import python_bridge
from icm_workbench.analysis import pair_series,rating_curve_fit,detect_spill_intervals,integrate_series,split_interval_by_month


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
