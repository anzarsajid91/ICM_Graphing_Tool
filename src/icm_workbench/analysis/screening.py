from __future__ import annotations
import pandas as pd
from .integration import integrate_series
from .spills import apply_12_24_counting


def spill_block_volumes(events, flow: pd.DataFrame, flow_col: str, *, max_gap_seconds=900.0, exclusions=()):
    """Integrate every physical discharge and retain support/completeness status."""
    counting=apply_12_24_counting(events)
    columns=["year","counting_block","start","end","volume_m3","physical_discharges","compatibility_spill_count","requested_seconds","valid_seconds","gap_seconds","excluded_seconds","uncovered_seconds","status"]
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
            "compatibility_spill_count":int(row.spills),
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
            "compatibility_spill_count":int(g.compatibility_spill_count.sum()),
            "requested_seconds":float(g.requested_seconds.sum()),
            "valid_seconds":float(g.valid_seconds.sum()),
            "gap_seconds":float(g.gap_seconds.sum()),
            "excluded_seconds":float(g.excluded_seconds.sum()),
            "uncovered_seconds":float(g.uncovered_seconds.sum()),
            "status":status,
        })
    return pd.DataFrame(rows,columns=columns)


def idealised_storage_screening(blocks: pd.DataFrame,target_count=10):
    """Whole-episode capture screening, retaining the legacy 12/24 count weights.

    An episode is either fully captured or retains its original count. Partial
    capture, drawdown and tank routing are not inferred from a volume ranking.
    """
    if target_count<0:raise ValueError("target_count must be >= 0")
    columns=["year","physical_blocks","target_count","required_storage_m3","max_block_volume_m3","annual_block_volume_m3","compatibility_spill_count","remaining_spill_count","status","reason","coverage_fraction"]
    if blocks is None or blocks.empty:return pd.DataFrame(columns=columns)
    rows=[]
    for year,g in blocks.groupby("year"):
        requested=float(g.get("requested_seconds",pd.Series(dtype=float)).sum())
        valid=float(g.get("valid_seconds",pd.Series(dtype=float)).sum())
        complete=bool(len(g)) and ("status" not in g.columns or bool((g.status=="complete").all()))
        volumes=[float(v) for v in g.volume_m3.dropna()] if "volume_m3" in g else []
        weights=g.get("compatibility_spill_count",pd.Series(1,index=g.index)).astype(int)
        count=int(weights.sum())
        if not complete:
            rows.append({
                "year":int(year),
                "physical_blocks":int(len(g)),
                "target_count":int(target_count),
                "required_storage_m3":None,
                "max_block_volume_m3":None,
                "annual_block_volume_m3":None,
                "compatibility_spill_count":count,
                "remaining_spill_count":None,
                "status":"partial" if valid>0 else "unavailable",
                "reason":"Required storage withheld because one or more spill-volume blocks have incomplete, excluded, or unsupported flow coverage.",
                "coverage_fraction":valid/requested if requested>0 else None,
            })
            continue
        weighted=list(zip(g.volume_m3.astype(float),weights))
        required=next(capacity for capacity in sorted({0.0,*volumes})
                      if sum(n for volume,n in weighted if volume>capacity)<=target_count)
        remaining=sum(n for volume,n in weighted if volume>required)
        rows.append({
            "year":int(year),
            "physical_blocks":len(volumes),
            "target_count":int(target_count),
            "required_storage_m3":float(required),
            "max_block_volume_m3":max(volumes) if volumes else 0.0,
            "annual_block_volume_m3":float(sum(volumes)),
            "compatibility_spill_count":count,
            "remaining_spill_count":int(remaining),
            "status":"complete",
            "reason":"Complete support; whole episodes at or below capacity are captured, with storage reset between episodes. Volume and counts are attributed to the episode year; no partial-capture tank routing is modelled.",
            "coverage_fraction":1.0,
        })
    return pd.DataFrame(rows,columns=columns)


def calendar_spill_volumes(events,flow,flow_col,*,max_gap_seconds=900.0,exclusions=()):
    """Split integrated physical discharge at calendar year boundaries."""
    totals={}
    for event in events:
        cursor,stop=pd.Timestamp(event["start"]),pd.Timestamp(event["end"])
        while cursor<stop:
            boundary=min(stop,pd.Timestamp(year=cursor.year+1,month=1,day=1))
            r=integrate_series(flow,flow_col,cursor,boundary,semantics="instantaneous",max_gap_seconds=max_gap_seconds,exclusions=exclusions,positive_only=True)
            rec=totals.setdefault(cursor.year,{"year":cursor.year,"volume_m3":0.0,"status":"complete"})
            rec["volume_m3"]+=float(r["integral"])
            if any(float(r.get(k,0))>1e-9 for k in ("gap_seconds","excluded_seconds","uncovered_seconds")):
                rec["status"]="partial"
            cursor=boundary
    return [totals[year] for year in sorted(totals)]
