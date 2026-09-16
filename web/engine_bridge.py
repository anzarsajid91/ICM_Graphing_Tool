from __future__ import annotations
import json, os, re
from pathlib import Path
import numpy as np
import pandas as pd
from icm_workbench.parsers import parse_file
from icm_workbench.analysis.alignment import pair_series
from icm_workbench.analysis.metrics import calibration_metrics
from icm_workbench.analysis.spills import spill_assessment
from icm_workbench.domain import ExclusionPeriod

FILES = {}
ROOT = Path('/tmp/icm_browser')
ROOT.mkdir(parents=True, exist_ok=True)

def _safe(name):
    return re.sub(r'[^A-Za-z0-9._-]+','_',name)[:180]

def _jsonable(value):
    if value is None: return None
    if isinstance(value, (np.integer,)): return int(value)
    if isinstance(value, (np.floating,)): return None if not np.isfinite(value) else float(value)
    if isinstance(value, pd.Timestamp): return value.isoformat()
    if isinstance(value, (pd.Timedelta,)): return value.total_seconds()
    if isinstance(value, dict): return {str(k):_jsonable(v) for k,v in value.items()}
    if isinstance(value, (list,tuple)): return [_jsonable(v) for v in value]
    return value

def _records(df):
    if df is None or getattr(df,'empty',True): return []
    out=df.copy()
    for c in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[c]): out[c]=out[c].map(lambda x: x.isoformat() if pd.notna(x) else None)
    return [_jsonable(r) for r in out.to_dict('records')]

def _series_payload(frame, col, max_points=9000):
    x=frame[['timestamp',col]].copy(); x['timestamp']=pd.to_datetime(x.timestamp,errors='coerce'); x[col]=pd.to_numeric(x[col],errors='coerce'); x=x.dropna(subset=['timestamp',col]).sort_values('timestamp')
    if len(x)>max_points:
        idx=np.unique(np.linspace(0,len(x)-1,max_points).astype(int)); x=x.iloc[idx]
    return {'x':[pd.Timestamp(t).isoformat() for t in x.timestamp], 'y':[float(v) for v in x[col]], 'column':col}

def put_file(key, name, text):
    path=ROOT/f'{key}_{_safe(name)}'; path.write_text(text,encoding='utf-8',errors='replace')
    parsed=parse_file(path); FILES[key]={'name':name,'path':str(path),'parsed':parsed}
    frame=parsed.frame; cols=[str(c) for c in frame.columns if str(c)!='timestamp']
    return json.dumps(_jsonable({'key':key,'name':name,'format':parsed.format_name,'metadata':parsed.metadata,'audit':parsed.audit,'columns':cols,'rows':len(frame),'start':pd.Timestamp(frame.timestamp.min()).isoformat() if len(frame) else None,'end':pd.Timestamp(frame.timestamp.max()).isoformat() if len(frame) else None}))

def drop_file(key):
    item=FILES.pop(key,None)
    if item:
        try: os.remove(item['path'])
        except OSError: pass

def _exclusions(raw):
    out=[]
    for e in raw or []:
        try: out.append(ExclusionPeriod(pd.Timestamp(e['start']).to_pydatetime(),pd.Timestamp(e['end']).to_pydatetime(),str(e['reason']),source='browser'))
        except Exception: continue
    return out

def analyse(config_json):
    cfg=json.loads(config_json); oid=cfg.get('observed_id'); obs_col=cfg.get('observed_col')
    if not oid or oid not in FILES: raise ValueError('Select one observed file from the common file pool.')
    obs=FILES[oid]['parsed'].frame.copy()
    if obs_col not in obs.columns: raise ValueError(f'Observed series {obs_col!r} is not available.')
    start=cfg.get('start') or None; end=cfg.get('end') or None; gap=float(cfg.get('max_gap_seconds') or 900)
    ex=_exclusions(cfg.get('exclusions'))
    result={'observed':{'id':oid,'name':FILES[oid]['name'],**_series_payload(obs,obs_col)},'simulated':[],'comparisons':[],'spills':None,'model_spills':[]}
    for sim in cfg.get('simulated') or []:
        sid, scol=sim.get('id'),sim.get('col')
        if sid not in FILES or scol not in FILES[sid]['parsed'].frame.columns: continue
        frame=FILES[sid]['parsed'].frame.copy(); paired=pair_series(obs,frame,obs_col,scol,max_gap_seconds=gap,start=start,end=end); metrics=calibration_metrics(paired)
        result['simulated'].append({'id':sid,'name':FILES[sid]['name'],**_series_payload(frame,scol)})
        p=paired.copy()
        result['comparisons'].append({'id':sid,'name':FILES[sid]['name'],'column':scol,'metrics':_jsonable(metrics),'paired':_records(p.iloc[np.unique(np.linspace(0,len(p)-1,min(len(p),6000)).astype(int))] if len(p)>6000 else p)})
    th=cfg.get('observed_threshold')
    if th not in (None,''):
        s=spill_assessment(obs,obs_col,float(th),start=start,end=end,max_gap_seconds=gap,exclusions=ex)
        result['spills']={k:(_records(v) if isinstance(v,pd.DataFrame) else _jsonable(v)) for k,v in s.items()}
    mth=cfg.get('model_threshold')
    if mth not in (None,''):
        for sim in cfg.get('simulated') or []:
            sid,scol=sim.get('id'),sim.get('col')
            if sid not in FILES or scol not in FILES[sid]['parsed'].frame.columns: continue
            s=spill_assessment(FILES[sid]['parsed'].frame,scol,float(mth),start=start,end=end,max_gap_seconds=gap,exclusions=ex)
            result['model_spills'].append({'id':sid,'name':FILES[sid]['name'],'column':scol,'assessment':{k:(_records(v) if isinstance(v,pd.DataFrame) else _jsonable(v)) for k,v in s.items()}})
    rid=cfg.get('rainfall_id'); rcol=cfg.get('rainfall_col')
    if rid in FILES and rcol in FILES[rid]['parsed'].frame.columns: result['rainfall']={'id':rid,'name':FILES[rid]['name'],**_series_payload(FILES[rid]['parsed'].frame,rcol)}
    return json.dumps(_jsonable(result))
