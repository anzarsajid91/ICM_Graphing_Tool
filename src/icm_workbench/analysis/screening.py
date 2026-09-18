from __future__ import annotations
import pandas as pd
from .integration import integrate_series
from .spills import apply_12_24_counting


def spill_block_volumes(events, flow: pd.DataFrame, flow_col: str, *, max_gap_seconds=900.0, exclusions=()):
    """Integrate every physical discharge and retain support/completeness status."""
    counting=apply_12_24_counting(events)
    columns=["year","counting_block","start","end","volume_m3","physical_discharges","requested_seconds","valid_seconds","gap_seconds","excluded_seconds","uncovered_seconds","status"]
    if counting.empty:return pd.DataFrame(columns=columns)
    per=[]
    for _,row in counting.iterrows():
        start,stop=pd.Timestamp(row.spill_start),pd.Timestamp(row.spill_stop)
        requested=max(0.0,float((stop-start).total_seconds()))
        integ=integrate_series(flow,flow_col,start,stop,semantics="instantaneous",max_gap_seconds=max_gap_seconds,exclusions=exclusions,positive_only=True)
        represented=float(integ["valid_seconds"])+float(integ["gap_seconds"])+float(integ["excluded_seconds"])
        uncovered=max(0.0,requested-represented)
        complete=(
            requested>0
            and float(integ["gap_seconds"])<=1e-9
            and float(integ["excluded_seconds"])<=1e-9
            and uncovered<=1e-9
            and float(integ["valid_seconds"])>=requested-1e-9
        )
        per.append({
            "block":int(row.spill_event),
            "year":int(row.year_start),
            "start":start,
            "end":stop,
            "volume":float(integ["integral"]),
            "requested_seconds":requested,
            "valid_seconds":float(integ["valid_seconds"]),
            "gap_seconds":float(integ["gap_seconds"]),
            "excluded_seconds":float(integ["excluded_seconds"]),
            "uncovered_seconds":uncovered,
            "status":"complete" if complete else ("partial" if float(integ["valid_seconds"])>0 else "unavailable"),
        })
    df=pd.DataFrame(per); rows=[]
    for (year,block),g in df.groupby(["year","block"]):
        statuses=set(g.status)
        status="complete" if statuses=={"complete"} else ("partial" if (g.valid_seconds.sum()>0) else "unavailable")
        rows.append({
            "year":int(year),
            "counting_block":int(block),
            "start":g.start.min(),
            "end":g.end.max(),
            "volume_m3":float(g.volume.sum()) if status!="unavailable" else None,
            "physical_discharges":int(len(g)),
            "requested_seconds":float(g.requested_seconds.sum()),
            "valid_seconds":float(g.valid_seconds.sum()),
            "gap_seconds":float(g.gap_seconds.sum()),
            "excluded_seconds":float(g.excluded_seconds.sum()),
            "uncovered_seconds":float(g.uncovered_seconds.sum()),
            "status":status,
        })
    return pd.DataFrame(rows,columns=columns)


def idealised_storage_screening(blocks: pd.DataFrame,target_count=10):
    """Idealised storage screening; headline volume is withheld for partial support."""
    if target_count<0:raise ValueError("target_count must be >= 0")
    columns=["year","physical_blocks","target_count","required_storage_m3","max_block_volume_m3","annual_block_volume_m3","status","reason","coverage_fraction"]
    if blocks is None or blocks.empty:return pd.DataFrame(columns=columns)
    rows=[]
    for year,g in blocks.groupby("year"):
        requested=float(g.get("requested_seconds",pd.Series(dtype=float)).sum())
        valid=float(g.get("valid_seconds",pd.Series(dtype=float)).sum())
        complete=bool(len(g)) and ("status" not in g.columns or bool((g.status=="complete").all()))
        volumes=[float(v) for v in g.volume_m3.dropna()] if "volume_m3" in g else []
        if not complete:
            rows.append({
                "year":int(year),
                "physical_blocks":int(len(g)),
                "target_count":int(target_count),
                "required_storage_m3":None,
                "max_block_volume_m3":None,
                "annual_block_volume_m3":None,
                "status":"partial" if valid>0 else "unavailable",
                "reason":"Required storage withheld because one or more spill-volume blocks have incomplete, excluded, or unsupported flow coverage.",
                "coverage_fraction":valid/requested if requested>0 else None,
            })
            continue
        volumes=sorted(volumes,reverse=True)
        required=volumes[target_count] if len(volumes)>target_count else 0.0
        rows.append({
            "year":int(year),
            "physical_blocks":len(volumes),
            "target_count":int(target_count),
            "required_storage_m3":float(required),
            "max_block_volume_m3":max(volumes) if volumes else 0.0,
            "annual_block_volume_m3":float(sum(volumes)),
            "status":"complete",
            "reason":"Complete flow support for all assessed physical discharge blocks.",
            "coverage_fraction":1.0,
        })
    return pd.DataFrame(rows,columns=columns)
