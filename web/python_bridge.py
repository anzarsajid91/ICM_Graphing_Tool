from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import pandas as pd

from icm_workbench.parsers import parse_file
from icm_workbench.parsers.common import canonical_unit
from icm_workbench.analysis import (
    pair_series, calibration_metrics, spill_assessment, detect_spill_intervals,
    spill_block_volumes, idealised_storage_screening, detect_rainfall_events,
    residual_series, cumulative_volume, time_weighted_exceedance, time_coverage,
    rating_curve_fit, weekly_data_assessment, dry_weather_flow, event_response_summary,
)
from icm_workbench.domain import ExclusionPeriod

_CACHE = {}
_SERIES_CACHE = {}


def _jsonable(value):
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return _jsonable(value.item())
    if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
        return None
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _records(df):
    if df is None or getattr(df, "empty", True):
        return []
    out = df.copy()
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]):
            out[col] = out[col].map(lambda x: None if pd.isna(x) else pd.Timestamp(x).isoformat())
    return [_jsonable(row) for row in out.to_dict("records")]


def _load(path):
    path = str(path)
    if path not in _CACHE:
        _CACHE[path] = parse_file(Path(path))
    return _CACHE[path]


def clear_cache():
    _CACHE.clear()
    _SERIES_CACHE.clear()
    return True


def _model_clock_timestamp(value):
    """Return a timezone-naive timestamp for the workbench model-clock time basis."""
    if value in (None, ""):
        return None
    ts = pd.Timestamp(value)
    if ts.tzinfo is not None:
        ts = ts.tz_localize(None)
    return ts


def parse_source(path):
    parsed = _load(path)
    frame = parsed.frame
    value_cols = [str(c) for c in frame.columns if str(c) != "timestamp"]
    start = None if frame.empty else pd.to_datetime(frame["timestamp"], errors="coerce").min()
    end = None if frame.empty else pd.to_datetime(frame["timestamp"], errors="coerce").max()
    payload = {
        "format": parsed.format_name,
        "metadata": parsed.metadata,
        "audit": parsed.audit,
        "columns": value_cols,
        "rows": int(len(frame)),
        "start": None if pd.isna(start) else pd.Timestamp(start).isoformat(),
        "end": None if pd.isna(end) else pd.Timestamp(end).isoformat(),
    }
    return json.dumps(_jsonable(payload), ensure_ascii=False)


def _prepared_series(path, column=None):
    parsed = _load(path)
    frame = parsed.frame
    cols = [c for c in frame.columns if c != "timestamp"]
    if not cols:
        raise ValueError("No value series available")
    col = column if column in cols else cols[0]
    key = (str(path), str(col))
    if key not in _SERIES_CACHE:
        x = frame[["timestamp", col]].copy()
        x["timestamp"] = pd.to_datetime(x["timestamp"], errors="coerce")
        x[col] = pd.to_numeric(x[col], errors="coerce")
        x = x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp", keep="last").reset_index(drop=True)
        _SERIES_CACHE[key] = x
    return _SERIES_CACHE[key], col


def _display_indices(values, max_points):
    """Extrema/gap-aware downsampling for display, preserving line shape and gaps."""
    n = len(values)
    limit = max(2, int(max_points))
    if n <= limit:
        return np.arange(n, dtype=np.int64)
    if limit < 8:
        return np.unique(np.linspace(0, n - 1, limit).astype(np.int64))

    # Four candidates per bucket: first, last, minimum and maximum finite value.
    # This deliberately spends the display budget on peaks/troughs rather than
    # uniformly sampling away short EDM/model events.
    bucket_count = max(1, limit // 4)
    edges = np.linspace(0, n, bucket_count + 1).astype(np.int64)
    selected = {0, n - 1}
    for left, right in zip(edges[:-1], edges[1:]):
        if right <= left:
            continue
        selected.add(int(left))
        selected.add(int(right - 1))
        block = values[left:right]
        finite = np.flatnonzero(np.isfinite(block))
        if finite.size:
            finite_values = block[finite]
            selected.add(int(left + finite[int(np.argmin(finite_values))]))
            selected.add(int(left + finite[int(np.argmax(finite_values))]))
        # Preserve at least one null inside a bucket so Plotly does not bridge a
        # missing-data gap simply because display downsampling removed the null.
        missing = np.flatnonzero(~np.isfinite(block))
        if missing.size:
            selected.add(int(left + missing[0]))
            selected.add(int(left + missing[-1]))

    idx = np.asarray(sorted(selected), dtype=np.int64)
    if len(idx) > limit:
        idx = idx[np.unique(np.linspace(0, len(idx) - 1, limit).astype(np.int64))]
    return idx


def series_data(path, column=None, max_points=5000, start=None, end=None, max_gap_seconds=900.0):
    x, col = _prepared_series(path, column)
    timestamps = x["timestamp"].to_numpy(dtype="datetime64[ns]")
    lo = 0
    hi = len(x)
    start_ts = _model_clock_timestamp(start)
    end_ts = _model_clock_timestamp(end)
    if start_ts is not None:
        lo = int(np.searchsorted(timestamps, np.datetime64(start_ts.to_datetime64()), side="left"))
    if end_ts is not None:
        hi = int(np.searchsorted(timestamps, np.datetime64(end_ts.to_datetime64()), side="right"))
    lo = max(0, min(lo, len(x)))
    hi = max(lo, min(hi, len(x)))
    view = x.iloc[lo:hi]
    raw_count = int(len(view))
    values = view[col].to_numpy(dtype=float)
    idx = _display_indices(values, max_points)
    # Preserve every segment boundary, even when topology exceeds the display budget.
    stamps = view["timestamp"].to_numpy(dtype="datetime64[ns]").astype(np.int64)
    breaks = np.flatnonzero((np.diff(stamps) > float(max_gap_seconds)*1e9) | ~np.isfinite(values[:-1]) | ~np.isfinite(values[1:])) + 1
    if len(breaks):
        idx = np.unique(np.r_[idx, breaks-1, breaks])
    display = view.iloc[idx] if len(view) else view
    plot_t, plot_v = [], []
    break_set = set(breaks.tolist())
    for position, value, stamp in zip(idx, display[col], display["timestamp"]):
        if int(position) in break_set:
            plot_t.append(None); plot_v.append(None)
        plot_t.append(pd.Timestamp(stamp).isoformat())
        plot_v.append(None if pd.isna(value) else float(value))
    payload = {
        "column": str(col),
        "timestamp": plot_t,
        "value": plot_v,
        "topology_exceeds_budget": len(display) > int(max_points),
        "gap_separator_count": len(plot_t) - len(display),
        "raw_count": raw_count,
        "display_count": int(len(display)),
        "native_resolution": bool(raw_count <= int(max_points)),
        "requested_start": None if start_ts is None else start_ts.isoformat(),
        "requested_end": None if end_ts is None else end_ts.isoformat(),
    }
    return json.dumps(payload, ensure_ascii=False)


def _comparison_domain(observed, modelled, start=None, end=None):
    obs_ts=pd.to_datetime(observed["timestamp"],errors="coerce").dropna()
    mod_ts=pd.to_datetime(modelled["timestamp"],errors="coerce").dropna()
    if obs_ts.empty or mod_ts.empty:
        return None,None
    s=_model_clock_timestamp(start) if start is not None else max(pd.Timestamp(obs_ts.min()),pd.Timestamp(mod_ts.min()))
    e=_model_clock_timestamp(end) if end is not None else min(pd.Timestamp(obs_ts.max()),pd.Timestamp(mod_ts.max()))
    return (s,e) if e>s else (None,None)


def compare_series(obs_path, obs_col, model_path, model_col, max_gap_seconds=900.0, offset_minutes=0.0, start=None, end=None, exclusions_json="[]"):
    oq, mq = _quantity(obs_path, obs_col), _quantity(model_path, model_col)
    if not oq or not mq or oq != mq:
        raise ValueError("Comparison requires matching declared quantities; depth and level are distinct.")
    obs = _load(obs_path).frame
    mod = _load(model_path).frame.copy()
    if float(offset_minutes or 0):
        mod["timestamp"] = pd.to_datetime(mod["timestamp"], errors="coerce") + pd.to_timedelta(float(offset_minutes), unit="m")
    domain_start,domain_end=_comparison_domain(obs,mod,start,end)
    paired_raw = pair_series(
        obs, mod, obs_col, model_col,
        max_gap_seconds=float(max_gap_seconds),
        start=domain_start, end=domain_end,
    )
    exclusions=_exclusions(exclusions_json)
    if domain_start is not None and domain_end is not None and not paired_raw.empty:
        coverage=time_coverage(
            paired_raw,"obs",domain_start,domain_end,
            max_gap_seconds=float(max_gap_seconds),
            exclusions=exclusions,
        )
    else:
        coverage={
            "status":"unavailable","coverage_fraction":None,
            "requested_seconds":0.0,"valid_seconds":0.0,
            "excluded_seconds":0.0,"unknown_seconds":0.0,
            "uncovered_seconds":0.0,"validity":None,
        }
    paired=paired_raw.copy()
    for exc in exclusions:
        paired.loc[(paired.timestamp >= exc.start) & (paired.timestamp < exc.end), ["obs", "sim"]] = np.nan
    metrics = calibration_metrics(paired)
    p = residual_series(paired) if not paired.empty else paired.copy()
    if not p.empty:
        p["residual"] = p["residual_model_minus_observed"]
    payload = {
        "metrics": metrics,
        "paired": _records(p),
        "calculation_status":coverage.get("status","unavailable"),
        "coverage_fraction":coverage.get("coverage_fraction"),
        "coverage":coverage,
        "validity_model":"validity-v1",
    }
    return json.dumps(_jsonable(payload), ensure_ascii=False)


def diagnostic_result(obs_path, obs_col, model_path, model_col, max_gap_seconds=900.0, offset_minutes=0.0, start=None, end=None, exclusions_json="[]"):
    obs=_load(obs_path).frame
    mod=_load(model_path).frame.copy()
    if float(offset_minutes or 0):
        mod["timestamp"]=pd.to_datetime(mod["timestamp"],errors="coerce")+pd.to_timedelta(float(offset_minutes),unit="m")
    domain_start,domain_end=_comparison_domain(obs,mod,start,end)
    paired_raw=pair_series(
        obs,mod,obs_col,model_col,
        max_gap_seconds=float(max_gap_seconds),
        start=domain_start,end=domain_end,
    )
    exclusions=_exclusions(exclusions_json)
    if domain_start is not None and domain_end is not None and not paired_raw.empty:
        coverage=time_coverage(
            paired_raw,"obs",domain_start,domain_end,
            max_gap_seconds=float(max_gap_seconds),
            exclusions=exclusions,
        )
    else:
        coverage={
            "status":"unavailable","coverage_fraction":None,
            "requested_seconds":0.0,"valid_seconds":0.0,
            "excluded_seconds":0.0,"unknown_seconds":0.0,
            "uncovered_seconds":0.0,"validity":None,
        }
    paired=paired_raw.copy()
    for exc in exclusions:
        paired.loc[(paired.timestamp >= exc.start) & (paired.timestamp < exc.end), ["obs", "sim"]] = np.nan
    residual=residual_series(paired) if not paired.empty else pd.DataFrame()
    obs_contract=_series_contract(obs_path,obs_col)
    mod_contract=_series_contract(model_path,model_col)
    compatible_flow=(
        obs_contract["quantity"]=="flow"
        and mod_contract["quantity"]=="flow"
        and obs_contract["canonical_unit"]=="m³/s"
        and mod_contract["canonical_unit"]=="m³/s"
    )
    is_flow=compatible_flow and not exclusions
    cumulative=cumulative_volume(paired,float(max_gap_seconds)) if is_flow and not paired.empty else pd.DataFrame()
    obs_exc=time_weighted_exceedance(paired,"obs",float(max_gap_seconds)) if is_flow else pd.DataFrame()
    mod_exc=time_weighted_exceedance(paired,"sim",float(max_gap_seconds)) if is_flow else pd.DataFrame()
    if is_flow:
        reason=None
    elif exclusions:
        reason="Cumulative volume and flow-duration diagnostics are withheld for masked assessments until exact masked support is routed through the common integration contract."
    elif obs_contract["quantity"]!="flow" or mod_contract["quantity"]!="flow":
        reason="Cumulative volume and flow-duration diagnostics require two declared flow channels."
    else:
        reason="Cumulative volume withheld because one or both flow units are unresolved. Resolve both series to m³/s-compatible source units."
    return json.dumps(_jsonable({
        "residual":_records(residual),
        "cumulative":_records(cumulative),
        "observed_exceedance":_records(obs_exc),
        "modelled_exceedance":_records(mod_exc),
        "flow_diagnostics_available":is_flow,
        "reason":reason,
        "observed_contract":obs_contract,
        "modelled_contract":mod_contract,
        "cumulative_unit":"m³" if is_flow else None,
        "flow_unit":"m³/s" if is_flow else None,
        "integration_method":"instantaneous-trapezoidal-v2",
        "exceedance_method":"left-support-time-weighted",
        "calculation_status":coverage.get("status","unavailable"),
        "coverage_fraction":coverage.get("coverage_fraction"),
        "coverage":coverage,
        "validity_model":"validity-v1",
    }),ensure_ascii=False)

def _exclusions(raw):
    if not raw:
        return []
    items = json.loads(raw) if isinstance(raw, str) else raw
    out = []
    for item in items:
        if item.get("enabled") is False:
            continue
        start = _model_clock_timestamp(item["start"])
        end = _model_clock_timestamp(item["end"])
        out.append(ExclusionPeriod(
            start=start.to_pydatetime(),
            end=end.to_pydatetime(),
            reason=str(item["reason"]),
            source=str(item.get("source", "user")),
            exclusion_id=item.get("id", item.get("exclusion_id")),
        ))
    return out


def rainfall_event_result(path,column,minimum_intensity=5.0,minimum_intensity_duration_min=6.0,minimum_depth_mm=5.0,minimum_event_duration_min=60.0,dry_gap_min=15.0,exclusions_json="[]"):
    parsed=_load(path)
    frame=parsed.frame
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
        exclusions=_exclusions(exclusions_json),
        semantics="intensity",
        declared_interval_minutes=float(interval) if interval else None,
        max_gap_seconds=_rain_support_gap_seconds(parsed),
    )
    return json.dumps(_jsonable({
        "events":events,
        "count":len(events),
        "criteria":{
            "minimum_intensity":float(minimum_intensity),
            "minimum_intensity_duration_min":float(minimum_intensity_duration_min),
            "minimum_depth_mm":float(minimum_depth_mm),
            "minimum_event_duration_min":float(minimum_event_duration_min),
            "dry_gap_min":float(dry_gap_min),
            "support_method":"actual elapsed intervals",
            "declared_interval_min":float(interval) if interval else None,
        }
    }),ensure_ascii=False)

def data_assessment(path,max_gap_seconds=900.0):
    parsed=_load(path); weekly=weekly_data_assessment(parsed.frame,float(max_gap_seconds))
    return json.dumps(_jsonable({"format":parsed.format_name,"audit":parsed.audit,"metadata":parsed.metadata,"weekly":_records(weekly)}),ensure_ascii=False)


def rating_result(obs_path,model_path=None,depth_col="depth",flow_col="flow",model_depth_col="depth",model_flow_col="flow"):
    obs=_load(obs_path).frame; payload={"observed":rating_curve_fit(obs[depth_col],obs[flow_col]) if depth_col in obs.columns and flow_col in obs.columns else {"ok":False,"message":"Observed depth/flow channels unavailable."}}
    if model_path:
        mod=_load(model_path).frame; payload["modelled"]=rating_curve_fit(mod[model_depth_col],mod[model_flow_col]) if model_depth_col in mod.columns and model_flow_col in mod.columns else {"ok":False,"message":"Modelled depth/flow channels unavailable."}
        if payload["observed"].get("ok") and payload["modelled"].get("ok"):
            payload["coefficient_difference_percent"]=100.0*(payload["modelled"]["a"]-payload["observed"]["a"])/payload["observed"]["a"] if payload["observed"]["a"] else None
            payload["exponent_difference"]=payload["modelled"]["b"]-payload["observed"]["b"]
    return json.dumps(_jsonable(payload),ensure_ascii=False)


def dwf_result(flow_path,flow_col,rain_path=None,rain_col="rainfall",dry_day_mm=1.0,baseline_days=28,min_dry_days=5,adp_hours=6.0):
    flow=_load(flow_path).frame
    rain_parsed=_load(rain_path) if rain_path else None
    rain=rain_parsed.frame if rain_parsed is not None else None
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
        rain_max_gap_seconds=_rain_support_gap_seconds(rain_parsed) if rain_parsed is not None else None,
    )
    return json.dumps(_jsonable(result),ensure_ascii=False)

def event_response_result(obs_path,obs_col,model_path,model_col,events_json,baseline_hours=3.0,post_hours=6.0):
    events=json.loads(events_json) if isinstance(events_json,str) else events_json
    rows=event_response_summary(_load(obs_path).frame,_load(model_path).frame,events,obs_col,model_col,float(baseline_hours),float(post_hours))
    return json.dumps(_jsonable({"rows":rows}),ensure_ascii=False)


def spill_result(path, column, threshold, exclusions_json="[]", max_gap_seconds=900.0, start=None, end=None):
    frame = _load(path).frame
    result = spill_assessment(frame, column, float(threshold), start=_model_clock_timestamp(start), end=_model_clock_timestamp(end), max_gap_seconds=float(max_gap_seconds), exclusions=_exclusions(exclusions_json))
    payload = dict(result)
    payload["counting_windows"] = _records(result.get("counting_windows"))
    payload["monthly_counts"] = _records(result.get("monthly_counts"))
    payload["monthly_durations"] = _records(result.get("monthly_durations"))
    payload["yearly_summary"] = _records(result.get("yearly_summary"))
    payload["events"] = [_jsonable(e) for e in result.get("events", [])]
    return json.dumps(_jsonable(payload), ensure_ascii=False)


def storage_result(level_path, level_col, flow_path, flow_col, threshold, exclusions_json="[]", target_count=10, max_gap_seconds=900.0, start=None, end=None, level_unit_override=None, flow_unit_override=None):
    level,level_contract=_scaled_dimensional_frame(
        level_path,level_col,
        unit_override=level_unit_override,
        allowed_quantities=("level","depth"),
        required_canonical_unit="m",
    )
    flow,flow_contract=_scaled_dimensional_frame(
        flow_path,flow_col,
        unit_override=flow_unit_override,
        allowed_quantities=("flow",),
        required_canonical_unit="m³/s",
    )
    exc=_exclusions(exclusions_json)
    threshold_m=float(threshold)*float(level_contract["scale_to_canonical"])
    physical=detect_spill_intervals(
        level,level_col,threshold_m,
        start=_model_clock_timestamp(start),
        end=_model_clock_timestamp(end),
        max_gap_seconds=float(max_gap_seconds),
        exclusions=exc,
    )
    blocks=spill_block_volumes(physical["events"],flow,flow_col,max_gap_seconds=float(max_gap_seconds),exclusions=exc)
    screening=idealised_storage_screening(blocks,target_count=int(target_count))
    if physical.get("status")!="complete" and not screening.empty:
        screening=screening.copy()
        screening["required_storage_m3"]=None
        screening["max_block_volume_m3"]=None
        screening["annual_block_volume_m3"]=None
        screening["status"]="partial" if physical.get("valid_seconds",0)>0 else "unavailable"
        screening["reason"]="Required storage withheld because the level series has incomplete support over the assessment period."
    screen_statuses=set(screening["status"]) if not screening.empty and "status" in screening else set()
    overall="complete" if physical.get("status")=="complete" and (not screen_statuses or screen_statuses=={"complete"}) else (
        "partial" if physical.get("valid_seconds",0)>0 else "unavailable"
    )
    payload={
        "calculation_status":overall,
        "level_contract":level_contract,
        "flow_contract":flow_contract,
        "threshold_canonical_m":threshold_m,
        "physical":{k:_jsonable(v) for k,v in physical.items() if k!="events"},
        "events":[_jsonable(e) for e in physical.get("events",[])],
        "blocks":_records(blocks),
        "screening":_records(screening),
    }
    return json.dumps(_jsonable(payload),ensure_ascii=False)

