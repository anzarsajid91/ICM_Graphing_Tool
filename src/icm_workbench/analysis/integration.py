from __future__ import annotations

import pandas as pd
from icm_workbench.analysis.exclusions import normalise_exclusions
from icm_workbench.domain import ExclusionPeriod


def _linear(v0, v1, f):
    return v0 + (v1 - v0) * f


def _subtract(a, b, exclusions):
    pieces = [(pd.Timestamp(a), pd.Timestamp(b))]
    for exc in normalise_exclusions(exclusions):
        es, ee = pd.Timestamp(exc.start), pd.Timestamp(exc.end)
        nxt = []
        for p, q in pieces:
            if ee <= p or es >= q:
                nxt.append((p, q)); continue
            if es > p: nxt.append((p, min(es, q)))
            if ee < q: nxt.append((max(ee, p), q))
        pieces = [(p, q) for p, q in nxt if q > p]
    return pieces


def _positive_linear(va, vb, seconds):
    if va <= 0 and vb <= 0: return 0.0
    if va >= 0 and vb >= 0: return (va + vb) * 0.5 * seconds
    frac = abs(va) / (abs(va) + abs(vb))
    return 0.5 * vb * seconds * (1 - frac) if va < 0 else 0.5 * va * seconds * frac


def integrate_series(df: pd.DataFrame, value_col: str, start, end, *, semantics="instantaneous",
                     max_gap_seconds=900.0, exclusions=(), positive_only=False) -> dict:
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    if e <= s: raise ValueError("end must be after start")
    x = df[["timestamp", value_col]].copy()
    x["timestamp"] = pd.to_datetime(x.timestamp, errors="coerce")
    x[value_col] = pd.to_numeric(x[value_col], errors="coerce")
    x = x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    total = valid_seconds = excluded_seconds = gap_seconds = 0.0
    segments = []
    for i in range(len(x)-1):
        t0, t1 = pd.Timestamp(x.iloc[i].timestamp), pd.Timestamp(x.iloc[i+1].timestamp)
        v0, v1 = x.iloc[i][value_col], x.iloc[i+1][value_col]
        dt = (t1-t0).total_seconds()
        if dt <= 0: continue
        a, b = max(t0,s), min(t1,e)
        if b <= a: continue
        support = (b-a).total_seconds()
        if dt > max_gap_seconds or pd.isna(v0) or (semantics == "instantaneous" and pd.isna(v1)):
            gap_seconds += support; continue
        pieces = _subtract(a,b,exclusions)
        use = sum((q-p).total_seconds() for p,q in pieces)
        exc = support-use; excluded_seconds += exc
        segment_total = 0.0
        for p,q in pieces:
            seconds = (q-p).total_seconds()
            if semantics == "interval_average":
                val = max(float(v0),0.0) if positive_only else float(v0)
                contrib = val*seconds
            elif semantics == "instantaneous":
                fp, fq = (p-t0).total_seconds()/dt, (q-t0).total_seconds()/dt
                vp, vq = _linear(float(v0),float(v1),fp), _linear(float(v0),float(v1),fq)
                contrib = _positive_linear(vp,vq,seconds) if positive_only else (vp+vq)*0.5*seconds
            else:
                raise ValueError(f"Unsupported semantics: {semantics}")
            total += contrib; segment_total += contrib; valid_seconds += seconds
        segments.append({"start":a,"end":b,"support_seconds":support,"excluded_seconds":exc,"contribution":segment_total})
    return {"integral":float(total),"valid_seconds":float(valid_seconds),"excluded_seconds":float(excluded_seconds),
            "gap_seconds":float(gap_seconds),"segments":segments,"semantics":semantics}


def split_interval_by_month(start,end):
    s,e = pd.Timestamp(start),pd.Timestamp(end); out=[]; cursor=s
    while cursor<e:
        stop=min(e,(cursor.to_period("M")+1).start_time); out.append((cursor,stop)); cursor=stop
    return out
