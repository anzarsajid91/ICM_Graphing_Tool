from __future__ import annotations
import json
import re
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
    rainfall_accumulation,
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


def set_series_quantity(path, column, quantity=None):
    """Apply an explicit user quantity to an otherwise-generic numeric series.

    The parser deliberately does not guess that a column named Value is a
    hydraulic level, flow, depth or velocity. Browser mapping can call this
    only for unresolved series after the user explicitly assigns the meaning.
    Units remain unresolved unless the source itself declares them.
    """
    parsed = _load(path)
    column = str(column)
    if column == "timestamp" or column not in parsed.frame.columns:
        raise ValueError(f"Unknown value series {column!r}.")
    allowed = {"depth", "level", "flow", "velocity", "rainfall"}
    requested = None if quantity in (None, "") else str(quantity).strip().lower()
    if requested is not None and requested not in allowed:
        raise ValueError(f"Unsupported series quantity {quantity!r}; expected one of {sorted(allowed)}.")

    metadata = parsed.metadata if isinstance(parsed.metadata, dict) else {}
    parsed.metadata = metadata
    series_metadata = metadata.setdefault("series_metadata", {})
    details = series_metadata.setdefault(column, {})
    quantity_by_column = metadata.setdefault("quantity_by_column", {})
    existing_source = details.get("quantity_source")
    existing = (
        details.get("quantity")
        or quantity_by_column.get(column)
        or _column_quantity_hint(column)
        or metadata.get("quantity")
    )
    if existing and existing_source != "user" and requested != str(existing).lower():
        raise ValueError(
            f"Series {column!r} already has declared quantity {existing!r}; "
            "user quantity overrides are only allowed for unresolved generic series."
        )

    if requested is None:
        if existing_source == "user":
            details.pop("quantity", None)
            details.pop("quantity_source", None)
            quantity_by_column[column] = None
    else:
        details["quantity"] = requested
        details["quantity_source"] = "user"
        quantity_by_column[column] = requested
    return json.dumps(_jsonable({
        "column": column,
        "quantity": requested,
        "unit": details.get("canonical_unit") or details.get("original_unit"),
        "unit_status": details.get("unit_status") or "unresolved",
        "quantity_source": "user" if requested else None,
    }), ensure_ascii=False)

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


def series_data(path, column=None, max_points=5000, start=None, end=None, max_gap_seconds=900.0, end_exclusive=False):
    parsed=_load(path);x, col = _prepared_series(path, column)
    timestamps = x["timestamp"].to_numpy(dtype="datetime64[ns]")
    lo = 0
    hi = len(x)
    start_ts = _model_clock_timestamp(start)
    end_ts = _model_clock_timestamp(end)
    if start_ts is not None:
        lo = int(np.searchsorted(timestamps, np.datetime64(start_ts.to_datetime64()), side="left"))
    if end_ts is not None:
        hi = int(np.searchsorted(timestamps, np.datetime64(end_ts.to_datetime64()), side="left" if end_exclusive else "right"))
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
    statistics = _graph_statistics(path, col, x, view, start_ts, end_ts, max_gap_seconds)
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
        "statistics":_jsonable(statistics),
    }
    return json.dumps(payload, ensure_ascii=False)


def _graph_statistics(path, col, source, view, start, end, max_gap_seconds):
    """Raw native-sample summaries and clipped interval support, never display data.

    Sample extrema/mean use the selected samples. Time-weighted mean and totals
    use valid source intervals clipped to the requested bounds, including
    interpolation at hydraulic boundaries. Rainfall uses left-held intensity.
    Exclusions remain visible annotations; these are explicitly raw statistics.
    """
    contract = _series_contract(path, str(col))
    quantity, unit = contract["quantity"], contract["canonical_unit"]
    values = view[col].to_numpy(dtype=float)
    finite = values[np.isfinite(values)]
    result = dict(quantity=quantity or str(col), unit=unit,
                  valid_count=int(len(finite)), missing_count=int((~np.isfinite(values)).sum()),
                  minimum=float(finite.min()) if len(finite) else None,
                  maximum=float(finite.max()) if len(finite) else None,
                  mean=float(finite.mean()) if len(finite) else None,
                  median=float(np.median(finite)) if len(finite) else None,
                  time_weighted_mean=None, total=None, total_unit=None,
                  valid_support_seconds=0.0, requested_seconds=0.0,
                  coverage_fraction=None, status="unavailable", unit_status=contract["unit_status"],
                  basis="raw source; exclusions are not applied")
    if source.empty:
        return result
    t = source.timestamp.to_numpy(dtype="datetime64[ns]").astype(np.int64) / 1e9
    v = source[col].to_numpy(dtype=float)
    parsed = _load(path)
    metadata = getattr(parsed, "metadata", {}) or {}
    declared = float(metadata.get("interval_min") or 0) * 60
    rainfall = quantity == "rainfall"
    if rainfall and declared > 0:
        right = np.r_[t[1:], t[-1] + declared]
        left, first, last = t, v, v
    else:
        left, right, first, last = t[:-1], t[1:], v[:-1], v[1:]
    a = float(start.value / 1e9) if start is not None else float(t[0])
    b = float(end.value / 1e9) if end is not None else float(right[-1] if len(right) else t[-1])
    requested = max(0.0, b - a)
    duration = right - left
    l, r = np.maximum(left, a), np.minimum(right, b)
    valid = (r > l) & (duration > 0) & (duration <= float(max_gap_seconds)) & np.isfinite(first)
    if not rainfall:
        valid &= np.isfinite(last)
    else:
        valid &= first >= 0
    seconds = (r - l)[valid]
    support = float(seconds.sum())
    coverage = support / requested if requested > 0 else None
    result.update(valid_support_seconds=support, requested_seconds=requested,
                  coverage_fraction=coverage,
                  status="unavailable" if support <= 0 else "complete" if coverage is not None and coverage >= 1-1e-9 else "partial")
    if support > 0:
        if rainfall:
            integral = float((first[valid] * seconds).sum())
        else:
            slope = (last[valid] - first[valid]) / duration[valid]
            vl = first[valid] + slope * (l[valid] - left[valid])
            vr = first[valid] + slope * (r[valid] - left[valid])
            integral = float(((vl + vr) * .5 * seconds).sum())
        result["time_weighted_mean"] = integral / support
        if quantity == "flow" and unit == "m³/s":
            result.update(total=integral, total_unit="m³")
        elif rainfall and unit == "mm/h":
            result.update(total=integral / 3600, total_unit="mm")
    return result


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


def _comparison_metric_reasons(paired, metrics):
    """Explain undefined verification statistics without manufacturing finite scores."""
    finite = paired.copy() if paired is not None else pd.DataFrame(columns=["obs", "sim"])
    if not finite.empty:
        finite = finite[
            np.isfinite(pd.to_numeric(finite["obs"], errors="coerce"))
            & np.isfinite(pd.to_numeric(finite["sim"], errors="coerce"))
        ]
    n = int(len(finite))
    reasons = {}
    if n == 0:
        reason = "no finite paired observed/modelled values"
        for key in ("rmse","mae","mean_bias","correlation","r2_correlation","regression_slope","regression_intercept","regression_r2","nse","kge_2009"):
            if metrics.get(key) is None:
                reasons[key] = reason
        return reasons
    o = pd.to_numeric(finite["obs"], errors="coerce").to_numpy(float)
    s = pd.to_numeric(finite["sim"], errors="coerce").to_numpy(float)
    obs_variable = n >= 2 and float(np.std(o)) > 0
    sim_variable = n >= 2 and float(np.std(s)) > 0
    if metrics.get("regression_slope") is None or metrics.get("regression_intercept") is None:
        reason = "requires at least two pairs and non-constant observed values"
        reasons["regression_slope"] = reason
        reasons["regression_intercept"] = reason
    if metrics.get("regression_r2") is None:
        reasons["regression_r2"] = "requires at least two pairs and non-constant observed values" if not obs_variable else "undefined because modelled values have zero variance"
    if metrics.get("correlation") is None or metrics.get("r2_correlation") is None:
        reason = "requires at least two pairs with non-zero variance in both observed and modelled values"
        reasons["correlation"] = reason
        reasons["r2_correlation"] = reason
    if metrics.get("nse") is None:
        reasons["nse"] = "undefined because observed values have zero variance"
    if metrics.get("kge_2009") is None:
        if not (obs_variable and sim_variable):
            reasons["kge_2009"] = "requires non-zero variance in both observed and modelled values"
        elif float(np.mean(o)) == 0:
            reasons["kge_2009"] = "undefined because the observed mean is zero"
        else:
            reasons["kge_2009"] = "undefined for this paired sample"
    return reasons


def compare_series(obs_path, obs_col, model_path, model_col, max_gap_seconds=900.0, offset_minutes=0.0, start=None, end=None, exclusions_json="[]", obs_unit=None, model_unit=None):
    oq, mq = _comparison_quantity(obs_path, obs_col), _comparison_quantity(model_path, model_col)
    if not oq or not mq:
        raise ValueError(
            "Comparison quantity could not be resolved for one or both selected series. "
            "Use matching hydraulic channels (for example depth with depth, flow with flow)."
        )
    if oq != mq:
        raise ValueError(
            f"Comparison requires matching declared quantities (or safely inferred quantities); "
            f"selected channels resolve to {oq!r} and {mq!r}. "
            "Depth and absolute level remain distinct."
        )
    obs_contract = _series_contract(obs_path, obs_col, unit_override=obs_unit)
    model_contract = _series_contract(model_path, model_col, unit_override=model_unit)
    obs = _load(obs_path).frame.copy()
    mod = _load(model_path).frame.copy()
    if obs_unit and float(obs_contract.get("scale_to_canonical") or 1.0) != 1.0:
        obs[obs_col] = pd.to_numeric(obs[obs_col], errors="coerce") * float(obs_contract["scale_to_canonical"])
    if model_unit and float(model_contract.get("scale_to_canonical") or 1.0) != 1.0:
        mod[model_col] = pd.to_numeric(mod[model_col], errors="coerce") * float(model_contract["scale_to_canonical"])
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
    metrics["unavailable_reasons"] = _comparison_metric_reasons(paired, metrics)
    positive_mask = (
        pd.to_numeric(paired["obs"], errors="coerce").gt(0)
        & pd.to_numeric(paired["sim"], errors="coerce").gt(0)
    ) if not paired.empty else pd.Series(dtype=bool)
    positive_paired = paired.loc[positive_mask].copy() if not paired.empty else paired.copy()
    positive_metrics = calibration_metrics(positive_paired)
    positive_metrics["unavailable_reasons"] = _comparison_metric_reasons(positive_paired, positive_metrics)
    positive_removed_count = max(0, int(metrics.get("pairs") or 0) - int(positive_metrics.get("pairs") or 0))
    p = residual_series(paired) if not paired.empty else paired.copy()
    if not p.empty:
        p["residual"] = p["residual_model_minus_observed"]
    payload = {
        "metrics": metrics,
        "positive_metrics": positive_metrics,
        "positive_removed_count": positive_removed_count,
        "paired": _records(p),
        "calculation_status":coverage.get("status","unavailable"),
        "coverage_fraction":coverage.get("coverage_fraction"),
        "coverage":coverage,
        "validity_model":"validity-v1",
        "observed_quantity": oq,
        "modelled_quantity": mq,
        "observed_unit": obs_contract.get("canonical_unit"),
        "modelled_unit": model_contract.get("canonical_unit"),
        "pairing_method": "observed timestamps with exact or bounded linear model interpolation; no extrapolation across disallowed gaps",
        "metric_weighting": "sample-weighted paired values",
    }
    return json.dumps(_jsonable(payload), ensure_ascii=False)



def _quantity(path, column):
    metadata = getattr(_load(path), "metadata", {}) or {}
    details = {}
    if isinstance(metadata.get("series_metadata"), dict):
        details = metadata["series_metadata"].get(column) or {}
    if not details and isinstance(metadata.get("channels"), dict):
        details = metadata["channels"].get(column) or {}
    return (
        details.get("quantity")
        or metadata.get("quantity_by_column", {}).get(column)
        or _column_quantity_hint(column)
        or metadata.get("quantity")
    )


def _column_quantity_hint(column):
    """Conservative fallback when an export has no explicit quantity metadata.

    This is intentionally name-based and keeps depth and absolute level distinct.
    It exists so otherwise-valid observed/model comparisons are not rejected solely
    because one parser/export omitted quantity metadata.
    """
    key = re.sub(r"[^a-z0-9]+", "", str(column or "").lower())
    if not key:
        return None
    if any(token in key for token in ("rainfall", "rain", "precip")):
        return "rainfall"
    # Resolve level/stage before velocity shorthand. "level" contains "vel",
    # so a broad substring check would otherwise misclassify hydraulic level.
    if any(token in key for token in ("waterlevel", "level", "stage")):
        return "level"
    if "velocity" in key or key == "vel":
        return "velocity"
    if any(token in key for token in ("discharge", "flow")):
        return "flow"
    if "depth" in key:
        return "depth"
    return None


def _comparison_quantity(path, column):
    declared = _quantity(path, column)
    if declared is not None:
        text = str(declared).strip().lower()
        aliases = {
            "discharge": "flow",
            "q": "flow",
            "vel": "velocity",
            "water depth": "depth",
            "water_depth": "depth",
            "water level": "level",
            "water_level": "level",
            "stage": "level",
            "rain": "rainfall",
            "precipitation": "rainfall",
        }
        text = aliases.get(text, text)
        if text in {"flow", "velocity", "depth", "level", "rainfall"}:
            return text
    return _column_quantity_hint(column)


def _series_contract(path, column, unit_override=None):
    parsed = _load(path)
    metadata = getattr(parsed, "metadata", {}) or {}
    details = {}
    if isinstance(metadata.get("series_metadata"), dict):
        details = dict(metadata["series_metadata"].get(column) or {})
    if not details and isinstance(metadata.get("channels"), dict):
        details = dict(metadata["channels"].get(column) or {})
    quantity = (
        details.get("quantity")
        or metadata.get("quantity_by_column", {}).get(column)
        or _column_quantity_hint(column)
        or metadata.get("quantity")
    )
    original_unit = details.get("original_unit", metadata.get("original_unit"))
    resolved_unit = details.get("canonical_unit", metadata.get("canonical_unit"))
    format_name = getattr(parsed, "format_name", None)
    if (
        not resolved_unit
        and quantity == "rainfall"
        and format_name == "rainfall_r_ascii"
        and str(original_unit or "").strip().lower() in {"", "unknown"}
    ):
        # The .R parser establishes interval-average rainfall intensity semantics.
        # Preserve that format contract without extending the assumption to generic CSV.
        resolved_unit = "mm/h"
        status = "resolved-by-format"
        source = "rainfall R format"
    else:
        status = details.get("unit_status") or ("resolved" if resolved_unit else "unresolved")
        source = "metadata" if resolved_unit else "unresolved"
    scale = 1.0
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
    coverage=_comparison_coverage(
        obs,obs_col,mod,model_col,domain_start,domain_end,
        float(max_gap_seconds),exclusions,
    )
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
