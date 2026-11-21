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
from icm_workbench.analysis.screening import calendar_spill_volumes

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


def _require_model_clock(parsed, label="Source"):
    metadata = getattr(parsed, "metadata", {}) or {}
    if metadata.get("time_basis") == "timezone-aware/unresolved":
        raise ValueError(
            f"{label} contains timezone-aware timestamps. Resolve the source to the "
            "project/model clock before running engineering calculations."
        )
    return parsed


def clear_cache():
    _CACHE.clear()
    _SERIES_CACHE.clear()
    return True


def drop_cache(path):
    """Remove cached parsed/series data for one source path."""
    path = str(path)
    _CACHE.pop(path, None)
    for key in [key for key in _SERIES_CACHE if key and key[0] == path]:
        _SERIES_CACHE.pop(key, None)
    return True


def _model_clock_timestamp(value):
    """Return a timezone-naive timestamp for the workbench model-clock time basis."""
    if value in (None, ""):
        return None
    ts = pd.Timestamp(value)
    if ts.tzinfo is not None:
        raise ValueError("Timezone-aware bounds require an explicit conversion to the confirmed model-clock time basis; a timezone offset cannot be discarded.")
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


def set_series_quantity(path, column, quantity=None, unit=None):
    """Set user interpretation for editable generic/tabular series.

    Tabular CSV quantity names are parser-inferred defaults and may be
    reinterpreted by the engineer. Native structured formats retain their
    authoritative declared quantity. Any prior canonical scaling is reversed
    before a new quantity/unit contract is applied, so cross-dimension
    reinterpretation never silently reuses an incompatible conversion.
    """
    path = str(path)
    parsed = _load(path)
    column = str(column)
    if column == "timestamp" or column not in parsed.frame.columns:
        raise ValueError(f"Unknown value series {column!r}.")
    allowed = {"depth", "level", "flow", "velocity", "rainfall"}
    requested = None if quantity in (None, "") else str(quantity).strip().lower()
    if requested is not None and requested not in allowed:
        raise ValueError(
            f"Unsupported series quantity {quantity!r}; expected one of {sorted(allowed)}."
        )

    metadata = parsed.metadata if isinstance(parsed.metadata, dict) else {}
    parsed.metadata = metadata
    series_metadata = metadata.setdefault("series_metadata", {})
    details = series_metadata.setdefault(column, {})
    quantity_by_column = metadata.setdefault("quantity_by_column", {})
    existing_source = str(details.get("quantity_source") or "").strip().lower() or None
    existing = (
        details.get("quantity")
        or quantity_by_column.get(column)
        or _column_quantity_hint(column)
        or metadata.get("quantity")
    )
    existing = None if existing in (None, "") else str(existing).strip().lower()

    tabular_editable = str(getattr(parsed, "format_name", "")).lower() == "tabular_csv"
    editable_source = existing_source in {"user", "inferred", "unresolved"} or (
        tabular_editable and existing_source is None
    )
    if existing and not editable_source:
        if requested not in (None, existing):
            raise ValueError(
                f"Series {column!r} already has declared quantity {existing!r}; "
                "user quantity overrides are only allowed for inferred or unresolved generic series."
            )

        # Native/structured sources keep their declared quantity and canonical
        # numeric values authoritative. The engineer may still choose any
        # dimensionally compatible presentation unit for graphs/tables.
        source_unit = (
            details.get("detected_unit")
            or details.get("original_unit")
            or metadata.get("original_unit")
        )
        canonical = details.get("canonical_unit") or metadata.get("canonical_unit")
        conversion_factor = (
            details.get("conversion_factor")
            if details.get("conversion_factor") is not None
            else metadata.get("conversion_factor")
        )
        unit_status = (
            details.get("unit_status")
            or metadata.get("unit_status")
            or ("resolved" if canonical or source_unit else "unresolved")
        )
        selected_unit = details.get("user_unit")
        if unit is not None:
            selected_unit = str(unit).strip() or None
            if selected_unit:
                selected_canonical, _ = canonical_unit(existing, selected_unit)
                if selected_canonical is None:
                    raise ValueError(f"Unsupported unit {selected_unit!r} for {existing}.")
                if existing != "rainfall" and canonical and selected_canonical != canonical:
                    raise ValueError(
                        f"Unit {selected_unit!r} is incompatible with declared "
                        f"{existing!r} series canonical unit {canonical!r}."
                    )

        if existing == "rainfall":
            # Assign the unit to unchanged values, retaining source provenance.
            canonical, conversion_factor = canonical_unit(existing, selected_unit or source_unit)
            unit_status = "resolved" if canonical else "unresolved"
        display_unit = selected_unit or source_unit or canonical
        details["quantity"] = existing
        details["quantity_source"] = existing_source or "declared"
        details["detected_unit"] = source_unit
        details["original_unit"] = source_unit
        details["user_unit"] = selected_unit
        details["display_unit"] = display_unit
        details["canonical_unit"] = canonical
        details["conversion_factor"] = conversion_factor
        details["unit_status"] = unit_status
        quantity_by_column[column] = existing

        return json.dumps(
            _jsonable(
                {
                    "column": column,
                    "quantity": existing,
                    "requested_quantity": requested,
                    "unit": display_unit,
                    "display_unit": display_unit,
                    "canonical_unit": canonical,
                    "original_unit": source_unit,
                    "detected_unit": source_unit,
                    "user_unit": selected_unit,
                    "conversion_factor": conversion_factor,
                    "unit_status": unit_status,
                    "quantity_source": existing_source or "declared",
                }
            ),
            ensure_ascii=False,
        )

    # Keep the parser's original inference so clearing a user override restores
    # the helpful default rather than converting an inferred CSV into a new
    # permanent declaration.
    inferred_quantity = details.get("inferred_quantity")
    if inferred_quantity in (None, "") and existing_source == "inferred":
        inferred_quantity = existing
        details["inferred_quantity"] = inferred_quantity
    target_quantity = requested if requested is not None else inferred_quantity
    target_quantity = (
        None
        if target_quantity in (None, "")
        else str(target_quantity).strip().lower()
    )

    values = pd.to_numeric(parsed.frame[column], errors="coerce")
    current_factor = details.get("conversion_factor")
    try:
        current_factor = float(current_factor)
        if not np.isfinite(current_factor) or abs(current_factor) <= 1e-30:
            current_factor = None
    except (TypeError, ValueError):
        current_factor = None

    # parse_tabular_csv stores canonicalised values when a defensible unit was
    # inferred. Recover original source values before applying a new semantic
    # contract; this makes repeated Flow↔Depth↔Level reclassification stable.
    original_values = values / current_factor if current_factor is not None else values
    # Keep reliable source-unit provenance immutable. The user-selected unit is
    # the requested presentation unit when the source unit is known. If no
    # reliable source unit exists, the user selection instead assigns the raw
    # values' unit (without guessing), which then also becomes the display unit.
    if "detected_unit" not in details:
        details["detected_unit"] = details.get("original_unit")
    detected_unit = details["detected_unit"]
    selected_unit = details.get("user_unit")
    if requested is None and unit is None:
        selected_unit = None
    if unit is not None:
        selected_unit = str(unit).strip() or None
        if selected_unit and not target_quantity:
            raise ValueError("Choose a quantity before interpreting its unit.")
        if selected_unit and canonical_unit(target_quantity, selected_unit)[0] is None:
            raise ValueError(f"Unsupported unit {selected_unit!r} for {target_quantity}.")
    if selected_unit and canonical_unit(target_quantity, selected_unit)[0] is None:
        selected_unit = None

    detected_canonical = (
        canonical_unit(target_quantity, detected_unit)
        if target_quantity and detected_unit
        else (None, None)
    )
    detected_compatible = detected_canonical[0] is not None
    source_unit = (selected_unit if target_quantity == "rainfall" and selected_unit
                   else detected_unit if detected_compatible else selected_unit)
    if target_quantity and source_unit:
        canonical, factor = canonical_unit(target_quantity, source_unit)
    else:
        canonical, factor = (None, None)

    if canonical is not None and factor is not None:
        factor = float(factor)
        parsed.frame[column] = original_values * factor
        unit_status = "resolved"
    else:
        factor = None
        parsed.frame[column] = original_values
        unit_status = "unresolved"

    display_unit = selected_unit or (detected_unit if detected_compatible else None) or canonical
    details["quantity"] = target_quantity
    details["user_unit"] = selected_unit
    details["display_unit"] = display_unit
    details["original_unit"] = detected_unit if detected_unit is not None else source_unit
    details["quantity_source"] = "user" if requested is not None else (
        "inferred" if target_quantity else "unresolved"
    )
    details["canonical_unit"] = canonical
    details["conversion_factor"] = factor
    details["unit_status"] = unit_status
    quantity_by_column[column] = target_quantity

    # Series-data/statistics caches contain numeric values. Reclassification can
    # change canonical scaling, so never serve a pre-override cached frame.
    for key in [
        key
        for key in _SERIES_CACHE
        if key and key[0] == path and len(key) > 1 and str(key[1]) == column
    ]:
        _SERIES_CACHE.pop(key, None)

    return json.dumps(
        _jsonable(
            {
                "column": column,
                "quantity": target_quantity,
                "requested_quantity": requested,
                "unit": display_unit,
                "display_unit": display_unit,
                "canonical_unit": canonical,
                "original_unit": details.get("original_unit"),
                "detected_unit": detected_unit,
                "user_unit": selected_unit,
                "conversion_factor": factor,
                "unit_status": unit_status,
                "quantity_source": details["quantity_source"],
                "inferred_quantity": inferred_quantity,
            }
        ),
        ensure_ascii=False,
    )

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


def series_data(path, column=None, max_points=5000, start=None, end=None, max_gap_seconds=900.0, end_exclusive=False, exclusions_json="[]"):
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
    exclusions = _exclusions(exclusions_json)
    assessed = _graph_statistics(path, col, x, view, start_ts, end_ts, max_gap_seconds, exclusions=exclusions) if exclusions else None
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
        "assessment_statistics":_jsonable(assessed),
    }
    return json.dumps(payload, ensure_ascii=False)


def _graph_statistics(path, col, source, view, start, end, max_gap_seconds, exclusions=()):
    """Raw native-sample summaries and clipped interval support, never display data.

    Sample extrema/mean use the selected samples. Time-weighted mean and totals
    use valid source intervals clipped to the requested bounds, including
    interpolation at hydraulic boundaries. Rainfall uses left-held intensity.
    When exclusions are supplied, interval contributions are clipped at both
    boundaries; sample extrema use only samples outside the exclusion mask.
    """
    contract = _series_contract(path, str(col))
    quantity, unit = contract["quantity"], contract["canonical_unit"]
    values = view[col].to_numpy(dtype=float)
    if exclusions and not view.empty:
        stamps=view.timestamp.to_numpy(dtype="datetime64[ns]").astype(np.int64)/1e9
        keep=np.ones(len(values),dtype=bool)
        for exc in exclusions:
            keep &= ~((stamps>=pd.Timestamp(exc.start).value/1e9)&(stamps<pd.Timestamp(exc.end).value/1e9))
        values=values[keep]
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
                  basis="assessment; exclusions applied" if exclusions else "raw source; exclusions are not applied")
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
    if exclusions:
        union=[]
        for exc in sorted(exclusions,key=lambda x:x.start):
            lo=max(a,pd.Timestamp(exc.start).value/1e9)
            hi=min(b,pd.Timestamp(exc.end).value/1e9)
            if hi<=lo:continue
            if union and lo<=union[-1][1]:union[-1]=(union[-1][0],max(hi,union[-1][1]))
            else:union.append((lo,hi))
        requested-=sum(hi-lo for lo,hi in union)
    duration = right - left
    l, r = np.maximum(left, a), np.minimum(right, b)
    valid = (r > l) & (duration > 0) & (duration <= float(max_gap_seconds)) & np.isfinite(first)
    if not rainfall:
        valid &= np.isfinite(last)
    else:
        valid &= first >= 0
    segments=[(l[valid],r[valid])]
    for exc in exclusions:
        es=pd.Timestamp(exc.start).value/1e9;ee=pd.Timestamp(exc.end).value/1e9
        fragments=[]
        for p,q in segments:
            before=np.minimum(q,es);after=np.maximum(p,ee)
            keep_before=before>p;keep_after=q>after
            if keep_before.any():fragments.append((p[keep_before],before[keep_before]))
            if keep_after.any():fragments.append((after[keep_after],q[keep_after]))
        segments=fragments
    seconds=np.concatenate([q-p for p,q in segments]) if segments else np.empty(0)
    support = float(seconds.sum())
    coverage = support / requested if requested > 0 else None
    result.update(valid_support_seconds=support, requested_seconds=requested,
                  coverage_fraction=coverage,
                  status="unavailable" if support <= 0 else "complete" if coverage is not None and coverage >= 1-1e-9 else "partial")
    if support > 0:
        integral=0.0
        for p,q in segments:
            # Each fragment was filtered independently; map its original interval
            # using the source support arrays retained alongside the fragment.
            indices=np.searchsorted(left,p,side="right")-1
            indices=np.clip(indices,0,len(left)-1)
            if rainfall:integral+=float((first[indices]*(q-p)).sum())
            else:
                slope=(last[indices]-first[indices])/duration[indices]
                vp=first[indices]+slope*(p-left[indices]);vq=first[indices]+slope*(q-left[indices])
                integral+=float(((vp+vq)*.5*(q-p)).sum())
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
    if oq == mq == "level":
        def datum(path, column):
            metadata=getattr(_load(path),"metadata",{}) or {}
            detail=(metadata.get("channels") or {}).get(column) or (metadata.get("series_metadata") or {}).get(column) or {}
            return detail.get("vertical_reference") or detail.get("datum") or metadata.get("vertical_reference") or metadata.get("datum")
        observed_datum,model_datum=datum(obs_path,obs_col),datum(model_path,model_col)
        if observed_datum and model_datum and str(observed_datum).lower()!=str(model_datum).lower():
            raise ValueError("Absolute Level comparison requires the same vertical datum; convert the sources before assessing calibration.")
    generic_numeric_comparison = oq is None or mq is None
    if oq is not None and mq is not None and oq != mq:
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
        "observed_quantity": "value" if generic_numeric_comparison else oq,
        "modelled_quantity": "value" if generic_numeric_comparison else mq,
        "source_observed_quantity": oq,
        "source_modelled_quantity": mq,
        "observed_unit": obs_contract.get("canonical_unit"),
        "modelled_unit": model_contract.get("canonical_unit"),
        "comparison_unit": (
            obs_contract.get("canonical_unit")
            if not generic_numeric_comparison
            and obs_contract.get("canonical_unit")
            and obs_contract.get("canonical_unit") == model_contract.get("canonical_unit")
            else None
        ),
        "generic_numeric_comparison": generic_numeric_comparison,
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
    parsed = _require_model_clock(_load(path), label=f"Series {column!r}")
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
    frame = parsed.frame.copy()
    values = pd.to_numeric(frame[column], errors="coerce").to_numpy(dtype=float)
    non_finite = ~np.isfinite(values)
    values[non_finite] = np.nan
    frame[column] = values * float(contract["scale_to_canonical"])
    contract = dict(contract)
    contract["non_finite_values"] = int(non_finite.sum())
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



def dwf_result(
    flow_path,
    flow_col,
    rain_path=None,
    rain_col="rainfall",
    dry_day_mm=1.0,
    baseline_days=28,
    min_dry_days=5,
    adp_hours=6.0,
    rainfall_semantics="intensity",
    flow_max_gap_seconds=None,
):
    flow_parsed = _require_model_clock(_load(flow_path), label="Observed flow")
    flow = flow_parsed.frame
    rain_parsed = _require_model_clock(_load(rain_path), label="Rainfall") if rain_path else None
    rain = rain_parsed.frame if rain_parsed is not None else None
    metadata = (getattr(rain_parsed, "metadata", {}) or {}) if rain_parsed is not None else {}
    interval = metadata.get("interval_min") if rain_parsed is not None else None
    result = dry_weather_flow(
        flow,
        flow_col,
        rain,
        rain_col,
        dry_day_mm=float(dry_day_mm),
        baseline_days=int(baseline_days),
        min_dry_days=int(min_dry_days),
        adp_hours=float(adp_hours),
        rain_semantics=rainfall_semantics,
        rain_interval_min=float(interval) if interval else None,
        rain_max_gap_seconds=_rain_support_gap_seconds(rain_parsed) if rain_parsed is not None else None,
        flow_max_gap_seconds=flow_max_gap_seconds,
    )
    return json.dumps(_jsonable(result), ensure_ascii=False)


def event_response_result(
    obs_path,
    obs_col,
    model_path,
    model_col,
    events_json,
    baseline_hours=3.0,
    post_hours=6.0,
    observed_exclusions_json="[]",
    model_exclusions_json="[]",
    max_gap_seconds=3600.0,
):
    events = json.loads(events_json) if isinstance(events_json, str) else events_json
    obs = _require_model_clock(_load(obs_path), label="Observed response").frame
    model = _require_model_clock(_load(model_path), label="Model response").frame
    rows = event_response_summary(
        obs,
        model,
        events,
        obs_col,
        model_col,
        float(baseline_hours),
        float(post_hours),
        observed_exclusions=_exclusions(observed_exclusions_json),
        model_exclusions=_exclusions(model_exclusions_json),
        max_gap_seconds=float(max_gap_seconds),
    )
    return json.dumps(_jsonable({"rows": rows}), ensure_ascii=False)

def spill_result(path, column, threshold, exclusions_json="[]", max_gap_seconds=900.0, start=None, end=None):
    frame = _require_model_clock(_load(path), label="Spill series").frame
    result = spill_assessment(frame, column, float(threshold), start=_model_clock_timestamp(start), end=_model_clock_timestamp(end), max_gap_seconds=float(max_gap_seconds), exclusions=_exclusions(exclusions_json))
    payload = dict(result)
    payload["counting_windows"] = _records(result.get("counting_windows"))
    payload["monthly_counts"] = _records(result.get("monthly_counts"))
    payload["monthly_durations"] = _records(result.get("monthly_durations"))
    payload["yearly_summary"] = _records(result.get("yearly_summary"))
    payload["monthly_summary"] = _records(result.get("monthly_summary"))
    payload["events"] = [_jsonable(e) for e in result.get("events", [])]
    return json.dumps(_jsonable(payload), ensure_ascii=False)


def network_spill_result(path, column, threshold, years_json="null", exclusions_json="[]", max_gap_seconds=900.0, comparison="ge"):
    """Isolated schematic reporting; never changes shared series or mappings."""
    from icm_workbench.analysis.network_spills import schematic_spill_assessment
    parsed = _require_model_clock(_load(path), label="Network spill series")
    result = schematic_spill_assessment(parsed.frame, column, threshold,
        years=json.loads(years_json), max_gap_seconds=max_gap_seconds, comparison=comparison,
        exclusions=_exclusions(exclusions_json))
    return json.dumps(_jsonable(result), ensure_ascii=False)


def review_spill_events(path, column, events, max_gap_s=900.0, exclusions_json="[]", flow=None, rainfall=None):
    """Review already detected physical intervals with independently supported evidence."""
    from icm_workbench.analysis.spill_inquiry import register_events

    def source(spec, expected):
        source_path, channel = spec["path"], spec["column"]
        parsed = _require_model_clock(_load(source_path), expected)
        contract = _series_contract(source_path, channel)
        quantity, unit = contract["quantity"], contract["canonical_unit"]
        if channel not in parsed.frame or channel == "timestamp":
            raise ValueError(f"Select an available {expected.lower()} channel.")
        trailing_support = None
        convention = parsed.metadata.get("timestamp_convention")
        if expected == "Threshold source" and quantity not in {"level", "depth"}:
            raise ValueError("The event basis must be an eligible depth or level channel.")
        if expected == "Spill flow" and (quantity != "flow" or unit != "m³/s"):
            raise ValueError("Supply an eligible spill-flow channel with a resolved flow unit.")
        if expected != "Rainfall" and convention != "instantaneous":
            raise ValueError(f"{expected} requires instantaneous values on the project clock.")
        if expected == "Rainfall":
            meaning = spec.get("semantics") or parsed.metadata.get("rainfall_semantics")
            if quantity != "rainfall" or (meaning, unit) not in {("intensity", "mm/h"), ("incremental_depth", "mm")}:
                raise ValueError("Resolve the rainfall quantity, unit and support before linking it.")
            convention = "interval_average" if meaning == "intensity" else "interval_depth"
            interval = parsed.metadata.get("interval_min")
            trailing_support = float(interval) * 60 if interval is not None else None
        if expected != "Threshold source" and any(parsed.audit.get(key, 0) for key in ("invalid_timestamps", "duplicate_timestamps", "malformed_rows")):
            raise ValueError(f"Resolve invalid or duplicate rows in the selected {expected.lower()} record.")
        frame, _ = _prepared_series(source_path, channel)
        values = frame[channel].to_numpy(dtype=float)
        if convention == "interval_average":
            values = values / 3600
        return {"times": pd.DatetimeIndex(frame.timestamp).as_unit("ns"), "values": values,
                "convention": convention, "trailing_support": trailing_support,
                "exclusions": _exclusions(spec.get("exclusions"))}

    basis = source({"path": path, "column": column, "exclusions": exclusions_json}, "Threshold source")
    result = register_events(events, basis, float(max_gap_s), flow_source=source(flow, "Spill flow") if flow else None,
                             rain_source=source(rainfall, "Rainfall") if rainfall else None)
    return json.dumps({"method": "physical-spill-register-v1", "rows": result}, allow_nan=False)


def network_common_spill_result(path, column, threshold, start, end, exclusions_json="[]", max_gap_seconds=900.0, comparison="ge"):
    """Explicit common-period review; preserve source warm-up and shared mappings."""
    from icm_workbench.analysis.network_spills import common_period_assessment
    parsed = _require_model_clock(_load(path), label="Network spill series")
    result = common_period_assessment(parsed.frame, column, threshold, start, end,
        max_gap_seconds=max_gap_seconds, comparison=comparison, exclusions=_exclusions(exclusions_json))
    return json.dumps(_jsonable(result), ensure_ascii=False)


def compare_spill_scenarios(assets, start, end, baseline_name, max_gap_s):
    """Compare reviewed asset-specific model sources against an explicit common baseline window."""
    from icm_workbench.analysis.spill_scenarios import evaluate_scenario, reporting_windows, scenario_delta

    def name(value, label):
        if not isinstance(value, str) or not value.strip() or len(value) > 128:
            raise ValueError(f"Enter a {label} within 128 characters.")
        return value.strip()

    if not isinstance(assets, list) or not 1 <= len(assets) <= 8:
        raise ValueError("Review between one and eight assets in a comparison.")
    gap = float(max_gap_s)
    if not np.isfinite(gap) or gap < .001:
        raise ValueError("Enter a finite positive maximum source gap.")
    if not start or not end:
        raise ValueError("Enter both explicit comparison limits on the project clock.")
    windows = list(reporting_windows(start, end))
    baseline_name = name(baseline_name, "common baseline name")

    def read_series(spec, expected, datum=None):
        path, column = spec["path"], spec["column"]
        parsed = _require_model_clock(_load(path), "Scenario source")
        if column not in parsed.frame or column == "timestamp":
            raise ValueError("Choose an available scenario channel.")
        if parsed.metadata.get("timestamp_convention") != "instantaneous" or any(
                parsed.audit.get(key, 0) for key in ("invalid_timestamps", "duplicate_timestamps", "malformed_rows")):
            raise ValueError("Resolve invalid or duplicate rows and use instantaneous model-clock samples.")
        contract = _series_contract(path, column)
        value = (contract["quantity"], contract["canonical_unit"])
        allowed = {("level", "m"), ("depth", "m")} if expected == "threshold" else {("flow", "m³/s")}
        if value not in allowed:
            raise ValueError("Use resolved level or depth in metres, or confirmed discharge flow in m³/s.")
        if value[0] == "level":
            reviewed = name(datum, "reviewed common vertical datum")
            detail = parsed.metadata.get("series_metadata", {}).get(column, {})
            declared = detail.get("datum") or detail.get("vertical_reference") or parsed.metadata.get("datum")
            if declared and str(declared).strip().casefold() != reviewed.casefold():
                raise ValueError("The reviewed vertical datum differs from a declared source datum.")
        frame, _ = _prepared_series(path, column)
        exclusions = _exclusions(spec.get("exclusions"))
        return frame, column, value[0], exclusions

    def simulation(spec, datum):
        frame, column, quantity, exclusions = read_series(spec, "threshold", datum)
        flow = None
        if spec.get("flow") is not None:
            if spec.get("flow_confirmed") is not True:
                raise ValueError("Confirm that each flow channel measures discharge for that asset and scenario.")
            flow_frame, flow_column, _, flow_exclusions = read_series(spec["flow"], "flow")
            flow = {"times": pd.DatetimeIndex(flow_frame.timestamp).as_unit("ns"), "values": flow_frame[flow_column].to_numpy(dtype=float),
                    "convention": "instantaneous", "exclusions": flow_exclusions}
        return {"frame": frame, "column": column, "quantity": quantity, "exclusions": exclusions, "flow": flow}

    rows, seen = [], set()
    for group in assets:
        asset = name(group.get("id"), "reviewed asset identity")
        if asset.casefold() in seen:
            raise ValueError("Use each reviewed asset identity once.")
        seen.add(asset.casefold())
        proposed = group.get("proposed")
        if not isinstance(proposed, list) or not 1 <= len(proposed) <= 8:
            raise ValueError("Choose one to eight proposed scenarios for each asset.")
        threshold = float(group["threshold_m"])
        if not np.isfinite(threshold):
            raise ValueError("Enter a finite reviewed threshold in metres.")
        original = group["baseline"]
        baseline = simulation(original, group.get("datum"))
        scenario_names = {baseline_name.casefold()}
        used = {(original["path"], original["column"])}
        candidates = []
        for spec in proposed:
            label = name(spec.get("name"), "proposed scenario name")
            key = spec["path"], spec["column"]
            if label.casefold() in scenario_names or key in used:
                raise ValueError("Use unique scenario names and distinct threshold channels per asset.")
            scenario_names.add(label.casefold())
            used.add(key)
            item = simulation(spec, group.get("datum"))
            if item["quantity"] != baseline["quantity"]:
                raise ValueError("Use a common depth or level quantity for the asset and all scenarios.")
            candidates.append((label, item))
        if baseline["quantity"] == "depth" and threshold < 0:
            raise ValueError("The depth threshold must be non-negative.")
        for left, right in windows:
            reference = evaluate_scenario(baseline, threshold, left, right, gap)
            for label, item in candidates:
                candidate = evaluate_scenario(item, threshold, left, right, gap)
                rows.append({"asset": asset, "baseline_name": baseline_name, "proposed_name": label,
                             "threshold_m": threshold, "quantity": baseline["quantity"], "datum": group.get("datum"),
                             "baseline": reference, "proposed": candidate, "delta": scenario_delta(reference, candidate)})
    return json.dumps({"method": "reviewed-common-period-spill-scenarios-v1", "rows": rows}, allow_nan=False)


def _storage_threshold_m(threshold,contract,threshold_unit=None):
    unit=threshold_unit or contract["original_unit"] or contract["canonical_unit"]
    resolved,factor=canonical_unit(contract["quantity"],unit)
    if resolved!="m" or factor is None:
        raise ValueError("Storage threshold requires a resolved m or mm unit.")
    value=float(threshold)*float(factor)
    if not np.isfinite(value):raise ValueError("Storage threshold must be finite.")
    return value


def storage_result(level_path, level_col, flow_path, flow_col, threshold, exclusions_json="[]", target_count=10, max_gap_seconds=900.0, start=None, end=None, level_unit_override=None, flow_unit_override=None, threshold_unit=None):
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
    threshold_m=_storage_threshold_m(threshold,level_contract,threshold_unit)
    target=float(target_count)
    if not np.isfinite(target) or target<0 or target!=int(target):
        raise ValueError("Target count must be a non-negative integer.")
    physical=detect_spill_intervals(
        level,level_col,threshold_m,
        start=_model_clock_timestamp(start),
        end=_model_clock_timestamp(end),
        max_gap_seconds=float(max_gap_seconds),
        exclusions=exc,
    )
    blocks=spill_block_volumes(physical["events"],flow,flow_col,max_gap_seconds=float(max_gap_seconds),exclusions=exc)
    screening=idealised_storage_screening(blocks,target_count=int(target))
    level_complete=physical.get("status")=="complete" and physical.get("excluded_seconds",0)<=1e-9
    if not level_complete and not screening.empty:
        screening=screening.copy()
        screening["required_storage_m3"]=None
        screening["max_block_volume_m3"]=None
        screening["annual_block_volume_m3"]=None
        screening["remaining_spill_count"]=None
        screening["status"]="partial" if physical.get("valid_seconds",0)>0 else "unavailable"
        screening["reason"]="Required storage withheld because the assessment period includes excluded or unsupported level data; retained discharge volumes do not establish a whole-period spill target."
    screen_statuses=set(screening["status"]) if not screening.empty and "status" in screening else set()
    overall="complete" if level_complete and (not screen_statuses or screen_statuses=={"complete"}) else (
        "partial" if physical.get("valid_seconds",0)>0 else "unavailable"
    )
    calendar=calendar_spill_volumes(physical["events"],flow,flow_col,max_gap_seconds=float(max_gap_seconds),exclusions=exc)
    for row in calendar:
        if not level_complete or row["status"]!="complete":
            row["volume_m3_partial"]=row["volume_m3"]
            row["volume_m3"]=None
            row["status"]="partial"
    payload={
        "method":"whole-episode capture; reset between episodes; legacy 12/24 compatibility counts",
        "volume_year_basis":"Episode volumes follow episode attribution; calendar volumes split physical discharge at 1 January.",
        "calendar_volumes":calendar,
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


def circular_pipe_capacity(diameter_m, gradient, roughness_m, viscosity_m2_s):
    """Expose the standalone full-bore calculator to the local worker."""
    from icm_workbench.analysis.pipe_capacity import full_pipe_capacity

    return json.dumps(full_pipe_capacity(diameter_m, gradient, roughness_m, viscosity_m2_s))


def circular_pipe_design_flow(diameter_m, gradient, roughness_m, viscosity_m2_s, discharge_m3_s):
    """Expose turbulent normal-depth assessment to the local worker."""
    from icm_workbench.analysis.pipe_capacity import normal_depth_assessment

    return json.dumps(normal_depth_assessment(diameter_m, gradient, roughness_m, viscosity_m2_s, discharge_m3_s))


def circular_manning_capacity(mode, n, viscosity_m2_s, diameter_m=None, gradient=None, depth_fraction=None, discharge_m3_s=None):
    from icm_workbench.analysis.manning_pipe import circular_manning_screen

    return json.dumps(circular_manning_screen(mode, n, viscosity_m2_s, diameter_m, gradient, depth_fraction, discharge_m3_s),
                      allow_nan=False)


def circular_darcy_sizing(mode, roughness_m, viscosity_m2_s, discharge_m3_s, diameter_m=None, gradient=None):
    from icm_workbench.analysis.darcy_sizing import circular_darcy_requirement

    result = circular_darcy_requirement(mode, roughness_m, viscosity_m2_s, discharge_m3_s, diameter_m, gradient)
    return json.dumps(result, allow_nan=False)


def verification_event_comparison(obs_path, obs_col, model_path, model_col, start, end,
                                  max_gap_seconds=900.0, offset_minutes=0, exclusions_json="[]", *, window_only=False):
    """Compare one selected wet-weather event using supported hydraulic channels."""
    from icm_workbench.analysis.verification_events import compare_event_support

    oq, mq = _comparison_quantity(obs_path, obs_col), _comparison_quantity(model_path, model_col)
    observed, model = _series_contract(obs_path, obs_col), _series_contract(model_path, model_col)
    unit = observed.get("canonical_unit")
    if oq not in {"flow", "depth"} or oq != mq or not unit or unit != model.get("canonical_unit"):
        raise ValueError("Event Review requires matching flow or depth quantities with known matching units.")
    obs_source = _require_model_clock(_load(obs_path), "Observed source")
    model_source = _require_model_clock(_load(model_path), "Modelled source")
    if any(source.metadata.get("timestamp_convention") != "instantaneous" for source in (obs_source, model_source)):
        raise ValueError("Event Review requires instantaneous hydraulic data.")
    obs, mod = obs_source.frame, model_source.frame
    offset = pd.to_timedelta(offset_minutes, unit="m")
    if window_only:
        def bounded(source, first, last):
            if any(source.audit.get(key, 0) for key in ("invalid_timestamps", "malformed_rows", "duplicate_timestamps")):
                raise ValueError("Resolve malformed or repeated source timestamps before using the matrix.")
            times = pd.DatetimeIndex(source.frame["timestamp"])
            if times.hasnans or times.has_duplicates or not times.is_monotonic_increasing:
                raise ValueError("The matrix needs unique, ordered source timestamps.")
            left = max(0, int(times.searchsorted(first, side="right")) - 1)
            right = min(len(times), int(times.searchsorted(last, side="left")) + 1)
            return source.frame.iloc[left:right]

        obs = bounded(obs_source, start, end)
        mod = bounded(model_source, start - offset, end - offset)
    if offset_minutes:
        mod = mod.assign(timestamp=pd.to_datetime(mod["timestamp"]) + offset)
    result = compare_event_support(obs, mod, obs_col, model_col, start, end,
                                   max_gap_seconds, _exclusions(exclusions_json))
    result["unit"] = unit
    result["observed_volume_m3"] = result.pop("observed_integral") if oq == "flow" and unit in {"m³/s", "m3/s"} else None
    result["modelled_volume_m3"] = result.pop("modelled_integral") if oq == "flow" and unit in {"m³/s", "m3/s"} else None
    result.pop("observed_integral", None)
    result.pop("modelled_integral", None)
    return json.dumps(_jsonable(result))


def verification_matrix_event(observed, scenario, event, criteria, max_gap_seconds, offset_minutes=0, exclusions=None):
    """Assess one matrix cell using the current native Event Review engine."""
    from icm_workbench.analysis.verification_matrix import verification_event_criteria

    quan = _comparison_quantity(observed["path"], observed["column"])
    first, last = _model_clock_timestamp(event["start"]), _model_clock_timestamp(event["end"])
    if first is None or last is None or pd.isna(first) or pd.isna(last) or first >= last:
        raise ValueError("Choose a current qualifying event with valid project-clock bounds.")
    if not np.isfinite(offset_minutes):
        raise ValueError("The scenario clock shift must be finite.")
    values = json.loads(verification_event_comparison(observed["path"], observed["column"], scenario["path"],
                        scenario["column"], first, last, max_gap_seconds, offset_minutes, exclusions, window_only=True))
    result = verification_event_criteria(values, quan, criteria)
    result.update(quantity=quan, values=values)
    return json.dumps(result, allow_nan=False)


def validate_verification_snapshot(snapshot):
    from icm_workbench.analysis.verification_revisions import verification_snapshot_summary

    return json.dumps(verification_snapshot_summary(snapshot), allow_nan=False)


def verification_revision_delta(baseline, candidate):
    from icm_workbench.analysis.verification_revisions import compare_verification_revisions

    return json.dumps(compare_verification_revisions(baseline, candidate), allow_nan=False)


def verification_calibration_diagnostics(observed, scenario, event, criteria, settings,
                                         max_gap_seconds, offset_minutes=0, exclusions=None,
                                         preceding=None, recovery=None, rainfall=None, depth=None):
    """Inspect native storm, preceding and recovery evidence without altering verification."""
    from icm_workbench.analysis.series_transform import integrate_periods
    from icm_workbench.analysis.verification_diagnostics import investigate_calibration

    def bounds(period):
        start, end = (_model_clock_timestamp(period[key]) for key in ("start", "end"))
        if start is None or end is None or pd.isna(start) or pd.isna(end) or end <= start:
            raise ValueError("Review each increasing analysis window on the common project clock.")
        return start, end

    def compare(before, after, window, applied):
        start, end = bounds(window)
        return json.loads(verification_event_comparison(before["path"], before["column"], after["path"], after["column"],
                                                        start, end, max_gap_seconds, offset_minutes, applied, window_only=True))

    if _comparison_quantity(observed["path"], observed["column"]) != "flow":
        raise ValueError("Calibration investigation requires an observed and modelled flow pairing.")
    first, last = bounds(event)
    dry = recovery_result = rain = depth_result = None
    if preceding:
        start, end = bounds(preceding)
        if end > first:
            raise ValueError("The preceding period must end by the start of the selected storm.")
        if not rainfall or rainfall.get("confirmed") is not True:
            raise ValueError("Confirm the appropriate rainfall source and review preceding conditions.")
        dry = compare(observed, scenario, preceding, exclusions)
        prepared = _reviewed_rainfall_channel(rainfall, start, end)
        duration = (end - start).value / 1e9
        total, covered = integrate_periods(prepared["times"], prepared["samples"], np.array([0.0, duration]),
                                           convention=prepared["convention"], maximum_gap=max_gap_seconds,
                                           trailing_support=prepared["trailing"], exclusions=prepared["exclusions"])
        rain = {"depth_mm": float(total[0]) if covered[0] > 0 else None,
                "valid_seconds": float(covered[0]), "requested_seconds": duration}
    if recovery:
        start, _ = bounds(recovery)
        if start < last:
            raise ValueError("The recovery period must start at or after the selected storm ends.")
        recovery_result = compare(observed, scenario, recovery, exclusions)
    if depth:
        if not depth.get("confirmed") or any(_comparison_quantity(depth[role]["path"], depth[role]["column"]) != "depth"
                                              for role in ("observed", "scenario")):
            raise ValueError("Confirm both depth records refer to the flow monitor's section and invert reference.")
        depth_result = compare(depth["observed"], depth["scenario"], event, depth.get("exclusions"))
    storm = json.loads(verification_matrix_event(observed, scenario, event, criteria, max_gap_seconds, offset_minutes, exclusions))
    result = investigate_calibration(storm, settings=settings, dry=dry, rainfall=rain, recovery=recovery_result, depth=depth_result)
    result["support"] = {"storm": storm["values"], "preceding": dry, "recovery": recovery_result, "depth": depth_result}
    return json.dumps(result, allow_nan=False)


def england_continuation_flow(catchments):
    """Review explicit England catchment allowances in the local worker."""
    from icm_workbench.analysis.design_flows import england_continuation_flow as calculate

    return json.dumps(calculate(catchments), allow_nan=False)


def scotland_continuation_flow(catchments, applicability):
    """Apply the documented SEPA low-significance continuation-flow method."""
    from icm_workbench.analysis.design_flows import scotland_continuation_flow as calculate

    return json.dumps(calculate(catchments, applicability), allow_nan=False)


def scotland_treatment_design_flows(inputs):
    """Calculate DWF and FFT with the distinct SEPA infiltration allowances."""
    from icm_workbench.analysis.design_flows import scotland_treatment_design_flows as calculate

    return json.dumps(calculate(**inputs), allow_nan=False)


def pipe_system_curve(stages, static_head_m, flow_m3_s, curve_max_m3_s, friction_method="fixed", viscosity_m2_s=None):
    """Evaluate full-pipe resistance with specified or calculated Darcy factors."""
    from icm_workbench.analysis.pumping import system_curve

    return json.dumps(system_curve(stages, static_head_m, flow_m3_s, curve_max_m3_s, friction_method=friction_method,
                                   viscosity_m2_s=viscosity_m2_s), allow_nan=False)


def pump_system_duty(stages, static_head_m, points, arrangement, pump_count, density_kg_m3, efficiency=None):
    """Intersect the measured pump curve with the idealised pipe system."""
    from icm_workbench.analysis.pumping import pump_duty

    return json.dumps(pump_duty(stages, static_head_m, points, arrangement, pump_count, density_kg_m3, efficiency),
                      allow_nan=False)


def preview_design_catchments(text):
    """Validate a local catchment table for explicit Formula A mappings."""
    from icm_workbench.analysis.design_flows import preview_catchment_csv

    return json.dumps(preview_catchment_csv(text), allow_nan=False)


def screen_storage_routing(path, column, capacities_m3, initial_m3, release_m3_s,
                           max_gap_s, start=None, end=None, exclusions_json="[]"):
    """Route the actual samples of a reviewed, resolved instantaneous inflow."""
    from icm_workbench.analysis.storage_routing import route_storage

    parsed = _require_model_clock(_load(path), "Inflow")
    if parsed.metadata.get("timestamp_convention") != "instantaneous":
        raise ValueError("Routing requires instantaneous inflow samples with a resolved project clock.")
    contract = _series_contract(path, column)
    if column not in parsed.frame or contract["quantity"] != "flow" or contract["canonical_unit"] != "m³/s":
        raise ValueError("Choose an inflow series with a resolved flow unit in Data / time series.")
    if any(parsed.audit.get(key, 0) for key in ("invalid_timestamps", "malformed_rows", "duplicate_timestamps")):
        raise ValueError("Resolve malformed rows and repeated or invalid timestamps in the source before routing.")
    times = pd.to_datetime(parsed.frame["timestamp"], errors="coerce")
    if times.empty or times.isna().any() or not times.is_monotonic_increasing or times.duplicated().any():
        raise ValueError("Routing requires valid, unique timestamps in chronological order.")
    first = _model_clock_timestamp(start) if start else times.iloc[0]
    last = _model_clock_timestamp(end) if end else times.iloc[-1]
    if pd.isna(first) or pd.isna(last) or first >= last:
        raise ValueError("Choose an increasing period on the source's project clock.")
    left, right = int(times.searchsorted(first)), int(times.searchsorted(last, side="right"))
    selected = times.iloc[left:right]
    if len(selected) < 2 or selected.iloc[0] != first or selected.iloc[-1] != last:
        raise ValueError("Start and end must match actual samples. Leave blank to use source endpoints.")
    if len(selected) > 250_000:
        raise ValueError("Select a smaller review period. This screening operation supports up to 250,000 samples per run.")
    applicable = sorted(
        (item for item in _exclusions(exclusions_json) if item.start < last and item.end > first),
        key=lambda item: item.start,
    )
    # Use the first intersecting interval. If it includes any excluded time,
    # the full interval is unsupported even when both endpoint samples exist.
    blocked = int(selected.searchsorted(max(first, applicable[0].start), side="right")) if applicable else None
    elapsed = (selected - first).dt.total_seconds().to_numpy()
    rates = pd.to_numeric(parsed.frame[column].iloc[left:right], errors="coerce").to_numpy(dtype=float)
    result = route_storage(elapsed, rates, capacities_m3, initial_m3, release_m3_s, max_gap_s, blocked)
    result["assessed_through"] = selected.iloc[result.pop("last_sample")].isoformat()
    result.update(window_start=first.isoformat(), window_end=last.isoformat(), sample_count=len(selected),
                  max_gap_s=max_gap_s, original_unit=contract["original_unit"], canonical_unit="m³/s")
    return json.dumps(result, allow_nan=False)


def inspect_local_series(path, column, criteria, start=None, end=None,
                         reference_path=None, reference_column=None, search_steps=None):
    """Inspect local source rows without deduplicating or transforming them."""
    from icm_workbench.analysis.series_quality import clock_candidates, inspect_series

    source = _require_model_clock(_load(path), "Diagnostic source")
    if source.metadata.get("timestamp_convention") != "instantaneous":
        raise ValueError("This diagnostic requires instantaneous source samples on the project clock.")
    contract = _series_contract(path, column)
    if column not in source.frame or column == "timestamp":
        raise ValueError("Select an available source series.")
    thresholds = any(criteria.get(key) is not None for key in ("lower", "upper", "change_limit", "flat_amplitude"))
    if thresholds and not contract["canonical_unit"]:
        raise ValueError("Confirm source quantity and units in Data / time series before applying value thresholds.")
    start = _model_clock_timestamp(start)
    end = _model_clock_timestamp(end)
    if (start is not None and pd.isna(start)) or (end is not None and pd.isna(end)) or (start is not None and end is not None and start >= end):
        raise ValueError("Choose an increasing review period on the project clock.")

    def select(parsed):
        frame=parsed.frame
        if start is not None:
            frame=frame[frame.timestamp>=start]
        if end is not None:
            frame=frame[frame.timestamp<=end]
        if len(frame)>250_000:
            raise ValueError("Choose a smaller review period. Diagnostics support up to 250,000 samples per series per run.")
        return frame

    frame=select(source)
    allowed={"expected_step_s","jitter_s","flat_amplitude","flat_seconds","change_limit","lower","upper"}
    if any(key not in allowed for key in criteria):
        raise ValueError("Unsupported diagnostic setting.")
    result=inspect_series(frame,column,**criteria,rejected_time_rows=source.audit.get("invalid_timestamps",0))
    result["source_contract"]=contract
    result["clock"]=None
    if reference_path is not None:
        ref=_require_model_clock(_load(reference_path), "Reference series")
        other_contract=_series_contract(reference_path,reference_column)
        if (reference_column not in ref.frame or ref.metadata.get("timestamp_convention")!="instantaneous" or
                not contract["canonical_unit"] or other_contract["canonical_unit"]!=contract["canonical_unit"] or
                not contract["quantity"] or other_contract["quantity"]!=contract["quantity"] or
                (path==reference_path and column==reference_column)):
            raise ValueError("Use a different instantaneous record of the same measured quantity with matching resolved units.")
        result["clock"]=clock_candidates(frame,select(ref),column,reference_column,criteria["expected_step_s"],search_steps)
    return json.dumps(_jsonable(result), allow_nan=False)


def review_monitor_channels(path, depth_column, velocity_column, settings, flow_column=None,
                            start=None, end=None, exclusions_json="[]"):
    """Review concurrent channels without changing independent quality or survey results."""
    from icm_workbench.analysis.survey_monitor_diagnostics import monitor_diagnostics

    parsed = _require_model_clock(_load(path), "Monitor source")
    if parsed.metadata.get("timestamp_convention") != "instantaneous" or any(
            parsed.audit.get(key, 0) for key in ("invalid_timestamps", "duplicate_timestamps", "malformed_rows")):
        raise ValueError("Resolve invalid or repeated timestamps before using concurrent monitor checks.")
    roles = [(depth_column, "depth", "m"), (velocity_column, "velocity", "m/s")]
    if flow_column is not None:
        roles.append((flow_column, "flow", "m³/s"))
    for name, quantity, unit in roles:
        contract = _series_contract(path, name)
        if name not in parsed.frame or (contract["quantity"], contract["canonical_unit"]) != (quantity, unit):
            raise ValueError("Select concurrent depth, velocity and optional flow with resolved canonical units.")
    frame = parsed.frame[["timestamp", *[name for name, *_ in roles]]]
    a, b = _model_clock_timestamp(start), _model_clock_timestamp(end)
    if (a is not None and pd.isna(a)) or (b is not None and pd.isna(b)) or (a is not None and b is not None and a >= b):
        raise ValueError("Enter an increasing review period on the project clock.")
    if a is not None:
        frame = frame[frame.timestamp >= a]
    if b is not None:
        frame = frame[frame.timestamp <= b]
    result = monitor_diagnostics(frame, depth_column, velocity_column, flow_column, settings=settings,
                                 exclusions=_exclusions(exclusions_json))
    return json.dumps(result, allow_nan=False)


def _relative_clock_seconds(origin, nanoseconds):
    origin_s, origin_ns = divmod(origin.value, 10**9)
    divide = np.divmod if isinstance(nanoseconds, np.ndarray) else divmod
    seconds, fraction = divide(nanoseconds, 10**9)
    return seconds - origin_s + (fraction - origin_ns) / 1e9


def _reviewed_rainfall_channel(source, first, last):
    from icm_workbench.analysis.series_transform import MAX_SOURCE_SAMPLES

    path, column = source["path"], source["column"]
    parsed = _require_model_clock(_load(path), "Rainfall source")
    if any(parsed.audit.get(key, 0) for key in ("invalid_timestamps", "malformed_rows", "duplicate_timestamps")):
        raise ValueError("Resolve invalid or repeated rainfall source timestamps before comparing.")
    contract = _series_contract(path, column)
    semantics = source.get("rainfall_semantics") or parsed.metadata.get("rainfall_semantics")
    convention = {("intensity", "mm/h"): "interval_average", ("incremental_depth", "mm"): "interval_depth"}.get(
        (semantics, contract["canonical_unit"]))
    if contract["quantity"] != "rainfall" or column not in parsed.frame or convention is None:
        raise ValueError("Resolve rainfall quantities, units and interval semantics in Data / time series.")
    times = pd.DatetimeIndex(parsed.frame["timestamp"]).as_unit("ns")
    if not len(times) or times.hasnans or not times.is_monotonic_increasing or times.has_duplicates:
        raise ValueError("Choose rainfall sources with valid, unique timestamps in order.")
    left = max(0, int(times.searchsorted(first, side="right")) - 1)
    right = min(len(times), int(times.searchsorted(last, side="left")) + 1)
    if right - left > MAX_SOURCE_SAMPLES:
        raise ValueError("Use a shorter window. This review supports up to 500,000 samples per gauge.")
    # Give trailing declared support only to an actual final source sample.
    interval = parsed.metadata.get("interval_min")
    trailing = float(interval) * 60 if interval is not None and right == len(times) else None
    values = pd.to_numeric(parsed.frame[column].iloc[left:right], errors="coerce").to_numpy(dtype=float)
    blocked = tuple((_relative_clock_seconds(first, pd.Timestamp(item.start).value),
                     _relative_clock_seconds(first, pd.Timestamp(item.end).value))
                    for item in _exclusions(source.get("exclusions")))
    return {"times": _relative_clock_seconds(first, times[left:right].asi8),
            "samples": values / 3600 if convention == "interval_average" else values,
            "trailing": trailing, "convention": convention, "exclusions": blocked}


def compare_local_rain_gauges(sources, start, end, interval_s, max_gap_s, suspect_rate_mm_h=None):
    """Compare resolved rainfall sources independently of qualification criteria."""
    from icm_workbench.analysis.rainfall_spatial import compare_rainfall

    first, last = _model_clock_timestamp(start), _model_clock_timestamp(end)
    if first is None or last is None or pd.isna(first) or pd.isna(last) or first >= last:
        raise ValueError("Choose an increasing review period on the shared project clock.")
    seen, gauges = set(), []
    if not 2 <= len(sources) <= 8:
        raise ValueError("Select two to eight distinct rainfall channels.")
    for source in sources:
        path, column = source["path"], source["column"]
        if (path, column) in seen:
            raise ValueError("Choose distinct rainfall channels.")
        seen.add((path, column))
        gauges.append(_reviewed_rainfall_channel(source, first, last))
    result = compare_rainfall(gauges, duration=(last - first).value / 1e9, interval=float(interval_s),
                              maximum_gap=float(max_gap_s), suspect_rate=suspect_rate_mm_h)
    result["timestamps"] = [stamp.isoformat() for stamp in first + pd.to_timedelta(result.pop("endpoints_seconds"), unit="s")]
    return json.dumps(result, allow_nan=False)


def transform_local_series(source, interval_s, max_gap_s, operation="single", reference=None,
                           output="mean", unit=None, start=None, end=None, datum=None):
    """Derive supported interval statistics from resolved, untouched source rows."""
    from icm_workbench.analysis.series_transform import MAX_SOURCE_SAMPLES, integrate_periods, period_boundaries

    if operation not in {"single", "add", "subtract"} or (operation == "single") != (reference is None):
        raise ValueError("Select one source, or two compatible sources for addition or subtraction.")
    if output not in {"mean", "total"}:
        raise ValueError("Select an interval mean or supported accumulated total.")

    def load(spec):
        path, column = spec["path"], spec["column"]
        parsed = _require_model_clock(_load(path), "Transformation source")
        if column not in parsed.frame or column == "timestamp":
            raise ValueError("Select an available numeric source series.")
        if len(parsed.frame) > MAX_SOURCE_SAMPLES:
            raise ValueError("This operation supports up to 500,000 samples from each source.")
        if any(parsed.audit.get(key, 0) for key in ("invalid_timestamps", "malformed_rows", "duplicate_timestamps")):
            raise ValueError("Resolve invalid or duplicate source rows before transforming.")
        contract = _series_contract(path, column)
        quantity, canonical = contract["quantity"], contract["canonical_unit"]
        convention = parsed.metadata.get("timestamp_convention")
        if quantity == "rainfall":
            semantics = spec.get("rainfall_semantics") or parsed.metadata.get("rainfall_semantics")
            conventions = {("intensity", "mm/h"): "interval_average", ("incremental_depth", "mm"): "interval_depth"}
            convention = conventions.get((semantics, canonical))
            if not convention:
                raise ValueError("Resolve the rainfall unit and interval semantics in Time series.")
        elif (quantity, canonical) not in {("flow", "m³/s"), ("depth", "m"), ("level", "m"), ("velocity", "m/s")} or convention != "instantaneous":
            raise ValueError("Use a resolved flow, depth, level, velocity or rainfall channel with supported temporal semantics.")
        shift = float(spec.get("shift_s", 0))
        if not np.isfinite(shift):
            raise ValueError("Time shifts must be finite.")
        offset = pd.to_timedelta(shift, unit="s")
        times = pd.DatetimeIndex(parsed.frame["timestamp"]).as_unit("ns") + offset
        if not len(times) or times.hasnans or not times.is_monotonic_increasing or times.has_duplicates:
            raise ValueError("Use valid and unique source timestamps on the project clock.")
        samples = pd.to_numeric(parsed.frame[column], errors="coerce").to_numpy(dtype=float)
        if convention == "interval_average":  # Canonical tank/gauge unit is mm/h.
            samples = samples / 3600
        trailing = parsed.metadata.get("interval_min") if convention != "instantaneous" else None
        support = float(trailing) * 60 if trailing is not None else None
        if support is not None and (not np.isfinite(support) or support <= 0):
            raise ValueError("Invalid declared source interval.")
        last = times[-1] + pd.to_timedelta(support, unit="s") if support is not None else times[-1]
        exclusions = _exclusions(spec.get("exclusions", ()))
        return times, samples, last, support, convention, contract, exclusions, offset

    first = load(source)
    inputs = [first] if reference is None else [first, load(reference)]
    quantity = first[5]["quantity"]
    if any(record[5]["quantity"] != quantity for record in inputs):
        raise ValueError("Select the same resolved quantity for both operands.")
    if operation == "add" and quantity not in {"flow", "rainfall"}:
        raise ValueError("Addition is supported for compatible flow and rainfall signals.")
    if quantity == "level" and operation == "subtract" and not datum:
        raise ValueError("Confirm a common vertical datum to calculate a level difference.")
    if output == "total" and quantity not in {"flow", "rainfall"}:
        raise ValueError("Only flow volume and accumulated rainfall have supported totals.")
    default_unit = ({"flow": "m³", "rainfall": "mm"}[quantity] if output == "total"
                    else "mm/h" if quantity == "rainfall" else first[5]["canonical_unit"])
    unit = unit or default_unit
    display_scale = 1.0
    if output == "total":
        if quantity == "flow" and unit == "L":
            display_scale = 1000.0
        elif unit != default_unit:
            raise ValueError("Choose compatible units for the requested total.")
    else:
        canonical, scale = canonical_unit(quantity, unit)
        if canonical != default_unit or scale is None:
            raise ValueError("The output unit is incompatible with this quantity and temporal support.")
        display_scale = (3600.0 if quantity == "rainfall" else 1.0) / scale

    origin = _model_clock_timestamp(start) if start else max(record[0][0] for record in inputs)
    last = _model_clock_timestamp(end) if end else min(record[2] for record in inputs)
    if pd.isna(origin) or pd.isna(last):
        raise ValueError("Choose valid transformation limits on the project clock.")
    edges = period_boundaries((last - origin).value / 1e9, float(interval_s))
    totals, coverage = [], []
    metadata = []
    for times, samples, _, trailing, convention, contract, exclusions, offset in inputs:
        blocked = tuple((_relative_clock_seconds(origin, (pd.Timestamp(item.start) + offset).value),
                         _relative_clock_seconds(origin, (pd.Timestamp(item.end) + offset).value)) for item in exclusions)
        total, covered = integrate_periods(_relative_clock_seconds(origin, times.asi8), samples, edges, convention=convention,
                                           maximum_gap=float(max_gap_s), trailing_support=trailing, exclusions=blocked)
        totals.append(total)
        coverage.append(covered)
        metadata.append({"contract": contract, "convention": convention, "shift_s": offset.value / 1e9,
                         "source_samples": len(samples), "exclusions": len(exclusions)})
    widths = np.diff(edges)
    complete = np.logical_and.reduce([np.isclose(valid, widths, rtol=1e-12, atol=1e-8) for valid in coverage])
    derived = totals[0] if reference is None else (totals[0] + totals[1] if operation == "add" else totals[0] - totals[1])
    values = derived * display_scale if output == "total" else derived / widths * display_scale
    if not np.isfinite(values[complete]).all():
        raise ValueError("The derived value exceeds the finite supported range.")
    stamps = origin + pd.to_timedelta(edges, unit="s")
    rows = [[stamps[i].isoformat(), stamps[i + 1].isoformat(), float(values[i]) if good else None,
             *[float(valid[i]) for valid in coverage]] for i, good in enumerate(complete)]
    return json.dumps({"method": "temporal-support-grid-v1", "quantity": quantity, "operation": operation,
                       "output": output, "unit": unit, "datum": datum, "interval_s": interval_s,
                       "max_gap_s": max_gap_s, "complete_periods": int(complete.sum()),
                       "inputs": metadata, "rows": rows}, allow_nan=False)


def hydraulic_structure(inputs):
    """Evaluate the documented steady structure screen in the local worker."""
    from icm_workbench.analysis.structures import screen_structure

    return json.dumps(screen_structure(**inputs), allow_nan=False)


def hydraulic_control_rating(points, head_difference_m, reversible=False):
    """Evaluate a supplied passive head-difference rating curve."""
    from icm_workbench.analysis.structures import screen_rating_curve

    return json.dumps(screen_rating_curve(points, head_difference_m, reversible), allow_nan=False)
