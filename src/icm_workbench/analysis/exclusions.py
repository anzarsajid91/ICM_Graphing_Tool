from __future__ import annotations

from datetime import datetime
from typing import Iterable
import numpy as np
import pandas as pd
from icm_workbench.domain import ExclusionPeriod


def normalise_exclusions(exclusions: Iterable[ExclusionPeriod]) -> list[ExclusionPeriod]:
    periods = sorted(exclusions, key=lambda x: (x.start, x.end))
    if not periods:
        return []
    merged = [periods[0]]
    for current in periods[1:]:
        previous = merged[-1]
        if current.start <= previous.end:
            reasons = [x.strip() for x in (previous.reason + "; " + current.reason).split(";") if x.strip()]
            merged[-1] = ExclusionPeriod(previous.start, max(previous.end, current.end),
                                         "; ".join(dict.fromkeys(reasons)), source="merged")
        else:
            merged.append(current)
    return merged


def exclusion_mask(timestamps, exclusions: Iterable[ExclusionPeriod]) -> np.ndarray:
    ts = pd.to_datetime(timestamps)
    mask = np.zeros(len(ts), dtype=bool)
    for exc in normalise_exclusions(exclusions):
        mask |= (ts >= pd.Timestamp(exc.start)) & (ts < pd.Timestamp(exc.end))
    return mask


def apply_exclusions(df: pd.DataFrame, exclusions: Iterable[ExclusionPeriod], value_columns: list[str]):
    out = df.copy()
    if out.empty or not exclusions:
        return out, {"excluded_rows": 0, "periods": []}
    m = exclusion_mask(out["timestamp"], exclusions)
    out.loc[m, value_columns] = np.nan
    periods = [x.to_dict() for x in normalise_exclusions(exclusions)]
    return out, {"excluded_rows": int(m.sum()), "periods": periods}


def interval_excluded_seconds(start: pd.Timestamp, end: pd.Timestamp, exclusions: Iterable[ExclusionPeriod]) -> float:
    if end <= start:
        return 0.0
    total = 0.0
    for exc in normalise_exclusions(exclusions):
        a, b = max(start, pd.Timestamp(exc.start)), min(end, pd.Timestamp(exc.end))
        if b > a:
            total += (b - a).total_seconds()
    return total


def audit_exclusions(exclusions: Iterable[ExclusionPeriod], analysis_start: datetime | None = None,
                     analysis_end: datetime | None = None) -> dict:
    periods = normalise_exclusions(exclusions)
    if analysis_start is not None and analysis_end is not None:
        s, e = pd.Timestamp(analysis_start), pd.Timestamp(analysis_end)
        seconds = interval_excluded_seconds(s, e, periods)
    else:
        seconds = sum((p.end - p.start).total_seconds() for p in periods)
    return {"count": len(periods), "excluded_hours": seconds / 3600.0,
            "periods": [p.to_dict() for p in periods]}
