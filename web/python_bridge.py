from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import pandas as pd

from icm_workbench.parsers import parse_file
from icm_workbench.analysis import (
    pair_series, calibration_metrics, spill_assessment, detect_spill_intervals,
    spill_block_volumes, idealised_storage_screening, detect_rainfall_events,
    residual_series, cumulative_volume, time_weighted_exceedance,
    rating_curve_fit, weekly_data_assessment, dry_weather_flow, event_response_summary,
)
from icm_workbench.domain import ExclusionPeriod

_CACHE = {}


def _jsonable(value):
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
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
    return True


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


def series_data(path, column=None, max_points=25000):
    parsed = _load(path)
    frame = parsed.frame
    cols = [c for c in frame.columns if c != "timestamp"]
    if not cols:
        raise ValueError("No value series available")
    col = column if column in cols else cols[0]
    x = frame[["timestamp", col]].copy()
    x["timestamp"] = pd.to_datetime(x["timestamp"], errors="coerce")
    x[col] = pd.to_numeric(x[col], errors="coerce")
    x = x.dropna(subset=["timestamp"]).sort_values("timestamp")
    if len(x) > max_points:
        idx = np.linspace(0, len(x) - 1, int(max_points)).astype(int)
        x = x.iloc[idx]
    payload = {
        "column": str(col),
        "timestamp": [None if pd.isna(t) else pd.Timestamp(t).isoformat() for t in x["timestamp"]],
        "value": [None if pd.isna(v) else float(v) for v in x[col]],
    }
    return json.dumps(payload, ensure_ascii=False)


def compare_series(obs_path, obs_col, model_path, model_col, max_gap_seconds=900.0, offset_minutes=0.0, start=None, end=None):
    obs = _load(obs_path).frame
    mod = _load(model_path).frame.copy()
    if float(offset_minutes or 0):
        mod["timestamp"] = pd.to_datetime(mod["timestamp"], errors="coerce") + pd.to_timedelta(float(offset_minutes), unit="m")
    paired = pair_series(obs, mod, obs_col, model_col, max_gap_seconds=float(max_gap_seconds), start=start, end=end)
    metrics = calibration_metrics(paired)
    p = residual_series(paired) if not paired.empty else paired.copy()
    if not p.empty:
        p["residual"] = p["residual_model_minus_observed"]
    payload = {"metrics": metrics, "paired": _records(p)}
    return json.dumps(_jsonable(payload), ensure_ascii=False)


def diagnostic_result(obs_path, obs_col, model_path, model_col, max_gap_seconds=900.0, offset_minutes=0.0, start=None, end=None):
    obs=_load(obs_path).frame; mod=_load(model_path).frame.copy()
    if float(offset_minutes or 0):mod["timestamp"]=pd.to_datetime(mod["timestamp"],errors="coerce")+pd.to_timedelta(float(offset_minutes),unit="m")
    paired=pair_series(obs,mod,obs_col,model_col,max_gap_seconds=float(max_gap_seconds),start=start,end=end)
    residual=residual_series(paired) if not paired.empty else pd.DataFrame()
    cumulative=cumulative_volume(paired,float(max_gap_seconds)) if not paired.empty else pd.DataFrame()
    obs_exc=time_weighted_exceedance(obs,obs_col,float(max_gap_seconds)); mod_exc=time_weighted_exceedance(mod,model_col,float(max_gap_seconds))
    return json.dumps(_jsonable({"residual":_records(residual),"cumulative":_records(cumulative),"observed_exceedance":_records(obs_exc),"modelled_exceedance":_records(mod_exc)}),ensure_ascii=False)


def _exclusions(raw):
    if not raw:
        return []
    items = json.loads(raw) if isinstance(raw, str) else raw
    out = []
    for item in items:
        out.append(ExclusionPeriod(start=pd.Timestamp(item["start"]).to_pydatetime(), end=pd.Timestamp(item["end"]).to_pydatetime(), reason=str(item["reason"]), source=str(item.get("source", "user"))))
    return out


def rainfall_event_result(path,column,minimum_intensity=5.0,minimum_intensity_duration_min=6.0,minimum_depth_mm=5.0,minimum_event_duration_min=60.0,dry_gap_min=15.0,exclusions_json="[]"):
    frame=_load(path).frame
    events=detect_rainfall_events(frame,intensity_col=column,minimum_intensity=float(minimum_intensity),minimum_intensity_duration_min=float(minimum_intensity_duration_min),minimum_depth_mm=float(minimum_depth_mm),minimum_event_duration_min=float(minimum_event_duration_min),dry_gap_min=float(dry_gap_min),exclusions=_exclusions(exclusions_json))
    return json.dumps(_jsonable({"events":events,"count":len(events),"criteria":{"minimum_intensity":float(minimum_intensity),"minimum_intensity_duration_min":float(minimum_intensity_duration_min),"minimum_depth_mm":float(minimum_depth_mm),"minimum_event_duration_min":float(minimum_event_duration_min),"dry_gap_min":float(dry_gap_min)}}),ensure_ascii=False)


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
    flow=_load(flow_path).frame; rain=_load(rain_path).frame if rain_path else None
    result=dry_weather_flow(flow,flow_col,rain,rain_col,dry_day_mm=float(dry_day_mm),baseline_days=int(baseline_days),min_dry_days=int(min_dry_days),adp_hours=float(adp_hours))
    return json.dumps(_jsonable(result),ensure_ascii=False)


def event_response_result(obs_path,obs_col,model_path,model_col,events_json,baseline_hours=3.0,post_hours=6.0):
    events=json.loads(events_json) if isinstance(events_json,str) else events_json
    rows=event_response_summary(_load(obs_path).frame,_load(model_path).frame,events,obs_col,model_col,float(baseline_hours),float(post_hours))
    return json.dumps(_jsonable({"rows":rows}),ensure_ascii=False)


def spill_result(path, column, threshold, exclusions_json="[]", max_gap_seconds=900.0):
    frame = _load(path).frame
    result = spill_assessment(frame, column, float(threshold), max_gap_seconds=float(max_gap_seconds), exclusions=_exclusions(exclusions_json))
    payload = dict(result)
    payload["counting_windows"] = _records(result.get("counting_windows"))
    payload["monthly_counts"] = _records(result.get("monthly_counts"))
    payload["monthly_durations"] = _records(result.get("monthly_durations"))
    payload["events"] = [_jsonable(e) for e in result.get("events", [])]
    return json.dumps(_jsonable(payload), ensure_ascii=False)


def storage_result(level_path, level_col, flow_path, flow_col, threshold, exclusions_json="[]", target_count=10, max_gap_seconds=900.0):
    level = _load(level_path).frame
    flow = _load(flow_path).frame
    exc = _exclusions(exclusions_json)
    physical = detect_spill_intervals(level, level_col, float(threshold), max_gap_seconds=float(max_gap_seconds), exclusions=exc)
    blocks = spill_block_volumes(physical["events"], flow, flow_col, max_gap_seconds=float(max_gap_seconds), exclusions=exc)
    screening = idealised_storage_screening(blocks, target_count=int(target_count))
    payload = {
        "physical": {k: _jsonable(v) for k, v in physical.items() if k != "events"},
        "events": [_jsonable(e) for e in physical.get("events", [])],
        "blocks": _records(blocks),
        "screening": _records(screening),
    }
    return json.dumps(payload, ensure_ascii=False)
