from __future__ import annotations

import json
import numpy as np
import pandas as pd

import python_bridge
from icm_workbench.analysis import (
    pair_series,rating_curve_fit,detect_spill_intervals,integrate_series,split_interval_by_month,
    detect_rainfall_events,dry_weather_flow,rainfall_accumulation,validity_summary,multi_gauge_rainfall_assessment,
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
    parsed=python_bridge._load(path)
    frame=parsed.frame.copy()
    frame[column]=pd.to_numeric(frame[column],errors="coerce")*float(conversion_factor)
    metadata=getattr(parsed,"metadata",{}) or {}
    interval=metadata.get("interval_min")
    events=detect_rainfall_events(
        frame,
        intensity_col=column,
        minimum_intensity=float(minimum_intensity),
        minimum_intensity_duration_min=float(minimum_intensity_duration_min),
        minimum_depth_mm=float(minimum_depth_mm),
        minimum_event_duration_min=float(minimum_event_duration_min),
        dry_gap_min=float(dry_gap_min),
        exclusions=python_bridge._exclusions(exclusions_json),
        semantics="intensity",
        declared_interval_minutes=float(interval) if interval else None,
        max_gap_seconds=python_bridge._rain_support_gap_seconds(parsed),
    )
    return json.dumps(python_bridge._jsonable({
        "events":events,
        "count":len(events),
        "criteria":{
            "minimum_intensity":float(minimum_intensity),
            "minimum_intensity_duration_min":float(minimum_intensity_duration_min),
            "minimum_depth_mm":float(minimum_depth_mm),
            "minimum_event_duration_min":float(minimum_event_duration_min),
            "dry_gap_min":float(dry_gap_min),
            "conversion_factor":float(conversion_factor),
            "rainfall_semantics":"intensity",
            "declared_interval_min":float(interval) if interval else None,
            "support_method":"actual elapsed intervals; final support only from declared interval",
        }
    }),ensure_ascii=False)

def cumulative_rainfall_series(path,column="rainfall",conversion_factor=1.0,max_points=5000):
    """Return support-aware cumulative rainfall depth from the native series."""
    parsed=python_bridge._load(path)
    frame=parsed.frame.copy()
    if column not in frame.columns:
        value_cols=[c for c in frame.columns if c!="timestamp"]
        if not value_cols:raise ValueError("Rainfall source contains no value series")
        column=value_cols[0]
    x=frame[["timestamp",column]].copy()
    x["timestamp"]=pd.to_datetime(x["timestamp"],errors="coerce")
    x[column]=pd.to_numeric(x[column],errors="coerce")*float(conversion_factor)
    x=x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp",keep="last").reset_index(drop=True)
    if x.empty:
        return json.dumps({"column":str(column),"timestamp":[],"value":[],"raw_count":0,"display_count":0,"missing_count":0,"final_total_mm":None,"complete":False,"calculation_status":"unavailable","conversion_factor":float(conversion_factor)},ensure_ascii=False)

    metadata=getattr(parsed,"metadata",{}) or {}
    interval=metadata.get("interval_min")
    result=rainfall_accumulation(
        x,
        column,
        semantics="intensity",
        declared_interval_minutes=float(interval) if interval else None,
    )
    seg=result["segments"]
    running=0.0
    plot_t=[]
    plot_v=[]
    if not seg.empty:
        plot_t.append(pd.Timestamp(seg.iloc[0]["start"]).isoformat())
        plot_v.append(0.0)
        for row in seg.itertuples(index=False):
            if bool(row.valid):
                running+=float(row.depth_mm)
                plot_t.append(pd.Timestamp(row.end).isoformat())
                plot_v.append(float(running))
            else:
                plot_t.append(pd.Timestamp(row.start).isoformat())
                plot_v.append(None)
                plot_t.append(pd.Timestamp(row.end).isoformat())
                plot_v.append(None)

    values=np.asarray([np.nan if v is None else float(v) for v in plot_v],dtype=float)
    idx=python_bridge._display_indices(values,max(2,int(max_points))) if len(values) else np.asarray([],dtype=int)
    timestamps=[plot_t[int(i)] for i in idx]
    display_values=[None if not np.isfinite(values[int(i)]) else float(values[int(i)]) for i in idx]
    missing_count=int(pd.to_numeric(x[column],errors="coerce").isna().sum())
    complete=result["status"]=="complete"
    payload={
        "column":str(column),
        "timestamp":timestamps,
        "value":display_values,
        "raw_count":int(len(x)),
        "display_count":int(len(idx)),
        "missing_count":missing_count,
        "negative_count":int((pd.to_numeric(x[column],errors="coerce")<0).sum()),
        "final_total_mm":result["total_depth_mm"],
        "complete":complete,
        "calculation_status":result["status"],
        "coverage_fraction":result["coverage_fraction"],
        "valid_seconds":result["valid_seconds"],
        "unknown_seconds":result["unknown_seconds"],
        "missing_seconds":result.get("missing_seconds",0.0),
        "validity":result.get("validity"),
        "conversion_factor":float(conversion_factor),
        "interval_min":float(interval) if interval else None,
        "start":pd.Timestamp(x["timestamp"].iloc[0]).isoformat(),
        "end":pd.Timestamp(x["timestamp"].iloc[-1]).isoformat(),
        "integration_method":"actual-support interval-average intensity × elapsed time; declared interval used only for final support",
    }
    return json.dumps(python_bridge._jsonable(payload),ensure_ascii=False)


def multi_gauge_rainfall_result(sources_json,conversion_factor=1.0):
    sources=json.loads(sources_json) if isinstance(sources_json,str) else list(sources_json or [])
    gauges={}
    for source in sources:
        parsed=python_bridge._load(source["path"]);frame=parsed.frame.copy();column=source.get("column")
        if column not in frame.columns:
            columns=[c for c in frame.columns if c!="timestamp"]
            if not columns:continue
            column=columns[0]
        frame[column]=pd.to_numeric(frame[column],errors="coerce")*float(conversion_factor)
        interval=(getattr(parsed,"metadata",{}) or {}).get("interval_min")
        gauges[str(source.get("name") or source["path"])]=(frame,column,float(interval) if interval else None)
    result=multi_gauge_rainfall_assessment(gauges);result["conversion_factor"]=float(conversion_factor)
    return json.dumps(python_bridge._jsonable(result),ensure_ascii=False)

def dwf_scaled(flow_path,flow_col,rain_path=None,rain_col="rainfall",rain_factor=1.0,dry_day_mm=1.0,baseline_days=28,min_dry_days=5,adp_hours=6.0):
    flow=python_bridge._load(flow_path).frame
    rain=None
    rain_parsed=None
    if rain_path:
        rain_parsed=python_bridge._load(rain_path)
        rain=rain_parsed.frame.copy()
        rain[rain_col]=pd.to_numeric(rain[rain_col],errors="coerce")*float(rain_factor)
    metadata=getattr(rain_parsed,"metadata",{}) or {} if rain_parsed is not None else {}
    interval=metadata.get("interval_min") if rain_parsed is not None else None
    result=dry_weather_flow(
        flow,flow_col,rain,rain_col,
        dry_day_mm=float(dry_day_mm),
        baseline_days=int(baseline_days),
        min_dry_days=int(min_dry_days),
        adp_hours=float(adp_hours),
        rain_semantics="intensity",
        rain_interval_min=float(interval) if interval else None,
        rain_max_gap_seconds=python_bridge._rain_support_gap_seconds(rain_parsed) if rain_parsed is not None else None,
    )
    result["rain_conversion_factor"]=float(rain_factor)
    return json.dumps(python_bridge._jsonable(result),ensure_ascii=False)

def monthly_spill_volume_result(level_path,level_col,flow_path,flow_col,threshold,exclusions_json="[]",max_gap_seconds=900.0,start=None,end=None,level_unit_override=None,flow_unit_override=None,**_ignored):
    level,level_contract=python_bridge._scaled_dimensional_frame(
        level_path,level_col,
        unit_override=level_unit_override,
        allowed_quantities=("level","depth"),
        required_canonical_unit="m",
    )
    flow,flow_contract=python_bridge._scaled_dimensional_frame(
        flow_path,flow_col,
        unit_override=flow_unit_override,
        allowed_quantities=("flow",),
        required_canonical_unit="m³/s",
    )
    exclusions=python_bridge._exclusions(exclusions_json)
    threshold_m=float(threshold)*float(level_contract["scale_to_canonical"])
    physical=detect_spill_intervals(
        level,level_col,threshold_m,
        start=python_bridge._model_clock_timestamp(start),
        end=python_bridge._model_clock_timestamp(end),
        max_gap_seconds=float(max_gap_seconds),
        exclusions=exclusions,
    )
    monthly={}
    for event in physical.get("events",[]):
        for part_start,part_end in split_interval_by_month(event["start"],event["end"]):
            result=integrate_series(flow,flow_col,part_start,part_end,semantics="instantaneous",max_gap_seconds=float(max_gap_seconds),exclusions=exclusions,positive_only=True)
            requested=float(result.get("requested_seconds",(pd.Timestamp(part_end)-pd.Timestamp(part_start)).total_seconds()))
            uncovered=float(result.get("uncovered_seconds",0.0))
            key=(int(pd.Timestamp(part_start).year),int(pd.Timestamp(part_start).month))
            rec=monthly.setdefault(key,{
                "year":key[0],"month":key[1],"volume_m3":0.0,
                "requested_seconds":0.0,"valid_seconds":0.0,"gap_seconds":0.0,
                "excluded_seconds":0.0,"uncovered_seconds":0.0,
            })
            rec["volume_m3"]+=float(result["integral"])
            rec["requested_seconds"]+=requested
            rec["valid_seconds"]+=float(result["valid_seconds"])
            rec["gap_seconds"]+=float(result["gap_seconds"])
            rec["excluded_seconds"]+=float(result["excluded_seconds"])
            rec["uncovered_seconds"]+=uncovered
    rows=[]
    for key in sorted(monthly):
        rec=monthly[key]
        complete=(
            rec["requested_seconds"]>0
            and rec["gap_seconds"]<=1e-9
            and rec["excluded_seconds"]<=1e-9
            and rec["uncovered_seconds"]<=1e-9
            and rec["valid_seconds"]>=rec["requested_seconds"]-1e-9
            and physical.get("status")=="complete"
        )
        validity=validity_summary(
            requested_seconds=rec["requested_seconds"],
            valid_seconds=rec["valid_seconds"],
            excluded_seconds=rec["excluded_seconds"],
            unknown_seconds=rec["gap_seconds"],
            uncovered_seconds=rec["uncovered_seconds"],
        )
        rec["status"]="complete" if complete else validity["calculation_status"]
        rec["coverage_fraction"]=validity["coverage_fraction"]
        rec["validity"]=validity
        if not complete:
            rec["volume_m3_partial"]=rec["volume_m3"]
            rec["volume_m3"]=None
        rows.append(rec)
    return json.dumps(python_bridge._jsonable({
        "rows":rows,
        "calculation_status":"complete" if physical.get("status")=="complete" and all(r["status"]=="complete" for r in rows) else ("partial" if physical.get("valid_seconds",0)>0 else "unavailable"),
        "level_contract":level_contract,
        "flow_contract":flow_contract,
    }),ensure_ascii=False)

def professional_flow_survey_result(
    depth_path=None,
    depth_col=None,
    velocity_path=None,
    velocity_col=None,
    flow_path=None,
    flow_col=None,
    rain_path=None,
    rain_col="rainfall",
    network_sources_json="[]",
    population_above_50k=True,
    apply_fault_cutoff=False,
    rain_factor=1.0,
    depth_unit_override=None,
    velocity_unit_override=None,
    flow_unit_override=None,
):
    """Run the advanced Flow-Survey-Assessment-Tools workflow in browser-local Python."""
    from icm_workbench.analysis.survey_assessment import (
        monitor_weekly_assessment,
        network_rainfall_assessment,
    )

    def _channel(path, column, quantity, override, canonical):
        if not path or not column:
            return None, None
        allowed = ("depth", "level") if quantity == "depth" else (quantity,)
        frame, contract = python_bridge._scaled_dimensional_frame(
            path,
            column,
            unit_override=override,
            allowed_quantities=allowed,
            required_canonical_unit=canonical,
        )
        out = frame[["timestamp", column]].copy().rename(columns={column: quantity})
        return out, contract

    depth, depth_contract = _channel(
        depth_path, depth_col, "depth", depth_unit_override, "m"
    )
    velocity, velocity_contract = _channel(
        velocity_path,
        velocity_col,
        "velocity",
        velocity_unit_override,
        "m/s",
    )
    flow, flow_contract = _channel(
        flow_path, flow_col, "flow", flow_unit_override, "m³/s"
    )

    hydraulic = None
    for part in (depth, velocity, flow):
        if part is None:
            continue
        part = part.copy()
        part["timestamp"] = pd.to_datetime(part["timestamp"], errors="coerce")
        part = part.dropna(subset=["timestamp"]).sort_values("timestamp")
        if hydraulic is None:
            hydraulic = part
        else:
            hydraulic = hydraulic.merge(part, on="timestamp", how="outer")
    if hydraulic is None or hydraulic.empty:
        raise ValueError(
            "Select at least one resolved SI hydraulic channel (depth, velocity or flow)."
        )
    hydraulic = (
        hydraulic.sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
    )

    if not rain_path:
        raise ValueError("Select the rainfall gauge associated with this monitor.")
    rain_parsed = python_bridge._load(rain_path)
    rain = rain_parsed.frame.copy()
    if rain_col not in rain.columns:
        raise ValueError(f"Mapped rainfall column {rain_col!r} is unavailable.")
    rain[rain_col] = (
        pd.to_numeric(rain[rain_col], errors="coerce") * float(rain_factor)
    )
    rain_meta = getattr(rain_parsed, "metadata", {}) or {}
    rain_interval = rain_meta.get("interval_min")
    rain_interval = float(rain_interval) if rain_interval else None

    sources = (
        json.loads(network_sources_json)
        if isinstance(network_sources_json, str)
        else list(network_sources_json or [])
    )
    gauges = {}
    mapped_key = str(rain_path)
    for source in sources:
        path = source.get("path")
        if not path:
            continue
        parsed = python_bridge._load(path)
        frame = parsed.frame.copy()
        column = source.get("column")
        if column not in frame.columns:
            columns = [c for c in frame.columns if c != "timestamp"]
            if not columns:
                continue
            column = columns[0]
        frame[column] = (
            pd.to_numeric(frame[column], errors="coerce") * float(rain_factor)
        )
        metadata = getattr(parsed, "metadata", {}) or {}
        interval = metadata.get("interval_min")
        gauges[str(source.get("name") or path)] = (
            frame,
            column,
            float(interval) if interval else None,
        )

    if not any(str(source.get("path")) == mapped_key for source in sources):
        mapped_name = str(
            rain_meta.get("site")
            or rain_meta.get("name")
            or "Mapped monitor rainfall"
        )
        gauges[mapped_name] = (rain, rain_col, rain_interval)

    network = network_rainfall_assessment(
        gauges,
        population_above_50k=bool(population_above_50k),
        apply_fault_cutoff=bool(apply_fault_cutoff),
    )
    monitor = monitor_weekly_assessment(
        hydraulic,
        rain,
        rain_col=rain_col,
        rain_interval_min=rain_interval,
        depth_col="depth" if depth is not None else None,
        velocity_col="velocity" if velocity is not None else None,
        flow_col="flow" if flow is not None else None,
        population_above_50k=bool(population_above_50k),
        network_wapug_events=network.get("qualified_wapug_events") or None,
    )
    payload = {
        "network": network,
        "monitor": monitor,
        "contracts": {
            "depth": depth_contract,
            "velocity": velocity_contract,
            "flow": flow_contract,
            "rainfall": {
                "conversion_factor": float(rain_factor),
                "interval_min": rain_interval,
            },
        },
        "source_policy": {
            "mapped_rainfall_used_for_monitor": True,
            "all_loaded_r_files_used_for_network_context": True,
            "raw_sources_mutated": False,
            "fault_cutoff_applied_to_network_qualification": bool(
                apply_fault_cutoff
            ),
        },
    }
    return json.dumps(python_bridge._jsonable(payload), ensure_ascii=False)

