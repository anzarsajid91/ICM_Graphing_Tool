from __future__ import annotations
import numpy as np
import pandas as pd


def calibration_metrics(paired):
    if paired is None or paired.empty:return {"pairs":0,"rmse":None,"mae":None,"mean_bias":None,"correlation":None,"r2_correlation":None,"regression_slope":None,"regression_intercept":None,"regression_r2":None,"nse":None,"kge_2009":None}
    o=pd.to_numeric(paired["obs"],errors="coerce").to_numpy(float); s=pd.to_numeric(paired["sim"],errors="coerce").to_numpy(float); m=np.isfinite(o)&np.isfinite(s); o,s=o[m],s[m]
    if len(o)==0:return {"pairs":0}
    err=s-o; result={"pairs":int(len(o)),"rmse":float(np.sqrt(np.mean(err**2))),"mae":float(np.mean(np.abs(err))),"mean_bias":float(np.mean(err)),"obs_mean":float(np.mean(o)),"sim_mean":float(np.mean(s)),"obs_peak":float(np.max(o)),"sim_peak":float(np.max(s))}
    if len(o)>=2 and np.std(o)>0:
        slope,intercept=np.polyfit(o,s,1)
        fitted=intercept+slope*o
        fit_denom=float(np.sum((s-np.mean(s))**2))
        result["regression_slope"]=float(slope)
        result["regression_intercept"]=float(intercept)
        result["regression_r2"]=float(1-np.sum((s-fitted)**2)/fit_denom) if fit_denom>0 else None
    else:
        result["regression_slope"]=None; result["regression_intercept"]=None; result["regression_r2"]=None
    if len(o)>=2 and np.std(o)>0 and np.std(s)>0:
        r=float(np.corrcoef(o,s)[0,1]); result["correlation"]=r; result["r2_correlation"]=r*r; alpha=float(np.std(s,ddof=1)/np.std(o,ddof=1)); beta=float(np.mean(s)/np.mean(o)) if np.mean(o)!=0 else np.nan; result["kge_2009"]=float(1-np.sqrt((r-1)**2+(alpha-1)**2+(beta-1)**2)) if np.isfinite(beta) else None
    else: result["correlation"]=None; result["r2_correlation"]=None; result["kge_2009"]=None
    denom=float(np.sum((o-np.mean(o))**2)); result["nse"]=float(1-np.sum((s-o)**2)/denom) if denom>0 else None
    if "timestamp" in paired and len(paired):
        oi,si=int(np.nanargmax(o)),int(np.nanargmax(s)); valid_idx=np.flatnonzero(m); ot=pd.Timestamp(paired.iloc[valid_idx[oi]].timestamp); st=pd.Timestamp(paired.iloc[valid_idx[si]].timestamp); result["peak_timing_minutes_model_minus_observed"]=float((st-ot).total_seconds()/60.0)
    return result
