from __future__ import annotations
import numpy as np
import pandas as pd


def residual_series(paired):
    out=paired[["timestamp","obs","sim"]].copy(); out["residual_model_minus_observed"]=out["sim"]-out["obs"]; return out


def cumulative_volume(paired,max_gap_seconds=900.0):
    x=paired[["timestamp","obs","sim"]].copy().sort_values("timestamp")
    dt=pd.to_datetime(x.timestamp).diff().dt.total_seconds()
    valid=dt.gt(0)&dt.le(max_gap_seconds)&x.obs.notna()&x.sim.notna()&x.obs.shift().notna()&x.sim.shift().notna()
    for name in ("obs","sim"):
        increments=((x[name]+x[name].shift())*0.5*dt).where(valid)
        x[f"{name}_increment_m3"]=increments
        x[f"{name}_cumulative_m3"]=increments.fillna(0).cumsum()
    x["gap"]=~valid
    return x


def time_weighted_exceedance(df,value_col,max_gap_seconds=900.0):
    x=df[["timestamp",value_col]].copy().sort_values("timestamp"); x[value_col]=pd.to_numeric(x[value_col],errors="coerce"); dt=pd.to_datetime(x.timestamp).diff().dt.total_seconds().shift(-1); x["weight"]=np.where(dt.gt(0)&dt.le(max_gap_seconds)&x[value_col].notna(),dt,0.0); x=x[x.weight>0].sort_values(value_col,ascending=False); total=x.weight.sum(); x["exceedance_fraction"]=x.weight.cumsum()/total if total else np.nan; return x[[value_col,"exceedance_fraction","weight"]].reset_index(drop=True)
