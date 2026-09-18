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


def _series_summary_payload(path, column, view, *, scale=1.0, max_gap_seconds=900.0):
    parsed = _load(path)
    contract = _series_contract(path, column)
    values = pd.to_numeric(view[column], errors="coerce") * float(scale)
    finite = values[np.isfinite(values)]
    start = None if view.empty else pd.to_datetime(view["timestamp"], errors="coerce").min()
    end = None if view.empty else pd.to_datetime(view["timestamp"], errors="coerce").max()
    unit = contract.get("canonical_unit") or contract.get("original_unit")
    summary = {
        "quantity": contract.get("quantity"),
        "unit": unit,
        "unit_status": contract.get("unit_status"),
        "samples": int(len(view)),
        "valid_samples": int(finite.count()),
        "start": None if pd.isna(start) else pd.Timestamp(start).isoformat(),
        "end": None if pd.isna(end) else pd.Timestamp(end).isoformat(),
        "minimum": float(finite.min()) if len(finite) else None,
        "mean": float(finite.mean()) if len(finite) else None,
        "median": float(finite.median()) if len(finite) else None,
        "maximum": float(finite.max()) if len(finite) else None,
        "scale": float(scale),
    }
    if contract.get("quantity") == "rainfall" and not view.empty:
        metadata = getattr(parsed, "metadata", {}) or {}
        interval = metadata.get("interval_min")
        semantics = "incremental_depth" if contract.get("canonical_unit") == "mm" else "intensity"
        rain = view[["timestamp", column]].copy()
        rain[column] = pd.to_numeric(rain[column], errors="coerce") * float(scale)
        accumulation = rainfall_accumulation(
            rain,
            column,
            semantics=semantics,
            declared_interval_minutes=float(interval) if interval else None,
            max_gap_seconds=_rain_support_gap_seconds(parsed),
        )
        segments = accumulation.get("segments")
        wet_seconds = 0.0
        if segments is not None and not getattr(segments, "empty", True):
            wet = segments["valid"].astype(bool) & pd.to_numeric(segments["value"], errors="coerce").fillna(0).gt(0)
            wet_seconds = float(pd.to_numeric(segments.loc[wet, "support_seconds"], errors="coerce").fillna(0).sum())
        valid_seconds = float(accumulation.get("valid_seconds") or 0.0)
        summary.update({
            "rain_total_mm": accumulation.get("total_depth_mm"),
            "rain_coverage_fraction": accumulation.get("coverage_fraction"),
            "rain_status": accumulation.get("status"),
            "rain_wet_hours": wet_seconds / 3600.0,
            "rain_valid_hours": valid_seconds / 3600.0,
            "rain_mean_intensity_mm_h": (
                float(accumulation.get("total_depth_mm")) / (valid_seconds / 3600.0)
                if accumulation.get("total_depth_mm") is not None and valid_seconds > 0 and semantics == "intensity"
                else None
            ),
            "rain_peak_intensity_mm_h": float(finite.max()) if len(finite) and semantics == "intensity" else None,
            "rain_semantics": semantics,
        })
    return _jsonable(summary)


def series_summary(path, column=None, start=None, end=None, scale=1.0, max_gap_seconds=900.0, end_exclusive=False):
    x, col = _prepared_series(path, column)
    view = x
    start_ts = _model_clock_timestamp(start)
    end_ts = _model_clock_timestamp(end)
    if start_ts is not None:
        view = view[pd.to_datetime(view["timestamp"], errors="coerce") >= start_ts]
    if end_ts is not None:
        timestamps = pd.to_datetime(view["timestamp"], errors="coerce")
        view = view[timestamps < end_ts] if bool(end_exclusive) else view[timestamps <= end_ts]
    payload = _series_summary_payload(
        path, col, view,
        scale=float(scale),
        max_gap_seconds=float(max_gap_seconds),
    )
    payload["column"] = str(col)
    return json.dumps(_jsonable(payload), ensure_ascii=False)


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
        "summary": _series_summary_payload(
            path, col, view,
            scale=1.0,
            max_gap_seconds=float(max_gap_seconds),
        ),
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


def _comparison_coverage(observed, obs_col, modelled, model_col, domain_start, domain_end, max_gap_seconds, exclusions):
    if domain_start is None or domain_end is None:
        empty={"status":"unavailable","coverage_fraction":None,"requested_seconds":0.0,"valid_seconds":0.0,"excluded_seconds":0.0,"missing_seconds":0.0,"unknown_seconds":0.0,"uncovered_seconds":0.0,"validity":None}
        return {"status":"unavailable","coverage_fraction":None,"observed":dict(empty),"modelled":dict(empty),"validity_model":"validity-v1"}
    observed_coverage=time_coverage(
        observed,obs_col,domain_start,domain_end,
        max_gap_seconds=float(max_gap_seconds),exclusions=exclusions,
    )
    modelled_coverage=time_coverage(
        modelled,model_col,domain_start,domain_end,
        max_gap_seconds=float(max_gap_seconds),exclusions=exclusions,
    )
    fractions=[x.get("coverage_fraction") for x in (observed_coverage,modelled_coverage) if x.get("coverage_fraction") is not None]
    coverage=min(fractions) if len(fractions)==2 else None
    statuses={observed_coverage.get("status"),modelled_coverage.get("status")}
    if "unavailable" in statuses or coverage is None:
        status="unavailable"
    elif statuses=={"complete"}:
        status="complete"
    else:
        status="partial"
    return {
        "status":status,
        "coverage_fraction":coverage,
        "observed":observed_coverage,
        "modelled":modelled_coverage,
        "validity_model":"validity-v1",
        "coverage_basis":"minimum of observed/modelled eligible support; metrics use bounded valid pairs",
    }


def compare_series(obs_path, obs_col, model_path, model_col, max_gap_seconds=900.0, offset_minutes=0.0, start=None, end=None, exclusions_json="[]", quantity_override=None, unit_override=None):
    obs, mod, effective = _comparison_frames(
        obs_path, obs_col, model_path, model_col,
        quantity_override=quantity_override,
        unit_override=unit_override,
    )
    if float(offset_minutes or 0):
        mod["timestamp"] = pd.to_datetime(mod["timestamp"], errors="coerce") + pd.to_timedelta(float(offset_minutes), unit="m")
    domain_start,domain_end=_comparison_domain(obs,mod,start,end)
    paired_raw = pair_series(
        obs, mod, obs_col, model_col,
        max_gap_seconds=float(max_gap_seconds),
        start=domain_start, end=domain_end,
    )
    exclusions=_exclusions(exclusions_json)
    coverage=_comparison_coverage(
        obs,obs_col,mod,model_col,domain_start,domain_end,
        float(max_gap_seconds),exclusions,
    )
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
        "quantity":effective["quantity"],
        "unit":effective["unit"],
        "unit_status":effective["unit_status"],
        "comparison_contract":effective,
    }
    return json.dumps(_jsonable(payload), ensure_ascii=False)



def _quantity(path, column):
    metadata = getattr(_load(path), "metadata", {})
    return metadata.get("quantity_by_column", {}).get(column) or metadata.get("quantity")


def _series_contract(path, column, unit_override=None):
    parsed = _load(path)
    metadata = getattr(parsed, "metadata", {}) or {}
    details = {}
    if isinstance(metadata.get("series_metadata"), dict):
        details = dict(metadata["series_metadata"].get(column) or {})
    if not details and isinstance(metadata.get("channels"), dict):
        details = dict(metadata["channels"].get(column) or {})
    quantity = details.get("quantity") or metadata.get("quantity_by_column", {}).get(column) or metadata.get("quantity")
    original_unit = details.get("original_unit", metadata.get("original_unit"))
    resolved_unit = details.get("canonical_unit", metadata.get("canonical_unit"))
    status = details.get("unit_status") or ("resolved" if resolved_unit else "unresolved")
    scale = 1.0
    source = "metadata" if resolved_unit else "unresolved"
    if not resolved_unit and unit_override:
        resolved_unit, factor = canonical_unit(quantity, unit_override)
        if resolved_unit is None or factor is None:
            raise ValueError(f"Unsupported unit override {unit_override!r} for {quantity or 'unknown quantity'}.")
        scale = float(factor)
        original_unit = str(unit_override)
        status = "resolved-by-user"
        source = "user override"
    return {
        "quantity": quantity,
        "original_unit": original_unit,
        "canonical_unit": resolved_unit,
        "unit_status": status,
        "scale_to_canonical": scale,
        "unit_source": source,
    }


def _comparison_frames(obs_path, obs_col, model_path, model_col, *, quantity_override=None, unit_override=None):
    obs_contract = _series_contract(obs_path, obs_col)
    model_contract = _series_contract(model_path, model_col)
    declared_obs = obs_contract.get("quantity")
    declared_model = model_contract.get("quantity")
    override = None if quantity_override in (None, "", "auto") else str(quantity_override)
    if override:
        if declared_obs and declared_obs != override:
            raise ValueError(f"Observed series is declared as {declared_obs}; it cannot be overridden as {override}.")
        if declared_model and declared_model != override:
            raise ValueError(f"Model series is declared as {declared_model}; it cannot be overridden as {override}.")
        quantity = override
    else:
        if not declared_obs or not declared_model:
            raise ValueError("Comparison quantity is unresolved. Select the comparison quantity explicitly.")
        if declared_obs != declared_model:
            raise ValueError(f"Comparison requires matching quantities; observed={declared_obs}, model={declared_model}.")
        quantity = declared_obs

    obs = _load(obs_path).frame.copy()
    mod = _load(model_path).frame.copy()
    unit_mode = None if unit_override in (None, "", "auto") else str(unit_override)
    resolved_obs = obs_contract.get("canonical_unit")
    resolved_model = model_contract.get("canonical_unit")

    obs_scale = model_scale = 1.0
    unit = None
    unit_status = "unresolved"
    if unit_mode == "same":
        if resolved_obs and resolved_model and resolved_obs != resolved_model:
            raise ValueError(f"Resolved source units differ ({resolved_obs} vs {resolved_model}); choose an explicit comparison unit.")
        if (resolved_obs and not resolved_model) or (resolved_model and not resolved_obs):
            raise ValueError("Only one source has a resolved unit. Choose an explicit comparison unit so the unresolved source can be converted.")
        unit = resolved_obs or resolved_model or "source unit"
        unit_status = "resolved" if resolved_obs and resolved_model else "user-confirmed-same-source"
    elif unit_mode:
        canonical, factor = canonical_unit(quantity, unit_mode)
        if canonical is None or factor is None:
            raise ValueError(f"Unit {unit_mode!r} is not valid for comparison quantity {quantity!r}.")
        unit = canonical
        if resolved_obs:
            if resolved_obs != canonical:
                raise ValueError(f"Observed source resolves to {resolved_obs}; requested comparison unit resolves to {canonical}.")
        else:
            obs_scale = float(factor)
        if resolved_model:
            if resolved_model != canonical:
                raise ValueError(f"Model source resolves to {resolved_model}; requested comparison unit resolves to {canonical}.")
        else:
            model_scale = float(factor)
        unit_status = "resolved-by-source-and-user"
    else:
        if not resolved_obs and not resolved_model:
            # Statistical comparison is still valid in the common numeric source unit,
            # but dimensional interpretation (for example m³ volume) remains withheld.
            unit = "source unit"
            unit_status = "unresolved-same-source"
        elif not resolved_obs or not resolved_model:
            raise ValueError("Only one source has a resolved unit. Select an explicit comparison unit so the unresolved source can be converted.")
        elif resolved_obs != resolved_model:
            raise ValueError(f"Resolved source units differ ({resolved_obs} vs {resolved_model}).")
        else:
            unit = resolved_obs
            unit_status = "resolved"

    obs[obs_col] = pd.to_numeric(obs[obs_col], errors="coerce") * obs_scale
    mod[model_col] = pd.to_numeric(mod[model_col], errors="coerce") * model_scale
    return obs, mod, {
        "quantity": quantity,
        "unit": unit,
        "unit_status": unit_status,
        "observed_scale": obs_scale,
        "model_scale": model_scale,
        "observed_declared_quantity": declared_obs,
        "model_declared_quantity": declared_model,
        "observed_source_unit": resolved_obs or obs_contract.get("original_unit"),
        "model_source_unit": resolved_model or model_contract.get("original_unit"),
    }


def _scaled_dimensional_frame(path, column, *, unit_override=None, allowed_quantities=(), required_canonical_unit=None):
    contract = _series_contract(path, column, unit_override=unit_override)
    if allowed_quantities and contract["quantity"] not in set(allowed_quantities):
        raise ValueError(
            f"Series {column!r} is declared as {contract['quantity'] or 'unknown quantity'}; "
            f"expected one of {sorted(set(allowed_quantities))}."
        )
    if required_canonical_unit and contract["canonical_unit"] != required_canonical_unit:
        raise ValueError(
            f"Dimensional calculation withheld: resolve {column!r} to {required_canonical_unit}. "
            f"Current unit is {contract['original_unit'] or 'unknown'}."
        )
    frame = _load(path).frame.copy()
    frame[column] = pd.to_numeric(frame[column], errors="coerce") * float(contract["scale_to_canonical"])
    return frame, contract


def _rain_support_gap_seconds(parsed):
    metadata = getattr(parsed, "metadata", {}) or {}
    interval = metadata.get("interval_min")
    if interval:
        return float(interval) * 60.0 * 1.5
    frame = parsed.frame
    if "timestamp" in frame and len(frame) >= 2:
        d = pd.to_datetime(frame["timestamp"], errors="coerce").sort_values().diff().dt.total_seconds()
        d = d[d > 0]
        if len(d):
            return float(d.median()) * 1.5
    return None


def diagnostic_result(obs_path, obs_col, model_path, model_col, max_gap_seconds=900.0, offset_minutes=0.0, start=None, end=None, exclusions_json="[]", quantity_override=None, unit_override=None):
    obs,mod,effective=_comparison_frames(
        obs_path,obs_col,model_path,model_col,
        quantity_override=quantity_override,
        unit_override=unit_override,
    )
    if float(offset_minutes or 0):
        mod["timestamp"]=pd.to_datetime(mod["timestamp"],errors="coerce")+pd.to_timedelta(float(offset_minutes),unit="m")
    domain_start,domain_end=_comparison_domain(obs,mod,start,end)
    paired_raw=pair_series(
        obs,mod,obs_col,model_col,
        max_gap_seconds=float(max_gap_seconds),
        start=domain_start,end=domain_end,
    )
    exclusions=_exclusions(exclusions_json)
    coverage=_comparison_coverage(
        obs,obs_col,mod,model_col,domain_start,domain_end,
        float(max_gap_seconds),exclusions,
    )
    paired=paired_raw.copy()
    for exc in exclusions:
        paired.loc[(paired.timestamp >= exc.start) & (paired.timestamp < exc.end), ["obs", "sim"]] = np.nan
    residual=residual_series(paired) if not paired.empty else pd.DataFrame()
    is_flow=(
        effective["quantity"]=="flow"
        and effective["unit"]=="m³/s"
        and effective["unit_status"]!="user-confirmed-same-source"
        and not exclusions
    )
    cumulative=cumulative_volume(paired,float(max_gap_seconds)) if is_flow and not paired.empty else pd.DataFrame()
    obs_exc=time_weighted_exceedance(paired,"obs",float(max_gap_seconds)) if is_flow else pd.DataFrame()
    mod_exc=time_weighted_exceedance(paired,"sim",float(max_gap_seconds)) if is_flow else pd.DataFrame()
    if is_flow:
        reason=None
    elif exclusions:
        reason="Cumulative volume and flow-duration diagnostics are withheld for masked assessments until exact masked support is routed through the common integration contract."
    elif effective["quantity"]!="flow":
        reason="Cumulative volume and flow-duration diagnostics require a flow-to-flow comparison."
    elif effective["unit"]!="m³/s" or effective["unit_status"]=="user-confirmed-same-source":
        reason="Cumulative volume requires both flow series to be resolved to m³/s. Statistical comparison remains available."
    else:
        reason="Flow diagnostics unavailable."
    return json.dumps(_jsonable({
        "residual":_records(residual),
        "cumulative":_records(cumulative),
        "observed_exceedance":_records(obs_exc),
        "modelled_exceedance":_records(mod_exc),
        "flow_diagnostics_available":is_flow,
        "reason":reason,
        "comparison_contract":effective,
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

