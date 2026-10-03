from __future__ import annotations

import numpy as np
import pandas as pd

from icm_workbench.analysis.alignment import time_coverage
from icm_workbench.analysis.exclusions import normalise_exclusions
from icm_workbench.analysis.rainfall import daily_rainfall_support


def rating_curve_fit(depth, flow, diameter_m=None):
    """Fit a data-derived Q=a*H**b relationship on positive finite pairs.

    When a reliable pipe diameter is supplied, retain the same data-fitted
    physical Q-H curve but also expose the dimensionless H/D form and the
    free-surface/surcharged sample split. Diameter alone is deliberately not used
    to manufacture a theoretical capacity curve because slope/roughness are not
    available from fm_rg_assoc.
    """
    d = pd.to_numeric(depth, errors="coerce")
    q = pd.to_numeric(flow, errors="coerce")
    mask = (
        np.isfinite(d.to_numpy(dtype=float))
        & np.isfinite(q.to_numpy(dtype=float))
        & (d.to_numpy(dtype=float) > 0)
        & (q.to_numpy(dtype=float) > 0)
    )
    d = d[mask].astype(float)
    q = q[mask].astype(float)
    base = {
        "method": "log10-least-squares-power-law",
        "equation_form": "Q = a H^b",
        "rating_mode": "data-fitted-generic",
        "depth_unit": "m",
        "flow_unit": "m³/s",
        "source_resolution": "authoritative paired source data; display downsampling not used",
    }
    if len(d) < 5:
        return {
            **base,
            "ok": False,
            "n": int(len(d)),
            "message": "At least 5 positive valid depth-flow pairs are required.",
        }
    depth_span = float(d.max() - d.min())
    flow_span = float(q.max() - q.min())
    depth_scale = max(1.0, float(np.nanmax(np.abs(d.to_numpy()))))
    flow_scale = max(1.0, float(np.nanmax(np.abs(q.to_numpy()))))
    if d.nunique(dropna=True) < 3 or depth_span <= np.finfo(float).eps * depth_scale * 100:
        return {
            **base,
            "ok": False,
            "n": int(len(d)),
            "message": "Insufficient depth variation for a defensible fitted rating relationship.",
            "depth_min": float(d.min()),
            "depth_max": float(d.max()),
        }
    if q.nunique(dropna=True) < 3 or flow_span <= np.finfo(float).eps * flow_scale * 100:
        return {
            **base,
            "ok": False,
            "n": int(len(d)),
            "message": "Insufficient flow variation for a defensible fitted rating relationship.",
            "depth_min": float(d.min()),
            "depth_max": float(d.max()),
            "flow_min": float(q.min()),
            "flow_max": float(q.max()),
        }
    x = np.log10(d.to_numpy())
    y = np.log10(q.to_numpy())
    b, loga = np.polyfit(x, y, 1)
    pred = loga + b * x
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else np.nan
    a = float(10 ** loga)
    result = {
        **base,
        "ok": True,
        "n": int(len(d)),
        "a": a,
        "b": float(b),
        "r2": r2,
        "depth_min": float(d.min()),
        "depth_max": float(d.max()),
        "flow_min": float(q.min()),
        "flow_max": float(q.max()),
    }
    try:
        diameter = float(diameter_m) if diameter_m is not None else None
    except (TypeError, ValueError):
        diameter = None
    if diameter is not None and np.isfinite(diameter) and diameter > 0:
        hd = d / diameter
        result.update(
            {
                "rating_mode": "diameter-informed-data-fit",
                "diameter_m": float(diameter),
                "diameter_mm": float(diameter * 1000.0),
                "normalised_equation_form": "Q = k (H/D)^b",
                "k_at_h_over_d_1": float(a * diameter ** float(b)),
                "h_over_d_min": float(hd.min()),
                "h_over_d_max": float(hd.max()),
                "free_surface_pairs": int((d < diameter).sum()),
                "surcharged_pairs": int((d >= diameter).sum()),
                "diameter_method_note": (
                    "Diameter contextualises the empirical fit through H/D and the "
                    "crown-depth split; it is not a theoretical Manning capacity curve."
                ),
            }
        )
    return result

def _longest_flatline_minutes(values, timestamps, tolerance):
    vals=pd.to_numeric(values,errors="coerce").to_numpy(dtype=float)
    ts=pd.to_datetime(timestamps,errors="coerce")
    longest=0.0;run_start=None
    for i in range(1,len(vals)):
        contiguous=pd.notna(ts.iloc[i-1]) and pd.notna(ts.iloc[i])
        same=np.isfinite(vals[i-1]) and np.isfinite(vals[i]) and abs(vals[i]-vals[i-1])<=float(tolerance)
        if contiguous and same:
            if run_start is None:run_start=i-1
            longest=max(longest,float((ts.iloc[i]-ts.iloc[run_start]).total_seconds()/60.0))
        else:run_start=None
    return longest


def _channel_contract(name):
    key=str(name).lower()
    if "velocity" in key or key in {"vel","v"}:return {"range":(0.0,10.0),"tolerance":1e-3,"zero_eps":0.05}
    if "depth" in key or "level" in key:return {"range":(0.0,10.0),"tolerance":1e-4,"zero_eps":0.01}
    if "flow" in key or "discharge" in key:return {"range":(0.0,None),"tolerance":1e-6,"zero_eps":0.005}
    return {"range":(None,None),"tolerance":1e-9,"zero_eps":1e-9}


def weekly_data_assessment(df,max_gap_seconds=900.0):
    """Weekly flow-survey QA with explicit, reviewable sensor-screening evidence.

    Thresholds mirror the proven FDV assessment scripts: coverage and gaps remain
    primary, while out-of-range, inactive/zero response and 6 h/48 h flatlines
    raise amber/red review flags. These are observations, not declarations that a
    logger is faulty.
    """
    if df is None or getattr(df,"empty",True) or "timestamp" not in df.columns:return pd.DataFrame()
    x=df.copy(); x["timestamp"]=pd.to_datetime(x["timestamp"],errors="coerce"); x=x.dropna(subset=["timestamp"]).sort_values("timestamp")
    channels=[c for c in x.columns if c!="timestamp" and pd.to_numeric(x[c],errors="coerce").notna().any()]
    if not channels:return pd.DataFrame()
    dt=x.timestamp.diff().dt.total_seconds(); positive=dt[dt>0]; median=float(positive.median()) if len(positive) else np.nan
    rows=[]
    for week,g in x.groupby(pd.Grouper(key="timestamp",freq="W-SUN",label="right",closed="right")):
        if g.empty:continue
        for col in channels:
            vals=pd.to_numeric(g[col],errors="coerce"); valid=pd.Series(np.isfinite(vals.to_numpy(dtype=float)),index=vals.index); gaps=pd.to_datetime(g.timestamp).diff().dt.total_seconds(); gap_count=int((gaps>float(max_gap_seconds)).sum())
            if np.isfinite(median) and median>0 and len(g)>1:
                span=max((g.timestamp.max()-g.timestamp.min()).total_seconds(),median); expected=max(1,int(round(span/median))+1); coverage=min(100.0,100.0*int(valid.sum())/expected)
            else: coverage=100.0*float(valid.mean()) if len(valid) else 0.0
            contract=_channel_contract(col);lo,hi=contract["range"]
            out_of_range=pd.Series(False,index=vals.index)
            if lo is not None:out_of_range|=vals<lo
            if hi is not None:out_of_range|=vals>hi
            out_count=int(out_of_range.fillna(False).sum())
            finite=vals[valid]
            zero_fraction=float((finite.abs()<=contract["zero_eps"]).mean()) if len(finite) else np.nan
            flatline_min=_longest_flatline_minutes(vals.reset_index(drop=True),g.timestamp.reset_index(drop=True),contract["tolerance"])
            notes=[];severity=0
            if coverage<60:notes.append("low coverage")
            elif coverage<90:notes.append("partial coverage")
            if gap_count:notes.append(f"{gap_count} gap(s) > {float(max_gap_seconds)/60:g} min")
            if coverage<60:severity=max(severity,2)
            elif coverage<90 or gap_count:severity=max(severity,1)
            if out_count:notes.append(f"{out_count} value(s) outside screening range");severity=max(severity,2)
            if np.isfinite(zero_fraction) and zero_fraction>=.95:notes.append(f"inactive/near-zero for {zero_fraction*100:.1f}% of valid samples");severity=max(severity,2)
            if flatline_min>=2880:notes.append(f"severe flatline {flatline_min/60:.1f} h");severity=max(severity,2)
            elif flatline_min>=360:notes.append(f"flatline {flatline_min/60:.1f} h");severity=max(severity,1)
            rag=("Green","Amber","Red")[severity]
            rows.append({"week_ending":pd.Timestamp(week),"channel":str(col),"rows":int(len(g)),"valid_values":int(valid.sum()),"coverage_percent":float(coverage),"minimum":float(vals.min()) if valid.any() else np.nan,"maximum":float(vals.max()) if valid.any() else np.nan,"mean":float(vals.mean()) if valid.any() else np.nan,"zero_percent":float(zero_fraction*100) if np.isfinite(zero_fraction) else np.nan,"flatline_minutes":float(flatline_min),"out_of_range_count":out_count,"large_gap_count":gap_count,"rag":rag,"comment":"; ".join(notes) if notes else "No major weekly completeness, range or response issue detected."})
    return pd.DataFrame(rows)



def dry_weather_flow(
    flow_df,
    flow_col,
    rainfall_df=None,
    rain_col="rainfall",
    dry_day_mm=1.0,
    baseline_days=28,
    min_dry_days=5,
    adp_hours=6.0,
    rain_semantics="intensity",
    rain_interval_min=None,
    rain_max_gap_seconds=None,
    flow_max_gap_seconds=None,
):
    """Validity-aware screening DWF baseline.

    A day is eligible only when both rainfall support and observed-flow support
    are defensible for the civil/model-clock day. Missing rainfall is never dry,
    and a sparse flow sample cannot manufacture a complete DWF baseline.
    """
    if flow_df is None or getattr(flow_df, "empty", True) or flow_col not in flow_df.columns:
        return {"available": "No", "reason": "Observed flow unavailable.", "calculation_status": "unavailable"}

    f = flow_df[["timestamp", flow_col]].copy()
    f["timestamp"] = pd.to_datetime(f["timestamp"], errors="coerce")
    f[flow_col] = pd.to_numeric(f[flow_col], errors="coerce")
    f = f.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    if f.empty:
        return {"available": "No", "reason": "No valid observed flow timestamps.", "calculation_status": "unavailable"}

    diffs = f["timestamp"].diff().dt.total_seconds()
    positive = diffs[diffs > 0]
    step_seconds = float(positive.median()) if len(positive) else np.nan
    if flow_max_gap_seconds is None:
        # Flow-survey series are expected to be sub-hourly/hourly. Cap inferred
        # support so one point per day cannot be interpreted as continuous flow.
        flow_gap = min(step_seconds * 1.5, 7200.0) if np.isfinite(step_seconds) else 7200.0
    else:
        flow_gap = float(flow_max_gap_seconds)
    if not np.isfinite(flow_gap) or flow_gap <= 0:
        raise ValueError("flow_max_gap_seconds must be positive")
    f["day"] = f["timestamp"].dt.floor("D")

    if rainfall_df is None or getattr(rainfall_df, "empty", True) or rain_col not in rainfall_df.columns:
        return {
            "available": "Unavailable",
            "reason": "Rainfall unavailable; dry-weather days cannot be established.",
            "average_dwf": None,
            "dry_days_used": 0,
            "calculation_status": "unavailable",
            "candidate_days": [],
        }

    daily = daily_rainfall_support(
        rainfall_df,
        rain_col,
        semantics=rain_semantics,
        declared_interval_minutes=rain_interval_min,
        max_gap_seconds=rain_max_gap_seconds,
    )
    if daily.empty:
        return {
            "available": "Unavailable",
            "reason": "Rainfall contains no assessable support; dry-weather days cannot be established.",
            "average_dwf": None,
            "dry_days_used": 0,
            "calculation_status": "unavailable",
            "candidate_days": [],
        }

    daily_by_day = {pd.Timestamp(row.day): row for row in daily.itertuples(index=False)}
    last_day = f["day"].max()
    cutoff = last_day - pd.Timedelta(days=int(baseline_days))
    candidate_days = []
    chosen = []
    daily_min = []

    for day in sorted(pd.unique(f.loc[(f["day"] >= cutoff) & (f["day"] <= last_day), "day"])):
        day = pd.Timestamp(day)
        rain_row = daily_by_day.get(day)
        if rain_row is None:
            candidate_days.append({
                "day": day,
                "status": "unknown",
                "reason": "No rainfall support for day.",
                "rainfall_depth_mm": None,
                "rainfall_coverage_fraction": 0.0,
                "flow_coverage_fraction": 0.0,
                "flow_status": "unavailable",
            })
            continue

        rain_coverage = float(rain_row.coverage_fraction or 0.0)
        rain_depth = float(rain_row.depth_mm)
        if rain_row.status != "complete" or rain_coverage < 0.999999:
            candidate_days.append({
                "day": day,
                "status": "unknown",
                "reason": "Rainfall support is incomplete.",
                "rainfall_depth_mm": rain_depth,
                "rainfall_coverage_fraction": rain_coverage,
                "flow_coverage_fraction": None,
                "flow_status": "not-assessed",
            })
            continue
        if rain_depth > float(dry_day_mm):
            candidate_days.append({
                "day": day,
                "status": "wet",
                "reason": "Rainfall depth exceeds dry-day threshold.",
                "rainfall_depth_mm": rain_depth,
                "rainfall_coverage_fraction": rain_coverage,
                "flow_coverage_fraction": None,
                "flow_status": "not-assessed",
            })
            continue

        day_end = day + pd.Timedelta(days=1)
        flow_support = time_coverage(
            f,
            flow_col,
            day,
            day_end,
            max_gap_seconds=flow_gap,
        )
        flow_coverage = flow_support.get("coverage_fraction")
        if flow_support.get("status") != "complete" or flow_coverage is None or flow_coverage < 0.999999:
            candidate_days.append({
                "day": day,
                "status": "insufficient-flow",
                "reason": "Dry rainfall day rejected because observed-flow support is incomplete.",
                "rainfall_depth_mm": rain_depth,
                "rainfall_coverage_fraction": rain_coverage,
                "flow_coverage_fraction": flow_coverage,
                "flow_status": flow_support.get("status", "unavailable"),
            })
            continue

        g = f[(f["timestamp"] >= day) & (f["timestamp"] < day_end)].copy()
        values = pd.to_numeric(g[flow_col], errors="coerce")
        finite = np.isfinite(values.to_numpy(dtype=float))
        g = g.loc[finite].copy()
        if g.empty:
            candidate_days.append({
                "day": day,
                "status": "insufficient-flow",
                "reason": "Dry rainfall day contains no finite observed-flow values.",
                "rainfall_depth_mm": rain_depth,
                "rainfall_coverage_fraction": rain_coverage,
                "flow_coverage_fraction": flow_coverage,
                "flow_status": "unavailable",
            })
            continue

        effective_step_minutes = step_seconds / 60.0 if np.isfinite(step_seconds) else np.nan
        if not np.isfinite(effective_step_minutes) or effective_step_minutes <= 0:
            continue
        window = max(1, int(round(float(adp_hours) * 60.0 / effective_step_minutes)))
        rolling = pd.to_numeric(g[flow_col], errors="coerce").rolling(
            window=window, min_periods=window
        ).mean()
        if not rolling.notna().any():
            candidate_days.append({
                "day": day,
                "status": "insufficient-flow",
                "reason": "Dry rainfall day lacks a complete ADP rolling window.",
                "rainfall_depth_mm": rain_depth,
                "rainfall_coverage_fraction": rain_coverage,
                "flow_coverage_fraction": flow_coverage,
                "flow_status": "complete",
            })
            continue

        chosen.append(day)
        daily_min.append(float(rolling.min()))
        candidate_days.append({
            "day": day,
            "status": "dry",
            "reason": "Complete rainfall and flow support; ADP window available.",
            "rainfall_depth_mm": rain_depth,
            "rainfall_coverage_fraction": rain_coverage,
            "flow_coverage_fraction": flow_coverage,
            "flow_status": "complete",
        })

    value = float(np.nanmean(daily_min)) if daily_min else np.nan
    enough = len(chosen) >= int(min_dry_days)
    return {
        "available": "Yes" if enough else "Low confidence",
        "average_dwf": value if np.isfinite(value) else None,
        "dry_days_used": int(len(chosen)),
        "dry_day_threshold_mm": float(dry_day_mm),
        "baseline_days": int(baseline_days),
        "minimum_dry_days": int(min_dry_days),
        "adp_hours": float(adp_hours),
        "flow_max_gap_seconds": float(flow_gap),
        "calculation_status": "complete" if enough and np.isfinite(value) else ("partial" if chosen else "unavailable"),
        "rainfall_semantics": rain_semantics,
        "rainfall_interval_min": None if rain_interval_min is None else float(rain_interval_min),
        "candidate_days": candidate_days,
    }


def event_response_summary(
    observed,
    modelled,
    events,
    obs_col,
    model_col,
    baseline_hours=3.0,
    post_hours=6.0,
    observed_exclusions=(),
    model_exclusions=(),
    max_gap_seconds=3600.0,
    minimum_requested_coverage_fraction=0.80,
):
    """Per-event response evidence with role-specific validity accounting."""

    def _mask_rows(frame, column, exclusions):
        x = frame[["timestamp", column]].copy()
        x["timestamp"] = pd.to_datetime(x["timestamp"], errors="coerce")
        x[column] = pd.to_numeric(x[column], errors="coerce")
        finite = np.isfinite(x[column].to_numpy(dtype=float))
        x = x.loc[x["timestamp"].notna() & finite].sort_values("timestamp")
        for exc in normalise_exclusions(exclusions):
            mask = (x["timestamp"] >= pd.Timestamp(exc.start)) & (x["timestamp"] < pd.Timestamp(exc.end))
            x = x.loc[~mask]
        return x

    def _window_status(frame, column, start, end, exclusions):
        support = time_coverage(
            frame,
            column,
            start,
            end,
            max_gap_seconds=float(max_gap_seconds),
            exclusions=exclusions,
        )
        requested_coverage = support.get("validity", {}).get("requested_coverage_fraction")
        sufficient = (
            support.get("status") == "complete"
            and requested_coverage is not None
            and float(requested_coverage) >= float(minimum_requested_coverage_fraction)
        )
        return support, sufficient

    rows = []
    if not events:
        return rows

    for event in events:
        start = pd.Timestamp(event["start"])
        end = pd.Timestamp(event["end"])
        b0 = start - pd.Timedelta(hours=float(baseline_hours))
        r1 = end + pd.Timedelta(hours=float(post_hours))

        def stats(df, col, exclusions):
            base_support, base_ok = _window_status(df, col, b0, start, exclusions)
            response_support, response_ok = _window_status(df, col, start, r1, exclusions)
            x = _mask_rows(df, col, exclusions)
            base = x[(x["timestamp"] >= b0) & (x["timestamp"] < start)]
            resp = x[(x["timestamp"] >= start) & (x["timestamp"] <= r1)]
            if not base_ok or not response_ok or base.empty or resp.empty:
                return {
                    "available": False,
                    "baseline_support": base_support,
                    "response_support": response_support,
                    "reason": "Baseline or response support is incomplete after gaps/exclusions.",
                }
            baseline = float(base[col].median())
            idx = resp[col].idxmax()
            peak = float(resp.loc[idx, col])
            return {
                "available": True,
                "baseline": baseline,
                "peak": peak,
                "uplift": peak - baseline,
                "peak_time": pd.Timestamp(resp.loc[idx, "timestamp"]),
                "baseline_support": base_support,
                "response_support": response_support,
            }

        o = stats(observed, obs_col, observed_exclusions)
        m = stats(modelled, model_col, model_exclusions)
        row = {
            "event": event.get("event"),
            "rain_start": start,
            "rain_end": end,
            "rain_depth_mm": event.get("total_depth_mm"),
            "observed_baseline": o.get("baseline", np.nan),
            "observed_uplift": o.get("uplift", np.nan),
            "modelled_uplift": m.get("uplift", np.nan),
            "uplift_error_percent": np.nan,
            "peak_lag_minutes": np.nan,
            "observed_baseline_coverage": o.get("baseline_support", {}).get("validity"),
            "observed_response_coverage": o.get("response_support", {}).get("validity"),
            "model_baseline_coverage": m.get("baseline_support", {}).get("validity"),
            "model_response_coverage": m.get("response_support", {}).get("validity"),
            "calculation_status": "complete" if o.get("available") and m.get("available") else "partial",
        }
        if o.get("available") and m.get("available") and abs(o["uplift"]) > 1e-12:
            row["uplift_error_percent"] = float((m["uplift"] - o["uplift"]) / o["uplift"] * 100.0)
        if o.get("available") and m.get("available"):
            row["peak_lag_minutes"] = float((m["peak_time"] - o["peak_time"]).total_seconds() / 60.0)
        rows.append(row)
    return rows

