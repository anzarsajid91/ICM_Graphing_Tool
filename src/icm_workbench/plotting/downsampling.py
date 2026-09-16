from __future__ import annotations
import numpy as np
import pandas as pd


def downsample_gap_aware(timestamps,values,max_points=5000):
    ts=pd.to_datetime(pd.Series(timestamps),errors="coerce"); vals=pd.to_numeric(pd.Series(values),errors="coerce"); valid=ts.notna()&vals.notna()
    if valid.sum()<=max_points:
        x=[]; y=[]; was=False
        for t,v,ok in zip(ts,vals,valid):
            if not ok:
                if was:x.append(None); y.append(None)
                was=False; continue
            x.append(t); y.append(float(v)); was=True
        return x,y
    groups=(valid!=valid.shift(fill_value=False)).cumsum(); runs=[(ts[g.index],vals[g.index]) for _,g in pd.DataFrame({"v":valid}).groupby(groups) if bool(g.v.iloc[0])]; budget=max(2,max_points//max(1,len(runs))); xs=[]; ys=[]
    for ri,(rt,rv) in enumerate(runs):
        n=len(rv)
        if n<=budget: keep=list(range(n))
        else:
            edges=np.linspace(0,n,max(2,budget//4)+1,dtype=int); chosen={0,n-1}; arr=rv.to_numpy(float)
            for a,b in zip(edges[:-1],edges[1:]):
                if b<=a:continue
                seg=arr[a:b]; chosen.update({a,b-1,a+int(np.nanargmin(seg)),a+int(np.nanargmax(seg))})
            keep=sorted(chosen)
        xs.extend([rt.iloc[i] for i in keep]); ys.extend([float(rv.iloc[i]) for i in keep])
        if ri!=len(runs)-1: xs.append(None); ys.append(None)
    return xs,ys
