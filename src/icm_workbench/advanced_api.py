from __future__ import annotations

import json
import re
import numpy as np
import pandas as pd

from icm_workbench import browser_api as python_bridge

_SURVEY_BATCH_CACHE = {}
from icm_workbench.analysis import (
    pair_series,rating_curve_fit,detect_spill_intervals,integrate_series,split_interval_by_month,
    detect_rainfall_events,dry_weather_flow,rainfall_accumulation,validity_summary,multi_gauge_rainfall_assessment,
)


def rating_sources_result(
    obs_depth_path,
    obs_depth_col,
    obs_flow_path,
    obs_flow_col,
    model_depth_path=None,
    model_depth_col=None,
    model_flow_path=None,
    model_flow_col=None,
    max_gap_seconds=900.0,
    start=None,
    end=None,
    obs_exclusions_json="[]",
    model_exclusions_json="[]",
    obs_depth_unit=None,
    obs_flow_unit=None,
    model_depth_unit=None,
    model_flow_unit=None,
    diameter_mm=None,
    diameter_source=None,
    monitor=None,
):
    """Return canonical full-resolution empirical Q-H rating diagnostics.

    Pairing is performed from authoritative source frames using bounded
    interpolation. Dimensional channels must resolve to metres and m³/s.
    Exclusions are applied before fitting. Optional fm_rg_assoc diameter adds H/D
    context but does not create a theoretical capacity curve.
    """

    def fit(
        depth_path,
        depth_col,
        flow_path,
        flow_col,
        *,
        depth_unit=None,
        flow_unit=None,
        exclusions_json="[]",
        diameter_m=None,
    ):
        depth, depth_contract = python_bridge._scaled_dimensional_frame(
            depth_path,
            depth_col,
            unit_override=depth_unit,
            allowed_quantities=("depth", "level"),
            required_canonical_unit="m",
        )
        flow, flow_contract = python_bridge._scaled_dimensional_frame(
            flow_path,
            flow_col,
            unit_override=flow_unit,
            allowed_quantities=("flow",),
            required_canonical_unit="m³/s",
        )
        paired = pair_series(
            depth,
            flow,
            depth_col,
            flow_col,
            max_gap_seconds=float(max_gap_seconds),
            start=start,
            end=end,
        )
        exclusions = python_bridge._exclusions(exclusions_json)
        if not paired.empty and exclusions:
            for exc in exclusions:
                paired.loc[
                    (paired["timestamp"] >= exc.start)
                    & (paired["timestamp"] < exc.end),
                    ["obs", "sim"],
                ] = np.nan
        finite = paired[
            np.isfinite(pd.to_numeric(paired["obs"], errors="coerce"))
            & np.isfinite(pd.to_numeric(paired["sim"], errors="coerce"))
        ].copy() if not paired.empty else paired.copy()
        effective_diameter = (
            diameter_m if depth_contract.get("quantity") == "depth" else None
        )
        result = rating_curve_fit(
            finite["obs"] if not finite.empty else pd.Series(dtype=float),
            finite["sim"] if not finite.empty else pd.Series(dtype=float),
            diameter_m=effective_diameter,
        )
        if diameter_m is not None and effective_diameter is None:
            result["diameter_not_applied_reason"] = (
                "Diameter normalisation requires hydraulic depth; absolute level/stage "
                "cannot be converted to H/D without a defensible invert/reference."
            )
        result["points"] = python_bridge._records(
            finite.rename(columns={"obs": "depth", "sim": "flow"})
        )
        result["paired_count"] = int(len(finite))
        result["excluded_period_count"] = int(len(exclusions))
        result["contracts"] = {
            "depth": depth_contract,
            "flow": flow_contract,
        }
        result["pairing_method"] = (
            "depth timestamps with exact or bounded linear flow interpolation; "
            "no extrapolation across disallowed gaps"
        )
        result["analysis_period"] = {"start": start, "end": end}
        result["calculation_status"] = "complete" if result.get("ok") else "unavailable"
        return result

    diameter_m = None
    if diameter_mm not in (None, ""):
        try:
            candidate = float(diameter_mm)
            if np.isfinite(candidate) and candidate > 0:
                diameter_m = candidate / 1000.0
        except (TypeError, ValueError):
            diameter_m = None

    observed = fit(
        obs_depth_path,
        obs_depth_col,
        obs_flow_path,
        obs_flow_col,
        depth_unit=obs_depth_unit,
        flow_unit=obs_flow_unit,
        exclusions_json=obs_exclusions_json,
        diameter_m=diameter_m,
    )
    modelled = None
    if model_depth_path and model_flow_path and model_depth_col and model_flow_col:
        modelled = fit(
            model_depth_path,
            model_depth_col,
            model_flow_path,
            model_flow_col,
            depth_unit=model_depth_unit,
            flow_unit=model_flow_unit,
            exclusions_json=model_exclusions_json,
            diameter_m=diameter_m,
        )
    payload = {
        "observed": observed,
        "modelled": modelled,
        "diameter_context": {
            "status": (
                "applied"
                if observed.get("rating_mode") == "diameter-informed-data-fit"
                else "generic-fallback"
            ),
            "monitor": monitor or None,
            "diameter_mm": (
                float(diameter_m * 1000.0)
                if observed.get("rating_mode") == "diameter-informed-data-fit"
                else None
            ),
            "diameter_m": (
                float(diameter_m)
                if observed.get("rating_mode") == "diameter-informed-data-fit"
                else None
            ),
            "source": (
                diameter_source
                if observed.get("rating_mode") == "diameter-informed-data-fit"
                else None
            ),
            "method": (
                "fm_rg_assoc diameter used only for H/D and crown-depth context"
                if observed.get("rating_mode") == "diameter-informed-data-fit"
                else (
                    observed.get("diameter_not_applied_reason")
                    or "generic empirical Q-H fit; no reliable association diameter supplied"
                )
            ),
        },
        "methodology": (
            "positive finite canonical depth-flow pairs from authoritative source-resolution "
            "data; bounded interpolation; exclusions applied before fit; log10 least-squares power law"
        ),
    }
    if observed.get("ok") and modelled and modelled.get("ok"):
        payload["coefficient_difference_percent"] = (
            100.0 * (modelled["a"] - observed["a"]) / observed["a"]
            if observed["a"]
            else None
        )
        payload["exponent_difference"] = modelled["b"] - observed["b"]
    return json.dumps(python_bridge._jsonable(payload), ensure_ascii=False)

def rainfall_event_scaled(path,column,conversion_factor=1.0,minimum_intensity=5.0,minimum_intensity_duration_min=6.0,minimum_depth_mm=5.0,minimum_event_duration_min=60.0,dry_gap_min=15.0,exclusions_json="[]",start=None,end=None):
    parsed=python_bridge._load(path)
    frame=parsed.frame.copy()
    frame[column]=pd.to_numeric(frame[column],errors="coerce")*float(conversion_factor)
    frame["timestamp"]=pd.to_datetime(frame["timestamp"],errors="coerce")
    analysis_start=python_bridge._model_clock_timestamp(start)
    analysis_end=python_bridge._model_clock_timestamp(end)
    if analysis_start is not None and analysis_end is not None and analysis_end<=analysis_start:
        raise ValueError("Analysis end must be after analysis start.")
    if analysis_start is not None:
        frame=frame.loc[frame["timestamp"]>=pd.Timestamp(analysis_start)].copy()
    if analysis_end is not None:
        frame=frame.loc[frame["timestamp"]<pd.Timestamp(analysis_end)].copy()
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
            "analysis_start":analysis_start,
            "analysis_end_exclusive":analysis_end,
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
    rain_gap_seconds=python_bridge._rain_support_gap_seconds(parsed)
    result=rainfall_accumulation(
        x,
        column,
        semantics="intensity",
        declared_interval_minutes=float(interval) if interval else None,
        max_gap_seconds=rain_gap_seconds,
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
        "integration_method":"actual-support interval-average intensity × elapsed time; gaps above the defensible source-support limit are unknown; declared interval used only for final support",
        "max_gap_seconds":rain_gap_seconds,
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

def dwf_scaled(
    flow_path,
    flow_col,
    rain_path=None,
    rain_col="rainfall",
    rain_factor=1.0,
    dry_day_mm=1.0,
    baseline_days=28,
    min_dry_days=5,
    adp_hours=6.0,
    start=None,
    end=None,
    flow_exclusions_json="[]",
    rainfall_exclusions_json="[]",
    flow_unit_override=None,
):
    """Run the canonical DWF method on the shared Graphs analytical context.

    The underlying :func:`dry_weather_flow` definition is unchanged. This bridge
    resolves the selected flow to canonical m³/s, applies the declared analysis
    window, and masks role-appropriate exclusions before invoking that method.
    Rainfall exclusions therefore become unknown support, never dry weather.
    """
    flow,flow_contract=python_bridge._scaled_dimensional_frame(
        flow_path,
        flow_col,
        unit_override=flow_unit_override,
        allowed_quantities=("flow",),
        required_canonical_unit="m³/s",
    )
    rain=None
    rain_parsed=None
    if rain_path:
        rain_parsed=python_bridge._load(rain_path)
        rain=rain_parsed.frame.copy()
        if rain_col not in rain.columns:
            raise ValueError(f"Mapped rainfall column {rain_col!r} is unavailable.")
        rain[rain_col]=pd.to_numeric(rain[rain_col],errors="coerce")*float(rain_factor)

    analysis_start=python_bridge._model_clock_timestamp(start)
    analysis_end=python_bridge._model_clock_timestamp(end)

    def _bound(frame):
        if frame is None:
            return None
        out=frame.copy()
        stamp=pd.to_datetime(out["timestamp"],errors="coerce")
        keep=stamp.notna()
        if analysis_start is not None:
            keep &= stamp>=analysis_start
        if analysis_end is not None:
            keep &= stamp<=analysis_end
        return out.loc[keep].copy()

    def _mask(frame,column,exclusions):
        if frame is None or not exclusions:
            return frame,0
        out=frame.copy()
        stamp=pd.to_datetime(out["timestamp"],errors="coerce")
        mask=pd.Series(False,index=out.index)
        for exc in exclusions:
            mask |= (stamp>=pd.Timestamp(exc.start))&(stamp<pd.Timestamp(exc.end))
        out.loc[mask,column]=np.nan
        return out,int(mask.sum())

    flow=_bound(flow)
    rain=_bound(rain)
    flow,excluded_flow_rows=_mask(flow,flow_col,python_bridge._exclusions(flow_exclusions_json))
    rain,excluded_rainfall_rows=_mask(rain,rain_col,python_bridge._exclusions(rainfall_exclusions_json))

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
    result["flow_contract"]=flow_contract
    result["flow_unit"]="m³/s"
    result["analysis_start"]=None if analysis_start is None else analysis_start.isoformat()
    result["analysis_end"]=None if analysis_end is None else analysis_end.isoformat()
    result["excluded_flow_rows"]=excluded_flow_rows
    result["excluded_rainfall_rows"]=excluded_rainfall_rows
    result["context_method"]="shared analysis period; role-scoped exclusions applied before canonical DWF-v2"
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
    exclusions_json="[]",
    hydraulic_exclusions_json=None,
    rainfall_exclusions_json=None,
    start=None,
    end=None,
    max_gap_seconds=900.0,
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
    fallback_exclusions = python_bridge._exclusions(exclusions_json)
    hydraulic_exclusions = (
        python_bridge._exclusions(hydraulic_exclusions_json)
        if hydraulic_exclusions_json is not None
        else fallback_exclusions
    )
    rainfall_exclusions = (
        python_bridge._exclusions(rainfall_exclusions_json)
        if rainfall_exclusions_json is not None
        else fallback_exclusions
    )
    analysis_start = python_bridge._model_clock_timestamp(start)
    analysis_end = python_bridge._model_clock_timestamp(end)
    for exc in rainfall_exclusions:
        stamp = pd.to_datetime(rain["timestamp"], errors="coerce")
        rain.loc[
            (stamp >= pd.Timestamp(exc.start)) & (stamp < pd.Timestamp(exc.end)),
            rain_col,
        ] = np.nan

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
        for exc in rainfall_exclusions:
            stamp = pd.to_datetime(frame["timestamp"], errors="coerce")
            frame.loc[
                (stamp >= pd.Timestamp(exc.start)) & (stamp < pd.Timestamp(exc.end)),
                column,
            ] = np.nan
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
        analysis_start=analysis_start,
        analysis_end=analysis_end,
        exclusions=hydraulic_exclusions,
        rain_exclusions=rainfall_exclusions,
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
            "analysis_start": analysis_start,
            "analysis_end": analysis_end,
            "hydraulic_exclusion_count": len(hydraulic_exclusions),
            "rainfall_exclusion_count": len(rainfall_exclusions),
            "scoped_exclusions": True,
            "max_gap_seconds": float(max_gap_seconds),
        },
    }
    return json.dumps(python_bridge._jsonable(payload), ensure_ascii=False)



def survey_association_result(headers_json="[]", rows_json="[]", inferred_json="{}"):
    from icm_workbench.analysis.survey_context import (
        merge_authoritative_associations,
        normalise_association_table,
    )
    headers = json.loads(headers_json) if isinstance(headers_json, str) else list(headers_json or [])
    rows = json.loads(rows_json) if isinstance(rows_json, str) else list(rows_json or [])
    inferred = json.loads(inferred_json) if isinstance(inferred_json, str) else dict(inferred_json or {})
    normalised = normalise_association_table(headers, rows)
    merged = merge_authoritative_associations(normalised["records"], inferred)
    payload = {
        **normalised,
        "records": merged["records"],
        "conflicts": merged["conflicts"],
        "precedence": merged["precedence"],
    }
    return json.dumps(python_bridge._jsonable(payload), ensure_ascii=False)


def _survey_name_token(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _survey_channel(path, column, quantity, unit_override=None):
    if not path or not column:
        return None, None
    allowed = ("depth", "level") if quantity == "depth" else (quantity,)
    canonical = {"depth": "m", "velocity": "m/s", "flow": "m³/s"}[quantity]
    frame, contract = python_bridge._scaled_dimensional_frame(
        path,
        column,
        unit_override=unit_override,
        allowed_quantities=allowed,
        required_canonical_unit=canonical,
    )
    out = frame[["timestamp", column]].copy().rename(columns={column: quantity})
    return out, contract


def _survey_hydraulic_bundle(source):
    """Build one canonical hydraulic frame per source without repeating full-frame copies.

    This preserves the existing dimensional contracts while avoiding three separate
    _scaled_dimensional_frame calls and two outer merges for a normal FDV source.
    """
    path = source.get("path")
    if not path:
        return None, {}
    parsed = python_bridge._load(path)
    base = parsed.frame
    if base is None or getattr(base, "empty", True) or "timestamp" not in base.columns:
        return None, {}
    out = pd.DataFrame({"timestamp": pd.to_datetime(base["timestamp"], errors="coerce")})
    contracts = {}
    for quantity, key in (
        ("depth", "depth_col"),
        ("velocity", "velocity_col"),
        ("flow", "flow_col"),
    ):
        column = source.get(key)
        channel_path = source.get(f"{quantity}_path") or path
        if not column or channel_path != path or column not in base.columns:
            if column and channel_path and channel_path != path:
                frame, contract = _survey_channel(
                    channel_path,
                    column,
                    quantity,
                    source.get(f"{quantity}_unit_override"),
                )
                if frame is not None:
                    out = out.merge(frame, on="timestamp", how="outer")
                    contracts[quantity] = contract
            continue
        contract = python_bridge._series_contract(
            path,
            column,
            unit_override=source.get(f"{quantity}_unit_override"),
        )
        allowed = {"depth", "level"} if quantity == "depth" else {quantity}
        if contract["quantity"] not in allowed:
            raise ValueError(
                f"Series {column!r} is declared as {contract['quantity'] or 'unknown quantity'}; "
                f"expected one of {sorted(allowed)}."
            )
        required = {"depth": "m", "velocity": "m/s", "flow": "m³/s"}[quantity]
        if contract["canonical_unit"] != required:
            raise ValueError(
                f"Dimensional calculation withheld: resolve {column!r} to {required}. "
                f"Current unit is {contract['original_unit'] or 'unknown'}."
            )
        out[quantity] = pd.to_numeric(base[column], errors="coerce") * float(contract["scale_to_canonical"])
        contracts[quantity] = contract
    value_columns = [c for c in ("depth", "velocity", "flow") if c in out.columns]
    if not value_columns:
        return None, contracts
    out = (
        out.dropna(subset=["timestamp"])
        .sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
        .reset_index(drop=True)
    )
    return out, contracts


def _survey_rain_source(path, column="rainfall", factor=1.0):
    if not path:
        return None, None
    parsed = python_bridge._load(path)
    frame = parsed.frame.copy()
    if column not in frame.columns:
        available = [c for c in frame.columns if c != "timestamp"]
        if not available:
            raise ValueError(f"Rainfall source {path!r} has no value column.")
        column = available[0]
    frame[column] = pd.to_numeric(frame[column], errors="coerce") * float(factor)
    metadata = getattr(parsed, "metadata", {}) or {}
    interval = metadata.get("interval_min")
    return frame, float(interval) if interval else None


def survey_volume_balance_result(
    association_json="[]",
    monitor_sources_json="[]",
    exclusions_json="[]",
    max_gap_seconds=900.0,
    start=None,
    end=None,
    amber_tolerance_percent=10.0,
):
    from icm_workbench.analysis.survey_context import survey_volume_balance

    associations = json.loads(association_json) if isinstance(association_json, str) else list(association_json or [])
    sources = json.loads(monitor_sources_json) if isinstance(monitor_sources_json, str) else list(monitor_sources_json or [])
    exclusions = python_bridge._exclusions(exclusions_json)
    flows = {}
    contracts = {}
    missing = []
    for source in sources:
        monitor = str(source.get("monitor") or "").strip()
        path = source.get("path")
        column = source.get("flow_col")
        if not monitor or not path or not column:
            if monitor:
                missing.append({"monitor": monitor, "reason": "flow source not mapped"})
            continue
        try:
            frame, contract = _survey_channel(
                path,
                column,
                "flow",
                source.get("flow_unit_override"),
            )
            if frame is None:
                missing.append({"monitor": monitor, "reason": "flow channel unavailable"})
                continue
            flows[monitor] = frame
            contracts[monitor] = contract
        except Exception as exc:
            missing.append({"monitor": monitor, "reason": str(exc)})

    result = survey_volume_balance(
        flows,
        associations,
        start=python_bridge._model_clock_timestamp(start),
        end=python_bridge._model_clock_timestamp(end),
        exclusions=exclusions,
        max_gap_seconds=float(max_gap_seconds),
        amber_tolerance_percent=float(amber_tolerance_percent),
    )
    result["contracts"] = contracts
    result["source_issues"] = missing
    result["association_precedence"] = "fm_rg_assoc.xlsx"
    return json.dumps(python_bridge._jsonable(result), ensure_ascii=False)


def professional_survey_batch_result(
    association_json="[]",
    monitor_sources_json="[]",
    rain_sources_json="[]",
    population_above_50k=True,
    apply_fault_cutoff=False,
    rain_factor=1.0,
    exclusions_json="[]",
    hydraulic_exclusions_json=None,
    rainfall_exclusions_json=None,
    max_gap_seconds=900.0,
    start=None,
    end=None,
    amber_tolerance_percent=10.0,
):
    from icm_workbench.analysis.survey_assessment import (
        monitor_weekly_assessment,
        network_rainfall_assessment,
    )
    from icm_workbench.analysis.survey_context import (
        fsat_event_response_assessment,
        survey_volume_balance,
    )

    associations = json.loads(association_json) if isinstance(association_json, str) else list(association_json or [])
    monitor_sources = json.loads(monitor_sources_json) if isinstance(monitor_sources_json, str) else list(monitor_sources_json or [])
    rain_sources = json.loads(rain_sources_json) if isinstance(rain_sources_json, str) else list(rain_sources_json or [])
    fallback_exclusions = python_bridge._exclusions(exclusions_json)
    hydraulic_exclusions = (
        python_bridge._exclusions(hydraulic_exclusions_json)
        if hydraulic_exclusions_json is not None
        else fallback_exclusions
    )
    rainfall_exclusions = (
        python_bridge._exclusions(rainfall_exclusions_json)
        if rainfall_exclusions_json is not None
        else fallback_exclusions
    )
    analysis_start = python_bridge._model_clock_timestamp(start)
    analysis_end = python_bridge._model_clock_timestamp(end)

    cache_key = (
        str(association_json),
        str(monitor_sources_json),
        str(rain_sources_json),
        bool(population_above_50k),
        bool(apply_fault_cutoff),
        float(rain_factor),
        str(hydraulic_exclusions_json if hydraulic_exclusions_json is not None else exclusions_json),
        str(rainfall_exclusions_json if rainfall_exclusions_json is not None else exclusions_json),
        float(max_gap_seconds),
        None if analysis_start is None else analysis_start.isoformat(),
        None if analysis_end is None else analysis_end.isoformat(),
        float(amber_tolerance_percent),
    )
    cached = _SURVEY_BATCH_CACHE.get(cache_key)
    if cached is not None:
        return cached

    gauges = {}
    rain_lookup = {}
    rain_issues = []
    for source in rain_sources:
        name = str(source.get("name") or source.get("gauge") or "").strip()
        path = source.get("path")
        column = source.get("column") or "rainfall"
        if not name or not path:
            continue
        try:
            frame, interval = _survey_rain_source(path, column, rain_factor)
            if rainfall_exclusions:
                stamp = pd.to_datetime(frame["timestamp"], errors="coerce")
                for exc in rainfall_exclusions:
                    frame.loc[
                        (stamp >= pd.Timestamp(exc.start)) & (stamp < pd.Timestamp(exc.end)),
                        column,
                    ] = np.nan
            gauges[name] = (frame, column, interval)
            rain_lookup[_survey_name_token(name)] = (frame, column, interval)
        except Exception as exc:
            rain_issues.append({"gauge": name, "reason": str(exc)})

    network = network_rainfall_assessment(
        gauges,
        population_above_50k=bool(population_above_50k),
        apply_fault_cutoff=bool(apply_fault_cutoff),
    )

    source_by_monitor = {
        str(x.get("monitor") or "").strip(): x
        for x in monitor_sources
        if str(x.get("monitor") or "").strip()
    }
    assoc_by_monitor = {
        str(x.get("monitor") or "").strip(): x
        for x in associations
        if str(x.get("monitor") or "").strip()
    }
    monitor_rows = []
    volume_flows = {}

    for monitor, assoc in assoc_by_monitor.items():
        source = source_by_monitor.get(monitor)
        if not source:
            monitor_rows.append({
                "monitor": monitor,
                "status": "unavailable",
                "reason": "No FDV source matched this workbook monitor.",
                "rain_gauge": assoc.get("rain_gauge"),
                "diameter_mm": assoc.get("diameter_mm"),
            })
            continue
        try:
            hydraulic, contracts = _survey_hydraulic_bundle(source)
        except Exception as exc:
            hydraulic = None
            contracts = {"source": {"unit_status": "error", "reason": str(exc)}}

        if hydraulic is None or hydraulic.empty:
            monitor_rows.append({
                "monitor": monitor,
                "status": "unavailable",
                "reason": "No usable depth, velocity or flow channel.",
                "rain_gauge": assoc.get("rain_gauge"),
                "diameter_mm": assoc.get("diameter_mm"),
                "contracts": contracts,
            })
            continue
        if "flow" in hydraulic.columns:
            volume_flows[monitor] = hydraulic[["timestamp", "flow"]].copy()

        rg = str(assoc.get("rain_gauge") or "").strip()
        rain_spec = rain_lookup.get(_survey_name_token(rg))
        if not rain_spec:
            monitor_rows.append({
                "monitor": monitor,
                "status": "partial",
                "reason": f"Workbook-mapped rainfall gauge {rg or '—'} is not loaded/matched.",
                "rain_gauge": rg or None,
                "diameter_mm": assoc.get("diameter_mm"),
                "contracts": contracts,
            })
            continue
        rain_frame, rain_col, rain_interval = rain_spec

        weekly = monitor_weekly_assessment(
            hydraulic,
            rain_frame,
            rain_col=rain_col,
            rain_interval_min=rain_interval,
            depth_col="depth" if "depth" in hydraulic.columns else None,
            velocity_col="velocity" if "velocity" in hydraulic.columns else None,
            flow_col="flow" if "flow" in hydraulic.columns else None,
            population_above_50k=bool(population_above_50k),
            network_wapug_events=network.get("qualified_wapug_events") or None,
            analysis_start=analysis_start,
            analysis_end=analysis_end,
            exclusions=hydraulic_exclusions,
            rain_exclusions=rainfall_exclusions,
        )
        if analysis_start or analysis_end:
            filtered = []
            for week in weekly.get("weeks", []):
                week_start = pd.Timestamp(week.get("start"))
                week_end = pd.Timestamp(week.get("end"))
                if analysis_start is not None and week_end < pd.Timestamp(analysis_start):
                    continue
                if analysis_end is not None and week_start > pd.Timestamp(analysis_end):
                    continue
                filtered.append(week)
            weekly["weeks"] = filtered
            weekly["analysis_period"] = {
                "start": analysis_start,
                "end": analysis_end,
            }

        event_response = fsat_event_response_assessment(
            hydraulic,
            rain_frame,
            rain_col=rain_col,
            rain_interval_min=rain_interval,
            diameter_mm=assoc.get("diameter_mm"),
            network_wapug_events=network.get("qualified_wapug_events") or [],
            depth_col="depth" if "depth" in hydraulic.columns else None,
            velocity_col="velocity" if "velocity" in hydraulic.columns else None,
            flow_col="flow" if "flow" in hydraulic.columns else None,
            monitor_type=str(source.get("monitor_type") or "FM"),
            start=analysis_start,
            end=analysis_end,
            exclusions=hydraulic_exclusions,
            rain_exclusions=rainfall_exclusions,
        )

        monitor_rows.append({
            "monitor": monitor,
            "status": "complete",
            "rain_gauge": rg,
            "diameter_mm": assoc.get("diameter_mm"),
            "upstream": assoc.get("upstream", []),
            "weekly": weekly,
            "event_response": event_response,
            "contracts": contracts,
        })

    volume = survey_volume_balance(
        volume_flows,
        associations,
        start=analysis_start,
        end=analysis_end,
        exclusions=hydraulic_exclusions,
        max_gap_seconds=float(max_gap_seconds),
        amber_tolerance_percent=float(amber_tolerance_percent),
    ) if volume_flows else {
        "rows": [],
        "summary": {"Green": 0, "Amber": 0, "Red": 0, "Grey": 0},
        "reason": "No mapped flow channels available for volume balance.",
        "method": "weekly-volume-balance-v2",
    }

    weekly_lookup = {}
    for monitor_result in monitor_rows:
        monitor_name = str(monitor_result.get("monitor") or "")
        for week in (monitor_result.get("weekly") or {}).get("weeks", []):
            try:
                week_key = pd.Timestamp(week.get("week_ending")).date().isoformat()
            except Exception:
                continue
            weekly_lookup[(monitor_name, week_key)] = week

    for row in volume.get("rows", []):
        try:
            week_key = pd.Timestamp(row.get("week_ending")).date().isoformat()
        except Exception:
            week_key = ""
        involved = [
            str(row.get("downstream_monitor") or ""),
            *[str(x) for x in row.get("upstream_monitors", [])],
        ]
        qa = []
        for name in involved:
            week = weekly_lookup.get((name, week_key))
            if not week:
                continue
            rag = str(week.get("rag") or "")
            if rag in {"Red", "Amber"}:
                qa.append(
                    {
                        "monitor": name,
                        "rag": rag,
                        "decision_path": week.get("decision_path"),
                        "flow_score": week.get("flow_score"),
                    }
                )
        row["qa_evidence"] = qa
        if qa and row.get("rag") in {"Red", "Amber"}:
            highest = "Red" if any(x["rag"] == "Red" for x in qa) else "Amber"
            candidates = [x["monitor"] for x in qa if x["rag"] == highest]
            row["likely_source"] = (
                ", ".join(candidates)
                + f" (independent weekly QA {highest}; investigate first)"
            )
            evidence = "; ".join(
                f"{x['monitor']}: {x['rag']} — {x.get('decision_path') or 'weekly QA finding'}"
                for x in qa
            )
            row["recommendation"] = (
                f"Start with {', '.join(candidates)} because independent weekly QA also flags the monitor(s). "
                f"QA evidence: {evidence}. "
                + str(row.get("recommendation") or "")
            )

    payload = {
        "association": associations,
        "network": network,
        "monitors": monitor_rows,
        "volume_balance": volume,
        "source_issues": {"rainfall": rain_issues},
        "analysis_controls": {
            "start": analysis_start,
            "end": analysis_end,
            "hydraulic_exclusion_count": len(hydraulic_exclusions),
            "rainfall_exclusion_count": len(rainfall_exclusions),
            "scoped_exclusions": True,
            "max_gap_seconds": float(max_gap_seconds),
            "amber_tolerance_percent": float(amber_tolerance_percent),
        },
        "source_policy": {
            "association_workbook_authoritative": True,
            "mapped_rainfall_used_per_monitor": True,
            "all_loaded_rainfall_used_for_network_context": True,
            "raw_sources_mutated": False,
        },
        "method": "complete-survey-fsat-v1",
    }
    encoded = json.dumps(python_bridge._jsonable(payload), ensure_ascii=False)
    _SURVEY_BATCH_CACHE[cache_key] = encoded
    while len(_SURVEY_BATCH_CACHE) > 4:
        _SURVEY_BATCH_CACHE.pop(next(iter(_SURVEY_BATCH_CACHE)))
    return encoded
