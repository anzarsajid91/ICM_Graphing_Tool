from __future__ import annotations

import numpy as np
import pandas as pd

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
    mask = d.notna() & q.notna() & (d > 0) & (q > 0)
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
            vals=pd.to_numeric(g[col],errors="coerce"); valid=vals.notna(); gaps=pd.to_datetime(g.timestamp).diff().dt.total_seconds(); gap_count=int((gaps>float(max_gap_seconds)).sum())
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
):
    """Validity-aware screening DWF baseline.

    A day is eligible only when rainfall support is complete for that civil/model
    clock day. Missing or uncovered rainfall is unknown, never dry.
    """
    if flow_df is None or getattr(flow_df,"empty",True) or flow_col not in flow_df.columns:
        return {"available":"No","reason":"Observed flow unavailable.","calculation_status":"unavailable"}
    f=flow_df[["timestamp",flow_col]].copy()
    f["timestamp"]=pd.to_datetime(f.timestamp,errors="coerce")
    f[flow_col]=pd.to_numeric(f[flow_col],errors="coerce")
    f=f.dropna(subset=["timestamp",flow_col]).sort_values("timestamp")
    if f.empty:
        return {"available":"No","reason":"No valid observed flow.","calculation_status":"unavailable"}

    d=f.timestamp.diff().dt.total_seconds().div(60)
    d=d[d>0]
    step=float(d.median()) if len(d) else np.nan
    f["day"]=f.timestamp.dt.floor("D")

    if rainfall_df is None or getattr(rainfall_df,"empty",True) or rain_col not in rainfall_df.columns:
        return {
            "available":"Unavailable",
            "reason":"Rainfall unavailable; dry-weather days cannot be established.",
            "average_dwf":None,
            "dry_days_used":0,
            "calculation_status":"unavailable",
            "candidate_days":[],
        }

    daily=daily_rainfall_support(
        rainfall_df,
        rain_col,
        semantics=rain_semantics,
        declared_interval_minutes=rain_interval_min,
        max_gap_seconds=rain_max_gap_seconds,
    )
    if daily.empty:
        return {
            "available":"Unavailable",
            "reason":"Rainfall contains no assessable support; dry-weather days cannot be established.",
            "average_dwf":None,
            "dry_days_used":0,
            "calculation_status":"unavailable",
            "candidate_days":[],
        }

    daily_by_day={pd.Timestamp(row.day):row for row in daily.itertuples(index=False)}
    last_day=f["day"].max()
    cutoff=last_day-pd.Timedelta(days=int(baseline_days))
    candidate_days=[]
    chosen=[]
    for day in sorted(pd.unique(f.loc[(f["day"]>=cutoff)&(f["day"]<=last_day),"day"])):
        day=pd.Timestamp(day)
        row=daily_by_day.get(day)
        if row is None:
            candidate_days.append({"day":day,"status":"unknown","reason":"No rainfall support for day.","rainfall_depth_mm":None,"rainfall_coverage_fraction":0.0})
            continue
        coverage=float(row.coverage_fraction)
        depth=float(row.depth_mm)
        if row.status!="complete" or coverage<0.999999:
            candidate_days.append({"day":day,"status":"unknown","reason":"Rainfall support is incomplete.","rainfall_depth_mm":depth,"rainfall_coverage_fraction":coverage})
            continue
        if depth<=float(dry_day_mm):
            chosen.append(day)
            candidate_days.append({"day":day,"status":"dry","reason":"Complete rainfall support and depth at/below threshold.","rainfall_depth_mm":depth,"rainfall_coverage_fraction":coverage})
        else:
            candidate_days.append({"day":day,"status":"wet","reason":"Rainfall depth exceeds dry-day threshold.","rainfall_depth_mm":depth,"rainfall_coverage_fraction":coverage})

    use=f[f.day.isin(chosen)].copy()
    daily_min=[]
    if np.isfinite(step) and step>0:
        window=max(1,int(round(float(adp_hours)*60.0/step)))
        for _,g in use.groupby("day"):
            s=pd.to_numeric(g[flow_col],errors="coerce").rolling(window=window,min_periods=max(1,window//2)).mean()
            if s.notna().any():daily_min.append(float(s.min()))
    value=float(np.nanmean(daily_min)) if daily_min else (float(use[flow_col].mean()) if not use.empty else np.nan)
    enough=len(chosen)>=int(min_dry_days)
    return {
        "available":"Yes" if enough else "Low confidence",
        "average_dwf":value if np.isfinite(value) else None,
        "dry_days_used":int(len(chosen)),
        "dry_day_threshold_mm":float(dry_day_mm),
        "baseline_days":int(baseline_days),
        "minimum_dry_days":int(min_dry_days),
        "adp_hours":float(adp_hours),
        "calculation_status":"complete" if enough else "partial",
        "rainfall_semantics":rain_semantics,
        "rainfall_interval_min":None if rain_interval_min is None else float(rain_interval_min),
        "candidate_days":candidate_days,
    }

def event_response_summary(observed,modelled,events,obs_col,model_col,baseline_hours=3.0,post_hours=6.0):
    """Per-rainfall-event peak uplift and timing comparison without assigning a subjective pass/fail score."""
    rows=[]
    if not events:return rows
    for event in events:
        start=pd.Timestamp(event["start"]); end=pd.Timestamp(event["end"]); b0=start-pd.Timedelta(hours=float(baseline_hours)); r1=end+pd.Timedelta(hours=float(post_hours))
        def stats(df,col):
            x=df[["timestamp",col]].copy(); x["timestamp"]=pd.to_datetime(x.timestamp,errors="coerce"); x[col]=pd.to_numeric(x[col],errors="coerce"); x=x.dropna().sort_values("timestamp")
            base=x[(x.timestamp>=b0)&(x.timestamp<start)][col]; resp=x[(x.timestamp>=start)&(x.timestamp<=r1)]
            if resp.empty:return None
            baseline=float(base.median()) if not base.empty else float(resp[col].quantile(.10)); idx=resp[col].idxmax(); peak=float(resp.loc[idx,col]); return {"baseline":baseline,"peak":peak,"uplift":peak-baseline,"peak_time":pd.Timestamp(resp.loc[idx,"timestamp"])}
        o=stats(observed,obs_col); m=stats(modelled,model_col)
        row={"event":event.get("event"),"rain_start":start,"rain_end":end,"rain_depth_mm":event.get("total_depth_mm"),"observed_baseline":o["baseline"] if o else np.nan,"observed_uplift":o["uplift"] if o else np.nan,"modelled_uplift":m["uplift"] if m else np.nan,"uplift_error_percent":np.nan,"peak_lag_minutes":np.nan}
        if o and m and abs(o["uplift"])>1e-12:row["uplift_error_percent"]=float((m["uplift"]-o["uplift"])/o["uplift"]*100.0)
        if o and m:row["peak_lag_minutes"]=float((m["peak_time"]-o["peak_time"]).total_seconds()/60.0)
        rows.append(row)
    return rows
