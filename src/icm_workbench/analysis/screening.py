from __future__ import annotations
import pandas as pd
from .integration import integrate_series
from .spills import apply_12_24_counting


def spill_block_volumes(events, flow: pd.DataFrame, flow_col: str, *, max_gap_seconds=900.0, exclusions=()):
    counting=apply_12_24_counting(events)
    if counting.empty: return pd.DataFrame(columns=["year","counting_block","start","end","volume_m3","physical_discharges"])
    per=[]
    for _,row in counting.iterrows():
        start,stop=pd.Timestamp(row.spill_start),pd.Timestamp(row.spill_stop)
        integ=integrate_series(flow,flow_col,start,stop,semantics="instantaneous",max_gap_seconds=max_gap_seconds,exclusions=exclusions,positive_only=True)
        per.append({"block":int(row.spill_event),"year":int(row.year_start),"start":start,"end":stop,"volume":float(integ["integral"])})
    df=pd.DataFrame(per); rows=[]
    for (year,block),g in df.groupby(["year","block"]):
        rows.append({"year":int(year),"counting_block":int(block),"start":g.start.min(),"end":g.end.max(),"volume_m3":float(g.volume.sum()),"physical_discharges":int(len(g))})
    return pd.DataFrame(rows)


def idealised_storage_screening(blocks: pd.DataFrame,target_count=10):
    if target_count<0: raise ValueError("target_count must be >= 0")
    if blocks is None or blocks.empty: return pd.DataFrame(columns=["year","physical_blocks","target_count","required_storage_m3","max_block_volume_m3","annual_block_volume_m3"])
    rows=[]
    for year,g in blocks.groupby("year"):
        volumes=sorted([float(v) for v in g.volume_m3],reverse=True); required=volumes[target_count] if len(volumes)>target_count else 0.0
        rows.append({"year":int(year),"physical_blocks":len(volumes),"target_count":int(target_count),"required_storage_m3":float(required),"max_block_volume_m3":max(volumes) if volumes else 0.0,"annual_block_volume_m3":float(sum(volumes))})
    return pd.DataFrame(rows)
