

import sys, math, json, hashlib, traceback, time, csv, re

from pathlib import Path

from datetime import datetime

import numpy as np

import pandas as pd

from dash import Dash, dcc, html, Input, Output, State, Patch, no_update, ALL, ctx

import plotly.graph_objects as go

from plotly.subplots import make_subplots

import plotly.io as pio



try:

    import polars as pl

    POLARS_AVAILABLE=True

except Exception:

    pl=None; POLARS_AVAILABLE=False



CACHE_VERSION=173

CACHE_DIR_NAME='_icm_viewer_cache_v17_3'

VARIABLES=['depth','flow','velocity']

UNITS={'depth':'m','flow':'m³/s','velocity':'m/s'}

DISPLAY_MAX_POINTS_PER_TRACE=5000

REPORT_MAX_POINTS_PER_TRACE=6000

TIME_COLUMNS=['time','date','datetime','timestamp','p_datetime']

IGNORE_VALUE_COLUMNS=['seconds','second','time_seconds','timestep']

MEM_CACHE={}

TABLE_CELL={"textAlign":"center","padding":"8px 10px","borderBottom":"1px solid #e5e5e5","verticalAlign":"middle","whiteSpace":"nowrap"}

TABLE_HEAD={**TABLE_CELL,"fontWeight":"700","background":"#f2f4f7"}

ERROR_STYLE={"background":"#fff2f2","border":"1px solid #ffb3b3","padding":"12px","borderRadius":"8px","color":"#7a0000","whiteSpace":"pre-wrap"}

OK_STYLE={"background":"#f4fff4","border":"1px solid #b7e3b7","padding":"12px","borderRadius":"8px","color":"#184d18"}

INFO_STYLE={"background":"#fff","border":"1px solid #ddd","padding":"12px","borderRadius":"8px","color":"#333"}



def now_text(): return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

def get_data_folder(): return Path(sys.argv[1]).expanduser() if len(sys.argv)>1 else Path.cwd()/ 'data'

def normalise(s): return str(s).strip().lower().replace(' ','_').replace('-','_').replace('\n','_')



INVALID_VALUE_CODES = {9999.0, -9999.0, 99999.0, -99999.0}



def clean_numeric_value(v):

    """Convert known invalid telemetry placeholders to zero; leave other values unchanged."""

    try:

        x = float(v)

        for bad in INVALID_VALUE_CODES:

            if abs(x - bad) < 1e-9:

                return 0.0

        return x

    except Exception:

        return np.nan



def clean_numeric_series(s):

    x = pd.to_numeric(s, errors='coerce')

    try:

        return x.mask(x.isin(list(INVALID_VALUE_CODES)), 0.0)

    except Exception:

        return x



def button_style(primary=False, max_width='260px'):

    base = {'height':'38px','padding':'0 16px','borderRadius':'8px','border':'1px solid #cfd6e4','cursor':'pointer','maxWidth':max_width,'width':'auto','whiteSpace':'nowrap','lineHeight':'16px'}

    if primary:

        base.update({'fontWeight':'700','background':'#0A66C2','color':'white','border':'1px solid #0A66C2'})

    else:

        base.update({'background':'white','color':'#1f2937'})

    return base



def csv_options(folder):
    if not Path(folder).exists(): return []
    exts=('.csv','.fdv','.fdv.txt','.r','.r.txt')
    files=[p for p in Path(folder).iterdir() if p.is_file() and p.name.lower().endswith(exts)]
    return [{'label':p.name,'value':p.name} for p in sorted(files,key=lambda x:x.name.lower())]

def path_from_name(folder,name):

    if not name: return None

    p=Path(folder)/name

    return p if p.exists() else None



def file_sig(path):

    if path is None or not Path(path).exists(): return None

    p=Path(path); st=p.stat()

    return {'path':str(p.resolve()),'name':p.name,'size':st.st_size,'mtime_ns':st.st_mtime_ns,'version':CACHE_VERSION}

def cache_root(folder):

    p=Path(folder)/CACHE_DIR_NAME; p.mkdir(exist_ok=True); return p

def cache_key(path,kind):

    sig=file_sig(path); raw=f"{kind}|{sig['path']}|{sig['size']}|{sig['mtime_ns']}|{sig['version']}"

    return hashlib.md5(raw.encode()).hexdigest()[:12]

def meta_path(cdir): return Path(cdir)/'metadata.json'

def read_meta(cdir):

    p=meta_path(cdir); return json.loads(p.read_text()) if p.exists() else None

def write_meta(cdir,meta):

    Path(cdir).mkdir(parents=True,exist_ok=True); meta_path(cdir).write_text(json.dumps(meta,indent=2,default=str),encoding='utf-8')

def cache_valid(path,cdir,kind):

    m=read_meta(cdir); sig=file_sig(path)

    return bool(m and sig and m.get('kind')==kind and m.get('source_size')==sig['size'] and m.get('source_mtime_ns')==sig['mtime_ns'] and m.get('cache_version')==CACHE_VERSION)

def stage_html(lines,style=INFO_STYLE): return html.Div([html.Div(x) for x in lines],style=style)

def exception_panel(title,err,stage=None):

    lines=(stage or [])+['',title,f'Exception type: {type(err).__name__}',f'Message: {err}','','Traceback:',traceback.format_exc()]

    return html.Div('\n'.join(lines),style=ERROR_STYLE)



def empty_figure(msg='Select files and click Apply / Refresh Graph.'):

    fig=go.Figure(); fig.add_annotation(text=msg,x=0.5,y=0.5,xref='paper',yref='paper',showarrow=False,font=dict(size=16,color='#1f3b5b'))

    fig.update_layout(template='plotly_white',height=620,title=msg,xaxis_title='Time',yaxis_title='Value')

    return fig

def error_figure(title,detail=''):

    fig=go.Figure(); fig.add_annotation(text=f'{title}<br>{detail}',x=0.5,y=0.5,xref='paper',yref='paper',showarrow=False,font=dict(size=14,color='#7a0000'))

    fig.update_layout(template='plotly_white',height=620,title='Graph update failed')

    return fig



def read_csv_loose(path): return pd.read_csv(path,sep=None,engine='python')

def detect_time_column(df):

    for c in df.columns:

        cn=normalise(c)

        if any(tc==cn or tc in cn for tc in TIME_COLUMNS): return c

    best=None; bn=0

    for c in df.columns:

        parsed=pd.to_datetime(df[c],errors='coerce',dayfirst=True); n=parsed.notna().sum()

        if n>bn: best,bn=c,n

    return best if bn>=max(2,int(0.5*len(df))) else None

def numeric_value_columns(df,time_col):

    out=[]

    for c in df.columns:

        if c==time_col or normalise(c) in IGNORE_VALUE_COLUMNS: continue

        if pd.to_numeric(df[c],errors='coerce').notna().sum()>0: out.append(c)

    return out



def parse_icm_event_csv(path,out_col='Observed'):

    lines=Path(path).read_text(errors='replace').splitlines(); start=None

    for i,line in enumerate(lines):

        if line.strip().lower().startswith('p_datetime'): start=i+1; break

    if start is None: return None

    rows=[]

    for line in lines[start:]:

        s=line.strip()

        if not s or ',' not in s: continue

        parts=[x.strip() for x in s.split(',')]

        if len(parts)<2: continue

        t=pd.to_datetime(parts[0],errors='coerce',dayfirst=True); v=pd.to_numeric(parts[1],errors='coerce')

        if pd.notna(t) and pd.notna(v): rows.append((t,clean_numeric_value(v)))

    if not rows: return pd.DataFrame(columns=['timestamp',out_col])

    return pd.DataFrame(rows,columns=['timestamp',out_col]).sort_values('timestamp').groupby('timestamp',as_index=False)[out_col].mean()

def parse_observed_source(path):

    ev=parse_icm_event_csv(path,'Observed')

    if ev is not None: return ev,f'ICM/event observed parser; rows={len(ev):,}'

    df=read_csv_loose(path); df.columns=[str(c).strip() for c in df.columns]

    tc=detect_time_column(df); vals=numeric_value_columns(df,tc) if tc else []

    if not tc or not vals: raise ValueError(f'Could not detect observed time/value columns. Columns={list(df.columns)}')

    out=pd.DataFrame({'timestamp':pd.to_datetime(df[tc],errors='coerce',dayfirst=True),'Observed':clean_numeric_series(df[vals[0]])}).dropna()

    out=out.sort_values('timestamp').groupby('timestamp',as_index=False)['Observed'].mean()

    return out,f"standard observed parser; time='{tc}', value='{vals[0]}', rows={len(out):,}"

def parse_simulated_source(paths):

    valid=[p for p in paths if p is not None and Path(p).exists()]

    if not valid: return pd.DataFrame(columns=['timestamp']),'No simulated file selected.'

    merged=None; msgs=[]; used=set()

    for path in valid:

        df=read_csv_loose(path); df.columns=[str(c).strip() for c in df.columns]

        tc=detect_time_column(df); vals=numeric_value_columns(df,tc) if tc else []

        if not tc or not vals:

            msgs.append(f'Could not detect time/value columns in {Path(path).name}.'); continue

        tmp=pd.DataFrame({'timestamp':pd.to_datetime(df[tc],errors='coerce',dayfirst=True)}); names=[]

        for c in vals:

            base=str(c).strip() or Path(path).stem

            if normalise(base) in ['value','1']: base=Path(path).stem

            if len(valid)>1 and normalise(base) not in normalise(Path(path).stem): base=f'{Path(path).stem} | {base}'

            name=base; k=2

            while name in used: name=f'{base}_{k}'; k+=1

            used.add(name); tmp[name]=clean_numeric_series(df[c]); names.append(name)

        tmp=tmp.dropna(subset=['timestamp']).dropna(subset=names,how='all').sort_values('timestamp').groupby('timestamp',as_index=False)[names].mean()

        merged=tmp if merged is None else pd.merge(merged,tmp,on='timestamp',how='outer')

        msgs.append(f"Loaded {Path(path).name}; columns={', '.join(names)}; rows={len(tmp):,}")

    return (merged.sort_values('timestamp') if merged is not None else pd.DataFrame(columns=['timestamp'])), ' | '.join(msgs)



def looks_like_datetime(text):

    s=str(text).strip(); return bool(s) and len(s)>=12 and any(ch in s for ch in ['/', '-']) and ':' in s



def parse_rainfall_to_years(path,out_dir,stage=None):

    if not POLARS_AVAILABLE: raise RuntimeError('polars is required for rainfall cache. Run install.bat.')

    buffers={}; part_counts={}; scanned=kept=ncols=sample_checked=mismatch_count=0; max_abs_diff=0.0

    LIMIT=1000; TOL=1e-6

    def flush_year(y):

        rows=buffers.get(y,[])

        if not rows: return

        pdf=pd.DataFrame(rows,columns=['timestamp','Rainfall']).dropna(subset=['timestamp','Rainfall'])

        if pdf.empty: buffers[y]=[]; return

        pdf=pdf.sort_values('timestamp'); part=part_counts.get(y,0); part_counts[y]=part+1

        pl.from_pandas(pdf).write_parquet(out_dir/f'rainfall_{y}_part{part:04d}.parquet',compression='snappy',statistics=True,row_group_size=100000)

        buffers[y]=[]

    def accept(ts_text,vals):

        nonlocal scanned,kept,ncols,sample_checked,mismatch_count,max_abs_diff

        scanned+=1; t=pd.to_datetime(str(ts_text).strip(),errors='coerce',dayfirst=True)

        if pd.isna(t) or not vals: return

        try: rainfall=float(str(vals[0]).strip())

        except Exception: return

        ncols=max(ncols,len(vals))

        if len(vals)>1 and sample_checked<LIMIT:

            sample_checked+=1

            for v in vals[1:]:

                try:

                    diff=abs(float(str(v).strip())-rainfall); max_abs_diff=max(max_abs_diff,diff)

                    if diff>TOL: mismatch_count+=1; break

                except Exception: mismatch_count+=1; break

        y=int(pd.Timestamp(t).year); buffers.setdefault(y,[]).append([pd.Timestamp(t).to_pydatetime(),rainfall]); kept+=1

        if len(buffers[y])>=200000: flush_year(y)

    prefix=Path(path).open('r',errors='replace',newline='').read(4096); low=prefix.lower()

    first_header = low.lstrip().split(',', 1)[0].strip().strip('"').replace('\ufeff', '')

    flat = first_header in ['time', 'date', 'datetime', 'timestamp'] and 'p_datetime' not in low[:200]

    if flat:

        if stage is not None: stage.append('Rainfall parser V16: detected flat Time + profile columns CSV format.')

        with Path(path).open('r',errors='replace',newline='') as f:

            reader=csv.reader(f); header=next(reader,None)

            if not header or len(header)<2: raise ValueError('Rainfall tabular CSV header missing profile columns.')

            for row in reader:

                if len(row)>=2: accept(row[0],row[1:])

    else:

        if stage is not None: stage.append('Rainfall parser V16: using legacy RED/P_DATETIME parser.')

        in_data=False; current_ncols=0

        for line in Path(path).open('r',errors='replace'):

            s=line.strip()

            if not s: continue

            if s.lower().startswith('p_datetime'):

                current_ncols=max(1,len(s.split(','))-1); in_data=True; continue

            if not in_data: continue

            parts=[x.strip() for x in s.split(',')]

            if not parts or not looks_like_datetime(parts[0]): in_data=False; continue

            vals=parts[1:1+current_ncols]

            if vals: accept(parts[0],vals)

    for y in list(buffers): flush_year(y)

    val={'parser_version':'v17','format_detected':'flat_time_profile_csv' if flat else 'legacy_red_p_datetime','profiles_detected':ncols,'homogeneity_sample_checked':sample_checked,'homogeneity_mismatch_count':mismatch_count,'homogeneity_max_abs_diff':max_abs_diff,'canonical_profile_used':'Profile 1'}

    if stage is not None:

        stage.append(f"Rainfall parser V16 kept {kept:,} rows from {scanned:,} scanned rows; format={val['format_detected']}.")

        stage.append(f"Rainfall profile homogeneity: sampled={sample_checked:,}, mismatches={mismatch_count:,}, max diff={max_abs_diff:g}.")

    return scanned,kept,val



class Registry:

    def __init__(self,folder): self.folder=Path(folder); self.root=cache_root(folder)

    def ensure_observed(self,filename,stage=None):

        p=path_from_name(self.folder,filename); cdir=self.root/cache_key(p,'observed'); mem=('obs',str(cdir))

        if mem in MEM_CACHE:

            if stage is not None: stage.append('Observed cache: memory hit')

            return MEM_CACHE[mem]

        if not cache_valid(p,cdir,'observed'):

            if stage is not None: stage.append('Observed cache: building parquet')

            df,msg=parse_observed_source(p); cdir.mkdir(parents=True,exist_ok=True); df.to_parquet(cdir/'data.parquet',index=False)

            write_meta(cdir,{'kind':'observed','source_name':p.name,'source_size':p.stat().st_size,'source_mtime_ns':p.stat().st_mtime_ns,'cache_version':CACHE_VERSION,'rows':len(df),'message':msg})

        else:

            if stage is not None: stage.append('Observed cache: parquet valid')

        df=pd.read_parquet(cdir/'data.parquet'); msg=read_meta(cdir).get('message','Observed cache loaded'); MEM_CACHE[mem]=(df,msg); return df,msg

    def ensure_simulated(self,filenames,stage=None):

        paths=[path_from_name(self.folder,n) for n in (filenames or [])]; raw='|'.join([str(file_sig(p)) for p in paths]); key=hashlib.md5((raw+'|simulated|'+str(CACHE_VERSION)).encode()).hexdigest()[:12]

        cdir=self.root/key; mem=('sim',str(cdir)); m=read_meta(cdir); valid=bool(m and m.get('kind')=='simulated' and m.get('source_sigs')==[file_sig(p) for p in paths] and m.get('cache_version')==CACHE_VERSION)

        if mem in MEM_CACHE:

            if stage is not None: stage.append('Simulated cache: memory hit')

            return MEM_CACHE[mem]

        if not valid:

            if stage is not None: stage.append('Simulated cache: building parquet')

            df,msg=parse_simulated_source(paths); cdir.mkdir(parents=True,exist_ok=True); df.to_parquet(cdir/'data.parquet',index=False)

            write_meta(cdir,{'kind':'simulated','source_sigs':[file_sig(p) for p in paths],'cache_version':CACHE_VERSION,'rows':len(df),'message':msg})

        else:

            if stage is not None: stage.append('Simulated cache: parquet valid')

        df=pd.read_parquet(cdir/'data.parquet'); msg=read_meta(cdir).get('message','Simulated cache loaded'); MEM_CACHE[mem]=(df,msg); return df,msg

    def ensure_rainfall_cache(self,filename,stage=None):

        p=path_from_name(self.folder,filename); cdir=self.root/cache_key(p,'rainfall_v17_canonical')

        if cache_valid(p,cdir,'rainfall_v17_canonical') and list(cdir.glob('rainfall_*_part*.parquet')):

            if stage is not None: stage.append('Rainfall cache: V16 canonical parquet valid')

            return cdir,read_meta(cdir)

        if cdir.exists():

            for f in cdir.glob('*'): f.unlink()

        cdir.mkdir(parents=True,exist_ok=True); t0=time.perf_counter()

        if stage is not None: stage.append(f'Rainfall cache: first V16 conversion ({p.stat().st_size/1e6:.1f} MB)')

        scanned,kept,val=parse_rainfall_to_years(p,cdir,stage); parts=sorted(cdir.glob('rainfall_*_part*.parquet'))

        meta={'kind':'rainfall_v17_canonical','source_name':p.name,'source_size':p.stat().st_size,'source_mtime_ns':p.stat().st_mtime_ns,'cache_version':CACHE_VERSION,'scanned_rows':scanned,'rows':kept,'partitions':[x.name for x in parts],'build_seconds':round(time.perf_counter()-t0,2),**val}

        write_meta(cdir,meta); return cdir,meta

    def query_rainfall(self,filename,t0,t1,profile='1',stage=None):

        if not filename: return pd.DataFrame(columns=['timestamp','Rainfall']),'No rainfall file selected.'

        cdir,meta=self.ensure_rainfall_cache(filename,stage); paths=[]

        for y in range(pd.Timestamp(t0).year,pd.Timestamp(t1).year+1): paths.extend(sorted(cdir.glob(f'rainfall_{y}_part*.parquet')))

        if not paths: return pd.DataFrame(columns=['timestamp','Rainfall']), 'No rainfall partitions found.'

        if stage is not None: stage.append(f'Rainfall query: reading {len(paths)} parquet part(s); using Profile 1 canonical rainfall.')

        if POLARS_AVAILABLE:

            q=pl.scan_parquet([str(p) for p in paths]).filter((pl.col('timestamp')>=pd.Timestamp(t0)) & (pl.col('timestamp')<=pd.Timestamp(t1))).select(['timestamp','Rainfall']).collect().to_pandas()

        else:

            q=pd.concat([pd.read_parquet(p) for p in paths],ignore_index=True); q=q[(q.timestamp>=pd.Timestamp(t0)) & (q.timestamp<=pd.Timestamp(t1))][['timestamp','Rainfall']]

        q=q.sort_values('timestamp')

        msg=f"Rainfall cache query returned {len(q):,} rows. Parser={meta.get('format_detected','unknown')}; homogeneity mismatches={meta.get('homogeneity_mismatch_count',0):,}."

        return q,msg



def filter_df_by_period(df,start,end):

    if df is None or df.empty or 'timestamp' not in df.columns: return df.copy() if df is not None else pd.DataFrame()

    out=df.copy()

    if start is not None: out=out[out.timestamp>=pd.Timestamp(start)]

    if end is not None: out=out[out.timestamp<=pd.Timestamp(end)]

    return out

def get_full_extent(*dfs):

    times=[]

    for df in dfs:

        if df is not None and not df.empty and 'timestamp' in df.columns: times += [df.timestamp.min(),df.timestamp.max()]

    times=[t for t in times if pd.notna(t)]; return (min(times),max(times)) if times else (None,None)

def data_overlap_period(obs,sim,start=None,end=None):

    if obs is None or sim is None or obs.empty or sim.empty: return None,None

    s=max(obs.timestamp.min(),sim.timestamp.min()); e=min(obs.timestamp.max(),sim.timestamp.max())

    if start is not None: s=max(s,pd.Timestamp(start))

    if end is not None: e=min(e,pd.Timestamp(end))

    return (None,None) if pd.isna(s) or pd.isna(e) or e<s else (s,e)

def hydraulic_plot_window(obs,sim):

    s,e=data_overlap_period(obs,sim)

    if s is not None: return s,e,'overlap'

    s,e=get_full_extent(obs,sim); return s,e,'union (no observed/simulated overlap found)'

def parse_user_period(a,b):

    st=pd.to_datetime(a,errors='coerce',dayfirst=True) if a else None; en=pd.to_datetime(b,errors='coerce',dayfirst=True) if b else None

    if a and pd.isna(st): return None,None,f'Invalid user start date/time: {a}'

    if b and pd.isna(en): return None,None,f'Invalid user end date/time: {b}'

    if st is not None and en is not None and en<st: return None,None,'User period end is before start.'

    return st,en,''

def extract_zoom_period(relayout):

    if not relayout: return None,None,'No graph zoom range available.'

    for prefix in ['xaxis','xaxis2']:

        if f'{prefix}.range[0]' in relayout and f'{prefix}.range[1]' in relayout:

            s=pd.to_datetime(relayout[f'{prefix}.range[0]'],errors='coerce'); e=pd.to_datetime(relayout[f'{prefix}.range[1]'],errors='coerce'); return (e,s,'') if e<s else (s,e,'')

        if f'{prefix}.range' in relayout and isinstance(relayout[f'{prefix}.range'],(list,tuple)):

            s=pd.to_datetime(relayout[f'{prefix}.range'][0],errors='coerce'); e=pd.to_datetime(relayout[f'{prefix}.range'][1],errors='coerce'); return (e,s,'') if e<s else (s,e,'')

    return None,None,'No usable x-axis zoom range found.'

def fmt(v):

    if v is None: return '—'

    if isinstance(v,float) and (math.isnan(v) or math.isinf(v)): return '—'

    return f'{v:.4g}' if isinstance(v,float) else str(v)

def fmt_dt(v): return '—' if v is None or pd.isna(v) else pd.Timestamp(v).strftime('%Y-%m-%d %H:%M')

def downsample_xy(x,y,max_points):

    x_arr=np.asarray(x); y_arr=np.asarray(y,dtype=float); mask=pd.notna(x_arr)&np.isfinite(y_arr); x_arr=x_arr[mask]; y_arr=y_arr[mask]; n=len(y_arr)

    if n<=max_points or n<3: return x_arr,y_arr

    edges=np.linspace(0,n,max(1,max_points//3)+1,dtype=int); keep={0,n-1}

    for a,b in zip(edges[:-1],edges[1:]):

        if b<=a: continue

        seg=y_arr[a:b]

        if len(seg): keep.add(a+int(np.nanargmin(seg))); keep.add(a+int(np.nanargmax(seg))); keep.add(a)

    idx=np.array(sorted(keep),dtype=int); return x_arr[idx],y_arr[idx]

def add_threshold(fig,x0,x1,value,label,color,row):

    if value is None: return

    try: y=float(value)

    except Exception: return

    if x0 is None or x1 is None: return

    fig.add_trace(go.Scatter(x=[x0,x1],y=[y,y],mode='lines',name=label or f'Threshold {y:g}',line=dict(color=color or '#FF3B30',width=2.5,dash='dash')),row=row,col=1)

def rainfall_timestep_hours(rain):

    try:

        if rain is None or rain.empty or len(rain)<2: return None

        ts=pd.to_datetime(rain['timestamp'],errors='coerce').dropna().sort_values(); d=ts.diff().dropna().dt.total_seconds()/3600.0; d=d[d>0]

        return float(d.median()) if len(d) else None

    except Exception: return None

def rainfall_vertical_strokes(rain):

    if rain is None or rain.empty: return [],[],[],[]

    r=rain[['timestamp','Rainfall']].copy(); r['timestamp']=pd.to_datetime(r['timestamp'],errors='coerce'); r['Rainfall']=pd.to_numeric(r['Rainfall'],errors='coerce'); r=r.dropna().sort_values('timestamp'); nz=r[r['Rainfall']>0]

    xs=[]; ys=[]

    for t,v in zip(nz['timestamp'].to_numpy(),nz['Rainfall'].to_numpy()): xs.extend([t,t,None]); ys.extend([0.0,float(v),None])

    return xs,ys,nz['timestamp'].to_numpy(),nz['Rainfall'].to_numpy()

def rainfall_axis_max(rain,manual=None):

    try:

        if manual not in [None,'']:

            v=float(manual)

            if v>0: return v

    except Exception: pass

    try:

        vals=pd.to_numeric(rain['Rainfall'],errors='coerce'); vals=vals[np.isfinite(vals)]; vals=vals[vals>0]

        if len(vals)==0: return 1.0

        vmax=float(vals.max()); p95=float(np.percentile(vals,95)); p99=float(np.percentile(vals,99)); cap=max(p95*1.5,p99) if p95>0 and vmax>p95*5 else vmax*1.15

        return max(cap,1.0)

    except Exception: return None



def compute_embedded_stats(variable,obs_plot,sim_plot,rain_plot,period_start=None,period_end=None):

    obs_s=filter_df_by_period(obs_plot,period_start,period_end) if obs_plot is not None else pd.DataFrame()

    sim_s=filter_df_by_period(sim_plot,period_start,period_end) if sim_plot is not None else pd.DataFrame()

    rain_s=filter_df_by_period(rain_plot,period_start,period_end) if rain_plot is not None else pd.DataFrame()

    stats={'period':f'{fmt_dt(period_start)} to {fmt_dt(period_end)}' if period_start is not None and period_end is not None else 'Plotted period','rain_total':None,'rain_peak':None,'rain_avg':None,'obs_min':None,'obs_max':None,'sim_min':None,'sim_max':None}

    if rain_s is not None and not rain_s.empty:

        vals=pd.to_numeric(rain_s['Rainfall'],errors='coerce').dropna()

        if len(vals):

            dt=rainfall_timestep_hours(rain_s); stats['rain_total']=float(vals.sum()*dt) if dt and dt>0 else None; stats['rain_peak']=float(vals.max()); stats['rain_avg']=float(vals.mean())

    if obs_s is not None and not obs_s.empty:

        vals=pd.to_numeric(obs_s['Observed'],errors='coerce').dropna()

        if len(vals): stats['obs_min']=float(vals.min()); stats['obs_max']=float(vals.max())

    if sim_s is not None and not sim_s.empty:

        cols=[c for c in sim_s.columns if c!='timestamp']

        if cols:

            vals=pd.to_numeric(sim_s[cols[0]],errors='coerce').dropna()

            if len(vals): stats['sim_min']=float(vals.min()); stats['sim_max']=float(vals.max())

    return stats

def _stats_value(v,unit=''):

    if v is None or (isinstance(v,float) and (math.isnan(v) or math.isinf(v))): return '—'

    s=f'{v:.3f}' if isinstance(v,float) else str(v); return f'{s} {unit}'.strip()

def add_stats_table_band(fig,variable,stats,row,col=1):

    unit=UNITS.get(variable,''); header=['Period','Rain total','Rain peak','Rain avg','Obs min','Obs max','Sim min','Sim max']

    values=[[stats.get('period','—'),_stats_value(stats.get('rain_total'),'mm'),_stats_value(stats.get('rain_peak'),'mm/hr'),_stats_value(stats.get('rain_avg'),'mm/hr'),_stats_value(stats.get('obs_min'),unit),_stats_value(stats.get('obs_max'),unit),_stats_value(stats.get('sim_min'),unit),_stats_value(stats.get('sim_max'),unit)]]

    fig.add_trace(go.Table(header=dict(values=header,fill_color='#f2f4f7',align='center',font=dict(size=11,color='#111'),height=24),cells=dict(values=list(map(list,zip(*values))),fill_color='white',align='center',font=dict(size=11,color='#111'),height=24),columnwidth=[190,90,90,90,80,80,80,80]),row=row,col=col)



def make_figure(variable,obs,sim,rain,colors,thresholds,title_suffix='',max_points=DISPLAY_MAX_POINTS_PER_TRACE,stats_box=True,stats_start=None,stats_end=None):

    has_rain=rain is not None and not rain.empty; has_stats=bool(stats_box)

    if has_rain and has_stats: rows=3; specs=[[{'type':'xy'}],[{'type':'xy'}],[{'type':'table'}]]; row_heights=[0.22,0.64,0.14]; main=2; stats_row=3; titles=['Rainfall','','']

    elif has_rain: rows=2; specs=[[{'type':'xy'}],[{'type':'xy'}]]; row_heights=[0.25,0.75]; main=2; stats_row=None; titles=['Rainfall','']

    elif has_stats: rows=2; specs=[[{'type':'xy'}],[{'type':'table'}]]; row_heights=[0.88,0.12]; main=1; stats_row=2; titles=None

    else: rows=1; specs=[[{'type':'xy'}]]; row_heights=[1.0]; main=1; stats_row=None; titles=None

    fig=make_subplots(rows=rows,cols=1,shared_xaxes=True,row_heights=row_heights,vertical_spacing=0.060,specs=specs,subplot_titles=titles)

    if has_rain:

        xs,ys,hx,hy=rainfall_vertical_strokes(rain)

        fig.add_trace(go.Scattergl(x=xs,y=ys,mode='lines',name='Rainfall',line=dict(color=colors.get('rain','#4A90E2'),width=1),opacity=0.65,hoverinfo='skip'),row=1,col=1)

        fig.add_trace(go.Scattergl(x=hx,y=hy,mode='markers',name='Rainfall values',showlegend=False,marker=dict(size=7,color='rgba(74,144,226,0.001)'),hovertemplate='%{x|%b %d, %Y, %H:%M}<br>Rainfall: %{y:.3g} mm/hr<extra></extra>'),row=1,col=1)

        rmax=rainfall_axis_max(rain,thresholds.get('rain_ymax')); fig.update_yaxes(title_text='Rainfall (mm/hr)',range=[rmax,0] if rmax else None,autorange=False if rmax else 'reversed',row=1,col=1)

    if obs is not None and not obs.empty:

        x,y=downsample_xy(obs.timestamp.to_numpy(),obs.Observed.to_numpy(),max_points); fig.add_trace(go.Scatter(x=x,y=y,mode='lines',name='Observed',line=dict(color=colors.get('obs','#111111'),width=2.5)),row=main,col=1)

    if sim is not None and not sim.empty:

        for c in [c for c in sim.columns if c!='timestamp']:

            tmp=sim[['timestamp',c]].dropna(subset=[c]); x,y=downsample_xy(tmp.timestamp.to_numpy(),tmp[c].to_numpy(),max_points)

            fig.add_trace(go.Scatter(x=x,y=y,mode='lines',name=f'Simulated: {c}',line=dict(color=colors.get('sim','#0A84FF'),width=2)),row=main,col=1)

    x0,x1=get_full_extent(obs,sim,rain); add_threshold(fig,x0,x1,thresholds.get('th1'),thresholds.get('th1_label'),thresholds.get('th1_color'),main); add_threshold(fig,x0,x1,thresholds.get('th2'),thresholds.get('th2_label'),thresholds.get('th2_color'),main)

    fig.update_yaxes(title_text=variable.capitalize()+(f' ({UNITS[variable]})' if UNITS.get(variable) else ''),row=main,col=1)

    if has_stats: fig.update_xaxes(title_text=None,row=main,col=1)

    else: fig.update_xaxes(title_text='Time',row=main,col=1)

    if has_stats and stats_row:

        d0,d1=get_full_extent(obs,sim); s0=pd.Timestamp(stats_start) if stats_start is not None else d0; s1=pd.Timestamp(stats_end) if stats_end is not None else d1

        add_stats_table_band(fig,variable,compute_embedded_stats(variable,obs,sim,rain,s0,s1),stats_row,1)

    fig.update_layout(template='plotly_white',height=840 if has_rain and has_stats else (790 if has_rain else 720),title=f'Observed vs Simulated — {variable.capitalize()}'+(f' — {title_suffix}' if title_suffix else ''),hovermode='x unified',legend=dict(orientation='h',yanchor='bottom',y=1.02,xanchor='right',x=1),margin=dict(l=60,r=30,t=80,b=85),uirevision='keep')

    return fig



def interpolate_sim_to_obs(obs_df,sim_series):

    if obs_df.empty or sim_series.empty: return pd.DataFrame(columns=['timestamp','obs','sim'])

    obs=obs_df.rename(columns={'Observed':'obs'})[['timestamp','obs']].copy(); sim=sim_series.rename(columns={sim_series.columns[-1]:'sim'})[['timestamp','sim']].dropna().sort_values('timestamp')

    if sim.empty: return pd.DataFrame(columns=['timestamp','obs','sim'])

    idx=sim.set_index('timestamp'); times=pd.DatetimeIndex(obs.timestamp); interp=idx.reindex(idx.index.union(times).sort_values()).interpolate(method='time').reindex(times)

    out=obs.copy(); out['sim']=interp['sim'].to_numpy(); return out.dropna()

def calc_stats(obs,sim,start=None,end=None):

    os,oe=data_overlap_period(obs,sim,start,end)

    if os is None: return []

    obs_f=filter_df_by_period(obs,os,oe); sim_all=filter_df_by_period(sim,os,oe); rows=[]

    for col in [c for c in sim_all.columns if c!='timestamp']:

        sim_f=sim_all[['timestamp',col]].dropna(subset=[col]); paired=interpolate_sim_to_obs(obs_f,sim_f)

        r={'series':col,'pairs':len(paired),'rmse':None,'r2':None,'nse':None,'mean_bias':None,'obs_peak':None,'obs_peak_time':None,'sim_peak':None,'sim_peak_time':None,'peak_lag_min':None,'peak_abs_lag_min':None}

        if not obs_f.empty and obs_f.Observed.notna().any(): oi=obs_f.Observed.idxmax(); r['obs_peak']=float(obs_f.loc[oi,'Observed']); r['obs_peak_time']=obs_f.loc[oi,'timestamp']

        if not sim_f.empty and sim_f[col].notna().any(): si=sim_f[col].idxmax(); r['sim_peak']=float(sim_f.loc[si,col]); r['sim_peak_time']=sim_f.loc[si,'timestamp']

        if r['obs_peak_time'] is not None and r['sim_peak_time'] is not None:

            lag=(r['sim_peak_time']-r['obs_peak_time']).total_seconds()/60; r['peak_lag_min']=float(lag); r['peak_abs_lag_min']=float(abs(lag))

        if len(paired)>=2:

            o=paired.obs.to_numpy(float); s=paired.sim.to_numpy(float); err=s-o; r['rmse']=float(np.sqrt(np.mean(err**2))); r['mean_bias']=float(np.mean(err)); denom=float(np.sum((o-np.mean(o))**2))

            if np.std(o)>0 and np.std(s)>0: cc=float(np.corrcoef(o,s)[0,1]); r['r2']=cc*cc

            if denom>0: r['nse']=float(1-np.sum((s-o)**2)/denom)

        rows.append(r)

    return rows



def stats_table(title,rows,subtitle=''):

    if not rows: return html.Div([html.H4(title),html.Div(subtitle,style={'color':'#666','fontSize':'13px'}) if subtitle else None,html.Div('No simulated series available or no overlapping paired data.',style={'color':'#666'})],style={'marginTop':'14px'})

    headers=['Sim series','Pairs','RMSE','R²','NSE','Mean bias','Obs peak','Obs peak time','Sim peak','Sim peak time','Peak lag min','Abs lag min']

    body=[]

    for r in rows:

        body.append(html.Tr([html.Td(r['series'],style={**TABLE_CELL,'textAlign':'left'}),html.Td(fmt(r['pairs']),style=TABLE_CELL),html.Td(fmt(r['rmse']),style=TABLE_CELL),html.Td(fmt(r['r2']),style=TABLE_CELL),html.Td(fmt(r['nse']),style=TABLE_CELL),html.Td(fmt(r['mean_bias']),style=TABLE_CELL),html.Td(fmt(r['obs_peak']),style=TABLE_CELL),html.Td(fmt_dt(r['obs_peak_time']),style=TABLE_CELL),html.Td(fmt(r['sim_peak']),style=TABLE_CELL),html.Td(fmt_dt(r['sim_peak_time']),style=TABLE_CELL),html.Td(fmt(r['peak_lag_min']),style=TABLE_CELL),html.Td(fmt(r['peak_abs_lag_min']),style=TABLE_CELL)]))

    return html.Div([html.H4(title),html.Div(subtitle,style={'color':'#666','fontSize':'13px','marginBottom':'8px'}) if subtitle else None,html.Div([html.Table([html.Thead(html.Tr([html.Th(h,style=TABLE_HEAD) for h in headers])),html.Tbody(body)],style={'borderCollapse':'collapse','width':'100%','background':'#fff','border':'1px solid #e5e5e5'})],style={'overflowX':'auto'})],style={'marginTop':'16px'})



def _ceil_positive(x):

    try: return int(math.ceil(float(x)))

    except Exception: return 0

def detect_edm_spill_events(obs,spill_level):

    if obs is None or obs.empty or 'timestamp' not in obs.columns or 'Observed' not in obs.columns: return []

    df=obs[['timestamp','Observed']].copy(); df['timestamp']=pd.to_datetime(df['timestamp'],errors='coerce'); df['Observed']=pd.to_numeric(df['Observed'],errors='coerce'); df=df.dropna(subset=['timestamp']).sort_values('timestamp')

    events=[]; in_spill=False; start=None; last=None

    for t,v in zip(df['timestamp'].to_numpy(),df['Observed'].to_numpy()):

        t=pd.Timestamp(t); last=t

        if pd.isna(v): continue

        spilling=float(v)>=float(spill_level)

        if spilling and not in_spill: in_spill=True; start=t

        elif (not spilling) and in_spill: events.append({'start':start,'stop':t}); in_spill=False; start=None

    if in_spill and start is not None and last is not None: events.append({'start':start,'stop':last})

    return events

def apply_12_24_spill_logic(events):

    rows=[]; prev_E=None; prev_F=0; prev_G=None

    for idx,ev in enumerate(events):

        A=pd.Timestamp(ev['start']); B=pd.Timestamp(ev['stop']); C=max(0.0,(B-A).total_seconds()/60.0)

        D=A+pd.Timedelta(hours=12) if C<720 else A+pd.Timedelta(hours=12)+pd.Timedelta(days=_ceil_positive((C-720.0)/1440.0))

        if idx==0:

            E=D; F=1; G=A.year; J=0 if C==0 else (1 if C<720 else _ceil_positive(((C-720.0)/1440.0)+1.0))

        else:

            if (A-prev_E)>pd.Timedelta(days=1): E=D

            elif B<prev_E: E=prev_E

            elif B<(prev_E+pd.Timedelta(days=1)): E=prev_E+pd.Timedelta(days=1)

            else: E=prev_E+pd.Timedelta(days=_ceil_positive((B-prev_E).total_seconds()/86400.0))

            F=prev_F+1 if A>(prev_E+pd.Timedelta(days=1)) else prev_F

            G=A.year if (F==prev_F or A.year!=prev_G) else prev_G

            if F!=prev_F: J=1 if C<720 else _ceil_positive(((C-720.0)/1440.0)+1.0)

            else: J=0 if E==prev_E else (1 if B==prev_E else _ceil_positive((B-prev_E).total_seconds()/86400.0))

        rows.append({'spill_start':A,'spill_stop':B,'duration_min':C,'block_end_this':E,'spill_event':F,'year_start':int(G),'month_start':int(A.month),'spills':int(J)})

        prev_E,prev_F,prev_G=E,F,G

    return pd.DataFrame(rows)

def edm_monthly_pivot(calc_df):

    months=list(range(1,13)); headers=['Year']+[pd.Timestamp(2000,m,1).strftime('%b') for m in months]+['Total']

    if calc_df is None or calc_df.empty: return pd.DataFrame(columns=headers)

    out=[]

    for y in sorted(calc_df['year_start'].dropna().astype(int).unique().tolist()):

        row={'Year':y}; total=0

        for m in months:

            key=pd.Timestamp(2000,m,1).strftime('%b'); val=int(calc_df.loc[(calc_df['year_start']==y)&(calc_df['month_start']==m),'spills'].sum()); row[key]=val; total+=val

        row['Total']=total; out.append(row)

    return pd.DataFrame(out,columns=headers)

def _simple_table(records,headers=None):

    if not records: return html.Div('No rows.',style={'color':'#666'})

    headers=headers or list(records[0].keys())

    return html.Div([html.Table([html.Thead(html.Tr([html.Th(h,style=TABLE_HEAD) for h in headers])),html.Tbody([html.Tr([html.Td(rec.get(h,''),style=TABLE_CELL) for h in headers]) for rec in records])],style={'borderCollapse':'collapse','width':'100%','background':'#fff','border':'1px solid #e5e5e5'})],style={'overflowX':'auto'})



def _monthly_counts_to_long(monthly_df, label):

    months = [pd.Timestamp(2000, m, 1).strftime('%b') for m in range(1, 13)]

    rows = []

    if monthly_df is None or monthly_df.empty:

        return rows

    for _, row in monthly_df.iterrows():

        year = int(row.get('Year'))

        for m in months:

            rows.append({'Year': year, 'Month': m, label: int(row.get(m, 0) or 0)})

    return rows



def _model_series_from_simulated(sim, sim_files=None):

    warnings = []

    if sim is None or sim.empty or 'timestamp' not in sim.columns:

        return None, None, ['No simulated/modelled series is available for Model Spill assessment.']

    sim_cols = [c for c in sim.columns if c != 'timestamp']

    if not sim_cols:

        return None, None, ['No simulated/modelled value column is available for Model Spill assessment.']

    selected = sim_cols[0]

    if len(sim_cols) > 1 or len(sim_files or []) > 1:

        warnings.append('WARNING: Multiple simulated/modelled series are loaded. Model Spill assessment uses the first available simulated series: ' + str(selected) + '. To remove ambiguity, select only one simulated series/file before calculating spills or generating the report.')

    model_df = sim[['timestamp', selected]].rename(columns={selected: 'Observed'}).copy()

    return model_df, selected, warnings



def _spill_result_from_series(label, df, threshold_value):

    if threshold_value is None or threshold_value == '':

        return {'label': label, 'ok': False, 'message': f'{label} threshold is not set.', 'events': [], 'calc_df': pd.DataFrame(), 'monthly': edm_monthly_pivot(pd.DataFrame()), 'summary': []}

    try:

        threshold = float(threshold_value)

    except Exception:

        return {'label': label, 'ok': False, 'message': f'{label} threshold is not numeric: {threshold_value}', 'events': [], 'calc_df': pd.DataFrame(), 'monthly': edm_monthly_pivot(pd.DataFrame()), 'summary': []}

    events = detect_edm_spill_events(df, threshold)

    calc_df = apply_12_24_spill_logic(events)

    monthly = edm_monthly_pivot(calc_df)

    ts = pd.to_datetime(df['timestamp'], errors='coerce').dropna().sort_values() if df is not None and not df.empty else pd.Series(dtype='datetime64[ns]')

    deltas = ts.diff().dropna().dt.total_seconds() / 60.0 if len(ts) else pd.Series(dtype=float)

    deltas = deltas[deltas > 0]

    timestep = float(deltas.median()) if len(deltas) else None

    total_duration = float(calc_df['duration_min'].sum() / 60.0) if calc_df is not None and not calc_df.empty else 0.0

    total_spills = int(calc_df['spills'].sum()) if calc_df is not None and not calc_df.empty else 0

    summary = [

        {'Metric': f'{label} spill level', 'Value': f'{threshold:.4g}'},

        {'Metric': 'Threshold comparison rule', 'Value': 'Series >= threshold'},

        {'Metric': 'Individual above-threshold events', 'Value': str(len(events))},

        {'Metric': 'Total 12/24 spill count', 'Value': str(total_spills)},

        {'Metric': 'Total spill duration', 'Value': f'{total_duration:.3f} hr'},

        {'Metric': 'Data start', 'Value': fmt_dt(ts.min() if len(ts) else None)},

        {'Metric': 'Data end', 'Value': fmt_dt(ts.max() if len(ts) else None)},

        {'Metric': 'Timestep estimate', 'Value': '—' if timestep is None else f'{timestep:.3g} min'},

    ]

    return {'label': label, 'ok': True, 'message': '', 'events': events, 'calc_df': calc_df, 'monthly': monthly, 'summary': summary}



def _compare_spill_monthlies(observed_monthly, model_monthly):

    months = [pd.Timestamp(2000, m, 1).strftime('%b') for m in range(1, 13)]

    obs = {(r['Year'], r['Month']): r['Observed spills'] for r in _monthly_counts_to_long(observed_monthly, 'Observed spills')}

    mod = {(r['Year'], r['Month']): r['Modelled spills'] for r in _monthly_counts_to_long(model_monthly, 'Modelled spills')}

    keys = sorted(set(obs.keys()) | set(mod.keys()), key=lambda x: (x[0], months.index(x[1])))

    rows = []

    for year, month in keys:

        o = int(obs.get((year, month), 0)); m = int(mod.get((year, month), 0)); diff = m - o

        assessment = 'Over-predicting' if diff > 0 else ('Under-predicting' if diff < 0 else 'Matching')

        rows.append({'Year': year, 'Month': month, 'Observed spills': o, 'Modelled spills': m, 'Difference': diff, 'Assessment': assessment})

    return pd.DataFrame(rows, columns=['Year', 'Month', 'Observed spills', 'Modelled spills', 'Difference', 'Assessment'])



def _warning_panel(warnings):

    if not warnings:

        return None

    return html.Div([html.Div(w) for w in warnings], style={**ERROR_STYLE, 'marginBottom': '10px'})



def edm_assessment_panel(obs, threshold_value, sim=None, model_threshold_value=None, sim_files=None):

    warnings = []

    observed = _spill_result_from_series('Observed EDM / Threshold 1', obs, threshold_value)

    model_df, model_series, model_warnings = _model_series_from_simulated(sim, sim_files)

    warnings.extend(model_warnings)

    model = _spill_result_from_series('Model Spill / Threshold 2', model_df, model_threshold_value) if model_df is not None else {'label': 'Model Spill / Threshold 2', 'ok': False, 'message': 'No simulated/modelled series available.', 'monthly': edm_monthly_pivot(pd.DataFrame()), 'summary': []}

    comparison_df = pd.DataFrame(columns=['Year', 'Month', 'Observed spills', 'Modelled spills', 'Difference', 'Assessment'])

    if observed.get('ok') and model.get('ok'):

        comparison_df = _compare_spill_monthlies(observed['monthly'], model['monthly'])

    children = [html.H3('EDM / Model 12/24 Monthly Spill Count Assessment', style={'marginTop': '20px'})]

    wp = _warning_panel(warnings)

    if wp is not None:

        children.append(wp)

    children.append(html.Div('Observed spills use Observed data and Threshold 1. Model spills use the first loaded simulated/modelled series and Threshold 2. Both use the same reviewed 12/24 logic.', style={'color': '#555', 'fontSize': '13px', 'marginBottom': '10px'}))

    children += [html.H4('Observed spill assessment summary'), _simple_table(observed.get('summary', []), ['Metric', 'Value'])]

    if not observed.get('ok'):

        children.append(html.Div(observed.get('message', 'Observed spill assessment not available.'), style=ERROR_STYLE))

    children += [html.H4('Observed monthly 12/24 spill count', style={'marginTop': '16px'}), _simple_table(observed['monthly'].to_dict('records'), observed['monthly'].columns.tolist())]

    children += [html.H4('Model spill assessment summary', style={'marginTop': '18px'})]

    if model_series:

        children.append(html.Div(f'Model series used: {model_series}', style={'color': '#555', 'fontSize': '13px', 'marginBottom': '8px'}))

    children.append(_simple_table(model.get('summary', []), ['Metric', 'Value']))

    if not model.get('ok'):

        children.append(html.Div(model.get('message', 'Model spill assessment not available.'), style=ERROR_STYLE))

    children += [html.H4('Model monthly 12/24 spill count', style={'marginTop': '16px'}), _simple_table(model['monthly'].to_dict('records'), model['monthly'].columns.tolist())]

    children += [html.H4('Observed vs Modelled monthly spill comparison', style={'marginTop': '18px'})]

    if comparison_df.empty:

        children.append(html.Div('Comparison requires both Threshold 1 and Threshold 2 plus observed and simulated data.', style={'color': '#666'}))

    else:

        children.append(_simple_table(comparison_df.to_dict('records'), comparison_df.columns.tolist()))

    return html.Div(children, style={'marginTop': '18px'})



def _html_table_from_records(title, records, headers):

    rows = [f'<h2>{title}</h2>', '<table><thead><tr>' + ''.join(f'<th>{h}</th>' for h in headers) + '</tr></thead><tbody>']

    for rec in records:

        rows.append('<tr>' + ''.join(f'<td>{rec.get(h, "")}</td>' for h in headers) + '</tr>')

    rows.append('</tbody></table>')

    return ''.join(rows)



def _spills_report_html(variable, obs, sim, rain, thresholds, colors, observed_result, model_result, comparison_df, warnings):

    p0, p1 = get_full_extent(obs, sim)

    fig = make_figure(variable, obs, sim, rain, colors, thresholds, 'Full time period', REPORT_MAX_POINTS_PER_TRACE, True, p0, p1)

    fig_html = pio.to_html(fig, include_plotlyjs='cdn', full_html=False, config={'displaylogo': False, 'responsive': True})

    css = "body{font-family:Segoe UI,Arial,sans-serif;margin:18px;background:#f7f7f8;color:#111}section{background:white;border:1px solid #ddd;border-radius:8px;padding:14px;margin:18px 0}table{border-collapse:collapse;width:100%;background:white;margin:8px 0 18px 0}th{background:#f2f4f7;border:1px solid #ddd;padding:7px;text-align:center}td{border:1px solid #ddd;padding:7px;text-align:center}.warning{background:#fff2f2;border:1px solid #ffb3b3;color:#7a0000;padding:10px;border-radius:6px;margin:8px 0}"

    warn_html = ''.join(f'<div class="warning">{w}</div>' for w in warnings)

    obs_table = _html_table_from_records('Observed spills table', observed_result['monthly'].to_dict('records'), observed_result['monthly'].columns.tolist())

    model_table = _html_table_from_records('Model spills table', model_result['monthly'].to_dict('records'), model_result['monthly'].columns.tolist())

    comp_table = _html_table_from_records('Observed vs Modelled spills table', comparison_df.to_dict('records'), comparison_df.columns.tolist())

    return f'<!doctype html><html><head><meta charset="utf-8"><title>V17 Spill Assessment Report</title><style>{css}</style></head><body><h1>ICM CSV Calibration Viewer V17 — Spill Assessment Report</h1>{warn_html}<section><h2>1. Full time period graph</h2>{fig_html}</section><section>{obs_table}</section><section>{model_table}</section><section>{comp_table}</section></body></html>'





def available_years(*dfs):

    ys=set()

    for df in dfs:

        if df is not None and not df.empty and 'timestamp' in df.columns: ys.update(df.timestamp.dropna().dt.year.astype(int).tolist())

    return sorted(ys)

def year_periods(year):

    y=int(year); return [(f'{y}_complete',f'{y} Complete Period',pd.Timestamp(y,1,1),pd.Timestamp(y,12,31,23,59,59)),(f'{y}_jan_apr',f'{y} Jan-Apr',pd.Timestamp(y,1,1),pd.Timestamp(y,4,30,23,59,59)),(f'{y}_may_aug',f'{y} May-Aug',pd.Timestamp(y,5,1),pd.Timestamp(y,8,31,23,59,59)),(f'{y}_sep_dec',f'{y} Sep-Dec',pd.Timestamp(y,9,1),pd.Timestamp(y,12,31,23,59,59))]

def make_html_report(variable,year,obs,sim,rain,colors,thresholds):

    sections=[]

    for _,title,start,end in year_periods(year):

        fig=make_figure(variable,filter_df_by_period(obs,start,end),filter_df_by_period(sim,start,end),filter_df_by_period(rain,start,end),colors,thresholds,title,REPORT_MAX_POINTS_PER_TRACE,True)

        div=pio.to_html(fig,include_plotlyjs='cdn' if not sections else False,full_html=False,config={'displaylogo':False,'responsive':True}); sections.append(f'<section class="graph-section"><h2>{title}</h2>{div}</section>')

    css='body{font-family:Segoe UI,Arial,sans-serif;margin:18px;background:#f7f7f8}.graph-section{background:white;border:1px solid #ddd;border-radius:8px;padding:14px;margin:18px 0;page-break-after:always}'

    return f'<!doctype html><html><head><meta charset="utf-8"><title>ICM {year} {variable} Graph Report</title><style>{css}</style></head><body><h1>ICM CSV Calibration Graph Report</h1><div>Variable: {variable.capitalize()} | Year: {year}</div>{"".join(sections)}</body></html>'





# ---------------- V17 additive utilities: active series, scatter and storage ----------------

def active_sim_columns(sim_df, active_col=None):

    if sim_df is None or sim_df.empty or 'timestamp' not in sim_df.columns:

        return sim_df

    if active_col and active_col in sim_df.columns:

        return sim_df[['timestamp', active_col]].copy()

    return sim_df



def make_scatter_figure(variable, obs, sim, active_col=None, start=None, end=None):

    fig = go.Figure()

    if obs is None or obs.empty or sim is None or sim.empty:

        fig.add_annotation(text='Scatter requires observed and simulated data.', x=0.5, y=0.5, xref='paper', yref='paper', showarrow=False)

        fig.update_layout(template='plotly_white', height=650, title='Observed vs Simulated scatter')

        return fig

    sim_use = active_sim_columns(sim, active_col)

    cols = [c for c in sim_use.columns if c != 'timestamp']

    if not cols:

        fig.add_annotation(text='No active simulated profile selected.', x=0.5, y=0.5, xref='paper', yref='paper', showarrow=False)

        fig.update_layout(template='plotly_white', height=650, title='Observed vs Simulated scatter')

        return fig

    s, e = data_overlap_period(obs, sim_use, start, end)

    if s is None:

        fig.add_annotation(text='No observed/simulated overlap for scatter period.', x=0.5, y=0.5, xref='paper', yref='paper', showarrow=False)

        fig.update_layout(template='plotly_white', height=650, title='Observed vs Simulated scatter')

        return fig

    obs_f = filter_df_by_period(obs, s, e)

    sim_f = filter_df_by_period(sim_use[['timestamp', cols[0]]], s, e)

    paired = interpolate_sim_to_obs(obs_f, sim_f)

    if paired.empty:

        fig.add_annotation(text='No paired observed/simulated points.', x=0.5, y=0.5, xref='paper', yref='paper', showarrow=False)

        fig.update_layout(template='plotly_white', height=650, title='Observed vs Simulated scatter')

        return fig

    fig.add_trace(go.Scattergl(x=paired['obs'], y=paired['sim'], mode='markers', name=cols[0], marker=dict(size=5, opacity=0.65)))

    mn = float(np.nanmin([paired['obs'].min(), paired['sim'].min()]))

    mx = float(np.nanmax([paired['obs'].max(), paired['sim'].max()]))

    if math.isfinite(mn) and math.isfinite(mx):

        pad = (mx-mn)*0.05 if mx>mn else 1.0

        fig.add_trace(go.Scatter(x=[mn-pad, mx+pad], y=[mn-pad, mx+pad], mode='lines', name='1:1 line', line=dict(color='#555', dash='dash')))

        fig.update_xaxes(range=[mn-pad, mx+pad])

        fig.update_yaxes(range=[mn-pad, mx+pad])

    unit = UNITS.get(variable,'')

    fig.update_layout(template='plotly_white', height=650, title=f'Observed vs Simulated Scatter — {cols[0]}', xaxis_title=f'Observed {variable.capitalize()}'+(f' ({unit})' if unit else ''), yaxis_title=f'Simulated {variable.capitalize()}'+(f' ({unit})' if unit else ''), legend=dict(orientation='h', y=1.02, x=1, xanchor='right'))

    return fig



def available_value_columns_from_files(filenames):

    paths = [path_from_name(DATA_FOLDER, n) for n in (filenames or [])]

    cols = []

    for p in paths:

        if p is None or not Path(p).exists():

            continue

        try:

            ev = parse_icm_event_csv(p, Path(p).stem)

            if ev is not None:

                cols += [c for c in ev.columns if c != 'timestamp']

                continue

            df = read_csv_loose(p)

            df.columns = [str(c).strip() for c in df.columns]

            tc = detect_time_column(df)

            vals = numeric_value_columns(df, tc) if tc else []

            for c in vals:

                base = str(c).strip() or Path(p).stem

                if normalise(base) in ['value','1']:

                    base = Path(p).stem

                cols.append(base)

        except Exception:

            pass

    # preserve order and uniqueness

    out=[]

    for c in cols:

        if c not in out:

            out.append(c)

    return out



def parse_wide_timeseries_file(filename, selected_col=None):

    p = path_from_name(DATA_FOLDER, filename)

    if p is None:

        raise ValueError('CSV file not found.')

    ev = parse_icm_event_csv(p, selected_col or Path(p).stem)

    if ev is not None:

        return ev

    df = read_csv_loose(p)

    df.columns = [str(c).strip() for c in df.columns]

    tc = detect_time_column(df)

    vals = numeric_value_columns(df, tc) if tc else []

    if not tc or not vals:

        raise ValueError(f'Could not detect time/value columns in {filename}.')

    col = selected_col if selected_col in vals else vals[0]

    out = pd.DataFrame({'timestamp':pd.to_datetime(df[tc], errors='coerce', dayfirst=True), col:clean_numeric_series(df[col])}).dropna(subset=['timestamp'])

    out = out.sort_values('timestamp').groupby('timestamp', as_index=False)[col].mean()

    return out



def integrate_positive_flow(df, value_col, start, stop):

    if df is None or df.empty:

        return 0.0

    s = pd.Timestamp(start); e = pd.Timestamp(stop)

    x = df[['timestamp', value_col]].copy()

    x['timestamp'] = pd.to_datetime(x['timestamp'], errors='coerce')

    x[value_col] = clean_numeric_series(x[value_col])

    x = x.dropna(subset=['timestamp']).sort_values('timestamp')

    x = x[(x['timestamp'] >= s) & (x['timestamp'] <= e)].copy()

    if x.empty:

        return 0.0

    ts = x['timestamp'].to_numpy()

    q = np.maximum(pd.to_numeric(x[value_col], errors='coerce').fillna(0.0).to_numpy(float), 0.0)

    if len(x) >= 2:

        deltas = pd.Series(pd.to_datetime(x['timestamp'])).diff().dt.total_seconds().dropna()

        dt = float(deltas[deltas>0].median()) if len(deltas[deltas>0]) else 0.0

    else:

        dt = 0.0

    return float(np.sum(q) * dt)



def storage_blocks_from_model_flow(flow_df, flow_col, threshold):

    model_df = flow_df[['timestamp', flow_col]].rename(columns={flow_col:'Observed'}).copy()

    model_df['Observed'] = clean_numeric_series(model_df['Observed'])

    events = detect_edm_spill_events(model_df, threshold)

    calc = apply_12_24_spill_logic(events)

    if calc is None or calc.empty:

        return pd.DataFrame(columns=['Year','Block','Start','Stop','Volume_m3'])

    rows=[]

    for _, r in calc.iterrows():

        if int(r.get('spills',0)) <= 0:

            continue

        A = pd.Timestamp(r['spill_start']); B = pd.Timestamp(r['spill_stop'])

        j = int(r['spills'])

        # Split each counted spill contribution into first 12 hr then 24 hr blocks.

        cursor = A

        for k in range(j):

            block_end = min(B, cursor + (pd.Timedelta(hours=12) if k == 0 else pd.Timedelta(hours=24)))

            vol = integrate_positive_flow(flow_df, flow_col, cursor, block_end)

            rows.append({'Year': int(A.year), 'Block': k+1, 'Start': fmt_dt(cursor), 'Stop': fmt_dt(block_end), 'Volume_m3': vol})

            cursor = block_end

            if cursor >= B:

                break

    return pd.DataFrame(rows)



def storage_requirement_panel(flow_filename, flow_profile, threshold2):

    stage=[f'Storage calculation clicked at {now_text()}']

    if not flow_filename:

        return html.Div('Select an overflow link flow CSV before calculating storage.', style=ERROR_STYLE)

    if threshold2 in [None, '']:

        return html.Div('Threshold 2 is required for modelled overflow event detection.', style=ERROR_STYLE)

    try:

        th = float(threshold2)

        df = parse_wide_timeseries_file(flow_filename, flow_profile)

        cols = [c for c in df.columns if c != 'timestamp']

        if not cols:

            raise ValueError('No overflow flow profile column detected.')

        col = flow_profile if flow_profile in cols else cols[0]

        blocks = storage_blocks_from_model_flow(df, col, th)

        if blocks.empty:

            return html.Div([stage_html(stage + [f'Parsed overflow profile {col}. No 12/24 spill blocks detected at Threshold 2 = {th:g}.'], OK_STYLE)])

        summaries=[]

        for y, g in blocks.groupby('Year'):

            volumes=sorted([float(v) for v in g['Volume_m3'].fillna(0.0)], reverse=True)

            required = volumes[10] if len(volumes) >= 11 else 0.0

            summaries.append({'Year': int(y), '12/24 spill blocks': len(volumes), 'Required storage for <=10 spills (m³)': f'{required:.3f}', 'Max block volume (m³)': f'{max(volumes) if volumes else 0.0:.3f}', 'Annual block volume total (m³)': f'{sum(volumes):.3f}'})

        max_req = max(float(x['Required storage for <=10 spills (m³)']) for x in summaries) if summaries else 0.0

        detail = blocks.copy()

        detail['Volume_m3'] = detail['Volume_m3'].map(lambda x: f'{float(x):.3f}')

        return html.Div([

            stage_html(stage + [f'Overflow flow file: {flow_filename}', f'Profile used: {col}', f'Threshold 2: {th:g}', 'Method: ranked modelled 12/24 spill-block volumes; target <=10 spills/year; required storage = 11th largest annual block volume.'], OK_STYLE),

            html.H4('Storage requirement summary by year'),

            _simple_table(summaries, ['Year','12/24 spill blocks','Required storage for <=10 spills (m³)','Max block volume (m³)','Annual block volume total (m³)']),

            html.Div(f'Maximum required storage across years: {max_req:.3f} m³', style={**INFO_STYLE, 'marginTop':'10px', 'fontWeight':'700'}),

            html.H4('Ranked 12/24 spill-block detail', style={'marginTop':'16px'}),

            _simple_table(detail.sort_values(['Year','Volume_m3'], ascending=[True,False]).to_dict('records'), detail.columns.tolist()),

        ])

    except Exception as e:

        return exception_panel('Storage requirement calculation failed', e, stage)





# ============================== V18_PATCH_MARKER ==============================
V18_HYDRO_CHANNELS=[('flow','Flow_m3_s','Flow','m³/s','#1f77b4'),('depth','Depth_m','Depth','m','#ff0000'),('velocity','Velocity_m_s','Velocity','m/s','#2ca02c')]
V18_CHANNEL_BY_KEY={k:(c,l,u,col) for k,c,l,u,col in V18_HYDRO_CHANNELS}; V18_CHANNEL_BY_COL={c:(k,l,u,col) for k,c,l,u,col in V18_HYDRO_CHANNELS}
WAPUG_MIN_INTENSITY=5.0; WAPUG_TOTAL_DEPTH_MM=5.0; WAPUG_DRY_GAP_MIN=15.0; WAPUG_GT50_INTENSITY_DURATION_MIN=6.0; WAPUG_GT50_STORM_DURATION_MIN=60.0; V18_WAPUG_ORANGE='#ff9900'
def v18_is_fdv_name(name): return str(name or '').lower().endswith(('.fdv','.fdv.txt'))
def v18_is_r_name(name): return str(name or '').lower().endswith(('.r','.r.txt')) and not str(name or '').lower().endswith('.fdv.txt')
def v18_dt(s):
    s=str(s or '').strip()
    if len(s)==10 and s.isdigit():
        yy=int(s[:2]); y=2000+yy if yy<=79 else 1900+yy
        return pd.Timestamp(y,int(s[2:4]),int(s[4:6]),int(s[6:8]),int(s[8:10]))
    return pd.NaT
def v18_unit(field,unit):
    f=str(field).upper(); u=str(unit).upper().replace('³','3')
    if f=='FLOW': return 'Flow_m3_s', (0.001 if u in ('L/S','LPS','L/SEC') else 1.0)
    if f=='DEPTH': return 'Depth_m', (0.001 if u in ('MM','MILLIMETRE','MILLIMETRES') else 1.0)
    if f=='VELOCITY': return 'Velocity_m_s', 1.0
    return re.sub(r'[^A-Za-z0-9_]+','_',f.title()).strip('_') or 'Value', 1.0
def parse_fdv_ascii_v18(path):
    path=Path(path); lines=path.read_text(encoding='utf-8',errors='ignore').splitlines(); fields=[]; units=[]; cstart=cend=None; mid=path.stem.replace('.fdv','')
    for i,line in enumerate(lines):
        s=line.strip()
        if s.startswith('**IDENTIFIER:'):
            try: mid=line.split(':',1)[1].strip().split(',',1)[1].strip()
            except Exception: pass
        elif s.startswith('**FIELD:'):
            p=line.split(':',1)[1].strip(); p=p.split(',',1)[1] if ',' in p else p; fields=[x.strip().upper() for x in p.split(',') if x.strip()]
        elif s.startswith('**UNITS:'):
            p=line.split(':',1)[1].strip(); p=p.split(',',1)[1] if ',' in p else p; units=[x.strip().upper() for x in p.split(',') if x.strip()]
        elif s=='*CSTART': cstart=i
        elif s=='*CEND': cend=i; break
    if cstart is None or cend is None or not fields: raise ValueError(f'FDV parser: invalid header in {path.name}')
    units += ['']*(len(fields)-len(units)); ct=[]
    for line in lines[cstart+1:cend]: ct.extend(line.split())
    dts=[x for x in ct if re.fullmatch(r'\d{10}',x)]
    if len(dts)<1: raise ValueError(f'FDV parser: START not found in {path.name}')
    start=v18_dt(dts[0]); interval=2.0
    try:
        if len(dts)>1:
            j=ct.index(dts[1]); interval=float(ct[j+1]) if j+1<len(ct) else 2.0
    except Exception: pass
    toks=[]
    for line in lines[cend+1:]: toks += re.findall(r'[-+]?\d*\.\d+|[-+]?\d+',line)
    n=len(fields); toks=toks[:(len(toks)//n)*n]
    if not toks: raise ValueError(f'FDV parser: no data in {path.name}')
    arr=np.asarray(toks,dtype=float).reshape((-1,n)); out=pd.DataFrame({'timestamp':pd.date_range(start=start,periods=arr.shape[0],freq=pd.Timedelta(minutes=interval))})
    meta={'monitor_id':mid,'fields':fields,'units':units,'interval_min':interval}
    for j,f in enumerate(fields):
        col,fac=v18_unit(f,units[j]); out[col]=arr[:,j]*fac
    if 'Depth_m' in out: out['Observed']=out['Depth_m']
    elif 'Flow_m3_s' in out: out['Observed']=out['Flow_m3_s']
    elif 'Velocity_m_s' in out: out['Observed']=out['Velocity_m_s']
    return out,meta
def v18_hydro_columns(df): return [c for _,c,_,_,_ in V18_HYDRO_CHANNELS if df is not None and c in df.columns and pd.to_numeric(df[c],errors='coerce').notna().any()]
_V17_parse_observed_source=parse_observed_source; _V17_parse_simulated_source=parse_simulated_source; _V17_make_figure=make_figure; _V17_make_scatter_figure=make_scatter_figure; _V17_available_value_columns_from_files=available_value_columns_from_files; _V17_parse_wide_timeseries_file=parse_wide_timeseries_file
def parse_observed_source(path):
    if path is not None and v18_is_fdv_name(Path(path).name):
        df,m=parse_fdv_ascii_v18(path); return df,f"FDV observed parser V18; monitor={m['monitor_id']}; fields={','.join(m['fields'])}; rows={len(df):,}; interval={m['interval_min']} min"
    return _V17_parse_observed_source(path)
def parse_simulated_source(paths):
    valid=[p for p in paths if p is not None and Path(p).exists()]
    if any(v18_is_fdv_name(Path(p).name) for p in valid):
        merged=None; msgs=[]
        for p in valid:
            if v18_is_fdv_name(Path(p).name):
                tmp,m=parse_fdv_ascii_v18(p); tmp=tmp[['timestamp']+v18_hydro_columns(tmp)].copy(); msgs.append(f"Loaded FDV {Path(p).name}; columns={', '.join([c for c in tmp.columns if c!='timestamp'])}; rows={len(tmp):,}")
            else: tmp,msg=_V17_parse_simulated_source([p]); msgs.append(msg)
            merged=tmp if merged is None else pd.merge(merged,tmp,on='timestamp',how='outer')
        return (merged.sort_values('timestamp') if merged is not None else pd.DataFrame(columns=['timestamp'])), ' | '.join(msgs)
    return _V17_parse_simulated_source(paths)
def available_value_columns_from_files(filenames):
    out=[]
    for n in filenames or []:
        p=path_from_name(DATA_FOLDER,n)
        try: out += (v18_hydro_columns(parse_fdv_ascii_v18(p)[0]) if p and v18_is_fdv_name(Path(p).name) else _V17_available_value_columns_from_files([n]))
        except Exception: pass
    return list(dict.fromkeys(out))
def parse_wide_timeseries_file(filename,selected_col=None):
    p=path_from_name(DATA_FOLDER,filename)
    if p and v18_is_fdv_name(Path(p).name):
        df,_=parse_fdv_ascii_v18(p); cols=v18_hydro_columns(df); return df[['timestamp']+([selected_col] if selected_col in cols else cols)].copy()
    return _V17_parse_wide_timeseries_file(filename,selected_col)
def v18_rain_canon(df,factor=1.0):
    if df is None or df.empty: return pd.DataFrame(columns=['timestamp','Rainfall'])
    out=df.copy(); out['timestamp']=pd.to_datetime(out['timestamp'],errors='coerce'); out['Rainfall']=pd.to_numeric(out['Rainfall'],errors='coerce')*float(factor or 1.0)
    return out.dropna(subset=['timestamp']).sort_values('timestamp').groupby('timestamp',as_index=False)['Rainfall'].mean()
def parse_r_ascii_file_v18(path,factor=1.0):
    lines=Path(path).read_text(encoding='utf-8',errors='ignore').splitlines(); cstart=cend=None
    for i,l in enumerate(lines):
        if l.strip().upper()=='*CSTART': cstart=i
        elif l.strip().upper()=='*CEND': cend=i; break
    if cstart is not None and cend is not None:
        ct=[]
        for l in lines[cstart+1:cend]: ct.extend(l.split())
        dts=[x for x in ct if re.fullmatch(r'\d{10}',x)]; vals=[]
        for l in lines[cend+1:]: vals += re.findall(r'[-+]?\d*\.\d+|[-+]?\d+',l)
        if dts and vals:
            interval=2.0
            try:
                if len(dts)>1:
                    j=ct.index(dts[1]); interval=float(ct[j+1])
            except Exception: pass
            return v18_rain_canon(pd.DataFrame({'timestamp':pd.date_range(start=v18_dt(dts[0]),periods=len(vals),freq=pd.Timedelta(minutes=interval)),'Rainfall':np.asarray(vals,dtype=float)}),factor)
    rows=[]
    for l in lines:
        parts=[x.strip() for x in re.split(r',|\t|\s{2,}',l.strip()) if x.strip()]
        if len(parts)>=2:
            t=pd.to_datetime(parts[0],errors='coerce',dayfirst=True); v=pd.to_numeric(parts[1],errors='coerce')
            if pd.notna(t) and pd.notna(v): rows.append((t,v))
    return v18_rain_canon(pd.DataFrame(rows,columns=['timestamp','Rainfall']),factor) if rows else pd.DataFrame(columns=['timestamp','Rainfall'])
def v18_load_full_rainfall(filename,factor=1.0,stage=None):
    if not filename: return pd.DataFrame(columns=['timestamp','Rainfall']),'No rainfall file selected.'
    p=path_from_name(DATA_FOLDER,filename)
    if p and v18_is_r_name(Path(p).name):
        r=parse_r_ascii_file_v18(p,factor); return r,f'R rainfall parser V18; rows={len(r):,}; conversion factor={float(factor or 1):g}'
    cdir,meta=REGISTRY.ensure_rainfall_cache(filename,stage); parts=sorted(cdir.glob('rainfall_*_part*.parquet'))
    r=pd.concat([pd.read_parquet(x) for x in parts],ignore_index=True) if parts else pd.DataFrame(columns=['timestamp','Rainfall'])
    return v18_rain_canon(r[['timestamp','Rainfall']],factor),f"Full rainfall loaded for WAPUG; rows={len(r):,}; parser={meta.get('format_detected','unknown')}; conversion factor={float(factor or 1):g}"
def v18_query_rainfall(filename,t0,t1,profile='1',factor=1.0,stage=None):
    p=path_from_name(DATA_FOLDER,filename)
    if filename and p and v18_is_r_name(Path(p).name):
        r,msg=v18_load_full_rainfall(filename,factor,stage); return filter_df_by_period(r,t0,t1),msg
    r,msg=REGISTRY.query_rainfall(filename,t0,t1,profile,stage); return v18_rain_canon(r,factor),msg+f'; conversion factor={float(factor or 1):g}'
def detect_rain_events_v18(rain,mi,idur,depth,edur,drygap):
    if rain is None or rain.empty: return []
    r=rain[['timestamp','Rainfall']].copy(); r['timestamp']=pd.to_datetime(r['timestamp']); r['Rainfall']=pd.to_numeric(r['Rainfall'],errors='coerce').fillna(0); r=r.sort_values('timestamp')
    d=r.timestamp.diff().dropna().dt.total_seconds()/60; d=d[d>0]; dt=float(d.median()) if len(d) else 2.0; ev=[]; vals=[]; times=[]; dry=0; active=False
    def close(vals,times):
        if not vals: return
        dur=len(vals)*dt; dep=float(np.sum(vals)*dt/60); peak=float(np.max(vals)); cur=best=0
        for v in vals:
            if v>=mi: cur+=dt; best=max(best,cur)
            else: cur=0
        if dur>=edur and dep>=depth and best>=idur: ev.append({'Event':len(ev)+1,'Start':times[0],'Stop':times[-1],'Duration_min':dur,'Total_depth_mm':dep,'Peak_intensity':peak,'Intensity_streak_min':best,'Interval_min':dt})
    for t,v in zip(r.timestamp,r.Rainfall):
        v=float(v)
        if not active and v>0: active=True; vals=[v]; times=[t]; dry=0
        elif active:
            vals.append(v); times.append(t); dry=dry+dt if v<=0 else 0
            if dry>=drygap:
                n=int(round(dry/dt)); close(vals[:-n] if n else vals,times[:-n] if n else times); active=False; vals=[]; times=[]; dry=0
    if active: close(vals,times)
    return ev
def v18_event_strokes(rain,events):
    if rain is None or rain.empty or not events: return [],[]
    r=rain[['timestamp','Rainfall']].copy(); r['timestamp']=pd.to_datetime(r['timestamp']); r['Rainfall']=pd.to_numeric(r['Rainfall'],errors='coerce'); m=pd.Series(False,index=r.index)
    for e in events: m |= (r.timestamp>=pd.Timestamp(e['Start']))&(r.timestamp<=pd.Timestamp(e['Stop']))&(r.Rainfall>0)
    xs=[]; ys=[]
    for t,v in zip(r.loc[m,'timestamp'],r.loc[m,'Rainfall']): xs += [t,t,None]; ys += [0,float(v),None]
    return xs,ys
def make_figure(variable,obs,sim,rain,colors,thresholds,title_suffix='',max_points=DISPLAY_MAX_POINTS_PER_TRACE,stats_box=True,stats_start=None,stats_end=None,wapug_events=None,wapug_color=V18_WAPUG_ORANGE):
    h=v18_hydro_columns(obs)
    if not h: return _V17_make_figure(variable,obs,sim,rain,colors,thresholds,title_suffix,max_points,stats_box,stats_start,stats_end)
    has_rain=rain is not None and not rain.empty; rows=(1 if has_rain else 0)+len(h)+(1 if stats_box else 0); specs=[[{'type':'xy'}] for _ in range(rows)]
    if stats_box: specs[-1]=[{'type':'table'}]
    titles=(['Rainfall'] if has_rain else [])+[V18_CHANNEL_BY_COL[c][1] for c in h]+([''] if stats_box else [])
    fig=make_subplots(rows=rows,cols=1,shared_xaxes=True,row_heights=[1/rows]*rows,vertical_spacing=0.055,specs=specs,subplot_titles=titles); row=1
    if has_rain:
        xs,ys,hx,hy=rainfall_vertical_strokes(rain); fig.add_trace(go.Scattergl(x=xs,y=ys,mode='lines',name='Rainfall',line=dict(color=colors.get('rain','#4A90E2'),width=1),opacity=0.6,hoverinfo='skip'),row=row,col=1)
        wx,wy=v18_event_strokes(rain,wapug_events or []); fig.add_trace(go.Scattergl(x=wx,y=wy,mode='lines',name='Highlighted rainfall event',line=dict(color=wapug_color or V18_WAPUG_ORANGE,width=2.4),hoverinfo='skip'),row=row,col=1)
        rmax=rainfall_axis_max(rain,thresholds.get('rain_ymax')); fig.update_yaxes(title_text='Rainfall',range=[rmax,0] if rmax else None,autorange=False if rmax else 'reversed',row=row,col=1); row+=1
    for col in h:
        key,label,unit,defcol=V18_CHANNEL_BY_COL[col]; x,y=downsample_xy(obs.timestamp.to_numpy(),obs[col].to_numpy(),max_points); fig.add_trace(go.Scatter(x=x,y=y,mode='lines',name=f'Observed {label}',line=dict(color=colors.get('obs','#ff0000') if key=='depth' else defcol,width=2.2)),row=row,col=1)
        if sim is not None and not sim.empty:
            sims=[c for c in sim.columns if c!='timestamp' and (c==col or normalise(c)==normalise(col) or normalise(label) in normalise(c))]
            for sc in sims:
                tmp=sim[['timestamp',sc]].dropna(subset=[sc]); sx,sy=downsample_xy(tmp.timestamp.to_numpy(),tmp[sc].to_numpy(),max_points); fig.add_trace(go.Scatter(x=sx,y=sy,mode='lines',name=f'Simulated {label}: {sc}',line=dict(color=colors.get('sim','#0008ff'),width=2)),row=row,col=1)
        if key=='depth':
            x0,x1=get_full_extent(obs,sim,rain); add_threshold(fig,x0,x1,thresholds.get('th1'),thresholds.get('th1_label'),thresholds.get('th1_color'),row); add_threshold(fig,x0,x1,thresholds.get('th2'),thresholds.get('th2_label'),thresholds.get('th2_color'),row)
        fig.update_yaxes(title_text=f'{label} ({unit})',row=row,col=1); row+=1
    fig.update_layout(template='plotly_white',height=max(760,230*rows),title='Observed hydraulic series',hovermode='x unified',legend=dict(orientation='h',y=1.02,x=1,xanchor='right'),margin=dict(l=70,r=35,t=85,b=80),uirevision='keep')
    return fig
def make_scatter_figure(variable,obs,sim,active_col=None,start=None,end=None,scatter_variable=None,log_mode=False):
    key=scatter_variable or variable; col,label,unit,_=V18_CHANNEL_BY_KEY.get(key,V18_CHANNEL_BY_KEY['depth'])
    if obs is None or obs.empty or col not in obs.columns: return _V17_make_scatter_figure(variable,obs,sim,active_col,start,end) if not v18_hydro_columns(obs) else empty_figure(f'Observed {label} series is not available.')
    sim_cols=[c for c in (sim.columns if sim is not None and not sim.empty else []) if c!='timestamp']; sim_col=active_col if active_col in sim_cols else next((c for c in sim_cols if c==col or normalise(label) in normalise(c)), sim_cols[0] if len(sim_cols)==1 else None)
    if not sim_col: return empty_figure(f'Simulated {label} series/profile is not available or ambiguous.')
    obs2=obs[['timestamp',col]].rename(columns={col:'Observed'}); sim2=sim[['timestamp',sim_col]]; s,e=data_overlap_period(obs2,sim2,start,end)
    if s is None: return empty_figure('No observed/simulated overlap for scatter period.')
    paired=interpolate_sim_to_obs(filter_df_by_period(obs2,s,e),filter_df_by_period(sim2,s,e)); exc=0
    if log_mode:
        before=len(paired); paired=paired[(paired.obs>0)&(paired.sim>0)]; exc=before-len(paired)
    fig=go.Figure(); fig.add_trace(go.Scattergl(x=paired.obs,y=paired.sim,mode='markers',name=label,marker=dict(size=5,opacity=0.65)))
    if not paired.empty:
        mn=float(np.nanmin([paired.obs.min(),paired.sim.min()])); mx=float(np.nanmax([paired.obs.max(),paired.sim.max()])); fig.add_trace(go.Scatter(x=[mn,mx],y=[mn,mx],mode='lines',name='1:1 line',line=dict(color='#555',dash='dash')))
    if log_mode: fig.update_xaxes(type='log'); fig.update_yaxes(type='log')
    fig.update_layout(template='plotly_white',height=650,title=f'Observed vs Simulated Scatter — {label}'+(f' (log; excluded {exc:,})' if log_mode else ''),xaxis_title=f'Observed {label} ({unit})',yaxis_title=f'Simulated {label} ({unit})',transition={'duration':450,'easing':'cubic-in-out'},uirevision='scatter-v18')
    return fig
def wapug_events_panel_v18(events,mode_text,params):
    rows=[{'Event':e['Event'],'Start':fmt_dt(e['Start']),'Stop':fmt_dt(e['Stop']),'Duration min':f"{e['Duration_min']:.3f}",'Total depth mm':f"{e['Total_depth_mm']:.3f}",'Peak intensity':f"{e['Peak_intensity']:.3f}",'Intensity streak min':f"{e['Intensity_streak_min']:.3f}"} for e in (events or [])]
    return html.Div([html.H3('WAPUG / Manual Rainfall Events'),html.Div(mode_text,style={'color':'#555'}),html.H4('Criteria used'),_simple_table([{'Parameter':k,'Value':v} for k,v in params.items()],['Parameter','Value']),html.H4('Detected events'),_simple_table(rows,list(rows[0].keys())) if rows else html.Div('No qualifying rainfall events detected over the full selected rainfall file.',style={'color':'#666'})])
def data_assessment_panel_v18(obs,rain=None,wapug_events=None):
    if obs is None or obs.empty: return html.Div('No selected observed data available.',style={'color':'#666'})
    h=v18_hydro_columns(obs); rows=[]; df=obs.copy(); df['timestamp']=pd.to_datetime(df.timestamp); df=df.sort_values('timestamp')
    for wk,g in df.groupby(pd.Grouper(key='timestamp',freq='W-SUN',label='right',closed='right')):
        if g.empty: continue
        r={'Week ending':fmt_dt(wk),'Start':fmt_dt(g.timestamp.min()),'End':fmt_dt(g.timestamp.max()),'Rows':len(g)}; notes=[]
        for c in h:
            key,label,unit,_=V18_CHANNEL_BY_COL[c]; s=pd.to_numeric(g[c],errors='coerce'); cov=s.notna().mean()*100; r[f'{label} coverage %']=f'{cov:.1f}'; r[f'{label} min']=fmt(float(s.min())) if s.notna().any() else '—'; r[f'{label} max']=fmt(float(s.max())) if s.notna().any() else '—'
            if cov<60: notes.append(f'{label} low coverage')
        r['WAPUG/manual event present']='Yes' if any((pd.Timestamp(e['Start'])<=g.timestamp.max()) and (pd.Timestamp(e['Stop'])>=g.timestamp.min()) for e in (wapug_events or [])) else 'No'; r['RAG']='Amber' if notes else 'Green'; r['Comment']='; '.join(notes) if notes else 'No major weekly data quality issue detected by V18 selected-file assessment.'; rows.append(r)
    return html.Div([html.H3('Data Assessment — selected observed file'),html.Div('Weekly grouping follows Sunday-ending weeks (W-SUN).',style={'color':'#555'}),_simple_table(rows,list(rows[0].keys())) if rows else html.Div('No weekly groups available.',style={'color':'#666'})])
# ============================ END V18_PATCH_MARKER ============================

DATA_FOLDER=get_data_folder(); REGISTRY=Registry(DATA_FOLDER); FILE_OPTIONS=csv_options(DATA_FOLDER); DEFAULT_OBS=FILE_OPTIONS[0]['value'] if FILE_OPTIONS else None; DEFAULT_SIM=[FILE_OPTIONS[1]['value']] if len(FILE_OPTIONS)>1 else ([] if not FILE_OPTIONS else [FILE_OPTIONS[0]['value']])

app=Dash(__name__); app.title='ICM CSV Calibration Viewer v19.50'

app.layout=html.Div([

    html.H2('ICM CSV Calibration Viewer v19.50 — Calibration, Spill, Storage, WAPUG and Data Assessment',style={'margin':'0'}),

    html.Div('Local desktop app. V18 adds native FDV/R support, multi-variable hydraulic plotting, WAPUG/manual rainfall event highlighting, scatter log view and selected-file data assessment while retaining V17 core logic.',style={'color':'#555','marginTop':'4px'}),

    html.Div(f'Data folder: {DATA_FOLDER}',style={'color':'#666','margin':'6px 0 18px'}),

    html.Div([html.Div([html.Label('Variable'),dcc.Dropdown(id='variable',options=[{'label':v.capitalize(),'value':v} for v in VARIABLES],value='depth',clearable=False)],style={'flex':'0.6','minWidth':'130px'}),html.Div([html.Label('Observed CSV / FDV'),dcc.Dropdown(id='observed-file',options=FILE_OPTIONS,value=DEFAULT_OBS,clearable=False)],style={'flex':'1.6','minWidth':'260px'}),html.Div([html.Label('Observed colour',style={'whiteSpace':'nowrap'}),dcc.Input(id='obs-color',type='color',value='#ff0000',style={'width':'100%','height':'34px'})],style={'flex':'0 0 125px','minWidth':'125px','alignSelf':'flex-end'}),html.Div([html.Label('Simulated CSV / FDV file(s)'),dcc.Dropdown(id='simulated-files',options=FILE_OPTIONS,value=DEFAULT_SIM,multi=True)],style={'flex':'1.6','minWidth':'260px'}),html.Div([html.Label('Active simulated/profile for stats, scatter and model spill'),dcc.Dropdown(id='active-sim-profile',options=[],value=None,clearable=True)],style={'flex':'1.4','minWidth':'260px'}),html.Div([html.Label('Sim colour',style={'whiteSpace':'nowrap'}),dcc.Input(id='sim-color',type='color',value='#0008ff',style={'width':'100%','height':'34px'})],style={'flex':'0 0 115px','minWidth':'115px','alignSelf':'flex-end'})],style={'display':'flex','gap':'14px','flexWrap':'wrap','marginBottom':'14px'}),

    html.Div([html.Div([html.Label('Rainfall CSV / R'),dcc.Dropdown(id='rainfall-file',options=[{'label':'None','value':''}]+FILE_OPTIONS,value='',clearable=False)],style={'flex':'1.4','minWidth':'300px'}),html.Div([dcc.Dropdown(id='rain-profile',options=[{'label':'Profile 1','value':'1'}],value='1',clearable=False)],style={'display':'none'}),html.Div([html.Label('Rainfall colour'),dcc.Input(id='rain-color',type='color',value='#4A90E2',style={'width':'100%','height':'34px'})],style={'flex':'0.35','minWidth':'90px'}),html.Div([html.Label('Rainfall axis max'),dcc.Input(id='rain-ymax',type='number',placeholder='Auto',debounce=True,min=0,style={'width':'100%'})],style={'flex':'0.45','minWidth':'115px'})],style={'display':'flex','gap':'14px','flexWrap':'wrap','marginBottom':'14px'}),
    html.Div([html.Div([html.Div([html.Label('Main WAPUG event toggle'),dcc.RadioItems(id='event-highlight-toggle',options=[{'label':' On','value':'on'},{'label':' Off','value':'off'}],value='on',inline=True,style={'paddingTop':'6px'})],style={'minWidth':'250px'}),html.Div([html.Label('WAPUG mode'),dcc.Checklist(id='wapug-toggle',options=[{'label':' Use WAPUG >50k criteria','value':'on'}],value=['on'],style={'paddingTop':'6px'})],style={'minWidth':'230px'}),html.Div([html.Label('Event overlay'),dcc.Checklist(id='event-timeline-toggle',options=[{'label':' Show event labels/bands on hydraulic timeline','value':'on'}],value=['on'],style={'paddingTop':'6px'})],style={'minWidth':'310px'})],id='v19-3-event-controls-row',style={'display':'flex','gap':'18px','alignItems':'flex-start','flexWrap':'wrap','width':'100%'}),html.Div([html.Label('Min intensity'),dcc.Input(id='wapug-min-intensity',type='number',value=5.0,debounce=True,style={'width':'100%'})],style={'flex':'0.6','minWidth':'120px'}),html.Div([html.Label('Intensity duration min'),dcc.Input(id='wapug-intensity-duration',type='number',value=6.0,debounce=True,style={'width':'100%'})],style={'flex':'0.7','minWidth':'150px'}),html.Div([html.Label('Event duration min'),dcc.Input(id='wapug-event-duration',type='number',value=60.0,debounce=True,style={'width':'100%'})],style={'flex':'0.7','minWidth':'150px'}),html.Div([html.Label('Total depth mm'),dcc.Input(id='wapug-total-depth',type='number',value=5.0,debounce=True,style={'width':'100%'})],style={'flex':'0.6','minWidth':'130px'}),html.Div([html.Label('Dry gap min'),dcc.Input(id='wapug-dry-gap',type='number',value=15.0,debounce=True,style={'width':'100%'})],style={'flex':'0.55','minWidth':'120px'}),html.Div([html.Label('Rain conversion factor'),dcc.Input(id='rain-conversion-factor',type='number',value=1.0,debounce=True,style={'width':'100%'})],style={'flex':'0.7','minWidth':'160px'}),html.Div([html.Label('Highlight colour'),dcc.Input(id='wapug-highlight-color',type='color',value='#ff9900',style={'width':'100%','height':'34px'})],style={'flex':'0.45','minWidth':'125px'})],style={'display':'flex','gap':'14px','flexWrap':'wrap','marginBottom':'14px','background':'#fff','border':'1px solid #e5e7eb','borderRadius':'10px','padding':'12px'}),

    html.Div([html.Div([html.Label('Threshold 1 value / EDM spill level'),dcc.Input(id='threshold-1',type='number',placeholder='Optional',debounce=True,style={'width':'100%'})],style={'flex':'1','minWidth':'180px'}),html.Div([html.Label('Threshold 1 label'),dcc.Input(id='threshold-1-label',type='text',value='Threshold 1',debounce=True,style={'width':'100%'})],style={'flex':'1','minWidth':'180px'}),html.Div([html.Label('Threshold 1 colour'),dcc.Input(id='threshold-1-color',type='color',value='#8000ff',style={'width':'100%','height':'34px'})],style={'flex':'0.6','minWidth':'120px'}),html.Div([html.Label('Threshold 2 value'),dcc.Input(id='threshold-2',type='number',placeholder='Optional',debounce=True,style={'width':'100%'})],style={'flex':'1','minWidth':'150px'}),html.Div([html.Label('Threshold 2 label'),dcc.Input(id='threshold-2-label',type='text',value='Threshold 2',debounce=True,style={'width':'100%'})],style={'flex':'1','minWidth':'180px'}),html.Div([html.Label('Threshold 2 colour'),dcc.Input(id='threshold-2-color',type='color',value='#ebcb00',style={'width':'100%','height':'34px'})],style={'flex':'0.6','minWidth':'120px'})],style={'display':'flex','gap':'14px','flexWrap':'wrap','marginBottom':'14px'}),

    html.Div([html.Div([html.Button('Apply / Refresh Graph',id='apply-button',n_clicks=0,style=button_style(True))],style={'flex':'1','minWidth':'220px'}),html.Div([html.Button('Calculate Statistics',id='stats-button',n_clicks=0,style=button_style(False))],style={'flex':'1','minWidth':'220px'})],style={'display':'flex','gap':'14px','flexWrap':'wrap','marginBottom':'14px'}),

    html.Div([html.Div([html.Label('User statistics start'),dcc.Input(id='user-start',type='text',placeholder='YYYY-MM-DD HH:MM or DD/MM/YYYY HH:MM',debounce=True,style={'width':'100%'})],style={'flex':'1','minWidth':'260px'}),html.Div([html.Label('User statistics end'),dcc.Input(id='user-end',type='text',placeholder='YYYY-MM-DD HH:MM or DD/MM/YYYY HH:MM',debounce=True,style={'width':'100%'})],style={'flex':'1','minWidth':'260px'}),html.Div([html.Label('Graph selection'),html.Div([html.Button('Use current graph zoom as statistics period',id='use-zoom',n_clicks=0,style=button_style(False,'320px')),html.Button('Zoom to entered period',id='zoom-to-entered',n_clicks=0,style=button_style(False,'260px'))])],style={'flex':'1','minWidth':'260px'})],style={'display':'flex','gap':'14px','flexWrap':'wrap','marginBottom':'8px'}),

    html.Div(id='period-message',style={'fontSize':'13px','color':'#555','marginBottom':'14px'}),

    html.Div([html.Div([html.Label('Year for HTML report'),dcc.Dropdown(id='export-year',options=[],value=None,clearable=False)],style={'flex':'1','minWidth':'180px'}),html.Div([html.Label('HTML report export',style={'whiteSpace':'nowrap'}),html.Button('Download single HTML report with 4 graphs',id='download-html-report',n_clicks=0,style=button_style(False,'390px'))],style={'flex':'0 0 430px','minWidth':'430px','alignSelf':'flex-end'}),dcc.Download(id='download-html')],style={'display':'flex','gap':'14px','flexWrap':'wrap','marginBottom':'14px'}),

    html.Div(id='export-message',style={'fontSize':'13px','color':'#555','marginBottom':'14px'}),html.Div(id='file-status',style={'marginBottom':'12px','fontSize':'13px','color':'#444'}),dcc.Tabs(id='main-tabs', value='timeseries-tab', children=[dcc.Tab(label='Time-series graph', value='timeseries-tab', children=[dcc.Loading(type='circle',children=dcc.Graph(id='chart',figure=empty_figure(),clear_on_unhover=True))]), dcc.Tab(label='Scatter graph', value='scatter-tab', children=[html.Div([html.Div([html.Label('Scatter variable'),dcc.RadioItems(id='scatter-variable',options=[{'label':'Depth','value':'depth','disabled':False},{'label':'Flow','value':'flow','disabled':True},{'label':'Velocity','value':'velocity','disabled':True}],value='depth',inline=True)],style={'flex':'1','minWidth':'260px'}),html.Div([html.Label('Scale'),dcc.Checklist(id='scatter-log-toggle',options=[{'label':' Log scale','value':'log'}],value=[],style={'paddingTop':'6px'})],style={'flex':'0.5','minWidth':'160px'})],style={'display':'flex','gap':'14px','flexWrap':'wrap','padding':'12px','background':'#fff','border':'1px solid #e5e7eb','borderRadius':'10px','margin':'10px 0'}),dcc.Loading(type='circle',children=dcc.Graph(id='scatter-chart',figure=empty_figure('Scatter graph will update after Apply / Refresh Graph.')))]), dcc.Tab(label='WAPUG', value='wapug-tab', children=[dcc.Loading(type='circle',children=html.Div(id='wapug-events',children=html.Div('Click Apply / Refresh Graph to calculate WAPUG/manual rainfall events.',style={'color':'#666','marginTop':'14px'})))]), dcc.Tab(label='Data Assessment', value='data-assessment-tab', children=[dcc.Loading(type='circle',children=html.Div(id='data-assessment',children=html.Div('Click Apply / Refresh Graph to assess the selected observed file.',style={'color':'#666','marginTop':'14px'})))])]),html.H3('Calibration statistics',style={'marginTop':'18px'}),dcc.Loading(type='circle',children=html.Div(id='stats',children=html.Div('Click Calculate Statistics to compute calibration metrics.',style={'color':'#666'}))),html.Div(id='edm-assessment',children=html.Div('Set Threshold 1 and Threshold 2 values and click Apply / Refresh Graph to calculate observed/modelled 12/24 monthly spill counts.',style={'color':'#666','marginTop':'18px'})),

html.Div([html.H3('Modelled overflow storage screening', style={'marginTop':'20px'}),

    html.Div('Separate calculation: this does not run during Apply / Refresh Graph. Uses selected modelled level profile + Threshold 2 for spill windows, then integrates selected overflow link flow only where level >= Threshold 2 and flow > 0.', style={'color':'#555','fontSize':'13px','marginBottom':'10px'}),

    html.Div([html.Div([html.Label('Overflow link flow CSV'),dcc.Dropdown(id='storage-flow-file',options=[{'label':'None','value':''}]+FILE_OPTIONS,value='',clearable=False)],style={'flex':'1.4','minWidth':'300px'}),

              html.Div([html.Label('Overflow flow profile'),dcc.Dropdown(id='storage-flow-profile',options=[],value=None,clearable=True)],style={'flex':'1.2','minWidth':'260px'}),

              html.Div([html.Label('Storage action'),html.Button('Calculate Storage Requirement',id='storage-button',n_clicks=0,style=button_style(True,'310px'))],style={'flex':'0.9','minWidth':'260px'})],style={'display':'flex','gap':'14px','flexWrap':'wrap','marginBottom':'12px'}),

    dcc.Loading(type='circle',children=html.Div(id='storage-assessment',children=html.Div('Select overflow link flow CSV and click Calculate Storage Requirement.',style={'color':'#666'})))

],style={'background':'#fff','border':'1px solid #e5e7eb','borderRadius':'10px','padding':'14px','marginTop':'18px'}),

html.Div([html.Button('Generate V18 Spill Report',id='generate-spill-report',n_clicks=0,style={'width':'100%','height':'38px','fontWeight':'700','marginTop':'18px'})],style={'maxWidth':'360px'}),dcc.Download(id='download-spill-report'),html.Div(id='spill-report-message',style={'marginTop':'10px'})],style={'fontFamily':'Segoe UI, Arial, sans-serif','padding':'24px','background':'#f7f7f8','minHeight':'100vh'})



@app.callback(Output('chart','figure'),Output('scatter-chart','figure'),Output('file-status','children'),Output('export-year','options'),Output('export-year','value'),Output('edm-assessment','children'),Output('wapug-events','children'),Output('data-assessment','children'),Input('apply-button','n_clicks'),State('variable','value'),State('observed-file','value'),State('simulated-files','value'),State('active-sim-profile','value'),State('rainfall-file','value'),State('rain-profile','value'),State('obs-color','value'),State('sim-color','value'),State('rain-color','value'),State('rain-ymax','value'),State('threshold-1','value'),State('threshold-1-label','value'),State('threshold-1-color','value'),State('threshold-2','value'),State('threshold-2-label','value'),State('threshold-2-color','value'),State('user-start','value'),State('user-end','value'),State('chart','relayoutData'),State('wapug-toggle','value'),State('wapug-min-intensity','value'),State('wapug-intensity-duration','value'),State('wapug-event-duration','value'),State('wapug-total-depth','value'),State('wapug-dry-gap','value'),State('rain-conversion-factor','value'),State('wapug-highlight-color','value'),State('scatter-variable','value'),State('scatter-log-toggle','value'),State('event-highlight-toggle','value'),State('event-timeline-toggle','value'),prevent_initial_call=True)
def apply_graph(n,variable,obs_file,sim_files,active_sim_profile,rain_file,rain_profile,obs_color,sim_color,rain_color,rain_ymax,th1,th1_label,th1_color,th2,th2_label,th2_color,user_start,user_end,relayout,wapug_toggle,wapug_min_intensity,wapug_intensity_duration,wapug_event_duration,wapug_total_depth,wapug_dry_gap,rain_conversion_factor,wapug_highlight_color,scatter_variable,scatter_log_toggle,event_highlight_toggle,event_timeline_toggle):
    stage=[f'Apply clicked at {now_text()}']; tstart=time.perf_counter()
    try:
        obs,om=REGISTRY.ensure_observed(obs_file,stage); sim,sm=REGISTRY.ensure_simulated(sim_files,stage); sim_active=active_sim_columns(sim,active_sim_profile); rain=pd.DataFrame(columns=['timestamp','Rainfall']); rm='No rainfall file selected.'
        plot0,plot1,mode=hydraulic_plot_window(obs,sim); obs_plot=filter_df_by_period(obs,plot0,plot1) if plot0 is not None and plot1 is not None else obs; sim_plot=filter_df_by_period(sim,plot0,plot1) if plot0 is not None and plot1 is not None else sim
        cf=float(rain_conversion_factor or 1.0); full_rain=pd.DataFrame(columns=['timestamp','Rainfall']); wapug_events=[]; wapug_msg='No rainfall file selected.'
        if rain_file:
            full_rain,wapug_msg=v18_load_full_rainfall(rain_file,cf,stage)
            if plot0 is not None and plot1 is not None: rain,rm=v18_query_rainfall(rain_file,plot0-pd.Timedelta(hours=1),plot1+pd.Timedelta(hours=1),rain_profile,cf,stage)
        if 'on' in (wapug_toggle or []): mi,idur,edur,depth,dry=WAPUG_MIN_INTENSITY,WAPUG_GT50_INTENSITY_DURATION_MIN,WAPUG_GT50_STORM_DURATION_MIN,WAPUG_TOTAL_DEPTH_MM,WAPUG_DRY_GAP_MIN; mode_text='WAPUG mode: population assumed greater than 50k.'
        else: mi,idur,edur,depth,dry=float(wapug_min_intensity or 5),float(wapug_intensity_duration or 6),float(wapug_event_duration or 60),float(wapug_total_depth or 5),float(wapug_dry_gap or 15); mode_text='Manual rainfall-event criteria mode.'
        if ('on' in (event_highlight_toggle or [])) and (not full_rain.empty): wapug_events=detect_rain_events_v18(full_rain,mi,idur,depth,edur,dry)
        else: wapug_events=[]
        us,ue,uerr=parse_user_period(user_start,user_end); stats0=stats1=None
        if not uerr and us is not None and ue is not None: stats0,stats1=us,ue
        else:
            zs,ze,zmsg=extract_zoom_period(relayout)
            if not zmsg and zs is not None and ze is not None: stats0,stats1=zs,ze
        colors={'obs':obs_color,'sim':sim_color,'rain':rain_color}; thresholds={'th1':th1,'th1_label':th1_label,'th1_color':th1_color,'th2':th2,'th2_label':th2_label,'th2_color':th2_color,'rain_ymax':rain_ymax}
        globals()['V19_EVENT_TIMELINE_ENABLED'] = (event_timeline_toggle == 'on') if isinstance(event_timeline_toggle, str) else ('on' in (event_timeline_toggle or []))
        fig=make_figure(variable,obs_plot,sim_plot,rain,colors,thresholds,stats_box=True,stats_start=stats0,stats_end=stats1,wapug_events=wapug_events,wapug_color=wapug_highlight_color or V18_WAPUG_ORANGE); fig=v19_20_apply_native_legend_names(fig,variable,obs_file,sim_plot,None)
        scatter_fig=make_scatter_figure(variable,obs,sim,active_sim_profile,stats0,stats1,scatter_variable or variable,'log' in (scatter_log_toggle or []))
        years=available_years(obs,sim,rain,full_rain); opts=[{'label':str(y),'value':y} for y in years]
        stage += [f'Plot window mode: {mode}; {plot0} to {plot1}',f'Rainfall event detection completed over full rainfall file: {len(wapug_events):,} qualifying event(s).',f'Apply completed successfully in {time.perf_counter()-tstart:.2f}s']
        status=html.Div([stage_html(stage,OK_STYLE),html.Div([html.Div(f'Observed: {om}'),html.Div(f'Simulated: {sm}'),html.Div(f'Rainfall: {rm}'),html.Div(f'WAPUG/manual event source: {wapug_msg}'),html.Div('Thresholds are depth-only in V18; ignored when no depth series is present.',style={'color':'#666','marginTop':'4px'}),html.Div(f'Cache folder: {REGISTRY.root}',style={'color':'#666','marginTop':'4px'})],style={**INFO_STYLE,'marginTop':'8px'})])
        params={'Minimum intensity':mi,'Intensity duration min':idur,'Minimum event duration min':edur,'Minimum total depth mm':depth,'Dry gap min':dry,'Rain conversion factor':cf,'Highlight colour':wapug_highlight_color or V18_WAPUG_ORANGE}
        return fig,scatter_fig,status,opts,(years[-1] if years else None),edm_assessment_panel(obs,th1,sim_active,th2,sim_files),wapug_events_panel_v18(wapug_events,mode_text,params),data_assessment_panel_v18(obs,full_rain,wapug_events)
    except Exception as e:
        err=exception_panel('Apply / Refresh Graph failed',e,stage)
        return error_figure('Apply / Refresh Graph failed',str(e)),error_figure('Apply / Refresh Graph failed',str(e)),err,[],None,html.Div('EDM assessment was not calculated because Apply / Refresh Graph failed.',style=ERROR_STYLE),html.Div('WAPUG events were not calculated because Apply / Refresh Graph failed.',style=ERROR_STYLE),html.Div('Data Assessment was not calculated because Apply / Refresh Graph failed.',style=ERROR_STYLE)


@app.callback(Output('stats','children'),Input('stats-button','n_clicks'),State('observed-file','value'),State('simulated-files','value'),State('active-sim-profile','value'),State('user-start','value'),State('user-end','value'),prevent_initial_call=True)

def calculate_statistics(n,obs_file,sim_files,active_sim_profile,user_start,user_end):

    stage=[f'Calculate Statistics clicked at {now_text()}']

    try:

        obs,om=REGISTRY.ensure_observed(obs_file,stage); sim,sm=REGISTRY.ensure_simulated(sim_files,stage); sim=active_sim_columns(sim, active_sim_profile); overall=calc_stats(obs,sim); us,ue,err=parse_user_period(user_start,user_end)

        children=[stage_html(stage+['Statistics completed successfully'],OK_STYLE),stats_table('Overall statistics',overall,'Calculated over actual overlapping observed/simulated period.')]

        if err: children.append(html.Div(err,style=ERROR_STYLE))

        elif us is not None or ue is not None: children.append(stats_table('User-defined period statistics',calc_stats(obs,sim,us,ue),f'Requested period: {fmt_dt(us)} to {fmt_dt(ue)}.'))

        else: children.append(html.Div('User-defined period statistics: enter start/end manually, or zoom the graph and click the graph selection button.',style={'color':'#666','marginTop':'12px'}))

        return html.Div(children)

    except Exception as e: return exception_panel('Calculate Statistics failed',e,stage)



@app.callback(Output('user-start','value'),Output('user-end','value'),Output('period-message','children'),Input('use-zoom','n_clicks'),State('chart','relayoutData'),prevent_initial_call=True)

def use_zoom(n,relayout):

    s,e,msg=extract_zoom_period(relayout)

    if msg: return no_update,no_update,msg

    return fmt_dt(s),fmt_dt(e),f'Statistics period set from current graph zoom: {fmt_dt(s)} to {fmt_dt(e)}'



@app.callback(Output('chart','figure',allow_duplicate=True),Output('period-message','children',allow_duplicate=True),Input('zoom-to-entered','n_clicks'),State('user-start','value'),State('user-end','value'),State('chart','figure'),prevent_initial_call=True)

def zoom_to_entered_period(n,user_start,user_end,fig):

    try:

        s,e,err=parse_user_period(user_start,user_end)

        if err: return no_update,err

        if s is None or e is None: return no_update,'Enter both User statistics start and end, then click Zoom to entered period.'

        if fig is None: return no_update,'No graph available to zoom. Click Apply / Refresh Graph first.'

        fig=dict(fig); layout=fig.setdefault('layout',{}); updated=False

        for key in list(layout.keys()):

            if str(key).startswith('xaxis'):

                axis=layout.setdefault(key,{})

                if isinstance(axis,dict): axis['range']=[pd.Timestamp(s).isoformat(),pd.Timestamp(e).isoformat()]; axis['autorange']=False; updated=True

        if not updated: layout['xaxis']={'range':[pd.Timestamp(s).isoformat(),pd.Timestamp(e).isoformat()],'autorange':False}

        return fig,f'Graph zoom set to entered period: {fmt_dt(s)} to {fmt_dt(e)}'

    except Exception as ex: return no_update,f'Zoom to entered period failed: {type(ex).__name__}: {ex}'



@app.callback(Output('download-html','data'),Output('export-message','children'),Input('download-html-report','n_clicks'),State('variable','value'),State('observed-file','value'),State('simulated-files','value'),State('active-sim-profile','value'),State('rainfall-file','value'),State('rain-profile','value'),State('export-year','value'),State('obs-color','value'),State('sim-color','value'),State('rain-color','value'),State('rain-ymax','value'),State('threshold-1','value'),State('threshold-1-label','value'),State('threshold-1-color','value'),State('threshold-2','value'),State('threshold-2-label','value'),State('threshold-2-color','value'),prevent_initial_call=True)

def download_report(n,variable,obs_file,sim_files,active_sim_profile,rain_file,rain_profile,year,obs_color,sim_color,rain_color,rain_ymax,th1,th1_label,th1_color,th2,th2_label,th2_color):

    stage=[f'HTML report requested at {now_text()}']

    try:

        if year is None: return no_update,html.Div('No year available. Click Apply / Refresh Graph first.',style=ERROR_STYLE)

        obs,om=REGISTRY.ensure_observed(obs_file,stage); sim,sm=REGISTRY.ensure_simulated(sim_files,stage); sim_active=active_sim_columns(sim, active_sim_profile); rain=pd.DataFrame(columns=['timestamp','Rainfall'])

        if rain_file:

            plot0,plot1,mode=hydraulic_plot_window(obs,sim_active)

            if plot0 is not None and plot1 is not None: rain,rm=REGISTRY.query_rainfall(rain_file,plot0-pd.Timedelta(hours=1),plot1+pd.Timedelta(hours=1),rain_profile,stage)

        thresholds={'th1':th1,'th1_label':th1_label,'th1_color':th1_color,'th2':th2,'th2_label':th2_label,'th2_color':th2_color,'rain_ymax':rain_ymax}

        report=make_html_report(variable,year,obs,sim_active,rain,{'obs':obs_color,'sim':sim_color,'rain':rain_color},thresholds)

        return dict(content=report,filename=f'icm_{variable}_{year}_4_graph_report.html',type='text/html'),html.Div(f'Created single HTML report for {year}.',style=OK_STYLE)

    except Exception as e: return no_update,exception_panel('HTML report export failed',e,stage)





@app.callback(Output('download-spill-report', 'data'), Output('spill-report-message', 'children'),

              Input('generate-spill-report', 'n_clicks'),

              State('variable', 'value'), State('observed-file', 'value'), State('simulated-files', 'value'), State('rainfall-file', 'value'), State('rain-profile', 'value'),

              State('obs-color', 'value'), State('sim-color', 'value'), State('rain-color', 'value'), State('rain-ymax', 'value'),

              State('threshold-1', 'value'), State('threshold-1-label', 'value'), State('threshold-1-color', 'value'),

              State('threshold-2', 'value'), State('threshold-2-label', 'value'), State('threshold-2-color', 'value'),

              prevent_initial_call=True)

def generate_spill_report(n, variable, obs_file, sim_files, rain_file, rain_profile, obs_color, sim_color, rain_color, rain_ymax, th1, th1_label, th1_color, th2, th2_label, th2_color):

    stage = [f'Generate V18 Spill Report clicked at {now_text()}']

    try:

        obs, om = REGISTRY.ensure_observed(obs_file, stage)

        sim, sm = REGISTRY.ensure_simulated(sim_files, stage)

        p0, p1 = get_full_extent(obs, sim)

        rain = pd.DataFrame(columns=['timestamp', 'Rainfall'])

        if rain_file and p0 is not None and p1 is not None:

            rain, rm = REGISTRY.query_rainfall(rain_file, p0 - pd.Timedelta(hours=1), p1 + pd.Timedelta(hours=1), rain_profile, stage)

        thresholds = {'th1': th1, 'th1_label': th1_label, 'th1_color': th1_color, 'th2': th2, 'th2_label': th2_label, 'th2_color': th2_color, 'rain_ymax': rain_ymax}

        colors = {'obs': obs_color, 'sim': sim_color, 'rain': rain_color}

        observed = _spill_result_from_series('Observed EDM / Threshold 1', obs, th1)

        model_df, model_series, warnings = _model_series_from_simulated(sim, sim_files)

        model = _spill_result_from_series('Model Spill / Threshold 2', model_df, th2) if model_df is not None else {'label': 'Model Spill / Threshold 2', 'ok': False, 'message': 'No simulated/modelled series available.', 'monthly': edm_monthly_pivot(pd.DataFrame()), 'summary': []}

        if model_series:

            warnings.append('Model series used for report: ' + str(model_series))

        comparison = _compare_spill_monthlies(observed['monthly'], model['monthly']) if observed.get('ok') and model.get('ok') else pd.DataFrame(columns=['Year', 'Month', 'Observed spills', 'Modelled spills', 'Difference', 'Assessment'])

        report = _spills_report_html(variable, obs, sim, rain, thresholds, colors, observed, model, comparison, warnings)

        return dict(content=report, filename='icm_v17_1_spill_assessment_report.html', type='text/html'), html.Div('Generated V17 spill assessment report.', style=OK_STYLE)

    except Exception as e:

        return no_update, exception_panel('Generate V18 Spill Report failed', e, stage)





@app.callback(Output('active-sim-profile','options'),Output('active-sim-profile','value'),Input('simulated-files','value'),prevent_initial_call=False)

def update_active_sim_profile_options(sim_files):

    cols = available_value_columns_from_files(sim_files)

    opts = [{'label':c,'value':c} for c in cols]

    return opts, (cols[0] if cols else None)



@app.callback(Output('storage-flow-profile','options'),Output('storage-flow-profile','value'),Input('storage-flow-file','value'),prevent_initial_call=False)

def update_storage_flow_profile_options(flow_file):

    cols = available_value_columns_from_files([flow_file] if flow_file else [])

    opts = [{'label':c,'value':c} for c in cols]

    return opts, (cols[0] if cols else None)



@app.callback(Output('storage-assessment','children'),Input('storage-button','n_clicks'),State('storage-flow-file','value'),State('storage-flow-profile','value'),State('simulated-files','value'),State('active-sim-profile','value'),State('threshold-2','value'),prevent_initial_call=True)

def calculate_storage_requirement(n, flow_file, flow_profile, sim_files, active_sim_profile, threshold2):

    return storage_requirement_panel_v17_3(flow_file, flow_profile, sim_files, active_sim_profile, threshold2)





# ---------------- V17.3 corrected storage logic ----------------

def integrate_flow_where_level_spilling(flow_df, flow_col, level_df, level_col, threshold, start, stop):

    """Integrate overflow flow where modelled level >= Threshold 2 and overflow flow > 0."""

    if flow_df is None or flow_df.empty or level_df is None or level_df.empty:

        return 0.0

    s = pd.Timestamp(start)

    e = pd.Timestamp(stop)



    f = flow_df[['timestamp', flow_col]].copy()

    f['timestamp'] = pd.to_datetime(f['timestamp'], errors='coerce')

    f[flow_col] = clean_numeric_series(f[flow_col])

    f = f.dropna(subset=['timestamp']).sort_values('timestamp')

    f = f[(f['timestamp'] >= s) & (f['timestamp'] <= e)].copy()

    if f.empty:

        return 0.0



    l = level_df[['timestamp', level_col]].copy()

    l['timestamp'] = pd.to_datetime(l['timestamp'], errors='coerce')

    l[level_col] = clean_numeric_series(l[level_col])

    l = l.dropna(subset=['timestamp']).sort_values('timestamp')

    if l.empty:

        return 0.0



    idx = l.set_index('timestamp')[[level_col]].sort_index()

    times = pd.DatetimeIndex(f['timestamp'])

    lev = idx.reindex(idx.index.union(times).sort_values()).interpolate(method='time').reindex(times)[level_col].to_numpy(float)

    q = np.maximum(pd.to_numeric(f[flow_col], errors='coerce').fillna(0.0).to_numpy(float), 0.0)

    mask = np.isfinite(lev) & (lev >= float(threshold)) & (q > 0)



    if len(f) >= 2:

        d = pd.Series(pd.to_datetime(f['timestamp'])).diff().dt.total_seconds().dropna()

        d = d[d > 0]

        dt = float(d.median()) if len(d) else 0.0

    else:

        dt = 0.0

    return float(np.sum(q[mask]) * dt)





def storage_blocks_from_level_and_flow(level_df, level_col, flow_df, flow_col, threshold):

    """Detect 12/24 blocks from modelled level; integrate flow only where level threshold is met."""

    model_df = level_df[['timestamp', level_col]].rename(columns={level_col:'Observed'}).copy()

    model_df['Observed'] = clean_numeric_series(model_df['Observed'])

    events = detect_edm_spill_events(model_df, threshold)

    calc = apply_12_24_spill_logic(events)

    if calc is None or calc.empty:

        return pd.DataFrame(columns=['Year','Rank basis block','Start','Stop','Volume_m3'])



    rows = []

    for _, r in calc.iterrows():

        if int(r.get('spills', 0)) <= 0:

            continue

        A = pd.Timestamp(r['spill_start'])

        B = pd.Timestamp(r['spill_stop'])

        year = int(r.get('year_start', A.year))

        cursor = A

        for k in range(int(r['spills'])):

            block_end = min(B, cursor + (pd.Timedelta(hours=12) if k == 0 else pd.Timedelta(hours=24)))

            vol = integrate_flow_where_level_spilling(flow_df, flow_col, level_df, level_col, threshold, cursor, block_end)

            rows.append({'Year': year, 'Rank basis block': k+1, 'Start': fmt_dt(cursor), 'Stop': fmt_dt(block_end), 'Volume_m3': vol})

            cursor = block_end

            if cursor >= B:

                break

    return pd.DataFrame(rows)





def storage_requirement_panel_v17_3(flow_filename, flow_profile, sim_files, active_sim_profile, threshold2):

    stage = [f'Storage calculation clicked at {now_text()}']

    if not flow_filename:

        return html.Div('Select an overflow link flow CSV before calculating storage.', style=ERROR_STYLE)

    if not sim_files:

        return html.Div('Select a simulated level CSV/profile before calculating storage.', style=ERROR_STYLE)

    if threshold2 in [None, '']:

        return html.Div('Threshold 2 is required for modelled level spill detection.', style=ERROR_STYLE)

    try:

        th = float(threshold2)

        sim, sm = REGISTRY.ensure_simulated(sim_files, stage)

        level_df = active_sim_columns(sim, active_sim_profile)

        level_cols = [c for c in level_df.columns if c != 'timestamp'] if level_df is not None and not level_df.empty else []

        if not level_cols:

            raise ValueError('No selected modelled level profile is available for storage spill-window detection.')

        level_col = active_sim_profile if active_sim_profile in level_cols else level_cols[0]



        flow_df = parse_wide_timeseries_file(flow_filename, flow_profile)

        flow_cols = [c for c in flow_df.columns if c != 'timestamp']

        if not flow_cols:

            raise ValueError('No overflow flow profile column detected.')

        flow_col = flow_profile if flow_profile in flow_cols else flow_cols[0]



        blocks = storage_blocks_from_level_and_flow(level_df, level_col, flow_df, flow_col, th)

        if blocks.empty:

            return html.Div([stage_html(stage + [

                f'Modelled level profile used for spill detection: {level_col}',

                f'Overflow flow profile selected for volume integration: {flow_col}',

                f'No 12/24 spill blocks detected from selected modelled level profile using Threshold 2 = {th:g}.',

            ], OK_STYLE)])



        summaries = []

        for y, g in blocks.groupby('Year'):

            volumes = sorted([float(v) for v in g['Volume_m3'].fillna(0.0)], reverse=True)

            required = volumes[10] if len(volumes) >= 11 else 0.0

            summaries.append({

                'Year': int(y),

                '12/24 spill blocks': len(volumes),

                'Required storage for <=10 spills (m³)': f'{required:.3f}',

                'Max block volume (m³)': f'{max(volumes) if volumes else 0.0:.3f}',

                'Annual block volume total (m³)': f'{sum(volumes):.3f}',

            })

        max_req = max(float(x['Required storage for <=10 spills (m³)']) for x in summaries) if summaries else 0.0

        detail = blocks.copy()

        detail['Volume_m3'] = detail['Volume_m3'].map(lambda x: f'{float(x):.3f}')

        return html.Div([

            stage_html(stage + [

                f'Modelled level profile used for spill detection: {level_col}',

                f'Threshold 2 level used for spill detection: {th:g}',

                f'Overflow flow file: {flow_filename}',

                f'Overflow flow profile used for volume integration: {flow_col}',

                'Corrected V17.3 method: spill windows are detected from modelled level >= Threshold 2; volume is integrated only where modelled level >= Threshold 2 and overflow flow > 0.',

                'Ranking basis: modelled 12/24 spill-block volumes; target <=10 spills/year; required storage = 11th largest annual block volume.',

            ], OK_STYLE),

            html.H4('Storage requirement summary by year'),

            _simple_table(summaries, ['Year','12/24 spill blocks','Required storage for <=10 spills (m³)','Max block volume (m³)','Annual block volume total (m³)']),

            html.Div(f'Maximum required storage across years: {max_req:.3f} m³', style={**INFO_STYLE, 'marginTop':'10px', 'fontWeight':'700'}),

            html.H4('Ranked 12/24 spill-block detail', style={'marginTop':'16px'}),

            _simple_table(detail.sort_values(['Year','Volume_m3'], ascending=[True,False]).to_dict('records'), detail.columns.tolist()),

        ])

    except Exception as e:

        return exception_panel('Storage requirement calculation failed', e, stage)







@app.callback(Output('wapug-min-intensity','disabled'),Output('wapug-intensity-duration','disabled'),Output('wapug-event-duration','disabled'),Output('wapug-total-depth','disabled'),Output('wapug-dry-gap','disabled'),Input('wapug-toggle','value'),prevent_initial_call=False)
def v18_toggle_manual_wapug_inputs(wapug_toggle):
    disabled='on' in (wapug_toggle or []); return disabled,disabled,disabled,disabled,disabled
@app.callback(Output('scatter-variable','options'),Output('scatter-variable','value'),Input('observed-file','value'),prevent_initial_call=False)
def v18_update_scatter_variable_options(obs_file):
    avail=set(['depth'])
    p=path_from_name(DATA_FOLDER,obs_file) if obs_file else None
    try:
        if p and v18_is_fdv_name(Path(p).name): avail={V18_CHANNEL_BY_COL[c][0] for c in v18_hydro_columns(parse_fdv_ascii_v18(p)[0])}
    except Exception: pass
    opts=[{'label':lab,'value':key,'disabled':key not in avail} for key,col,lab,unit,color in V18_HYDRO_CHANNELS]
    return opts, ('depth' if 'depth' in avail else (next(iter(avail)) if avail else 'depth'))



# ============================== V18_1_PATCH_MARKER ==============================
# V18.1 hotfixes:
# 1) dynamically refresh file dropdown options so .fdv/.fdv.txt/.R/.R.txt files added to data folder appear without code edits.
# 2) scatter log-scale and variable controls update the scatter graph immediately.
# 3) WAPUG/manual rainfall highlight is guaranteed to use the full rainfall file event source and overlay visible event rainfall in orange.

V18_1_FILE_EXTS = ('.csv', '.fdv', '.fdv.txt', '.r', '.r.txt')
V18_LAST_FULL_RAIN = pd.DataFrame(columns=['timestamp','Rainfall'])
V18_LAST_EVENTS = []
V18_LAST_HIGHLIGHT_COLOR = V18_WAPUG_ORANGE if 'V18_WAPUG_ORANGE' in globals() else '#ff9900'


def csv_options(folder):
    """V18.1 extension-aware file list. Retains historical name used across V17/V18 code."""
    root = Path(folder)
    if not root.exists():
        return []
    files = [p for p in root.iterdir() if p.is_file() and p.name.lower().endswith(V18_1_FILE_EXTS)]
    return [{'label': p.name, 'value': p.name} for p in sorted(files, key=lambda x: x.name.lower())]


# Ensure initial app-level options are also corrected if code above was loaded from an older cache/session.
try:
    FILE_OPTIONS = csv_options(DATA_FOLDER)
except Exception:
    pass


# Wrap event detector to retain the full rainfall file used for WAPUG/manual event detection.
try:
    _V18_1_ORIG_detect_rain_events_v18 = detect_rain_events_v18
    def detect_rain_events_v18(rain, mi, idur, depth, edur, drygap):
        global V18_LAST_FULL_RAIN, V18_LAST_EVENTS
        try:
            V18_LAST_FULL_RAIN = rain.copy() if rain is not None else pd.DataFrame(columns=['timestamp','Rainfall'])
        except Exception:
            V18_LAST_FULL_RAIN = pd.DataFrame(columns=['timestamp','Rainfall'])
        events = _V18_1_ORIG_detect_rain_events_v18(rain, mi, idur, depth, edur, drygap)
        V18_LAST_EVENTS = events or []
        return events
except Exception:
    pass


def v18_1_event_overlay_strokes(rain_full, events, x0=None, x1=None):
    if rain_full is None or getattr(rain_full, 'empty', True) or not events:
        return [], []
    r = rain_full[['timestamp','Rainfall']].copy()
    r['timestamp'] = pd.to_datetime(r['timestamp'], errors='coerce')
    r['Rainfall'] = pd.to_numeric(r['Rainfall'], errors='coerce')
    r = r.dropna(subset=['timestamp','Rainfall']).sort_values('timestamp')
    if x0 is not None:
        r = r[r['timestamp'] >= pd.Timestamp(x0)]
    if x1 is not None:
        r = r[r['timestamp'] <= pd.Timestamp(x1)]
    if r.empty:
        return [], []
    mask = pd.Series(False, index=r.index)
    for ev in events:
        try:
            mask |= (r['timestamp'] >= pd.Timestamp(ev['Start'])) & (r['timestamp'] <= pd.Timestamp(ev['Stop'])) & (r['Rainfall'] > 0)
        except Exception:
            continue
    xs, ys = [], []
    for t, v in zip(r.loc[mask, 'timestamp'].to_numpy(), r.loc[mask, 'Rainfall'].to_numpy()):
        xs.extend([t, t, None]); ys.extend([0.0, float(v), None])
    return xs, ys


# Wrap make_figure to add a robust orange overlay from the full rainfall file, not only the display-query subset.
try:
    _V18_1_ORIG_make_figure = make_figure
    def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
        global V18_LAST_HIGHLIGHT_COLOR
        if wapug_color:
            V18_LAST_HIGHLIGHT_COLOR = wapug_color
        fig = _V18_1_ORIG_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, wapug_events, wapug_color or V18_LAST_HIGHLIGHT_COLOR)
        events = wapug_events or V18_LAST_EVENTS or []
        if events and V18_LAST_FULL_RAIN is not None and not V18_LAST_FULL_RAIN.empty:
            try:
                x0, x1 = get_full_extent(obs, sim, rain)
                wx, wy = v18_1_event_overlay_strokes(V18_LAST_FULL_RAIN, events, x0, x1)
                if wx and wy:
                    fig.add_trace(go.Scattergl(
                        x=wx, y=wy, mode='lines', name='WAPUG/manual event highlight',
                        line=dict(color=wapug_color or V18_LAST_HIGHLIGHT_COLOR or '#ff9900', width=3.0),
                        opacity=1.0, hoverinfo='skip'
                    ))
                    fig.update_layout(uirevision='v18-1-wapug-highlight')
            except Exception:
                pass
        return fig
except Exception:
    pass


# Add an unobtrusive interval to allow dropdown option refresh when files are copied into /data after startup.
try:
    if hasattr(app, 'layout') and app.layout is not None:
        app.layout.children.append(dcc.Interval(id='v18-file-options-refresh', interval=2500, n_intervals=0, max_intervals=-1))
except Exception:
    pass


@app.callback(
    Output('observed-file','options'),
    Output('simulated-files','options'),
    Output('rainfall-file','options'),
    Output('storage-flow-file','options'),
    Input('v18-file-options-refresh','n_intervals'),
    prevent_initial_call=False
)
def v18_1_refresh_file_dropdown_options(_n):
    opts = csv_options(DATA_FOLDER)
    none_opts = [{'label':'None','value':''}] + opts
    return opts, opts, none_opts, none_opts


@app.callback(
    Output('scatter-chart','figure', allow_duplicate=True),
    Input('scatter-variable','value'),
    Input('scatter-log-toggle','value'),
    State('variable','value'),
    State('observed-file','value'),
    State('simulated-files','value'),
    State('active-sim-profile','value'),
    State('user-start','value'),
    State('user-end','value'),
    prevent_initial_call=True
)
def v18_1_update_scatter_immediately(scatter_variable, scatter_log_toggle, variable, obs_file, sim_files, active_sim_profile, user_start, user_end):
    stage=[f'Scatter view updated at {now_text()}']
    try:
        obs, _ = REGISTRY.ensure_observed(obs_file, stage)
        sim, _ = REGISTRY.ensure_simulated(sim_files, stage)
        us, ue, err = parse_user_period(user_start, user_end)
        if err:
            us = ue = None
        return make_scatter_figure(variable, obs, sim, active_sim_profile, us, ue, scatter_variable or variable, 'log' in (scatter_log_toggle or []))
    except Exception as e:
        return error_figure('Scatter update failed', str(e))

# ============================ END V18_1_PATCH_MARKER ============================



# ============================== V18_2_PATCH_MARKER ==============================
# V18.2 hotfixes:
# - Adds missing re import guard used by FDV/R parsers.
# - Adds dynamic Variable dropdown with All for FDV files containing multiple hydraulic series.
# - Makes Variable=All plot all FDV hydraulic subplots; variable-specific selections plot only that channel.
# - Replaces scatter generation with a robust log-capable implementation for both legacy CSV and FDV data.

try:
    re
except NameError:
    import re

V18_2_CHANNEL_TO_VARIABLE = {'Flow_m3_s':'flow', 'Depth_m':'depth', 'Velocity_m_s':'velocity'}
V18_2_VARIABLE_TO_CHANNEL = {'flow':'Flow_m3_s', 'depth':'Depth_m', 'velocity':'Velocity_m_s'}
V18_2_LABEL = {'flow':'Flow', 'depth':'Depth', 'velocity':'Velocity', 'all':'All'}
V18_2_UNIT = {'flow':'m³/s', 'depth':'m', 'velocity':'m/s'}


def v18_2_selected_hydro_columns_for_variable(obs, variable):
    cols = v18_hydro_columns(obs) if 'v18_hydro_columns' in globals() else []
    if not cols:
        return []
    if variable == 'all' or variable is None:
        return cols
    wanted = V18_2_VARIABLE_TO_CHANNEL.get(variable)
    return [wanted] if wanted in cols else cols


# Keep prior V18/V18.1 figure maker, but enforce Variable=All vs selected FDV channel.
try:
    _V18_2_PREV_make_figure = make_figure
    def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
        hydro = v18_hydro_columns(obs) if obs is not None else []
        if hydro and variable != 'all':
            selected = v18_2_selected_hydro_columns_for_variable(obs, variable)
            if selected and set(selected) != set(hydro):
                keep = ['timestamp'] + selected
                if 'Observed' in obs.columns:
                    keep.append('Observed')
                obs2 = obs[[c for c in keep if c in obs.columns]].copy()
                # For V17 compatibility/stats, Observed follows the shown variable where possible.
                if selected[0] in obs2.columns:
                    obs2['Observed'] = obs2[selected[0]]
                return _V18_2_PREV_make_figure(variable, obs2, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, wapug_events, wapug_color)
        return _V18_2_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, wapug_events, wapug_color)
except Exception:
    pass


def v18_2_scatter_from_paired(paired, label, unit, log_mode=False, title_suffix=''):
    fig = go.Figure()
    if paired is None or paired.empty:
        fig.add_annotation(text='No paired observed/simulated points.', x=0.5, y=0.5, xref='paper', yref='paper', showarrow=False)
        fig.update_layout(template='plotly_white', height=650, title='Observed vs Simulated scatter')
        return fig
    paired = paired.copy()
    paired['obs'] = pd.to_numeric(paired['obs'], errors='coerce')
    paired['sim'] = pd.to_numeric(paired['sim'], errors='coerce')
    paired = paired.dropna(subset=['obs','sim'])
    excluded = 0
    if log_mode:
        before = len(paired)
        paired = paired[(paired['obs'] > 0) & (paired['sim'] > 0)]
        excluded = before - len(paired)
    if paired.empty:
        fig.add_annotation(text=f'Log scale requires positive observed and simulated values. Excluded {excluded:,} non-positive pair(s).', x=0.5, y=0.5, xref='paper', yref='paper', showarrow=False)
        fig.update_layout(template='plotly_white', height=650, title=f'Observed vs Simulated Scatter — {label}')
        return fig
    fig.add_trace(go.Scattergl(x=paired['obs'], y=paired['sim'], mode='markers', name=label, marker=dict(size=5, opacity=0.65)))
    mn = float(np.nanmin([paired['obs'].min(), paired['sim'].min()]))
    mx = float(np.nanmax([paired['obs'].max(), paired['sim'].max()]))
    if math.isfinite(mn) and math.isfinite(mx) and mx > 0:
        lo = max(mn, np.nextafter(0, 1)) if log_mode else mn
        hi = mx
        fig.add_trace(go.Scatter(x=[lo, hi], y=[lo, hi], mode='lines', name='1:1 line', line=dict(color='#555', dash='dash')))
    if log_mode:
        fig.update_xaxes(type='log', autorange=True)
        fig.update_yaxes(type='log', autorange=True)
    else:
        pad = (mx - mn) * 0.05 if mx > mn else 1.0
        fig.update_xaxes(type='linear', range=[mn-pad, mx+pad])
        fig.update_yaxes(type='linear', range=[mn-pad, mx+pad])
    suffix = f' — {title_suffix}' if title_suffix else ''
    note = f' (log scale; excluded {excluded:,} non-positive pair(s))' if log_mode else ''
    fig.update_layout(
        template='plotly_white', height=650,
        title=f'Observed vs Simulated Scatter — {label}{suffix}{note}',
        xaxis_title=f'Observed {label}' + (f' ({unit})' if unit else ''),
        yaxis_title=f'Simulated {label}' + (f' ({unit})' if unit else ''),
        legend=dict(orientation='h', y=1.02, x=1, xanchor='right'),
        transition={'duration':450, 'easing':'cubic-in-out'},
        uirevision='scatter-v18-2-log' + ('-on' if log_mode else '-off')
    )
    return fig


try:
    _V18_2_PREV_make_scatter_figure = make_scatter_figure
    def make_scatter_figure(variable, obs, sim, active_col=None, start=None, end=None, scatter_variable=None, log_mode=False):
        # FDV / hydraulic path.
        hydro = v18_hydro_columns(obs) if obs is not None else []
        key = scatter_variable or (variable if variable != 'all' else 'depth') or 'depth'
        if hydro:
            col = V18_2_VARIABLE_TO_CHANNEL.get(key, 'Depth_m')
            if col not in obs.columns:
                return empty_figure(f'Observed {V18_2_LABEL.get(key,key).capitalize()} series is not available.')
            label = V18_2_LABEL.get(key, key.capitalize()); unit = V18_2_UNIT.get(key, '')
            sim_cols = [c for c in (sim.columns if sim is not None and not sim.empty else []) if c != 'timestamp']
            sim_col = active_col if active_col in sim_cols else next((c for c in sim_cols if c == col or normalise(c) == normalise(col) or normalise(label) in normalise(c)), sim_cols[0] if len(sim_cols)==1 else None)
            if not sim_col:
                return empty_figure(f'Simulated {label} series/profile is not available or ambiguous. Select an active simulated/profile.')
            obs2 = obs[['timestamp', col]].rename(columns={col:'Observed'})
            sim2 = sim[['timestamp', sim_col]]
            s, e = data_overlap_period(obs2, sim2, start, end)
            if s is None:
                return empty_figure('No observed/simulated overlap for scatter period.')
            paired = interpolate_sim_to_obs(filter_df_by_period(obs2, s, e), filter_df_by_period(sim2, s, e))
            return v18_2_scatter_from_paired(paired, label, unit, bool(log_mode), sim_col)
        # Legacy CSV path: old Observed column vs active/first simulated column, but with real log support.
        if obs is None or obs.empty or sim is None or sim.empty or 'Observed' not in obs.columns:
            return _V18_2_PREV_make_scatter_figure(variable, obs, sim, active_col, start, end, scatter_variable, log_mode)
        sim_use = active_sim_columns(sim, active_col)
        cols = [c for c in sim_use.columns if c != 'timestamp']
        if not cols:
            return empty_figure('No active simulated profile selected.')
        s, e = data_overlap_period(obs, sim_use, start, end)
        if s is None:
            return empty_figure('No observed/simulated overlap for scatter period.')
        paired = interpolate_sim_to_obs(filter_df_by_period(obs, s, e), filter_df_by_period(sim_use[['timestamp', cols[0]]], s, e))
        label = (variable or 'value').capitalize(); unit = UNITS.get(variable, '') if 'UNITS' in globals() else ''
        return v18_2_scatter_from_paired(paired, label, unit, bool(log_mode), cols[0])
except Exception:
    pass


@app.callback(
    Output('variable','options'),
    Output('variable','value'),
    Input('observed-file','value'),
    State('variable','value'),
    prevent_initial_call=False
)
def v18_2_update_variable_dropdown(obs_file, current_value):
    base_opts = [{'label':v.capitalize(), 'value':v} for v in VARIABLES]
    p = path_from_name(DATA_FOLDER, obs_file) if obs_file else None
    if not p or not v18_is_fdv_name(Path(p).name):
        return base_opts, current_value if current_value in VARIABLES else 'depth'
    try:
        df, _ = parse_fdv_ascii_v18(p)
        hydro = v18_hydro_columns(df)
        available = [V18_2_CHANNEL_TO_VARIABLE[c] for c in hydro if c in V18_2_CHANNEL_TO_VARIABLE]
        opts = []
        if len(available) > 1:
            opts.append({'label':'All', 'value':'all'})
        for v in VARIABLES:
            opts.append({'label':v.capitalize(), 'value':v, 'disabled': v not in available})
        valid_values = ['all'] + available if len(available) > 1 else available
        if current_value in valid_values:
            return opts, current_value
        return opts, ('all' if len(available) > 1 else (available[0] if available else 'depth'))
    except Exception:
        return base_opts, current_value if current_value in VARIABLES else 'depth'


@app.callback(
    Output('scatter-chart','figure', allow_duplicate=True),
    Input('scatter-variable','value'),
    Input('scatter-log-toggle','value'),
    State('variable','value'),
    State('observed-file','value'),
    State('simulated-files','value'),
    State('active-sim-profile','value'),
    State('user-start','value'),
    State('user-end','value'),
    prevent_initial_call=True
)
def v18_2_update_scatter_immediately(scatter_variable, scatter_log_toggle, variable, obs_file, sim_files, active_sim_profile, user_start, user_end):
    stage=[f'Scatter V18.2 updated at {now_text()}']
    try:
        obs, _ = REGISTRY.ensure_observed(obs_file, stage)
        sim, _ = REGISTRY.ensure_simulated(sim_files, stage)
        us, ue, err = parse_user_period(user_start, user_end)
        if err:
            us = ue = None
        return make_scatter_figure(variable, obs, sim, active_sim_profile, us, ue, scatter_variable or (variable if variable != 'all' else 'depth'), 'log' in (scatter_log_toggle or []))
    except Exception as e:
        return error_figure('Scatter update failed', str(e))

# ============================ END V18_2_PATCH_MARKER ============================



# ============================== V18_3_PATCH_MARKER ==============================
# V18.3 refinements:
# - Scatter tab now uses hydraulic rating mode when depth+flow are available: X=Depth, Y=Flow,
#   with observed and modelled traces on the same plot.
# - Log toggle uses explicit log10 transformed axes for hydraulic rating plots.
# - FDV time-series statistics table shows min/max for every plotted hydraulic series and rainfall min/max/avg/total.
# - WAPUG/event overlay can be globally disabled by the new Event overlay switch.

V18_3_SERIES_COLOURS = {
    'observed': '#ff0000',
    'modelled': '#0008ff',
    'rain': '#4A90E2',
    'highlight': '#ff9900',
}


def v18_3_find_sim_channel(sim, channel_col, label=None):
    if sim is None or getattr(sim, 'empty', True):
        return None
    cols = [c for c in sim.columns if c != 'timestamp']
    if channel_col in cols:
        return channel_col
    n_channel = normalise(channel_col)
    n_label = normalise(label or channel_col)
    for c in cols:
        nc = normalise(c)
        if nc == n_channel or n_channel in nc or n_label in nc:
            return c
    return None


def v18_3_downsample_points_frame(df, xcol, ycol, max_points=DISPLAY_MAX_POINTS_PER_TRACE):
    d = df[['timestamp', xcol, ycol]].copy() if 'timestamp' in df.columns else df[[xcol, ycol]].copy()
    d[xcol] = pd.to_numeric(d[xcol], errors='coerce')
    d[ycol] = pd.to_numeric(d[ycol], errors='coerce')
    d = d.dropna(subset=[xcol, ycol])
    if len(d) <= max_points:
        return d
    idx = np.linspace(0, len(d)-1, max_points).astype(int)
    return d.iloc[idx].copy()


def v18_3_make_flow_depth_scatter(obs, sim=None, log_mode=False, max_points=DISPLAY_MAX_POINTS_PER_TRACE):
    fig = go.Figure()
    if obs is None or getattr(obs, 'empty', True) or 'Depth_m' not in obs.columns or 'Flow_m3_s' not in obs.columns:
        return None

    od = v18_3_downsample_points_frame(obs, 'Depth_m', 'Flow_m3_s', max_points)
    if log_mode:
        od = od[(od['Depth_m'] > 0) & (od['Flow_m3_s'] > 0)].copy()
        if not od.empty:
            fig.add_trace(go.Scattergl(
                x=np.log10(od['Depth_m']), y=np.log10(od['Flow_m3_s']), mode='markers',
                name='Observed', marker=dict(size=5, opacity=0.58, color=V18_3_SERIES_COLOURS['observed'])
            ))
    else:
        if not od.empty:
            fig.add_trace(go.Scattergl(
                x=od['Depth_m'], y=od['Flow_m3_s'], mode='markers',
                name='Observed', marker=dict(size=5, opacity=0.58, color=V18_3_SERIES_COLOURS['observed'])
            ))

    sim_depth = v18_3_find_sim_channel(sim, 'Depth_m', 'Depth')
    sim_flow = v18_3_find_sim_channel(sim, 'Flow_m3_s', 'Flow')
    if sim_depth and sim_flow:
        md = v18_3_downsample_points_frame(sim, sim_depth, sim_flow, max_points)
        if log_mode:
            md = md[(md[sim_depth] > 0) & (md[sim_flow] > 0)].copy()
            if not md.empty:
                fig.add_trace(go.Scattergl(
                    x=np.log10(md[sim_depth]), y=np.log10(md[sim_flow]), mode='markers',
                    name='Modelled', marker=dict(size=5, opacity=0.58, color=V18_3_SERIES_COLOURS['modelled'])
                ))
        elif not md.empty:
            fig.add_trace(go.Scattergl(
                x=md[sim_depth], y=md[sim_flow], mode='markers',
                name='Modelled', marker=dict(size=5, opacity=0.58, color=V18_3_SERIES_COLOURS['modelled'])
            ))

    if not fig.data:
        return empty_figure('Flow-depth scatter requires positive depth and flow values.' if log_mode else 'Flow-depth scatter requires depth and flow values.')

    if log_mode:
        xt = 'log10(Depth [m])'; yt = 'log10(Flow [m³/s])'; title = 'Flow vs Depth Rating Scatter — log10 scale'
    else:
        xt = 'Depth (m)'; yt = 'Flow (m³/s)'; title = 'Flow vs Depth Rating Scatter'
    fig.update_layout(
        template='plotly_white', height=680, title=title,
        xaxis_title=xt, yaxis_title=yt,
        legend=dict(orientation='h', y=1.02, x=1, xanchor='right'),
        transition={'duration':450, 'easing':'cubic-in-out'},
        uirevision='flow-depth-log' + ('-on' if log_mode else '-off')
    )
    return fig


try:
    _V18_3_PREV_make_scatter_figure = make_scatter_figure
    def make_scatter_figure(variable, obs, sim, active_col=None, start=None, end=None, scatter_variable=None, log_mode=False):
        # Best-practice V18.3 default: when depth and flow are available, scatter tab is a hydraulic
        # rating plot: X=Depth, Y=Flow, with observed and modelled clouds overlaid.
        if obs is not None and not getattr(obs, 'empty', True) and 'Depth_m' in obs.columns and 'Flow_m3_s' in obs.columns:
            obs_use = filter_df_by_period(obs, start, end) if start is not None or end is not None else obs
            sim_use = filter_df_by_period(sim, start, end) if sim is not None and not getattr(sim, 'empty', True) and (start is not None or end is not None) else sim
            fig = v18_3_make_flow_depth_scatter(obs_use, sim_use, bool(log_mode))
            if fig is not None:
                return fig
        return _V18_3_PREV_make_scatter_figure(variable, obs, sim, active_col, start, end, scatter_variable, log_mode)
except Exception:
    pass


def v18_3_stats_records(obs, rain, plotted_cols):
    rows = []
    for col in plotted_cols:
        if obs is None or col not in obs.columns:
            continue
        key, label, unit, _ = V18_CHANNEL_BY_COL.get(col, ('', col, '', ''))
        s = pd.to_numeric(obs[col], errors='coerce').dropna()
        rows.append({
            'Series': label,
            'Unit': unit,
            'Min': '—' if s.empty else f'{float(s.min()):.4g}',
            'Max': '—' if s.empty else f'{float(s.max()):.4g}',
            'Average': '—' if s.empty else f'{float(s.mean()):.4g}',
            'Total': '—',
        })
    if rain is not None and not getattr(rain, 'empty', True) and 'Rainfall' in rain.columns:
        r = pd.to_numeric(rain['Rainfall'], errors='coerce').dropna()
        dt = rainfall_timestep_hours(rain)
        total = float(r.sum() * dt) if dt and not r.empty else np.nan
        rows.append({
            'Series': 'Rainfall',
            'Unit': 'native / mm-equivalent total',
            'Min': '—' if r.empty else f'{float(r.min()):.4g}',
            'Max': '—' if r.empty else f'{float(r.max()):.4g}',
            'Average': '—' if r.empty else f'{float(r.mean()):.4g}',
            'Total': '—' if not np.isfinite(total) else f'{total:.4g}',
        })
    return rows


def v18_3_add_stats_table(fig, rows, row_index):
    if not rows:
        rows = [{'Series':'—','Unit':'—','Min':'—','Max':'—','Average':'—','Total':'—'}]
    headers = ['Series','Unit','Min','Max','Average','Total']
    values = [[r.get(h, '—') for r in rows] for h in headers]
    fig.add_trace(go.Table(
        header=dict(values=headers, fill_color='#f2f4f7', align='center', font=dict(size=11, color='#111'), height=24),
        cells=dict(values=values, fill_color='white', align='center', font=dict(size=11, color='#111'), height=24),
        columnwidth=[100,130,80,80,80,90]
    ), row=row_index, col=1)


try:
    _V18_3_PREV_make_figure = make_figure
    def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
        hydro = v18_hydro_columns(obs) if obs is not None else []
        if not hydro:
            return _V18_3_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, wapug_events, wapug_color)
        plotted_cols = v18_2_selected_hydro_columns_for_variable(obs, variable) if 'v18_2_selected_hydro_columns_for_variable' in globals() else hydro
        if variable == 'all':
            plotted_cols = hydro
        has_rain = rain is not None and not getattr(rain, 'empty', True)
        has_stats = bool(stats_box)
        rows_count = (1 if has_rain else 0) + len(plotted_cols) + (1 if has_stats else 0)
        specs = [[{'type':'xy'}] for _ in range(rows_count)]
        if has_stats:
            specs[-1] = [{'type':'table'}]
        # Keep stats row comfortably below data; give it more height and spacing.
        row_heights = []
        if has_rain:
            row_heights.append(0.18)
        hydro_weight = 0.70 / max(len(plotted_cols), 1)
        row_heights += [hydro_weight] * len(plotted_cols)
        if has_stats:
            row_heights.append(0.17)
        total_h = sum(row_heights)
        row_heights = [h/total_h for h in row_heights]
        titles = (['Rainfall'] if has_rain else []) + [V18_CHANNEL_BY_COL[c][1] for c in plotted_cols] + (['Statistics'] if has_stats else [])
        fig = make_subplots(rows=rows_count, cols=1, shared_xaxes=True, row_heights=row_heights, vertical_spacing=0.075, specs=specs, subplot_titles=titles)
        rix = 1
        if has_rain:
            xs, ys, hx, hy = rainfall_vertical_strokes(rain)
            fig.add_trace(go.Scattergl(x=xs, y=ys, mode='lines', name='Rainfall', line=dict(color=colors.get('rain','#4A90E2'), width=1), opacity=0.60, hoverinfo='skip'), row=rix, col=1)
            events = wapug_events or (V18_LAST_EVENTS if 'V18_LAST_EVENTS' in globals() else [])
            frain = V18_LAST_FULL_RAIN if 'V18_LAST_FULL_RAIN' in globals() and not V18_LAST_FULL_RAIN.empty else rain
            if events:
                try:
                    x0, x1 = get_full_extent(obs, sim, rain)
                    wx, wy = v18_1_event_overlay_strokes(frain, events, x0, x1) if 'v18_1_event_overlay_strokes' in globals() else v18_event_strokes(rain, events)
                    if wx:
                        fig.add_trace(go.Scattergl(x=wx, y=wy, mode='lines', name='WAPUG/manual event highlight', line=dict(color=wapug_color or '#ff9900', width=3), opacity=1, hoverinfo='skip'), row=rix, col=1)
                except Exception:
                    pass
            rmax = rainfall_axis_max(rain, thresholds.get('rain_ymax'))
            fig.update_yaxes(title_text='Rainfall', range=[rmax,0] if rmax else None, autorange=False if rmax else 'reversed', row=rix, col=1)
            rix += 1
        for col in plotted_cols:
            key, label, unit, default_color = V18_CHANNEL_BY_COL[col]
            x, y = downsample_xy(obs['timestamp'].to_numpy(), obs[col].to_numpy(), max_points)
            obs_color = colors.get('obs','#ff0000') if key == 'depth' else default_color
            fig.add_trace(go.Scatter(x=x, y=y, mode='lines', name=f'Observed {label}', line=dict(color=obs_color, width=2.2)), row=rix, col=1)
            sim_channels = v19_30_find_sim_channels(sim, col, label) if 'v19_30_find_sim_channels' in globals() else ([v18_3_find_sim_channel(sim, col, label)] if v18_3_find_sim_channel(sim, col, label) else [])
            for sim_idx, sim_col in enumerate(sim_channels):
                tmp = sim[['timestamp', sim_col]].dropna(subset=[sim_col])
                sx, sy = downsample_xy(tmp['timestamp'].to_numpy(), tmp[sim_col].to_numpy(), max_points)
                sim_palette = globals().get('V19_30_SERIES_COLOURS', [colors.get('sim','#0008ff')])
                sim_colour = sim_palette[sim_idx % len(sim_palette)] if sim_palette else colors.get('sim','#0008ff')
                sim_name = v19_30_series_display_name(sim_col) if 'v19_30_series_display_name' in globals() else f'Modelled {label}: {sim_col}'
                fig.add_trace(go.Scatter(x=sx, y=sy, mode='lines', name=sim_name, line=dict(color=sim_colour, width=2)), row=rix, col=1)
            if key == 'depth':
                x0, x1 = get_full_extent(obs, sim, rain)
                add_threshold(fig, x0, x1, thresholds.get('th1'), thresholds.get('th1_label'), thresholds.get('th1_color'), rix)
                add_threshold(fig, x0, x1, thresholds.get('th2'), thresholds.get('th2_label'), thresholds.get('th2_color'), rix)
            fig.update_yaxes(title_text=f'{label} ({unit})', row=rix, col=1)
            rix += 1
        if has_stats:
            v18_3_add_stats_table(fig, v19_30_graph_stats_records(obs, sim, rain, plotted_cols, variable) if 'v19_30_graph_stats_records' in globals() else v18_3_stats_records(obs, rain, plotted_cols), rix)
        fig.update_layout(
            template='plotly_white', height=max(840, 245*rows_count),
            title='Observed / Modelled hydraulic series' + (f' — {title_suffix}' if title_suffix else ''),
            hovermode='x unified', legend=dict(orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1),
            margin=dict(l=70, r=35, t=90, b=95), uirevision='v18-3-timeseries'
        )
        return fig
except Exception:
    pass

# ============================ END V18_3_PATCH_MARKER ============================



# ============================== V18_5_FIXED_PATCH_MARKER ==============================
# V18.5 fixed combined WAPUG/report toggle hotfix:
# - Includes V18.4 stale-event highlight clearing behaviour.
# - Makes the Event overlay toggle authoritative immediately, even before Apply/Refresh.
# - Generated reports inherit the current Event overlay global state: OFF = guaranteed plain rainfall/no orange highlights.
# - Avoids invasive report-callback signature rewrites to prevent indentation/signature breakage.

V18_REPORT_INCLUDE_EVENTS = False
V18_REPORT_EVENTS = []
V18_REPORT_HIGHLIGHT_COLOR = '#ff9900'


def v18_5_fixed_clear_event_cache():
    global V18_LAST_EVENTS, V18_LAST_FULL_RAIN, V18_REPORT_INCLUDE_EVENTS, V18_REPORT_EVENTS
    try:
        V18_LAST_EVENTS = []
        V18_LAST_FULL_RAIN = pd.DataFrame(columns=['timestamp','Rainfall'])
    except Exception:
        pass
    V18_REPORT_INCLUDE_EVENTS = False
    V18_REPORT_EVENTS = []


def v18_5_fixed_prune_event_highlight_traces(fig):
    try:
        fig.data = tuple(
            tr for tr in fig.data
            if not any(tok in str(getattr(tr, 'name', '') or '').lower() for tok in ['highlight', 'wapug/manual event', 'wapug'])
        )
    except Exception:
        pass
    return fig


def v18_5_fixed_overlay_xy_from_rain(rain_source, events, x0=None, x1=None):
    if rain_source is None or getattr(rain_source, 'empty', True) or not events:
        return [], []
    try:
        r = rain_source[['timestamp','Rainfall']].copy()
        r['timestamp'] = pd.to_datetime(r['timestamp'], errors='coerce')
        r['Rainfall'] = pd.to_numeric(r['Rainfall'], errors='coerce')
        r = r.dropna(subset=['timestamp','Rainfall']).sort_values('timestamp')
        if x0 is not None:
            r = r[r['timestamp'] >= pd.Timestamp(x0)]
        if x1 is not None:
            r = r[r['timestamp'] <= pd.Timestamp(x1)]
        if r.empty:
            return [], []
        mask = pd.Series(False, index=r.index)
        for ev in events:
            try:
                mask |= (r['timestamp'] >= pd.Timestamp(ev['Start'])) & (r['timestamp'] <= pd.Timestamp(ev['Stop'])) & (r['Rainfall'] > 0)
            except Exception:
                continue
        xs, ys = [], []
        for t, v in zip(r.loc[mask, 'timestamp'].to_numpy(), r.loc[mask, 'Rainfall'].to_numpy()):
            xs.extend([t, t, None])
            ys.extend([0.0, float(v), None])
        return xs, ys
    except Exception:
        return [], []


try:
    _V18_5_FIXED_PREV_make_figure = make_figure
    def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
        global V18_LAST_EVENTS, V18_LAST_FULL_RAIN, V18_REPORT_INCLUDE_EVENTS, V18_REPORT_EVENTS, V18_REPORT_HIGHLIGHT_COLOR
        current_events = list(wapug_events or [])

        # Report path: report callbacks do not pass wapug_events. Only inject cached report events
        # if the Event overlay switch is currently/last-authoritatively ON.
        if not current_events and V18_REPORT_INCLUDE_EVENTS and V18_REPORT_EVENTS:
            current_events = list(V18_REPORT_EVENTS or [])
            wapug_color = wapug_color or V18_REPORT_HIGHLIGHT_COLOR

        # OFF / no authorised events: clear cache before old wrappers can reuse stale events.
        if not current_events:
            v18_5_fixed_clear_event_cache()
            fig = _V18_5_FIXED_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, [], wapug_color)
            return v18_5_fixed_prune_event_highlight_traces(fig)

        # ON / authorised events: allow previous plotter and defend by adding overlay if omitted.
        V18_REPORT_EVENTS = current_events
        V18_REPORT_INCLUDE_EVENTS = True
        if wapug_color:
            V18_REPORT_HIGHLIGHT_COLOR = wapug_color
        fig = _V18_5_FIXED_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, current_events, wapug_color)
        try:
            has_highlight = any('highlight' in str(getattr(tr, 'name', '') or '').lower() for tr in fig.data)
            if not has_highlight:
                full_rain = V18_LAST_FULL_RAIN if 'V18_LAST_FULL_RAIN' in globals() and not V18_LAST_FULL_RAIN.empty else rain
                x0, x1 = get_full_extent(obs, sim, rain)
                wx, wy = v18_5_fixed_overlay_xy_from_rain(full_rain, current_events, x0, x1)
                if wx:
                    fig.add_trace(go.Scattergl(
                        x=wx, y=wy, mode='lines', name='WAPUG/manual event highlight',
                        line=dict(color=wapug_color or V18_REPORT_HIGHLIGHT_COLOR or '#ff9900', width=3),
                        opacity=1.0, hoverinfo='skip'
                    ))
        except Exception:
            pass
        return fig
except Exception:
    pass


@app.callback(
    Output('period-message','children', allow_duplicate=True),
    Input('event-highlight-toggle','value'),
    prevent_initial_call=True
)
def v18_5_fixed_event_overlay_toggle_state(event_highlight_toggle):
    global V18_REPORT_INCLUDE_EVENTS
    if 'on' in (event_highlight_toggle or []):
        V18_REPORT_INCLUDE_EVENTS = True
        return 'Event overlay enabled. Click Apply / Refresh Graph to recalculate WAPUG/manual highlights.'
    v18_5_fixed_clear_event_cache()
    return 'Event overlay disabled. WAPUG/manual highlights are cleared and reports will use plain rainfall.'

# ============================ END V18_5_FIXED_PATCH_MARKER ============================



# ============================== V18_6_VELOCITY_SIM_FIX ==============================
# V18.6 hotfix:
# - Canonicalises simulated hydraulic CSV/FDV channels to Depth_m, Flow_m3_s, Velocity_m_s.
# - Uses BOTH column names and selected simulated file names, so separate exported model CSVs
#   such as Depth.csv, Flow.csv, Velocity.csv are recognised even if their value column is generic.
# - Strengthens simulated channel lookup used by time-series and scatter plotting.

V18_6_CANONICAL_CHANNELS = {
    'depth': 'Depth_m',
    'flow': 'Flow_m3_s',
    'velocity': 'Velocity_m_s',
}


def v18_6_norm_text(x):
    try:
        return normalise(str(x or ''))
    except Exception:
        return str(x or '').strip().lower().replace(' ', '_').replace('-', '_')


def v18_6_channel_from_text(text):
    n = v18_6_norm_text(text)
    # Depth / level variants. Do not map rainfall depth because this function is only used for simulated hydraulic files.
    if any(tok in n for tok in ['depth', 'depth_m', 'level', 'stage', 'water_level', 'head']):
        return 'Depth_m'
    # Flow variants.
    if any(tok in n for tok in ['flow', 'flow_m3_s', 'flow_m3s', 'discharge', 'm3_s', 'm3s', 'l_s', 'lps']) or n in ['q', 'qsim', 'q_sim', 'simq']:
        return 'Flow_m3_s'
    # Velocity variants: deliberately broad because model exports often use Vel, V, US velocity, link velocity etc.
    if any(tok in n for tok in ['velocity', 'vel', 'vel_m_s', 'velocity_m_s', 'velocity_ms', 'm_s', 'mps', 'speed']) or n in ['v', 'v_sim', 'simv']:
        return 'Velocity_m_s'
    return None


def v18_6_source_index_from_col(col, filenames):
    """Best-effort matching of merged simulated column back to its source file stem."""
    nc = v18_6_norm_text(col)
    for f in filenames or []:
        stem = Path(str(f)).stem
        ns = v18_6_norm_text(stem)
        if ns and ns in nc:
            return f
    return None


def v18_6_make_unique_column(existing, wanted):
    if wanted not in existing:
        return wanted
    i = 2
    while f'{wanted}_{i}' in existing:
        i += 1
    return f'{wanted}_{i}'


def v18_6_canonicalise_sim_columns(df, filenames=None):
    if df is None or getattr(df, 'empty', True):
        return df
    out = df.copy()
    rename = {}
    existing_after = set(out.columns)
    for col in list(out.columns):
        if col == 'timestamp':
            continue
        # 1) Try the merged/result column name first.
        target = v18_6_channel_from_text(col)
        # 2) If the value column is generic, infer from source filename embedded in the merged name.
        if target is None:
            src_file = v18_6_source_index_from_col(col, filenames)
            if src_file:
                target = v18_6_channel_from_text(Path(str(src_file)).stem)
        # 3) If still unknown and there is a one-file simulated selection, infer from that file name.
        if target is None and filenames and len(filenames) == 1:
            target = v18_6_channel_from_text(Path(str(filenames[0])).stem)
        if target:
            existing_after.discard(col)
            final = v18_6_make_unique_column(existing_after, target)
            existing_after.add(final)
            rename[col] = final
    if rename:
        out = out.rename(columns=rename)
    return out


# Patch the live Registry instance so all existing V17/V18 cache logic remains intact.
try:
    if not hasattr(REGISTRY, '_v18_6_velocity_fix_applied'):
        _V18_6_PREV_ensure_simulated = REGISTRY.ensure_simulated
        def ensure_simulated_v18_6(filenames, stage=None):
            sim, msg = _V18_6_PREV_ensure_simulated(filenames, stage)
            sim2 = v18_6_canonicalise_sim_columns(sim, filenames or [])
            detected = [c for c in ['Depth_m', 'Flow_m3_s', 'Velocity_m_s'] if sim2 is not None and c in sim2.columns]
            if stage is not None:
                stage.append('V18.6 simulated channel canonicalisation: ' + (', '.join(detected) if detected else 'no hydraulic channel rename required'))
            suffix = '; V18.6 canonical simulated channels=' + (','.join(detected) if detected else 'none')
            return sim2, str(msg) + suffix
        REGISTRY.ensure_simulated = ensure_simulated_v18_6
        REGISTRY._v18_6_velocity_fix_applied = True
except Exception:
    pass


# Strengthen active simulated/profile dropdown column options.
try:
    _V18_6_PREV_available_value_columns_from_files = available_value_columns_from_files
    def available_value_columns_from_files(filenames):
        cols = []
        try:
            cols = list(_V18_6_PREV_available_value_columns_from_files(filenames) or [])
        except Exception:
            cols = []
        # Add canonical options inferred from file names, even if raw CSV value columns are generic.
        for f in filenames or []:
            ch = v18_6_channel_from_text(Path(str(f)).stem)
            if ch and ch not in cols:
                cols.append(ch)
        # Preserve order and uniqueness.
        out = []
        for c in cols:
            mapped = v18_6_channel_from_text(c) or c
            if mapped not in out:
                out.append(mapped)
        return out
except Exception:
    pass


# Override channel finder used by V18.3+ plotting so Velocity_m_s is found even from non-canonical names.
def v18_6_find_sim_channel(sim, channel_col, label=None):
    if sim is None or getattr(sim, 'empty', True):
        return None
    cols = [c for c in sim.columns if c != 'timestamp']
    if channel_col in cols:
        return channel_col
    target = v18_6_channel_from_text(channel_col) or channel_col
    label_target = v18_6_channel_from_text(label or '')
    for c in cols:
        mapped = v18_6_channel_from_text(c)
        if mapped == target or (label_target and mapped == label_target):
            return c
    # Fallback to old fuzzy matching.
    n_channel = v18_6_norm_text(channel_col)
    n_label = v18_6_norm_text(label or channel_col)
    for c in cols:
        nc = v18_6_norm_text(c)
        if n_channel in nc or n_label in nc:
            return c
    return None

# Replace V18.3 channel finder if present; otherwise expose the stronger function for future wrappers.
try:
    v18_3_find_sim_channel = v18_6_find_sim_channel
except Exception:
    pass

# ============================ END V18_6_VELOCITY_SIM_FIX ============================



# ============================== V19_ANALYTICS_PATCH_MARKER ==============================
# V19 additive analytics layer over V18.6. Core V18.6 parsing, plotting, WAPUG and report logic remain intact.

V19_SCATTER_MODE = 'rating'
V19_EVENT_TIMELINE_ENABLED = True
V19_RATING_CURVES_ENABLED = True
V19_PERSIST_KEYS = [
    'variable','observed-file','simulated-files','active-sim-profile','rainfall-file','obs-color','sim-color','rain-color',
    'threshold-1','threshold-2','wapug-toggle','event-highlight-toggle','event-timeline-toggle','scatter-mode','scatter-variable','scatter-log-toggle'
]


def v19_find_by_id(component, wanted_id):
    try:
        if getattr(component, 'id', None) == wanted_id:
            return component
        children = getattr(component, 'children', None)
        if children is None:
            return None
        if not isinstance(children, (list, tuple)):
            children = [children]
        for child in children:
            found = v19_find_by_id(child, wanted_id)
            if found is not None:
                return found
    except Exception:
        return None
    return None


def v19_append_once(parent, child, marker_id):
    try:
        if v19_find_by_id(parent, marker_id) is not None:
            return
        if parent.children is None:
            parent.children = []
        if not isinstance(parent.children, list):
            parent.children = list(parent.children) if isinstance(parent.children, tuple) else [parent.children]
        parent.children.append(child)
    except Exception:
        pass


# ---- Layout additions: V19 diagnostics tab, scatter mode toggle, event timeline toggle, persistent store ----
try:
    v19_append_once(app.layout, dcc.Store(id='v19-ui-state', storage_type='local'), 'v19-ui-state')
    tabs = v19_find_by_id(app.layout, 'main-tabs')
    if tabs is not None:
        if not isinstance(tabs.children, list):
            tabs.children = list(tabs.children) if isinstance(tabs.children, tuple) else [tabs.children]
        if v19_find_by_id(tabs, 'v19-calibration-diagnostics') is None:
            tabs.children.append(dcc.Tab(label='Calibration Diagnostics', value='calibration-diagnostics-tab', children=[
                dcc.Loading(type='circle', children=html.Div(id='v19-calibration-diagnostics', children=html.Div('Click Apply / Refresh Graph to calculate V19 calibration diagnostics.', style={'color':'#666','marginTop':'14px'})))
            ]))
    scatter_graph = v19_find_by_id(app.layout, 'scatter-chart')
    # Add controls into scatter tab by appending near graph parent if feasible.
    scatter_tab = None
    if tabs is not None:
        for tab in tabs.children:
            if getattr(tab, 'value', None) == 'scatter-tab':
                scatter_tab = tab
                break
    if scatter_tab is not None and v19_find_by_id(scatter_tab, 'scatter-mode') is None:
        if not isinstance(scatter_tab.children, list):
            scatter_tab.children = list(scatter_tab.children) if isinstance(scatter_tab.children, tuple) else [scatter_tab.children]
        scatter_tab.children.insert(0, html.Div([
            html.Div([html.Label('Scatter mode'), dcc.RadioItems(id='scatter-mode', options=[{'label':'Rating (Depth vs Flow)','value':'rating'}, {'label':'Obs vs Sim','value':'obs_sim'}], value='rating', inline=True)], style={'flex':'1.2','minWidth':'310px'}),
            html.Div([html.Label('Rating diagnostics'), dcc.Checklist(id='rating-curve-toggle', options=[{'label':' Show fitted rating curves','value':'fit'}], value=['fit'], style={'paddingTop':'6px'})], style={'flex':'1','minWidth':'260px'}),
        ], id='v19-scatter-mode-panel', style={'display':'flex','gap':'14px','flexWrap':'wrap','padding':'12px','background':'#fff','border':'1px solid #e5e7eb','borderRadius':'10px','margin':'10px 0'}))
    # Add separate event-timeline toggle immediately after Event overlay / WAPUG controls area.
    if v19_find_by_id(app.layout, 'event-timeline-toggle') is None:
        wapug = v19_find_by_id(app.layout, 'wapug-toggle')
        if wapug is not None:
            # safest: append as small floating control near top-level layout, visually close after controls.
            idx_child = html.Div([html.Label('Event overlay'), dcc.Checklist(id='event-timeline-toggle', options=[{'label':' Show event labels/bands on hydraulic timeline','value':'on'}], value=['on'], style={'paddingTop':'6px'})], id='v19-event-timeline-panel', style={'background':'#fff','border':'1px solid #e5e7eb','borderRadius':'10px','padding':'10px','margin':'0 0 12px 0'})
            # Insert before file-status if possible.
            if isinstance(app.layout.children, list):
                insert_at = 0
                for i, ch in enumerate(app.layout.children):
                    if v19_find_by_id(ch, 'file-status') is not None:
                        insert_at = i
                        break
                app.layout.children.insert(insert_at, idx_child)
except Exception:
    pass


# ---- Numerical helpers ----
def v19_dt_minutes(df):
    try:
        d = pd.to_datetime(df['timestamp']).diff().dropna().dt.total_seconds()/60.0
        d = d[d > 0]
        return float(d.median()) if len(d) else 2.0
    except Exception:
        return 2.0


def v19_pick_sim_channel(sim, channel_col, label=None):
    if sim is None or getattr(sim, 'empty', True):
        return None
    try:
        return v18_6_find_sim_channel(sim, channel_col, label)
    except Exception:
        try:
            return v18_3_find_sim_channel(sim, channel_col, label)
        except Exception:
            cols = [c for c in sim.columns if c != 'timestamp']
            for c in cols:
                if normalise(channel_col) in normalise(c) or normalise(label or '') in normalise(c):
                    return c
    return None


def v19_pair_channel(obs, sim, obs_col, sim_col=None, start=None, end=None):
    if obs is None or sim is None or getattr(obs, 'empty', True) or getattr(sim, 'empty', True) or obs_col not in obs.columns:
        return pd.DataFrame()
    sim_col = sim_col or v19_pick_sim_channel(sim, obs_col, V18_CHANNEL_BY_COL.get(obs_col, ('', obs_col, '', ''))[1] if 'V18_CHANNEL_BY_COL' in globals() else obs_col)
    if not sim_col or sim_col not in sim.columns:
        return pd.DataFrame()
    obs2 = obs[['timestamp', obs_col]].rename(columns={obs_col:'Observed'}).dropna()
    sim2 = sim[['timestamp', sim_col]].dropna().copy()
    if start is not None or end is not None:
        obs2 = filter_df_by_period(obs2, start, end)
        sim2 = filter_df_by_period(sim2, start, end)
    if obs2.empty or sim2.empty:
        return pd.DataFrame()
    s, e = data_overlap_period(obs2, sim2, None, None)
    if s is None:
        return pd.DataFrame()
    return interpolate_sim_to_obs(filter_df_by_period(obs2, s, e), filter_df_by_period(sim2, s, e))


def v19_rating_fit(depth, flow):
    d = pd.to_numeric(depth, errors='coerce')
    q = pd.to_numeric(flow, errors='coerce')
    m = (d > 0) & (q > 0) & d.notna() & q.notna()
    d = d[m]; q = q[m]
    if len(d) < 5:
        return {'ok':False, 'n':int(len(d)), 'message':'Not enough positive depth-flow points'}
    x = np.log10(d.astype(float)); y = np.log10(q.astype(float))
    try:
        b, loga = np.polyfit(x, y, 1)
        pred = loga + b*x
        ss_res = float(np.sum((y-pred)**2)); ss_tot = float(np.sum((y-y.mean())**2))
        r2 = 1 - ss_res/ss_tot if ss_tot > 0 else np.nan
        return {'ok':True, 'a':float(10**loga), 'b':float(b), 'r2':float(r2), 'n':int(len(d)), 'x_min':float(d.min()), 'x_max':float(d.max())}
    except Exception as e:
        return {'ok':False, 'n':int(len(d)), 'message':str(e)}


def v19_bias_metrics(paired, variable_label, cumulative=False, dt_minutes=None):
    if paired is None or paired.empty:
        return None
    o = pd.to_numeric(paired['obs'], errors='coerce')
    s = pd.to_numeric(paired['sim'], errors='coerce')
    m = o.notna() & s.notna()
    o = o[m]; s = s[m]
    if len(o) < 2:
        return None
    err = s - o
    out = {
        'Variable': variable_label,
        'Pairs': int(len(o)),
        'Obs mean': float(o.mean()),
        'Model mean': float(s.mean()),
        'Mean bias': float(err.mean()),
        'Bias %': float(err.mean()/o.mean()*100) if float(o.mean()) != 0 else np.nan,
        'MAE': float(np.mean(np.abs(err))),
        'RMSE': float(np.sqrt(np.mean(err**2))),
        'Obs peak': float(o.max()),
        'Model peak': float(s.max()),
        'Peak error %': float((s.max()-o.max())/o.max()*100) if float(o.max()) != 0 else np.nan,
    }
    den = float(np.sum((o-o.mean())**2))
    out['NSE'] = float(1 - np.sum((s-o)**2)/den) if den > 0 else np.nan
    # KGE 2009 style.
    try:
        r = float(np.corrcoef(o, s)[0,1])
        alpha = float(s.std()/o.std()) if o.std() != 0 else np.nan
        beta = float(s.mean()/o.mean()) if o.mean() != 0 else np.nan
        out['KGE'] = float(1 - np.sqrt((r-1)**2 + (alpha-1)**2 + (beta-1)**2))
    except Exception:
        out['KGE'] = np.nan
    if cumulative and dt_minutes:
        obs_vol = float(o.sum() * dt_minutes * 60.0)
        sim_vol = float(s.sum() * dt_minutes * 60.0)
        out['Volume error %'] = float((sim_vol-obs_vol)/obs_vol*100) if obs_vol != 0 else np.nan
    return out


def v19_best_lag(paired, max_lag_min=180, step_min=None):
    if paired is None or paired.empty or 'timestamp' not in paired.columns:
        return None
    d = paired[['timestamp','obs','sim']].copy().dropna()
    if len(d) < 10:
        return None
    d['timestamp'] = pd.to_datetime(d['timestamp'])
    if step_min is None:
        step_min = max(1.0, v19_dt_minutes(d))
    best = {'Lag min':0, 'Correlation':np.nan}
    base_corr = np.nan
    try:
        base_corr = float(np.corrcoef(d['obs'], d['sim'])[0,1])
    except Exception:
        pass
    obs = d[['timestamp','obs']].sort_values('timestamp')
    sim = d[['timestamp','sim']].sort_values('timestamp')
    for lag in np.arange(-max_lag_min, max_lag_min + step_min, step_min):
        shifted = sim.copy(); shifted['timestamp'] = shifted['timestamp'] + pd.to_timedelta(float(lag), unit='m')
        try:
            m = pd.merge_asof(obs.sort_values('timestamp'), shifted.sort_values('timestamp'), on='timestamp', direction='nearest', tolerance=pd.Timedelta(minutes=step_min*1.5)).dropna()
            if len(m) >= 10:
                c = float(np.corrcoef(m['obs'], m['sim'])[0,1])
                if np.isfinite(c) and (not np.isfinite(best['Correlation']) or c > best['Correlation']):
                    best = {'Lag min':float(lag), 'Correlation':c, 'Pairs':int(len(m)), 'Base correlation':base_corr}
        except Exception:
            continue
    return best


def v19_compute_dwf(obs, rain=None):
    if obs is None or getattr(obs, 'empty', True) or 'Flow_m3_s' not in obs.columns:
        return {'Available':'No', 'Reason':'Observed flow not available'}
    df = obs[['timestamp','Flow_m3_s']].copy(); df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce'); df = df.dropna().sort_values('timestamp')
    if df.empty:
        return {'Available':'No', 'Reason':'No valid observed flow'}
    if rain is None or getattr(rain, 'empty', True):
        return {'Available':'Partial', 'Reason':'Rainfall unavailable; DWF estimated from all flow records', 'Average DWF m3/s':float(pd.to_numeric(df['Flow_m3_s'], errors='coerce').mean())}
    r = rain[['timestamp','Rainfall']].copy(); r['timestamp'] = pd.to_datetime(r['timestamp'], errors='coerce'); r['Rainfall'] = pd.to_numeric(r['Rainfall'], errors='coerce').fillna(0); r = r.dropna(subset=['timestamp'])
    dt_h = rainfall_timestep_hours(r) or (v19_dt_minutes(r)/60.0)
    daily = r.assign(day=r['timestamp'].dt.floor('D')).groupby('day')['Rainfall'].sum() * dt_h
    dry_days = set(daily[daily <= 1.0].index)
    df['day'] = df['timestamp'].dt.floor('D')
    baseline_days = sorted([d for d in dry_days if d >= df['day'].max() - pd.Timedelta(days=28)])
    if len(baseline_days) < 5:
        return {'Available':'Low confidence', 'Dry days used':len(baseline_days), 'Average DWF m3/s':float(df[df['day'].isin(dry_days)]['Flow_m3_s'].mean()) if dry_days else np.nan, 'Rule':'28d baseline, >=5 dry days, dry day <=1mm'}
    dry_flow = df[df['day'].isin(baseline_days)].copy()
    # ADP_HOURS=6 approximation: daily minimum rolling 6-hour average on dry days, averaged across dry days.
    vals = []
    for day, g in dry_flow.groupby('day'):
        g = g.sort_values('timestamp')
        step = max(v19_dt_minutes(g), 1)
        window = max(1, int(round(6*60/step)))
        s = pd.to_numeric(g['Flow_m3_s'], errors='coerce').rolling(window=window, min_periods=max(1, window//2)).mean()
        if s.notna().any(): vals.append(float(s.min()))
    return {'Available':'Yes', 'Dry days used':len(baseline_days), 'Average DWF m3/s':float(np.nanmean(vals)) if vals else float(dry_flow['Flow_m3_s'].mean()), 'Rule':'28d baseline, >=5 dry days, dry day <=1mm, ADP 6h'}


def v19_event_scores(obs, sim, events):
    rows = []
    if not events:
        return rows
    channels = [('Flow_m3_s','Flow',True), ('Depth_m','Depth',False), ('Velocity_m_s','Velocity',False)]
    for ev in events:
        start = pd.Timestamp(ev.get('Start')) - pd.Timedelta(hours=1)
        stop = pd.Timestamp(ev.get('Stop')) + pd.Timedelta(hours=6)
        row = {'Event':ev.get('Event'), 'Start':fmt_dt(ev.get('Start')), 'Stop':fmt_dt(ev.get('Stop'))}
        comments = []
        for col, label, cumulative in channels:
            if obs is None or col not in obs.columns: continue
            p = v19_pair_channel(obs, sim, col, start=start, end=stop)
            m = v19_bias_metrics(p, label, cumulative=cumulative, dt_minutes=v19_dt_minutes(obs))
            if m:
                row[f'{label} peak error %'] = f"{m.get('Peak error %', np.nan):.2f}" if np.isfinite(m.get('Peak error %', np.nan)) else '—'
                row[f'{label} RMSE'] = f"{m.get('RMSE', np.nan):.4g}" if np.isfinite(m.get('RMSE', np.nan)) else '—'
                lag = v19_best_lag(p, max_lag_min=120)
                row[f'{label} lag min'] = f"{lag.get('Lag min', np.nan):.1f}" if lag and np.isfinite(lag.get('Lag min', np.nan)) else '—'
                if np.isfinite(m.get('Peak error %', np.nan)) and abs(m['Peak error %']) > 50: comments.append(f'{label} peak mismatch')
        row['Score'] = 'Red' if comments else 'Green'
        row['Comment'] = '; '.join(comments) if comments else 'No major event calibration issue detected'
        rows.append(row)
    return rows


def v19_fmt_metric(x):
    try:
        return '—' if not np.isfinite(float(x)) else f'{float(x):.4g}'
    except Exception:
        return '—'


def v19_table(rows):
    if not rows:
        return html.Div('No results available.', style={'color':'#666'})
    cols = list(rows[0].keys())
    return _simple_table(rows, cols)


# ---- Scatter mode implementation ----
try:
    _V19_PREV_make_scatter_figure = make_scatter_figure
    def make_scatter_figure(variable, obs, sim, active_col=None, start=None, end=None, scatter_variable=None, log_mode=False):
        mode = globals().get('V19_SCATTER_MODE', 'rating')
        if mode == 'rating' and obs is not None and not getattr(obs, 'empty', True) and 'Depth_m' in obs.columns and 'Flow_m3_s' in obs.columns:
            fig = v18_3_make_flow_depth_scatter(filter_df_by_period(obs, start, end) if start is not None or end is not None else obs, filter_df_by_period(sim, start, end) if sim is not None and not getattr(sim, 'empty', True) and (start is not None or end is not None) else sim, bool(log_mode)) if 'v18_3_make_flow_depth_scatter' in globals() else None
            if fig is None:
                fig = go.Figure()
            # rating curves
            if 'fit' in globals().get('V19_RATING_CURVES_VALUE', ['fit']) and len(fig.data):
                fit = v19_rating_fit(obs['Depth_m'], obs['Flow_m3_s'])
                if fit.get('ok'):
                    xs = np.linspace(fit['x_min'], fit['x_max'], 80); ys = fit['a'] * xs**fit['b']
                    fig.add_trace(go.Scatter(x=np.log10(xs) if log_mode else xs, y=np.log10(ys) if log_mode else ys, mode='lines', name=f"Observed fit: Q={fit['a']:.3g}H^{fit['b']:.3g}, R²={fit['r2']:.3f}", line=dict(color='#ff0000', width=2)))
                sd = v19_pick_sim_channel(sim, 'Depth_m', 'Depth') if sim is not None else None
                sf = v19_pick_sim_channel(sim, 'Flow_m3_s', 'Flow') if sim is not None else None
                if sd and sf:
                    fitm = v19_rating_fit(sim[sd], sim[sf])
                    if fitm.get('ok'):
                        xs = np.linspace(fitm['x_min'], fitm['x_max'], 80); ys = fitm['a'] * xs**fitm['b']
                        fig.add_trace(go.Scatter(x=np.log10(xs) if log_mode else xs, y=np.log10(ys) if log_mode else ys, mode='lines', name=f"Modelled fit: Q={fitm['a']:.3g}H^{fitm['b']:.3g}, R²={fitm['r2']:.3f}", line=dict(color='#0008ff', width=2)))
            return fig
        return _V19_PREV_make_scatter_figure(variable, obs, sim, active_col, start, end, scatter_variable, log_mode)
except Exception:
    pass


# ---- Event timeline overlay wrapper ----
try:
    _V19_PREV_make_figure = make_figure
    def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
        fig = _V19_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, wapug_events, wapug_color)
        if not globals().get('V19_EVENT_TIMELINE_ENABLED', True):
            return fig
        events = list(wapug_events or (V18_LAST_EVENTS if 'V18_LAST_EVENTS' in globals() else []) or [])
        if not events:
            return fig
        try:
            yrefs = [k for k in fig.layout if str(k).startswith('yaxis')]
            for ev in events:
                x0 = pd.Timestamp(ev['Start']); x1 = pd.Timestamp(ev['Stop']); name = f"Event {ev.get('Event','')}"
                fig.add_vrect(x0=x0, x1=x1, fillcolor='orange', opacity=0.10, line_width=0, annotation_text=name, annotation_position='top left')
        except Exception:
            pass
        return fig
except Exception:
    pass


# ---- V19 callbacks ----
@app.callback(
    Output('scatter-chart','figure', allow_duplicate=True),
    Input('scatter-mode','value'), Input('rating-curve-toggle','value'), Input('scatter-log-toggle','value'), Input('scatter-variable','value'),
    State('variable','value'), State('observed-file','value'), State('simulated-files','value'), State('active-sim-profile','value'), State('user-start','value'), State('user-end','value'),
    prevent_initial_call=True
)
def v19_update_scatter_mode(scatter_mode, rating_curve_toggle, scatter_log_toggle, scatter_variable, variable, obs_file, sim_files, active_sim_profile, user_start, user_end):
    globals()['V19_SCATTER_MODE'] = scatter_mode or 'rating'
    globals()['V19_RATING_CURVES_VALUE'] = rating_curve_toggle or []
    stage = [f'V19 scatter update at {now_text()}']
    try:
        obs, _ = REGISTRY.ensure_observed(obs_file, stage)
        sim, _ = REGISTRY.ensure_simulated(sim_files, stage)
        us, ue, err = parse_user_period(user_start, user_end)
        if err: us = ue = None
        return make_scatter_figure(variable, obs, sim, active_sim_profile, us, ue, scatter_variable or (variable if variable != 'all' else 'depth'), 'log' in (scatter_log_toggle or []))
    except Exception as e:
        return error_figure('V19 scatter update failed', str(e))


@app.callback(Output('period-message','children', allow_duplicate=True), Input('event-timeline-toggle','value'), prevent_initial_call=True)
def v19_event_timeline_toggle(value):
    globals()['V19_EVENT_TIMELINE_ENABLED'] = 'on' in (value or [])
    return 'Event timeline overlay enabled.' if globals()['V19_EVENT_TIMELINE_ENABLED'] else 'Event timeline overlay disabled.'


@app.callback(
    Output('v19-calibration-diagnostics','children'),
    Input('apply-button','n_clicks'),
    State('variable','value'), State('observed-file','value'), State('simulated-files','value'), State('active-sim-profile','value'), State('rainfall-file','value'), State('rain-profile','value'), State('rain-conversion-factor','value'), State('event-highlight-toggle','value'),
    prevent_initial_call=True
)
def v19_calibration_diagnostics(_n, variable, obs_file, sim_files, active_sim_profile, rain_file, rain_profile, rain_factor, event_overlay):
    stage = [f'V19 diagnostics at {now_text()}']
    try:
        obs, om = REGISTRY.ensure_observed(obs_file, stage)
        sim, sm = REGISTRY.ensure_simulated(sim_files, stage)
        rain = pd.DataFrame(columns=['timestamp','Rainfall'])
        if rain_file:
            try:
                rain, _ = v18_load_full_rainfall(rain_file, float(rain_factor or 1.0), stage)
            except Exception:
                pass
        channels = [('Depth_m','Depth',False), ('Flow_m3_s','Flow',True), ('Velocity_m_s','Velocity',False)]
        bias_rows = []
        lag_rows = []
        for col, label, cumulative in channels:
            if col in obs.columns:
                p = v19_pair_channel(obs, sim, col)
                m = v19_bias_metrics(p, label, cumulative=cumulative, dt_minutes=v19_dt_minutes(obs))
                if m:
                    row = {k: v19_fmt_metric(v) if isinstance(v, (float, np.floating)) else v for k,v in m.items()}
                    bias_rows.append(row)
                    lag = v19_best_lag(p)
                    if lag:
                        lag_rows.append({k: v19_fmt_metric(v) if isinstance(v, (float, np.floating)) else v for k,v in lag.items()} | {'Variable':label})
        rating_rows = []
        if 'Depth_m' in obs.columns and 'Flow_m3_s' in obs.columns:
            f = v19_rating_fit(obs['Depth_m'], obs['Flow_m3_s'])
            rating_rows.append({'Dataset':'Observed','n':f.get('n'), 'a':v19_fmt_metric(f.get('a',np.nan)), 'b':v19_fmt_metric(f.get('b',np.nan)), 'R²':v19_fmt_metric(f.get('r2',np.nan)), 'Status':'OK' if f.get('ok') else f.get('message','Not available')})
        sd = v19_pick_sim_channel(sim, 'Depth_m', 'Depth'); sf = v19_pick_sim_channel(sim, 'Flow_m3_s', 'Flow')
        if sd and sf:
            f = v19_rating_fit(sim[sd], sim[sf])
            rating_rows.append({'Dataset':'Modelled','n':f.get('n'), 'a':v19_fmt_metric(f.get('a',np.nan)), 'b':v19_fmt_metric(f.get('b',np.nan)), 'R²':v19_fmt_metric(f.get('r2',np.nan)), 'Status':'OK' if f.get('ok') else f.get('message','Not available')})
        events = V18_LAST_EVENTS if ('on' in (event_overlay or []) and 'V18_LAST_EVENTS' in globals()) else []
        event_rows = v19_event_scores(obs, sim, events)
        dwf = v19_compute_dwf(obs, rain)
        dwf_rows = [{k: v19_fmt_metric(v) if isinstance(v, (float, np.floating)) else v for k,v in dwf.items()}]
        return html.Div([
            html.H3('V19 Calibration Diagnostics'),
            html.Div(f'Observed: {om}', style={'color':'#555','fontSize':'12px'}),
            html.Div(f'Simulated: {sm}', style={'color':'#555','fontSize':'12px','marginBottom':'10px'}),
            html.H4('Bias decomposition'), v19_table(bias_rows),
            html.H4('Flow-depth physics diagnostics'), html.Div('Rating curve: Q = a × Hᵇ, fitted on positive depth-flow pairs.', style={'color':'#555','fontSize':'12px'}), v19_table(rating_rows),
            html.H4('Time lag optimisation'), html.Div('Lag search uses cross-correlation over ±180 minutes.', style={'color':'#555','fontSize':'12px'}), v19_table(lag_rows),
            html.H4('Event-based calibration scoring'), html.Div('Uses WAPUG/manual event windows where Event overlay is ON, with 1h pre-event and 6h post-event hydraulic response windows.', style={'color':'#555','fontSize':'12px'}), v19_table(event_rows),
            html.H4('Dry weather flow baseline'), html.Div('DWF follows the supplied assessment concept: dry day ≤1.0 mm, 28-day baseline, at least 5 dry days, ADP window 6h approximation.', style={'color':'#555','fontSize':'12px'}), v19_table(dwf_rows),
        ])
    except Exception as e:
        return exception_panel('V19 calibration diagnostics failed', e, stage)


# ---- State persistence: save selected UI state on Apply and restore V19 controls on reload where safe ----
@app.callback(Output('v19-ui-state','data'), Input('apply-button','n_clicks'),
              State('variable','value'), State('observed-file','value'), State('simulated-files','value'), State('active-sim-profile','value'), State('rainfall-file','value'),
              State('scatter-mode','value'), State('scatter-variable','value'), State('scatter-log-toggle','value'), State('event-highlight-toggle','value'), State('event-timeline-toggle','value'),
              prevent_initial_call=True)
def v19_save_ui_state(_n, variable, obs_file, sim_files, active_sim_profile, rain_file, scatter_mode, scatter_variable, scatter_log, event_highlight, event_timeline):
    return {'variable':variable, 'observed-file':obs_file, 'simulated-files':sim_files, 'active-sim-profile':active_sim_profile, 'rainfall-file':rain_file, 'scatter-mode':scatter_mode, 'scatter-variable':scatter_variable, 'scatter-log-toggle':scatter_log, 'event-highlight-toggle':event_highlight, 'event-timeline-toggle':event_timeline}


@app.callback(
    Output('period-message','children', allow_duplicate=True),
    Input('event-highlight-toggle','value'),
    prevent_initial_call=True
)
def v19_5_event_overlay_message(event_highlight_value):
    enabled = v19_5_bool_event_overlay(event_highlight_value)
    if enabled:
        return 'Event overlay enabled. Click Apply / Refresh Graph to calculate rainfall-event highlights and timeline bands.'
    return 'Event overlay disabled. Event highlights and event timeline bands are cleared and will stay off after Apply / Refresh Graph.'

# ============================ END V19_5_EVENT_OVERLAY_STATE_FIX_MARKER ============================



# ============================== V19_7_EVENT_OVERLAY_AUTHORITATIVE_FIX_MARKER ==============================
# Final Event overlay authority layer:
# - event-highlight-toggle is a pure input; no callback writes to it.
# - empty wapug_events means OFF/no events and must clear old caches and visuals.
# - this wrapper is intentionally last in the make_figure chain.

def v19_7_clear_event_state():
    global V18_LAST_EVENTS, V18_LAST_FULL_RAIN, V18_REPORT_INCLUDE_EVENTS, V18_REPORT_EVENTS
    try:
        V18_LAST_EVENTS = []
        V18_LAST_FULL_RAIN = pd.DataFrame(columns=['timestamp', 'Rainfall'])
    except Exception:
        pass
    try:
        V18_REPORT_INCLUDE_EVENTS = False
        V18_REPORT_EVENTS = []
    except Exception:
        pass


def v19_7_prune_event_visuals(fig):
    try:
        fig.data = tuple(
            tr for tr in fig.data
            if not any(tok in str(getattr(tr, 'name', '') or '').lower()
                       for tok in ['highlight', 'wapug/manual event', 'highlighted rainfall event'])
        )
    except Exception:
        pass
    try:
        kept_shapes = []
        for sh in tuple(fig.layout.shapes) if fig.layout.shapes else []:
            yref = str(getattr(sh, 'yref', '') or '').lower()
            fill = str(getattr(sh, 'fillcolor', '') or '').lower()
            if yref == 'paper' and ('orange' in fill or '#ff9900' in fill or '255,153,0' in fill):
                continue
            kept_shapes.append(sh)
        fig.layout.shapes = tuple(kept_shapes)
    except Exception:
        pass
    try:
        kept_annotations = []
        for an in tuple(fig.layout.annotations) if fig.layout.annotations else []:
            txt = str(getattr(an, 'text', '') or '')
            yref = str(getattr(an, 'yref', '') or '').lower()
            if yref == 'paper' and (txt.startswith('E') or txt.lower().startswith('event')):
                continue
            kept_annotations.append(an)
        fig.layout.annotations = tuple(kept_annotations)
    except Exception:
        pass
    return fig


try:
    _V19_7_PREV_make_figure = make_figure
    def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
        current_events = list(wapug_events or [])
        if not current_events:
            v19_7_clear_event_state()
            previous_timeline_state = globals().get('V19_EVENT_TIMELINE_ENABLED', True)
            # Disable older event-timeline wrappers while building the base figure.
            globals()['V19_EVENT_TIMELINE_ENABLED'] = False
            fig = _V19_7_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, [], wapug_color)
            globals()['V19_EVENT_TIMELINE_ENABLED'] = previous_timeline_state
            return v19_7_prune_event_visuals(fig)
        # Current authorised events exist: allow the V19.4/V19.3 timeline/highlight chain to draw them.
        return _V19_7_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, current_events, wapug_color)
except Exception:
    pass

# ============================ END V19_7_EVENT_OVERLAY_AUTHORITATIVE_FIX_MARKER ============================



# ============================== V19_8_EVENT_OVERLAY_RADIO_AUTHORITATIVE_MARKER ==============================
# V19.8 final Event overlay fix:
# - Replaces the fragile checklist toggle with an explicit On/Off RadioItems control using the same id.
# - Removes every callback that writes to event-highlight-toggle.value.
# - Event overlay is therefore a pure user input consumed by Apply / Refresh Graph.
# - Empty/no current events forcibly clears stale WAPUG/manual event caches and prunes event visuals.

def v19_8_event_overlay_on(value):
    if isinstance(value, str):
        return value == 'on'
    return 'on' in (value or [])


def v19_8_clear_event_state():
    global V18_LAST_EVENTS, V18_LAST_FULL_RAIN, V18_REPORT_INCLUDE_EVENTS, V18_REPORT_EVENTS
    try:
        V18_LAST_EVENTS = []
        V18_LAST_FULL_RAIN = pd.DataFrame(columns=['timestamp', 'Rainfall'])
    except Exception:
        pass
    try:
        V18_REPORT_INCLUDE_EVENTS = False
        V18_REPORT_EVENTS = []
    except Exception:
        pass


def v19_8_prune_event_visuals(fig):
    try:
        fig.data = tuple(
            tr for tr in fig.data
            if not any(tok in str(getattr(tr, 'name', '') or '').lower()
                       for tok in ['highlight', 'wapug/manual event', 'highlighted rainfall event'])
        )
    except Exception:
        pass
    try:
        kept_shapes = []
        for sh in tuple(fig.layout.shapes) if fig.layout.shapes else []:
            yref = str(getattr(sh, 'yref', '') or '').lower()
            fill = str(getattr(sh, 'fillcolor', '') or '').lower()
            if yref == 'paper' and ('orange' in fill or '#ff9900' in fill or '255,153,0' in fill):
                continue
            kept_shapes.append(sh)
        fig.layout.shapes = tuple(kept_shapes)
    except Exception:
        pass
    try:
        kept_annotations = []
        for an in tuple(fig.layout.annotations) if fig.layout.annotations else []:
            txt = str(getattr(an, 'text', '') or '')
            yref = str(getattr(an, 'yref', '') or '').lower()
            if yref == 'paper' and (txt.startswith('E') or txt.lower().startswith('event')):
                continue
            kept_annotations.append(an)
        fig.layout.annotations = tuple(kept_annotations)
    except Exception:
        pass
    return fig


try:
    _V19_8_PREV_make_figure = make_figure
    def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
        current_events = list(wapug_events or [])
        if not current_events:
            v19_8_clear_event_state()
            prev_timeline = globals().get('V19_EVENT_TIMELINE_ENABLED', True)
            globals()['V19_EVENT_TIMELINE_ENABLED'] = False
            fig = _V19_8_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, [], wapug_color)
            globals()['V19_EVENT_TIMELINE_ENABLED'] = prev_timeline
            return v19_8_prune_event_visuals(fig)
        return _V19_8_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, current_events, wapug_color)
except Exception:
    pass

# ============================ END V19_8_EVENT_OVERLAY_RADIO_AUTHORITATIVE_MARKER ============================



# ============================== V19_9_WAPUG_EVENT_TOGGLE_SEMANTICS_FIX_MARKER ==============================
# V19.9 WAPUG/Event overlay semantics fix:
# - Main WAPUG event toggle controls event detection + orange rainfall highlight + all event overlays.
# - Event overlay toggle controls only event labels and vertical bands extending across hydraulic series.
# - No callback writes back to either toggle value; both toggles are user-authoritative.
# - Apply / Refresh reads event-timeline-toggle directly and sets V19_EVENT_TIMELINE_ENABLED before plotting.

def v19_9_clear_event_state():
    global V18_LAST_EVENTS, V18_LAST_FULL_RAIN, V18_REPORT_INCLUDE_EVENTS, V18_REPORT_EVENTS
    try:
        V18_LAST_EVENTS = []
        V18_LAST_FULL_RAIN = pd.DataFrame(columns=['timestamp', 'Rainfall'])
    except Exception:
        pass
    try:
        V18_REPORT_INCLUDE_EVENTS = False
        V18_REPORT_EVENTS = []
    except Exception:
        pass


def v19_9_prune_all_event_visuals(fig):
    try:
        fig.data = tuple(
            tr for tr in fig.data
            if not any(tok in str(getattr(tr, 'name', '') or '').lower()
                       for tok in ['highlight', 'wapug/manual event', 'highlighted rainfall event'])
        )
    except Exception:
        pass
    return v19_9_prune_timeline_only(fig)


def v19_9_prune_timeline_only(fig):
    try:
        kept_shapes = []
        for sh in tuple(fig.layout.shapes) if fig.layout.shapes else []:
            yref = str(getattr(sh, 'yref', '') or '').lower()
            fill = str(getattr(sh, 'fillcolor', '') or '').lower()
            if yref == 'paper' and ('orange' in fill or '#ff9900' in fill or '255,153,0' in fill):
                continue
            kept_shapes.append(sh)
        fig.layout.shapes = tuple(kept_shapes)
    except Exception:
        pass
    try:
        kept_annotations = []
        for an in tuple(fig.layout.annotations) if fig.layout.annotations else []:
            txt = str(getattr(an, 'text', '') or '')
            yref = str(getattr(an, 'yref', '') or '').lower()
            if yref == 'paper' and (txt.startswith('E') or txt.lower().startswith('event')):
                continue
            kept_annotations.append(an)
        fig.layout.annotations = tuple(kept_annotations)
    except Exception:
        pass
    return fig


try:
    _V19_9_PREV_make_figure = make_figure
    def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
        current_events = list(wapug_events or [])

        # Main WAPUG event toggle OFF is represented by empty current_events from apply_graph.
        # In that case remove both orange rainfall highlights and hydraulic-series timeline overlays.
        if not current_events:
            v19_9_clear_event_state()
            prev_timeline = globals().get('V19_EVENT_TIMELINE_ENABLED', True)
            globals()['V19_EVENT_TIMELINE_ENABLED'] = False
            fig = _V19_9_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, [], wapug_color)
            globals()['V19_EVENT_TIMELINE_ENABLED'] = prev_timeline
            return v19_9_prune_all_event_visuals(fig)

        # Main WAPUG event toggle ON: allow orange rainfall highlight to be drawn.
        fig = _V19_9_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, current_events, wapug_color)

        # Event overlay toggle OFF: remove only labels and vertical bands extending through hydraulic series.
        # Keep the orange rainfall event highlight trace.
        if not globals().get('V19_EVENT_TIMELINE_ENABLED', True):
            fig = v19_9_prune_timeline_only(fig)
        return fig
except Exception:
    pass

# ============================ END V19_9_WAPUG_EVENT_TOGGLE_SEMANTICS_FIX_MARKER ============================


# ============================== V19_9_1_EVENT_TIMELINE_ARG_FIX_MARKER ==============================
# apply_graph now receives event_timeline_toggle and sets V19_EVENT_TIMELINE_ENABLED robustly.
# ============================ END V19_9_1_EVENT_TIMELINE_ARG_FIX_MARKER ============================



# ============================== V19_9_2_EVENT_LABELS_FORCE_DRAW_MARKER ==============================
# V19.9.2 final label/band rendering layer:
# - Main WAPUG event toggle ON + Event overlay ON => orange rainfall highlight + hydraulic-series labels/bands.
# - Main WAPUG event toggle ON + Event overlay OFF => orange rainfall highlight remains; hydraulic-series labels/bands removed.
# - This layer explicitly draws labels/bands after all older wrappers, so older broken label logic cannot suppress them.

def v19_9_2_ts_extent(df):
    try:
        if df is not None and not getattr(df, 'empty', True) and 'timestamp' in df.columns:
            t = pd.to_datetime(df['timestamp'], errors='coerce').dropna()
            if not t.empty:
                return pd.Timestamp(t.min()), pd.Timestamp(t.max())
    except Exception:
        pass
    return None, None


def v19_9_2_event_window(obs, sim=None, rain=None):
    # Clip bands/labels to observed hydraulic data first. Fallback to sim, then rainfall.
    s, e = v19_9_2_ts_extent(obs)
    if s is not None and e is not None:
        return s, e
    s, e = v19_9_2_ts_extent(sim)
    if s is not None and e is not None:
        return s, e
    return v19_9_2_ts_extent(rain)


def v19_9_2_prune_timeline_only(fig):
    try:
        kept_shapes = []
        for sh in tuple(fig.layout.shapes) if fig.layout.shapes else []:
            yref = str(getattr(sh, 'yref', '') or '').lower()
            fill = str(getattr(sh, 'fillcolor', '') or '').lower()
            if yref == 'paper' and ('orange' in fill or '#ff9900' in fill or '255,153,0' in fill):
                continue
            kept_shapes.append(sh)
        fig.layout.shapes = tuple(kept_shapes)
    except Exception:
        pass
    try:
        kept_annotations = []
        for an in tuple(fig.layout.annotations) if fig.layout.annotations else []:
            txt = str(getattr(an, 'text', '') or '')
            yref = str(getattr(an, 'yref', '') or '').lower()
            if yref == 'paper' and (txt.startswith('E') or txt.lower().startswith('event')):
                continue
            kept_annotations.append(an)
        fig.layout.annotations = tuple(kept_annotations)
    except Exception:
        pass
    return fig


def v19_9_2_draw_timeline(fig, obs, sim, rain, events, wapug_color=None):
    fig = v19_9_2_prune_timeline_only(fig)
    x_min, x_max = v19_9_2_event_window(obs, sim, rain)
    if x_min is None or x_max is None:
        return fig
    colour = wapug_color or '#ff9900'
    added = 0
    try:
        for ev in events or []:
            ev_start = pd.Timestamp(ev.get('Start'))
            ev_stop = pd.Timestamp(ev.get('Stop'))
            if pd.isna(ev_start) or pd.isna(ev_stop):
                continue
            if ev_stop < x_min or ev_start > x_max:
                continue
            x0 = max(ev_start, x_min)
            x1 = min(ev_stop, x_max)
            if x1 <= x0:
                continue
            ev_no = ev.get('Event', '')
            fig.add_shape(
                type='rect',
                xref='x', yref='paper',
                x0=x0, x1=x1,
                y0=0, y1=1,
                fillcolor=colour,
                opacity=0.12,
                layer='below',
                line_width=0,
            )
            fig.add_annotation(
                x=x0, y=1.0,
                xref='x', yref='paper',
                text=f'E{ev_no}',
                showarrow=False,
                yanchor='bottom',
                font=dict(size=10, color='#8a4b00'),
                bgcolor='rgba(255,255,255,0.78)',
                bordercolor='rgba(255,153,0,0.50)',
                borderwidth=1,
            )
            added += 1
        if added:
            fig.update_layout(uirevision='v19-9-2-event-labels-force-draw')
    except Exception:
        pass
    return fig


try:
    _V19_9_2_PREV_make_figure = make_figure
    def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
        events = list(wapug_events or [])
        fig = _V19_9_2_PREV_make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, events, wapug_color)
        if not events:
            return v19_9_2_prune_timeline_only(fig)
        timeline_on = bool(globals().get('V19_EVENT_TIMELINE_ENABLED', True))
        if timeline_on:
            return v19_9_2_draw_timeline(fig, obs, sim, rain, events, wapug_color)
        return v19_9_2_prune_timeline_only(fig)
except Exception:
    pass

# ============================ END V19_9_2_EVENT_LABELS_FORCE_DRAW_MARKER ============================



# ============================== V19_9_3_EVENT_CALIBRATION_SCORING_MARKER ==============================
# V19.9.3 event calibration scoring upgrade only.
# Scope intentionally limited to Calibration Diagnostics > Event-based calibration scoring.
# This override replaces the permissive window-statistics score with rainfall-response scoring:
# baseline -> observed uplift -> model uplift -> peak/volume/timing errors -> RAG.

V19_9_3_RESPONSE_THRESHOLDS = {
    'Flow_m3_s': {'abs': 0.005, 'rel': 0.10, 'unit': 'm³/s'},
    'Depth_m': {'abs': 0.010, 'rel': 0.05, 'unit': 'm'},
    'Velocity_m_s': {'abs': 0.020, 'rel': 0.10, 'unit': 'm/s'},
}
V19_9_3_EVENT_BASELINE_HOURS = 3
V19_9_3_EVENT_POST_HOURS = 6
V19_9_3_GREEN_PEAK_ERR_PCT = 30.0
V19_9_3_RED_PEAK_ERR_PCT = 75.0
V19_9_3_GREEN_VOLUME_ERR_PCT = 30.0
V19_9_3_RED_VOLUME_ERR_PCT = 75.0
V19_9_3_GREEN_LAG_MIN = 20.0
V19_9_3_RED_LAG_MIN = 60.0


def v19_9_3_fmt_num(x, ndp=3):
    try:
        if x is None or not np.isfinite(float(x)):
            return '—'
        return f'{float(x):.{ndp}f}'
    except Exception:
        return '—'


def v19_9_3_fmt_pct(x):
    try:
        if x is None or not np.isfinite(float(x)):
            return '—'
        return f'{float(x):.1f}%'
    except Exception:
        return '—'


def v19_9_3_response_threshold(col, baseline):
    cfg = V19_9_3_RESPONSE_THRESHOLDS.get(col, {'abs': 0.0, 'rel': 0.0})
    try:
        return max(float(cfg.get('abs', 0.0)), abs(float(baseline or 0.0)) * float(cfg.get('rel', 0.0)))
    except Exception:
        return float(cfg.get('abs', 0.0))


def v19_9_3_window(df, start, stop):
    try:
        if df is None or getattr(df, 'empty', True) or 'timestamp' not in df.columns:
            return pd.DataFrame()
        x = df.copy()
        x['timestamp'] = pd.to_datetime(x['timestamp'], errors='coerce')
        x = x.dropna(subset=['timestamp']).sort_values('timestamp')
        return x[(x['timestamp'] >= pd.Timestamp(start)) & (x['timestamp'] <= pd.Timestamp(stop))].copy()
    except Exception:
        return pd.DataFrame()


def v19_9_3_series_stats(df, col, baseline_start, baseline_stop, response_start, response_stop):
    out = {
        'available': False, 'baseline': np.nan, 'peak': np.nan, 'uplift': np.nan,
        'peak_time': None, 'points': 0, 'threshold': np.nan, 'has_response': False,
        'volume_above_baseline': np.nan,
    }
    try:
        if df is None or getattr(df, 'empty', True) or col not in df.columns:
            return out
        base_df = v19_9_3_window(df[['timestamp', col]].dropna(subset=[col]), baseline_start, baseline_stop)
        resp_df = v19_9_3_window(df[['timestamp', col]].dropna(subset=[col]), response_start, response_stop)
        if resp_df.empty:
            return out
        vals = pd.to_numeric(resp_df[col], errors='coerce').dropna()
        if vals.empty:
            return out
        if not base_df.empty:
            base_vals = pd.to_numeric(base_df[col], errors='coerce').dropna()
            baseline = float(base_vals.median()) if not base_vals.empty else float(vals.iloc[0])
        else:
            # Fallback is deliberately conservative when pre-event history is absent.
            baseline = float(vals.quantile(0.10)) if len(vals) >= 5 else float(vals.iloc[0])
        idx = pd.to_numeric(resp_df[col], errors='coerce').idxmax()
        peak = float(pd.to_numeric(resp_df.loc[[idx], col], errors='coerce').iloc[0])
        peak_time = pd.Timestamp(resp_df.loc[idx, 'timestamp'])
        uplift = float(peak - baseline)
        threshold = v19_9_3_response_threshold(col, baseline)
        has_response = bool(np.isfinite(uplift) and uplift >= threshold and uplift > 0)
        # Volume/area above baseline. For depth/velocity this is an area-like diagnostic; for flow it is m³.
        try:
            d = resp_df[['timestamp', col]].copy()
            d[col] = pd.to_numeric(d[col], errors='coerce')
            d = d.dropna().sort_values('timestamp')
            dt = pd.to_datetime(d['timestamp']).diff().dropna().dt.total_seconds()
            dt_sec = float(dt[dt > 0].median()) if len(dt[dt > 0]) else 0.0
            vol = float(np.maximum(d[col].to_numpy(float) - baseline, 0.0).sum() * dt_sec) if dt_sec > 0 else np.nan
        except Exception:
            vol = np.nan
        out.update({
            'available': True, 'baseline': baseline, 'peak': peak, 'uplift': uplift,
            'peak_time': peak_time, 'points': int(len(resp_df)), 'threshold': threshold,
            'has_response': has_response, 'volume_above_baseline': vol,
        })
        return out
    except Exception:
        return out


def v19_9_3_pick_sim_col(sim, obs_col, label):
    try:
        c = v19_pick_sim_channel(sim, obs_col, label) if 'v19_pick_sim_channel' in globals() else None
        if c and sim is not None and c in sim.columns:
            return c
    except Exception:
        pass
    try:
        if sim is None or getattr(sim, 'empty', True):
            return None
        for c in [x for x in sim.columns if x != 'timestamp']:
            if c == obs_col or normalise(c) == normalise(obs_col) or normalise(label) in normalise(c):
                return c
    except Exception:
        pass
    return None


def v19_9_3_pct_error(model, observed):
    try:
        if observed is None or not np.isfinite(float(observed)) or abs(float(observed)) <= 1e-12:
            return np.nan
        if model is None or not np.isfinite(float(model)):
            return np.nan
        return float((float(model) - float(observed)) / float(observed) * 100.0)
    except Exception:
        return np.nan


def v19_9_3_lag_minutes(model_time, obs_time):
    try:
        if model_time is None or obs_time is None or pd.isna(model_time) or pd.isna(obs_time):
            return np.nan
        return float((pd.Timestamp(model_time) - pd.Timestamp(obs_time)).total_seconds() / 60.0)
    except Exception:
        return np.nan


def v19_9_3_worst_score(scores):
    if 'Red' in scores:
        return 'Red'
    if 'Amber' in scores:
        return 'Amber'
    if 'Green' in scores:
        return 'Green'
    return 'Amber'


def v19_event_scores(obs, sim, events):
    rows = []
    if not events:
        return rows

    channels = [
        ('Flow_m3_s', 'Flow', True),
        ('Depth_m', 'Depth', False),
        ('Velocity_m_s', 'Velocity', False),
    ]

    for ev in events:
        ev_start = pd.Timestamp(ev.get('Start'))
        ev_stop = pd.Timestamp(ev.get('Stop'))
        baseline_start = ev_start - pd.Timedelta(hours=V19_9_3_EVENT_BASELINE_HOURS)
        baseline_stop = ev_start
        response_start = ev_start
        response_stop = ev_stop + pd.Timedelta(hours=V19_9_3_EVENT_POST_HOURS)

        row = {
            'Event': ev.get('Event'),
            'Start': fmt_dt(ev_start) if 'fmt_dt' in globals() else str(ev_start),
            'Stop': fmt_dt(ev_stop) if 'fmt_dt' in globals() else str(ev_stop),
            'Rain depth mm': v19_9_3_fmt_num(ev.get('Total_depth_mm', np.nan), 3),
            'Score': 'Amber',
            'Reason': '',
        }

        available_channels = 0
        observed_response_channels = 0
        model_response_channels = 0
        channel_scores = []
        reasons = []

        for obs_col, label, cumulative in channels:
            # Always include stable output columns so the table is consistent.
            row[f'{label} obs baseline'] = '—'
            row[f'{label} obs uplift'] = '—'
            row[f'{label} model uplift'] = '—'
            row[f'{label} uplift error %'] = '—'
            row[f'{label} lag min'] = '—'
            if cumulative:
                row[f'{label} volume error %'] = '—'

            if obs is None or obs_col not in getattr(obs, 'columns', []):
                continue
            available_channels += 1

            obs_stats = v19_9_3_series_stats(obs, obs_col, baseline_start, baseline_stop, response_start, response_stop)
            row[f'{label} obs baseline'] = v19_9_3_fmt_num(obs_stats.get('baseline'), 4)
            row[f'{label} obs uplift'] = v19_9_3_fmt_num(obs_stats.get('uplift'), 4)

            if not obs_stats.get('available'):
                channel_scores.append('Red')
                reasons.append(f'{label}: no observed data in response window')
                continue

            if not obs_stats.get('has_response'):
                channel_scores.append('Amber')
                reasons.append(f'{label}: no significant observed response; uplift {v19_9_3_fmt_num(obs_stats.get("uplift"), 4)} < threshold {v19_9_3_fmt_num(obs_stats.get("threshold"), 4)}')
                continue

            observed_response_channels += 1
            sim_col = v19_9_3_pick_sim_col(sim, obs_col, label)
            if not sim_col:
                channel_scores.append('Red')
                reasons.append(f'{label}: model series unavailable')
                continue

            sim_stats = v19_9_3_series_stats(sim, sim_col, baseline_start, baseline_stop, response_start, response_stop)
            row[f'{label} model uplift'] = v19_9_3_fmt_num(sim_stats.get('uplift'), 4)

            if not sim_stats.get('available'):
                channel_scores.append('Red')
                reasons.append(f'{label}: no model data in response window')
                continue

            if not sim_stats.get('has_response'):
                channel_scores.append('Red')
                reasons.append(f'{label}: observed response exists but model has no significant response')
                continue

            model_response_channels += 1
            uplift_err = v19_9_3_pct_error(sim_stats.get('uplift'), obs_stats.get('uplift'))
            lag_min = v19_9_3_lag_minutes(sim_stats.get('peak_time'), obs_stats.get('peak_time'))
            vol_err = v19_9_3_pct_error(sim_stats.get('volume_above_baseline'), obs_stats.get('volume_above_baseline')) if cumulative else np.nan

            row[f'{label} uplift error %'] = v19_9_3_fmt_pct(uplift_err)
            row[f'{label} lag min'] = v19_9_3_fmt_num(lag_min, 1)
            if cumulative:
                row[f'{label} volume error %'] = v19_9_3_fmt_pct(vol_err)

            red = False
            amber = False
            if np.isfinite(uplift_err):
                if abs(uplift_err) > V19_9_3_RED_PEAK_ERR_PCT:
                    red = True
                elif abs(uplift_err) > V19_9_3_GREEN_PEAK_ERR_PCT:
                    amber = True
            else:
                amber = True
            if cumulative and np.isfinite(vol_err):
                if abs(vol_err) > V19_9_3_RED_VOLUME_ERR_PCT:
                    red = True
                elif abs(vol_err) > V19_9_3_GREEN_VOLUME_ERR_PCT:
                    amber = True
            if np.isfinite(lag_min):
                if abs(lag_min) > V19_9_3_RED_LAG_MIN:
                    red = True
                elif abs(lag_min) > V19_9_3_GREEN_LAG_MIN:
                    amber = True
            else:
                amber = True

            if red:
                channel_scores.append('Red')
                reasons.append(f'{label}: response mismatch outside Red tolerance')
            elif amber:
                channel_scores.append('Amber')
                reasons.append(f'{label}: response mismatch outside Green tolerance')
            else:
                channel_scores.append('Green')

        if available_channels == 0:
            row['Score'] = 'Amber'
            row['Reason'] = 'No observed hydraulic calibration channels available for event scoring'
        elif observed_response_channels == 0:
            row['Score'] = 'Red'
            row['Reason'] = 'Rainfall event detected but no significant observed hydraulic response in available channels'
        elif model_response_channels == 0:
            row['Score'] = 'Red'
            row['Reason'] = 'Observed hydraulic response exists but no significant modelled response was detected'
        else:
            row['Score'] = v19_9_3_worst_score(channel_scores)
            row['Reason'] = '; '.join(dict.fromkeys(reasons)) if reasons else 'Observed response exists and model response is within Green tolerances'

        rows.append(row)

    return rows

# ============================ END V19_9_3_EVENT_CALIBRATION_SCORING_MARKER ============================



# ============================== V19_10_OBS_COMPARE_IN_SIMULATED_MARKER ==============================
# V19.10: Observed-format fallback support inside the Simulated file(s) pathway.
# Intent:
# - Keep the primary Observed selector untouched and authoritative for calibration/data assessment/spill baseline.
# - Allow observed-style files selected under Simulated CSV / FDV file(s) to be loaded as comparison series.
# - Prefix only files parsed through observed-format fallback as OBS_COMPARE | ... to prevent silent semantic confusion.
# - Warn/block where OBS_COMPARE can be misinterpreted as a modelled series.

V19_10_OBS_COMPARE_PREFIX = 'OBS_COMPARE | '


def v19_10_is_obs_compare_col(col):
    return str(col or '').startswith(V19_10_OBS_COMPARE_PREFIX)


def v19_10_unique_name(base, used):
    name = str(base)
    k = 2
    while name in used:
        name = f'{base}_{k}'
        k += 1
    used.add(name)
    return name


def v19_10_standard_sim_file(path, valid_count, used):
    df = read_csv_loose(path)
    df.columns = [str(c).strip() for c in df.columns]
    tc = detect_time_column(df)
    vals = numeric_value_columns(df, tc) if tc else []
    if not tc or not vals:
        raise ValueError(f'Could not detect simulated time/value columns in {Path(path).name}.')
    tmp = pd.DataFrame({'timestamp': pd.to_datetime(df[tc], errors='coerce', dayfirst=True)})
    names = []
    for c in vals:
        base = str(c).strip() or Path(path).stem
        if normalise(base) in ['value', '1']:
            base = Path(path).stem
        if valid_count > 1 and normalise(base) not in normalise(Path(path).stem):
            base = f'{Path(path).stem} | {base}'
        name = v19_10_unique_name(base, used)
        tmp[name] = clean_numeric_series(df[c])
        names.append(name)
    tmp = tmp.dropna(subset=['timestamp']).dropna(subset=names, how='all')
    if not tmp.empty:
        tmp = tmp.sort_values('timestamp').groupby('timestamp', as_index=False)[names].mean()
    return tmp, names, f"Loaded simulated/tabular {Path(path).name}; columns={', '.join(names)}; rows={len(tmp):,}"


def v19_10_observed_fallback_file(path, used):
    stem = Path(path).stem

    # Highest-confidence observed/event CSV format: legacy ICM event observed file with P_DATETIME section.
    ev = parse_icm_event_csv(path, f'{V19_10_OBS_COMPARE_PREFIX}{stem}')
    if ev is not None:
        col = [c for c in ev.columns if c != 'timestamp'][0]
        name = v19_10_unique_name(col, used)
        if name != col:
            ev = ev.rename(columns={col: name})
        return ev[['timestamp', name]].copy(), [name], f"Loaded observed-format comparison {Path(path).name}; columns={name}; rows={len(ev):,}"

    # Lower-confidence fallback: reuse the observed parser for files the simulated parser cannot read.
    obs_like, msg = parse_observed_source(path)
    if obs_like is None or getattr(obs_like, 'empty', True) or 'timestamp' not in obs_like.columns:
        raise ValueError(f'Observed-format fallback found no usable data in {Path(path).name}.')

    tmp = pd.DataFrame({'timestamp': pd.to_datetime(obs_like['timestamp'], errors='coerce')})
    names = []
    hydro_cols = [c for c in ['Depth_m', 'Flow_m3_s', 'Velocity_m_s'] if c in obs_like.columns]
    if hydro_cols:
        label_map = {'Depth_m': 'Depth', 'Flow_m3_s': 'Flow', 'Velocity_m_s': 'Velocity'}
        for c in hydro_cols:
            base = f'{V19_10_OBS_COMPARE_PREFIX}{stem} | {label_map.get(c, c)}'
            name = v19_10_unique_name(base, used)
            tmp[name] = clean_numeric_series(obs_like[c])
            names.append(name)
    elif 'Observed' in obs_like.columns:
        base = f'{V19_10_OBS_COMPARE_PREFIX}{stem}'
        name = v19_10_unique_name(base, used)
        tmp[name] = clean_numeric_series(obs_like['Observed'])
        names.append(name)
    else:
        value_cols = [c for c in obs_like.columns if c != 'timestamp']
        for c in value_cols:
            base = f'{V19_10_OBS_COMPARE_PREFIX}{stem} | {c}'
            name = v19_10_unique_name(base, used)
            tmp[name] = clean_numeric_series(obs_like[c])
            names.append(name)

    if not names:
        raise ValueError(f'Observed-format fallback found no numeric columns in {Path(path).name}.')
    tmp = tmp.dropna(subset=['timestamp']).dropna(subset=names, how='all')
    if not tmp.empty:
        tmp = tmp.sort_values('timestamp').groupby('timestamp', as_index=False)[names].mean()
    return tmp, names, f"Loaded observed-format comparison {Path(path).name}; columns={', '.join(names)}; rows={len(tmp):,}; source=({msg})"


_V19_10_PREV_parse_simulated_source = parse_simulated_source

def parse_simulated_source(paths):
    valid = [p for p in paths if p is not None and Path(p).exists()]
    if not valid:
        return pd.DataFrame(columns=['timestamp']), 'No simulated file selected.'

    merged = None
    msgs = []
    used = set()

    for path in valid:
        try:
            # Preserve the existing FDV path and semantics. FDV support in simulated selector already existed before V19.10.
            if v18_is_fdv_name(Path(path).name):
                tmp, meta = parse_fdv_ascii_v18(path)
                cols = v18_hydro_columns(tmp)
                tmp = tmp[['timestamp'] + cols].copy()
                names = []
                rename = {}
                for c in cols:
                    name = v19_10_unique_name(c, used)
                    if name != c:
                        rename[c] = name
                    names.append(name)
                if rename:
                    tmp = tmp.rename(columns=rename)
                msg = f"Loaded FDV {Path(path).name}; columns={', '.join(names)}; rows={len(tmp):,}"
            else:
                # Try the existing simulated/tabular interpretation first to avoid changing normal model CSV behaviour.
                try:
                    tmp, names, msg = v19_10_standard_sim_file(path, len(valid), used)
                except Exception as sim_err:
                    # If a simulated-style parse fails, fall back to observed-format parse and label explicitly as comparison observed.
                    tmp, names, msg = v19_10_observed_fallback_file(path, used)
                    msg += f' WARNING: parsed through observed-format fallback after simulated parser failed: {type(sim_err).__name__}: {sim_err}'

            merged = tmp if merged is None else pd.merge(merged, tmp, on='timestamp', how='outer')
            msgs.append(msg)
        except Exception as e:
            msgs.append(f"Could not load {Path(path).name} as simulated/comparison series: {type(e).__name__}: {e}")

    if merged is None:
        return pd.DataFrame(columns=['timestamp']), ' | '.join(msgs) if msgs else 'No simulated/comparison series loaded.'
    return merged.sort_values('timestamp'), ' | '.join(msgs)


_V19_10_PREV_available_value_columns_from_files = available_value_columns_from_files

def available_value_columns_from_files(filenames):
    out = []
    used = set()
    for n in filenames or []:
        p = path_from_name(DATA_FOLDER, n)
        if p is None or not Path(p).exists():
            continue
        try:
            if v18_is_fdv_name(Path(p).name):
                # Preserve existing FDV option names to avoid breaking established workflows.
                cols = v18_hydro_columns(parse_fdv_ascii_v18(p)[0])
                for c in cols:
                    name = v19_10_unique_name(c, used)
                    out.append(name)
                continue

            # High-confidence observed/event CSV fallback should appear as OBS_COMPARE to match parse_simulated_source.
            ev = parse_icm_event_csv(p, f'{V19_10_OBS_COMPARE_PREFIX}{Path(p).stem}')
            if ev is not None:
                col = [c for c in ev.columns if c != 'timestamp'][0]
                name = v19_10_unique_name(col, used)
                out.append(name)
                continue

            # Normal tabular model CSV names are preserved.
            df = read_csv_loose(p)
            df.columns = [str(c).strip() for c in df.columns]
            tc = detect_time_column(df)
            vals = numeric_value_columns(df, tc) if tc else []
            if vals:
                for c in vals:
                    base = str(c).strip() or Path(p).stem
                    if normalise(base) in ['value', '1']:
                        base = Path(p).stem
                    name = v19_10_unique_name(base, used)
                    out.append(name)
                continue

            # Last-resort observed parser fallback for non-tabular observed files.
            obs_like, _msg = parse_observed_source(p)
            hydro_cols = [c for c in ['Depth_m', 'Flow_m3_s', 'Velocity_m_s'] if c in getattr(obs_like, 'columns', [])]
            if hydro_cols:
                label_map = {'Depth_m': 'Depth', 'Flow_m3_s': 'Flow', 'Velocity_m_s': 'Velocity'}
                for c in hydro_cols:
                    name = v19_10_unique_name(f'{V19_10_OBS_COMPARE_PREFIX}{Path(p).stem} | {label_map.get(c, c)}', used)
                    out.append(name)
            elif obs_like is not None and 'Observed' in getattr(obs_like, 'columns', []):
                name = v19_10_unique_name(f'{V19_10_OBS_COMPARE_PREFIX}{Path(p).stem}', used)
                out.append(name)
        except Exception:
            pass
    return out


# Make model/spill panels explicit when a comparison observed series is being used where a model series would normally be expected.
_V19_10_PREV_model_series_from_simulated = _model_series_from_simulated

def _model_series_from_simulated(sim, sim_files=None):
    model_df, selected, warnings = _V19_10_PREV_model_series_from_simulated(sim, sim_files)
    if selected and v19_10_is_obs_compare_col(selected):
        warnings = list(warnings or [])
        warnings.insert(0, 'WARNING: The selected active series is an OBS_COMPARE observed-format comparison series, not a modelled result. Model/spill/event comparisons are therefore observed-vs-observed diagnostics, not model calibration results.')
    return model_df, selected, warnings


# Prevent storage screening from silently using a comparison observed profile as the modelled level profile.
_V19_10_PREV_storage_requirement_panel_v17_3 = storage_requirement_panel_v17_3

def storage_requirement_panel_v17_3(flow_filename, flow_profile, sim_files, active_sim_profile, threshold2):
    if active_sim_profile and v19_10_is_obs_compare_col(active_sim_profile):
        return html.Div([
            html.Div('Storage screening blocked: the active simulated/profile selection is an OBS_COMPARE observed-format comparison series, not a modelled level profile.', style=ERROR_STYLE),
            html.Div('Select a genuine modelled level result as the active simulated/profile before calculating storage requirement.', style={**INFO_STYLE, 'marginTop': '8px'}),
        ])
    return _V19_10_PREV_storage_requirement_panel_v17_3(flow_filename, flow_profile, sim_files, active_sim_profile, threshold2)

# ============================ END V19_10_OBS_COMPARE_IN_SIMULATED_MARKER ============================












# ============================== V19_20_HYD_CSV_DEPTH_PARSER_CLEANUP_MARKER ==============================
# V19.20 final cleaned parser/caching fix for ICM HYD/P_DATETIME CSV level exports.
# Key correction: do NOT infer Flow from filenames containing "Overflow". Channel is determined from HYD metadata first.
# This block supersedes V19.10.3/10.4/10.5/10.6 and V19.11 late hotfixes.

V19_20_OBS_HYD_CACHE_KIND = 'observed_v19_20_hyd_csv_depth'
V19_20_SIM_CACHE_KIND = 'simulated_v19_20_hyd_obscompare'
try:
    V19_10_OBS_COMPARE_PREFIX
except NameError:
    V19_10_OBS_COMPARE_PREFIX = 'OBS_COMPARE | '


def v19_20_unique_name(base, used):
    name = str(base)
    k = 2
    while name in used:
        name = f'{base}_{k}'
        k += 1
    used.add(name)
    return name


def v19_20_head(path, n=120):
    try:
        return Path(path).read_text(encoding='utf-8', errors='replace').splitlines()[:n]
    except Exception:
        return []


def v19_20_is_icm_hyd_pdatetime_csv(path):
    lines = v19_20_head(path, 120)
    if not lines:
        return False
    txt = '\n'.join(lines).lower()
    return (
        'p_datetime' in txt
        and ('!version=' in txt[:300] or 'usersettings' in txt or 'g_start' in txt)
        and ('type=hyd' in txt[:300] or 'u_level' in txt or 'u_values' in txt)
    )


def v19_20_hyd_metadata_text(path):
    lines = v19_20_head(path, 80)
    head = []
    for line in lines:
        # stop scanning at data rows after P_DATETIME; header metadata above this point is enough
        if line.strip().lower().startswith('p_datetime'):
            head.append(line)
            break
        head.append(line)
    return '\n'.join(head), '\n'.join(head).upper()


def v19_20_filename_tokens(path):
    # Tokenise name so OVERFLOW does not count as FLOW.
    stem = Path(path).stem.lower()
    return [t for t in re.split(r'[^a-z0-9]+', stem) if t]


def v19_20_channel_label(path):
    """Return Flow, Velocity, Depth_mAOD or Depth for ICM HYD files.

    The decisive source is HYD/UserSettings metadata. Filename is only a weak fallback.
    Critically, the substring 'flow' inside 'overflow' is ignored.
    """
    txt, upper = v19_20_hyd_metadata_text(path)
    tokens = v19_20_filename_tokens(path)

    # Metadata wins. ICM mAOD examples carry U_LEVEL and units m AD: this is depth/level, not flow.
    if 'U_VELOCITY' in upper:
        return 'Velocity'
    if 'U_FLOW' in upper:
        return 'Flow'
    if 'U_LEVEL' in upper or 'M AD' in upper or 'MAOD' in upper:
        return 'Depth_mAOD' if ('M AD' in upper or 'MAOD' in upper or 'maod' in tokens) else 'Depth'

    # Fallback on filename tokens only. Do not match substrings within words like OVERFLOW.
    if any(t in ('velocity', 'vel') for t in tokens):
        return 'Velocity'
    if 'flow' in tokens or 'q' in tokens:
        return 'Flow'
    if any(t in ('depth', 'level', 'stage', 'wl', 'waterlevel', 'maod', 'mald') for t in tokens):
        return 'Depth_mAOD' if 'maod' in tokens else 'Depth'
    return 'Depth'


def v19_20_parse_icm_hyd_observed(path):
    label = v19_20_channel_label(path)
    ev = parse_icm_event_csv(path, 'Observed')
    if ev is None or ev.empty:
        raise ValueError(f'No P_DATETIME/value rows parsed from {Path(path).name}.')
    out = ev[['timestamp', 'Observed']].copy()
    if label == 'Flow':
        out['Flow_m3_s'] = clean_numeric_series(out['Observed'])
    elif label == 'Velocity':
        out['Velocity_m_s'] = clean_numeric_series(out['Observed'])
    else:
        # mAOD/level/depth files must expose Depth_m so V18 hydraulic plotting is used.
        out['Depth_m'] = clean_numeric_series(out['Observed'])
    return out.sort_values('timestamp'), f"ICM HYD/P_DATETIME observed parser V19.20; channel={label}; rows={len(out):,}"


def v19_20_parse_icm_hyd_comparison(path, used):
    label = v19_20_channel_label(path)
    col = v19_20_unique_name(f'{V19_10_OBS_COMPARE_PREFIX}{Path(path).stem} | {label}', used)
    df = parse_icm_event_csv(path, col)
    if df is None or df.empty:
        raise ValueError(f'No P_DATETIME/value rows parsed from {Path(path).name}.')
    return df[['timestamp', col]].copy(), [col], f"Loaded ICM HYD comparison {Path(path).name}; channel={label}; columns={col}; rows={len(df):,}"


_V19_20_PREV_PARSE_OBS = parse_observed_source
_V19_20_PREV_PARSE_SIM = parse_simulated_source
_V19_20_PREV_AVAIL_COLS = available_value_columns_from_files
_V19_20_PREV_ENSURE_OBS = Registry.ensure_observed
_V19_20_PREV_ENSURE_SIM = Registry.ensure_simulated


def parse_observed_source(path):
    if path is not None and v19_20_is_icm_hyd_pdatetime_csv(path):
        return v19_20_parse_icm_hyd_observed(path)
    return _V19_20_PREV_PARSE_OBS(path)


def v19_20_standard_sim_file(path, valid_count, used):
    df = read_csv_loose(path)
    df.columns = [str(c).strip() for c in df.columns]
    tc = detect_time_column(df)
    vals = numeric_value_columns(df, tc) if tc else []
    if not tc or not vals:
        raise ValueError(f'Could not detect simulated time/value columns in {Path(path).name}.')
    tmp = pd.DataFrame({'timestamp': pd.to_datetime(df[tc], errors='coerce', dayfirst=True)})
    names = []
    for c in vals:
        base = str(c).strip() or Path(path).stem
        if normalise(base) in ['value', '1']:
            base = Path(path).stem
        if valid_count > 1 and normalise(base) not in normalise(Path(path).stem):
            base = f'{Path(path).stem} | {base}'
        name = v19_20_unique_name(base, used)
        tmp[name] = clean_numeric_series(df[c])
        names.append(name)
    tmp = tmp.dropna(subset=['timestamp']).dropna(subset=names, how='all')
    if not tmp.empty:
        tmp = tmp.sort_values('timestamp').groupby('timestamp', as_index=False)[names].mean()
    return tmp, names, f"Loaded simulated/tabular {Path(path).name}; columns={', '.join(names)}; rows={len(tmp):,}"


def parse_simulated_source(paths):
    valid = [p for p in paths if p is not None and Path(p).exists()]
    if not valid:
        return pd.DataFrame(columns=['timestamp']), 'No simulated file selected.'
    merged = None
    msgs = []
    used = set()
    for path in valid:
        try:
            if v18_is_fdv_name(Path(path).name):
                tmp, meta = parse_fdv_ascii_v18(path)
                cols = v18_hydro_columns(tmp)
                tmp = tmp[['timestamp'] + cols].copy()
                rename = {}
                names = []
                for c in cols:
                    name = v19_20_unique_name(c, used)
                    if name != c:
                        rename[c] = name
                    names.append(name)
                if rename:
                    tmp = tmp.rename(columns=rename)
                msg = f"Loaded FDV {Path(path).name}; columns={', '.join(names)}; rows={len(tmp):,}"
            elif v19_20_is_icm_hyd_pdatetime_csv(path):
                tmp, names, msg = v19_20_parse_icm_hyd_comparison(path, used)
            else:
                tmp, names, msg = v19_20_standard_sim_file(path, len(valid), used)
            merged = tmp if merged is None else pd.merge(merged, tmp, on='timestamp', how='outer')
            msgs.append(msg)
        except Exception as e:
            msgs.append(f"Could not load {Path(path).name} as simulated/comparison series: {type(e).__name__}: {e}")
    if merged is None:
        return pd.DataFrame(columns=['timestamp']), ' | '.join(msgs) if msgs else 'No simulated/comparison series loaded.'
    return merged.sort_values('timestamp'), ' | '.join(msgs)


def available_value_columns_from_files(filenames):
    out = []
    used = set()
    for n in filenames or []:
        p = path_from_name(DATA_FOLDER, n)
        if p is None or not Path(p).exists():
            continue
        try:
            if v18_is_fdv_name(Path(p).name):
                for c in v18_hydro_columns(parse_fdv_ascii_v18(p)[0]):
                    out.append(v19_20_unique_name(c, used))
                continue
            if v19_20_is_icm_hyd_pdatetime_csv(p):
                out.append(v19_20_unique_name(f'{V19_10_OBS_COMPARE_PREFIX}{Path(p).stem} | {v19_20_channel_label(p)}', used))
                continue
            for c in _V19_20_PREV_AVAIL_COLS([n]):
                out.append(v19_20_unique_name(c, used))
        except Exception:
            pass
    return out


def v19_20_cache_key_for_paths(paths, kind):
    raw = '|'.join([str(file_sig(p)) for p in paths])
    return hashlib.md5((raw + '|' + kind + '|' + str(CACHE_VERSION)).encode()).hexdigest()[:12]


def v19_20_ensure_observed(self, filename, stage=None):
    p = path_from_name(self.folder, filename)
    if p is not None and v19_20_is_icm_hyd_pdatetime_csv(p):
        key = v19_20_cache_key_for_paths([p], V19_20_OBS_HYD_CACHE_KIND)
        cdir = self.root / key
        mem = ('obs_v19_20_hyd', str(cdir))
        sig = file_sig(p)
        m = read_meta(cdir)
        valid = bool(m and m.get('kind') == V19_20_OBS_HYD_CACHE_KIND and m.get('source_sig') == sig and m.get('cache_version') == CACHE_VERSION)
        if mem in MEM_CACHE:
            if stage is not None:
                stage.append('Observed HYD cache: memory hit (V19.20 parser)')
            return MEM_CACHE[mem]
        if not valid:
            if stage is not None:
                stage.append('Observed HYD cache: building parquet with V19.20 parser')
            df, msg = v19_20_parse_icm_hyd_observed(p)
            cdir.mkdir(parents=True, exist_ok=True)
            df.to_parquet(cdir / 'data.parquet', index=False)
            write_meta(cdir, {'kind': V19_20_OBS_HYD_CACHE_KIND, 'source_sig': sig, 'cache_version': CACHE_VERSION, 'rows': len(df), 'message': msg})
        else:
            if stage is not None:
                stage.append('Observed HYD cache: V19.20 parquet valid')
        df = pd.read_parquet(cdir / 'data.parquet')
        msg = read_meta(cdir).get('message', 'Observed HYD cache loaded')
        MEM_CACHE[mem] = (df, msg)
        return df, msg
    return _V19_20_PREV_ENSURE_OBS(self, filename, stage)


def v19_20_ensure_simulated(self, filenames, stage=None):
    paths = [path_from_name(self.folder, n) for n in (filenames or [])]
    key = v19_20_cache_key_for_paths(paths, V19_20_SIM_CACHE_KIND)
    cdir = self.root / key
    mem = ('sim_v19_20', str(cdir))
    source_sigs = [file_sig(p) for p in paths]
    m = read_meta(cdir)
    valid = bool(m and m.get('kind') == V19_20_SIM_CACHE_KIND and m.get('source_sigs') == source_sigs and m.get('cache_version') == CACHE_VERSION)
    if mem in MEM_CACHE:
        if stage is not None:
            stage.append('Simulated cache: memory hit (V19.20 parser)')
        return MEM_CACHE[mem]
    if not valid:
        if stage is not None:
            stage.append('Simulated cache: building parquet with V19.20 parser')
        df, msg = parse_simulated_source(paths)
        cdir.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cdir / 'data.parquet', index=False)
        write_meta(cdir, {'kind': V19_20_SIM_CACHE_KIND, 'source_sigs': source_sigs, 'cache_version': CACHE_VERSION, 'rows': len(df), 'message': msg})
    else:
        if stage is not None:
            stage.append('Simulated cache: V19.20 parquet valid')
    df = pd.read_parquet(cdir / 'data.parquet')
    msg = read_meta(cdir).get('message', 'Simulated cache loaded')
    MEM_CACHE[mem] = (df, msg)
    return df, msg

Registry.ensure_observed = v19_20_ensure_observed
Registry.ensure_simulated = v19_20_ensure_simulated
try:
    REGISTRY.__class__.ensure_observed = v19_20_ensure_observed
    REGISTRY.__class__.ensure_simulated = v19_20_ensure_simulated
except Exception:
    pass


def v19_20_trace_name_for_sim_col(col):
    col = str(col or '').strip()
    if col.startswith(V19_10_OBS_COMPARE_PREFIX):
        return 'Comparison: ' + col.replace(V19_10_OBS_COMPARE_PREFIX, '', 1)
    return 'Simulated: ' + col


def v19_20_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    try:
        obs_name = Path(observed_file).stem if observed_file else 'Observed'
        sim_cols = [str(c) for c in getattr(sim_df, 'columns', []) if str(c) != 'timestamp']
        if active_profile and str(active_profile) in sim_cols:
            sim_cols = [str(active_profile)]
        available = list(sim_cols)
        fig.update_layout(title=f'Observed vs Simulated — {str(variable or "series").capitalize()}')
        for tr in getattr(fig, 'data', []) or []:
            original = str(getattr(tr, 'name', '') or '')
            low = original.lower()
            if not original or low.startswith('rainfall') or 'threshold' in low or '1:1 line' in low or 'highlighted rainfall' in low:
                continue
            if original.startswith('Observed'):
                suffix = original.replace('Observed', '', 1).strip(' :')
                tr.name = f'Observed {suffix}: {obs_name}' if suffix else f'Observed: {obs_name}'
                continue
            matched = None
            for c in sim_cols:
                if c == original or original.endswith(': ' + c) or c in original:
                    matched = c
                    break
            if matched is None and available and (original.startswith('Simulated') or original.startswith('Comparison')):
                matched = available.pop(0)
            if matched is not None:
                tr.name = v19_20_trace_name_for_sim_col(matched)
    except Exception:
        pass
    return fig

# Compatibility aliases for callbacks produced by previous hotfixes.
def v19_10_5_apply_series_title(fig, variable, observed_file, sim_df=None, active_profile=None):
    return v19_20_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_10_6_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_20_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_11_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_20_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)

# ============================ END V19_20_HYD_CSV_DEPTH_PARSER_CLEANUP_MARKER ============================



# ============================== V19_22_SERIES_LABEL_AND_MULTI_PLOT_FIX_MARKER ==============================
# V19.22 final graph/statistics display fix layered over V19.20 parser fix.
# Scope:
# - Time-series graph plots all loaded simulated/comparison series.
# - V18 hydraulic plotter no longer truncates matching simulated/comparison traces to one trace.
# - Native Plotly legend names are derived from the actual sim dataframe columns, not stale trace names.
# - Statistics presentation uses the same canonical series labels as the graph legend.
# - Calculation logic is not changed: active simulated/profile remains used for stats/scatter/model spill/storage.

try:
    V19_10_OBS_COMPARE_PREFIX
except NameError:
    V19_10_OBS_COMPARE_PREFIX = 'OBS_COMPARE | '


def v19_22_series_display_name(col):
    """Canonical display label for simulated/comparison series.

    This is presentation-only. It deliberately does not alter dataframe column names or calculations.
    """
    s = str(col or '').strip()
    if not s:
        return s
    if s.startswith(V19_10_OBS_COMPARE_PREFIX):
        return 'Comparison: ' + s.replace(V19_10_OBS_COMPARE_PREFIX, '', 1)
    if s.startswith('Comparison:') or s.startswith('Simulated:'):
        return s
    return 'Simulated: ' + s


def v19_22_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    """Rewrite native Plotly trace names from actual dataframe columns.

    Earlier patches attempted to infer the simulated trace from the existing Plotly trace name. That is fragile,
    because older traces could already be named Flow_m3_s. This function maps simulated traces by trace order
    to the actual sim_df columns supplied to make_figure.
    """
    try:
        obs_name = Path(observed_file).stem if observed_file else 'Observed'
        sim_cols = [str(c) for c in getattr(sim_df, 'columns', []) if str(c) != 'timestamp']
        # If active_profile is deliberately supplied and valid, use it; the time-series graph passes None to show all.
        if active_profile and str(active_profile) in sim_cols:
            sim_cols = [str(active_profile)]
        sim_i = 0
        try:
            fig.update_layout(title=f'Observed vs Simulated — {str(variable or "series").capitalize()}')
        except Exception:
            pass
        for tr in getattr(fig, 'data', []) or []:
            original = str(getattr(tr, 'name', '') or '')
            low = original.lower()
            if not original:
                continue
            if low.startswith('rainfall') or 'rainfall values' in low or 'threshold' in low or '1:1 line' in low or 'highlighted rainfall' in low:
                continue
            if original.startswith('Observed'):
                suffix = original.replace('Observed', '', 1).strip(' :')
                tr.name = f'Observed {suffix}: {obs_name}' if suffix else f'Observed: {obs_name}'
                continue
            if original.startswith('Simulated') or original.startswith('Comparison'):
                if sim_i < len(sim_cols):
                    tr.name = v19_22_series_display_name(sim_cols[sim_i])
                    sim_i += 1
                continue
    except Exception:
        pass
    return fig

# Backward-compatible aliases used by existing patched callbacks.
def v19_20_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_22_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_11_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_22_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_10_6_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_22_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_10_5_apply_series_title(fig, variable, observed_file, sim_df=None, active_profile=None):
    return v19_22_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)


def stats_table(title, rows, subtitle=''):
    """Statistics table with canonical display labels for the Sim series column only.

    The incoming rows and metric calculations are not modified. Only the displayed series label is normalised.
    """
    if not rows:
        return html.Div([html.H4(title), html.Div(subtitle, style={'color':'#666','fontSize':'13px'}) if subtitle else None, html.Div('No simulated series available or no overlapping paired data.', style={'color':'#666'})], style={'marginTop':'14px'})
    headers = ['Sim series','Pairs','RMSE','R²','NSE','Mean bias','Obs peak','Obs peak time','Sim peak','Sim peak time','Peak lag min','Abs lag min']
    body = []
    for r in rows:
        display_series = v19_22_series_display_name(r.get('series'))
        body.append(html.Tr([
            html.Td(display_series, style={**TABLE_CELL,'textAlign':'left'}),
            html.Td(fmt(r.get('pairs')), style=TABLE_CELL),
            html.Td(fmt(r.get('rmse')), style=TABLE_CELL),
            html.Td(fmt(r.get('r2')), style=TABLE_CELL),
            html.Td(fmt(r.get('nse')), style=TABLE_CELL),
            html.Td(fmt(r.get('mean_bias')), style=TABLE_CELL),
            html.Td(fmt(r.get('obs_peak')), style=TABLE_CELL),
            html.Td(fmt_dt(r.get('obs_peak_time')), style=TABLE_CELL),
            html.Td(fmt(r.get('sim_peak')), style=TABLE_CELL),
            html.Td(fmt_dt(r.get('sim_peak_time')), style=TABLE_CELL),
            html.Td(fmt(r.get('peak_lag_min')), style=TABLE_CELL),
            html.Td(fmt(r.get('peak_abs_lag_min')), style=TABLE_CELL),
        ]))
    return html.Div([html.H4(title), html.Div(subtitle, style={'color':'#666','fontSize':'13px','marginBottom':'8px'}) if subtitle else None, html.Div([html.Table([html.Thead(html.Tr([html.Th(h, style=TABLE_HEAD) for h in headers])), html.Tbody(body)], style={'borderCollapse':'collapse','width':'100%','background':'#fff','border':'1px solid #e5e5e5'})], style={'overflowX':'auto'})], style={'marginTop':'16px'})

# ============================ END V19_22_SERIES_LABEL_AND_MULTI_PLOT_FIX_MARKER ============================



# ============================== V19_30_PRODUCTION_GRAPH_SERIES_STATS_FIX_MARKER ==============================
# V19.30 production-grade graph series/statistics fix.
# This patch is intentionally plotting/presentation focused; it does not change parsing, storage, spill counting,
# rainfall parsing, calibration metric mathematics, or cache signatures.

try:
    V19_10_OBS_COMPARE_PREFIX
except NameError:
    V19_10_OBS_COMPARE_PREFIX = 'OBS_COMPARE | '

V19_30_SERIES_COLOURS = [
    '#0008ff', '#ff7f0e', '#2ca02c', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f'
]


def v19_30_series_display_name(col):
    s = str(col or '').strip()
    if not s:
        return s
    if s.startswith(V19_10_OBS_COMPARE_PREFIX):
        return 'Comparison: ' + s.replace(V19_10_OBS_COMPARE_PREFIX, '', 1)
    if s.startswith('Comparison:') or s.startswith('Simulated:'):
        return s
    return 'Simulated: ' + s


def v19_30_infer_unit_for_sim_col(col, variable='depth'):
    s = str(col or '')
    ns = normalise(s)
    if 'flow_m3_s' in ns or 'flow' in ns:
        return 'm³/s'
    if 'velocity_m_s' in ns or 'velocity' in ns or 'vel' in ns:
        return 'm/s'
    if 'depth' in ns or 'level' in ns or 'maod' in ns:
        return 'm'
    return UNITS.get(variable, '')


def v19_30_find_sim_channels(sim, channel_col, label=None):
    """Return all simulated/comparison columns matching the displayed hydraulic row.

    The previous v18_3 logic returned only one column. This function returns all matching columns and also
    treats Depth_mAOD and OBS_COMPARE depth/mAOD columns as depth-series matches.
    """
    if sim is None or getattr(sim, 'empty', True):
        return []
    cols = [str(c) for c in sim.columns if str(c) != 'timestamp']
    if not cols:
        return []
    n_channel = normalise(channel_col)
    n_label = normalise(label or channel_col)
    out = []
    for c in cols:
        nc = normalise(c)
        ok = False
        if c == channel_col or nc == n_channel or n_channel in nc or n_label in nc:
            ok = True
        # Depth_m row should include mAOD/depth/level observed-style files from the simulated dropdown.
        if channel_col == 'Depth_m' and any(tok in nc for tok in ['depth', 'level', 'maod', 'm_ad', 'mald']):
            ok = True
        if channel_col == 'Flow_m3_s' and ('flow' in nc and 'overflow' not in nc):
            ok = True
        if channel_col == 'Velocity_m_s' and any(tok in nc for tok in ['velocity', 'vel']):
            ok = True
        if ok and c not in out:
            out.append(c)
    return out


def v19_30_stats_value(x):
    try:
        x = float(x)
        if not np.isfinite(x):
            return '—'
        return f'{x:.4g}'
    except Exception:
        return '—'


def v19_30_series_stats_row(series_name, unit, values, total='—'):
    s = pd.to_numeric(values, errors='coerce').dropna() if values is not None else pd.Series(dtype=float)
    return {
        'Series': series_name,
        'Unit': unit or '',
        'Min': '—' if s.empty else v19_30_stats_value(s.min()),
        'Max': '—' if s.empty else v19_30_stats_value(s.max()),
        'Average': '—' if s.empty else v19_30_stats_value(s.mean()),
        'Total': total,
    }


def v19_30_graph_stats_records(obs, sim, rain, plotted_cols, variable='depth'):
    """Rows for the embedded graph table: observed plotted rows + every simulated/comparison trace + rainfall."""
    rows = []
    # Observed hydraulic rows actually plotted.
    for col in plotted_cols or []:
        if obs is None or col not in getattr(obs, 'columns', []):
            continue
        key, label, unit, _ = V18_CHANNEL_BY_COL.get(col, ('', col, UNITS.get(variable,''), ''))
        rows.append(v19_30_series_stats_row(f'Observed {label}', unit, pd.to_numeric(obs[col], errors='coerce')))
        # Matching simulated/comparison rows for that hydraulic channel.
        for sc in v19_30_find_sim_channels(sim, col, label):
            if sim is not None and sc in sim.columns:
                rows.append(v19_30_series_stats_row(v19_30_series_display_name(sc), v19_30_infer_unit_for_sim_col(sc, variable), pd.to_numeric(sim[sc], errors='coerce')))
    # If the active requested variable fell through but sim still has columns, include unreported sim rows once.
    reported = {r.get('Series') for r in rows}
    if sim is not None and not getattr(sim, 'empty', True):
        for sc in [c for c in sim.columns if c != 'timestamp']:
            dn = v19_30_series_display_name(sc)
            if dn not in reported:
                rows.append(v19_30_series_stats_row(dn, v19_30_infer_unit_for_sim_col(sc, variable), pd.to_numeric(sim[sc], errors='coerce')))
                reported.add(dn)
    # Rainfall row.
    if rain is not None and not getattr(rain, 'empty', True) and 'Rainfall' in rain.columns:
        r = pd.to_numeric(rain['Rainfall'], errors='coerce').dropna()
        dt = rainfall_timestep_hours(rain)
        total = float(r.sum() * dt) if dt and not r.empty else np.nan
        rows.append(v19_30_series_stats_row('Rainfall', 'native / mm-equivalent total', r, '—' if not np.isfinite(total) else f'{total:.4g}'))
    return rows


def v19_30_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    """Robust native legend naming: any non-rain/non-observed/non-threshold scatter after observed becomes sim/comparison."""
    try:
        obs_name = Path(observed_file).stem if observed_file else 'Observed'
        sim_cols = [str(c) for c in getattr(sim_df, 'columns', []) if str(c) != 'timestamp']
        if active_profile and str(active_profile) in sim_cols:
            sim_cols = [str(active_profile)]
        sim_i = 0
        try:
            fig.update_layout(title=f'Observed vs Simulated — {str(variable or "series").capitalize()}')
        except Exception:
            pass
        for tr in getattr(fig, 'data', []) or []:
            original = str(getattr(tr, 'name', '') or '')
            low = original.lower()
            # Leave the graph's embedded stats table and rainfall/threshold/event traces alone.
            if getattr(tr, 'type', '') == 'table':
                continue
            if low.startswith('rainfall') or 'rainfall values' in low or 'threshold' in low or '1:1 line' in low or 'highlight' in low:
                continue
            if original.startswith('Observed'):
                suffix = original.replace('Observed', '', 1).strip(' :')
                tr.name = f'Observed {suffix}: {obs_name}' if suffix else f'Observed: {obs_name}'
                continue
            # Treat Modelled/Simulated/Comparison or any other hydraulic non-observed trace as simulated/comparison.
            if sim_i < len(sim_cols):
                tr.name = v19_30_series_display_name(sim_cols[sim_i])
                sim_i += 1
    except Exception:
        pass
    return fig

# Compatibility aliases used by the existing Apply callback and previous patch layers.
def v19_20_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_30_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_22_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_30_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_10_6_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_30_apply_native_legend_names(fig, variable, observed_file, sim_df, active_profile)

# ============================ END V19_30_PRODUCTION_GRAPH_SERIES_STATS_FIX_MARKER ============================



# ============================== V19_40_PRODUCTION_FINAL_GRAPH_CACHE_FIX_MARKER ==============================
# V19.40 final production patch for the remaining graph/cache defects.
# Fixes:
# 1) corrupt/empty metadata.json no longer breaks Apply / Refresh Graph;
# 2) simulated cache is forced through the V19.20 parser path, bypassing stale V17/V18 instance wrappers;
# 3) time-series graph plots every matching simulated/comparison series, not just one;
# 4) native legend names are the actual plotted series names;
# 5) embedded bottom statistics table includes every plotted series and is given proper vertical space.

try:
    V19_10_OBS_COMPARE_PREFIX
except NameError:
    V19_10_OBS_COMPARE_PREFIX = 'OBS_COMPARE | '

V19_40_SIM_CACHE_KIND = 'simulated_v19_40_final_parser_graph'
V19_40_COLOURS = ['#0008ff', '#ff7f0e', '#2ca02c', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f']

# Keep previous callable references only for safe fallback.
_V19_40_PREV_MAKE_FIGURE = make_figure
_V19_40_PREV_READ_META = read_meta


def read_meta(cdir):
    """Safe metadata reader. Empty/corrupt JSON means invalid cache, not fatal application failure."""
    p = meta_path(cdir)
    if not p.exists():
        return None
    try:
        txt = p.read_text(encoding='utf-8', errors='replace').strip()
        if not txt:
            return None
        return json.loads(txt)
    except Exception:
        return None


def v19_40_cache_key_for_paths(paths, kind):
    raw = '|'.join([str(file_sig(p)) for p in (paths or [])])
    return hashlib.md5((raw + '|' + kind + '|' + str(CACHE_VERSION)).encode()).hexdigest()[:12]


def v19_40_display_name(col):
    s = str(col or '').strip()
    if not s:
        return s
    if s.startswith(V19_10_OBS_COMPARE_PREFIX):
        return 'Comparison: ' + s.replace(V19_10_OBS_COMPARE_PREFIX, '', 1)
    if s.startswith('Comparison:') or s.startswith('Simulated:'):
        return s
    return 'Simulated: ' + s


def v19_40_unit_for_col(col, variable='depth'):
    n = normalise(col)
    # Important: do not treat OVERFLOW as FLOW unless an actual parsed channel is Flow_m3_s.
    if 'flow_m3_s' in n or n in ('flow', 'q', 'qsim', 'q_sim'):
        return 'm³/s'
    if 'velocity_m_s' in n or 'velocity' in n or 'vel' in n:
        return 'm/s'
    if 'depth' in n or 'level' in n or 'maod' in n or 'mald' in n:
        return 'm'
    return UNITS.get(variable, '')


def v19_40_channel_matches_sim(channel_col, label, sim_col, total_sim_cols=1):
    nc = normalise(sim_col)
    nchan = normalise(channel_col)
    nlab = normalise(label or channel_col)
    if sim_col == channel_col or nc == nchan or nchan in nc or nlab in nc:
        return True
    if channel_col == 'Depth_m':
        # ICM observed-style comparison files selected under simulated dropdown should land here.
        if any(tok in nc for tok in ['depth', 'level', 'maod', 'm_ad', 'mald', 'obs_compare']):
            # Exclude explicit velocity/flow canonical names from the depth row.
            if not any(tok in nc for tok in ['velocity_m_s', 'flow_m3_s']):
                return True
        # Production fallback: if user selected a single simulated value but its label is generic, plot it on depth.
        if total_sim_cols == 1 and not any(tok in nc for tok in ['velocity', 'vel', 'flow_m3_s']):
            return True
    if channel_col == 'Flow_m3_s':
        return ('flow_m3_s' in nc or nc in ('flow', 'q', 'qsim', 'q_sim'))
    if channel_col == 'Velocity_m_s':
        return ('velocity_m_s' in nc or 'velocity' in nc or 'vel' in nc)
    return False


def v19_40_matching_sim_cols(sim, channel_col, label):
    if sim is None or getattr(sim, 'empty', True) or 'timestamp' not in getattr(sim, 'columns', []):
        return []
    cols = [c for c in sim.columns if c != 'timestamp']
    out = []
    for c in cols:
        if v19_40_channel_matches_sim(channel_col, label, str(c), len(cols)) and c not in out:
            out.append(c)
    return out


def v19_40_numeric_stats(values):
    s = pd.to_numeric(values, errors='coerce').dropna() if values is not None else pd.Series(dtype=float)
    def f(x):
        try:
            x = float(x)
            return '—' if not np.isfinite(x) else f'{x:.4g}'
        except Exception:
            return '—'
    return ('—' if s.empty else f(s.min()), '—' if s.empty else f(s.max()), '—' if s.empty else f(s.mean()))


def v19_40_stats_rows(rain, observed_entries, simulated_entries):
    rows = []
    for name, unit, series in observed_entries:
        mn, mx, av = v19_40_numeric_stats(series)
        rows.append({'Series': name, 'Unit': unit or '', 'Min': mn, 'Max': mx, 'Average': av, 'Total': '—'})
    for name, unit, series in simulated_entries:
        mn, mx, av = v19_40_numeric_stats(series)
        rows.append({'Series': name, 'Unit': unit or '', 'Min': mn, 'Max': mx, 'Average': av, 'Total': '—'})
    if rain is not None and not getattr(rain, 'empty', True) and 'Rainfall' in rain.columns:
        r = pd.to_numeric(rain['Rainfall'], errors='coerce').dropna()
        mn, mx, av = v19_40_numeric_stats(r)
        dt = rainfall_timestep_hours(rain)
        total = float(r.sum() * dt) if dt and not r.empty else np.nan
        rows.append({'Series': 'Rainfall', 'Unit': 'native / mm-equivalent total', 'Min': mn, 'Max': mx, 'Average': av, 'Total': '—' if not np.isfinite(total) else f'{total:.4g}'})
    if not rows:
        rows = [{'Series':'—','Unit':'—','Min':'—','Max':'—','Average':'—','Total':'—'}]
    return rows


def v19_40_add_stats_table(fig, rows, row_index):
    headers = ['Series','Unit','Min','Max','Average','Total']
    values = [[r.get(h, '—') for r in rows] for h in headers]
    fig.add_trace(go.Table(
        header=dict(values=headers, fill_color='#f2f4f7', align='center', font=dict(size=11, color='#111'), height=28),
        cells=dict(values=values, fill_color='white', align='center', font=dict(size=11, color='#111'), height=27),
        columnwidth=[260,150,80,80,90,90]
    ), row=row_index, col=1)


def v19_40_ensure_simulated(self, filenames, stage=None):
    """Authoritative simulated cache path after V19.20.

    This deliberately avoids the older V17/V18 instance-wrapper cache that produced JSONDecodeError on corrupt metadata.
    """
    paths = [path_from_name(self.folder, n) for n in (filenames or [])]
    key = v19_40_cache_key_for_paths(paths, V19_40_SIM_CACHE_KIND)
    cdir = self.root / key
    mem = ('sim_v19_40', str(cdir))
    source_sigs = [file_sig(p) for p in paths]
    m = read_meta(cdir)
    valid = bool(m and m.get('kind') == V19_40_SIM_CACHE_KIND and m.get('source_sigs') == source_sigs and m.get('cache_version') == CACHE_VERSION and (cdir / 'data.parquet').exists())
    if mem in MEM_CACHE:
        if stage is not None:
            stage.append('Simulated cache: memory hit (V19.40 parser path)')
        return MEM_CACHE[mem]
    if not valid:
        if stage is not None:
            stage.append('Simulated cache: building parquet with V19.40 parser path')
        df, msg = parse_simulated_source(paths)
        # Avoid V18.6 canonicalising OBS_COMPARE mAOD into generic Depth_m; only apply to true FDV/simple model columns.
        try:
            if any(v18_is_fdv_name(Path(p).name) for p in paths if p is not None):
                df = v18_6_canonicalise_sim_columns(df, filenames or [])
        except Exception:
            pass
        cdir.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cdir / 'data.parquet', index=False)
        write_meta(cdir, {'kind': V19_40_SIM_CACHE_KIND, 'source_sigs': source_sigs, 'cache_version': CACHE_VERSION, 'rows': len(df), 'message': msg})
    else:
        if stage is not None:
            stage.append('Simulated cache: V19.40 parquet valid')
    df = pd.read_parquet(cdir / 'data.parquet')
    meta = read_meta(cdir) or {}
    msg = meta.get('message', 'Simulated cache loaded')
    MEM_CACHE[mem] = (df, msg)
    return df, msg


def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
    """Final authoritative time-series graph builder.

    For hydraulic observed files, this function owns the plot instead of delegating into older V18.3 wrappers.
    For non-hydraulic observed files, it falls back to the previous graph builder.
    """
    hydro = v18_hydro_columns(obs) if obs is not None else []
    if not hydro:
        return _V19_40_PREV_MAKE_FIGURE(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, wapug_events, wapug_color)
    try:
        plotted_cols = v18_2_selected_hydro_columns_for_variable(obs, variable) if 'v18_2_selected_hydro_columns_for_variable' in globals() else hydro
    except Exception:
        plotted_cols = hydro
    if variable == 'all':
        plotted_cols = hydro
    if not plotted_cols:
        plotted_cols = hydro

    has_rain = rain is not None and not getattr(rain, 'empty', True)
    has_stats = bool(stats_box)
    rows_count = (1 if has_rain else 0) + len(plotted_cols) + (1 if has_stats else 0)
    specs = [[{'type':'xy'}] for _ in range(rows_count)]
    if has_stats:
        specs[-1] = [{'type':'table'}]

    # Explicitly reserve enough height for the statistics table; no cramped scroll strip.
    row_heights = []
    if has_rain:
        row_heights.append(0.16)
    hydro_total = 0.64 if has_stats else 0.78
    row_heights += [hydro_total / max(len(plotted_cols), 1)] * len(plotted_cols)
    if has_stats:
        row_heights.append(0.24)
    s = sum(row_heights) or 1.0
    row_heights = [x/s for x in row_heights]
    titles = (['Rainfall'] if has_rain else []) + [V18_CHANNEL_BY_COL[c][1] for c in plotted_cols] + (['Statistics'] if has_stats else [])
    fig = make_subplots(rows=rows_count, cols=1, shared_xaxes=True, row_heights=row_heights, vertical_spacing=0.065, specs=specs, subplot_titles=titles)

    rix = 1
    if has_rain:
        xs, ys, hx, hy = rainfall_vertical_strokes(rain)
        fig.add_trace(go.Scattergl(x=xs, y=ys, mode='lines', name='Rainfall', line=dict(color=colors.get('rain','#4A90E2'), width=1), opacity=0.60, hoverinfo='skip'), row=rix, col=1)
        events = wapug_events or []
        if events:
            try:
                wx, wy = v18_event_strokes(rain, events)
                if wx:
                    fig.add_trace(go.Scattergl(x=wx, y=wy, mode='lines', name='WAPUG/manual event highlight', line=dict(color=wapug_color or '#ff9900', width=3), opacity=1, hoverinfo='skip'), row=rix, col=1)
            except Exception:
                pass
        rmax = rainfall_axis_max(rain, thresholds.get('rain_ymax'))
        fig.update_yaxes(title_text='Rainfall', range=[rmax,0] if rmax else None, autorange=False if rmax else 'reversed', row=rix, col=1)
        rix += 1

    observed_entries = []
    simulated_entries = []
    for col in plotted_cols:
        key, label, unit, default_color = V18_CHANNEL_BY_COL[col]
        x, y = downsample_xy(obs['timestamp'].to_numpy(), obs[col].to_numpy(), max_points)
        obs_color = colors.get('obs','#ff0000') if key == 'depth' else default_color
        obs_name = f'Observed {label}'
        fig.add_trace(go.Scatter(x=x, y=y, mode='lines', name=obs_name, line=dict(color=obs_color, width=2.2)), row=rix, col=1)
        observed_entries.append((obs_name, unit, pd.to_numeric(obs[col], errors='coerce')))

        sim_cols = v19_40_matching_sim_cols(sim, col, label)
        for si, sc in enumerate(sim_cols):
            tmp = sim[['timestamp', sc]].dropna(subset=[sc])
            sx, sy = downsample_xy(tmp['timestamp'].to_numpy(), tmp[sc].to_numpy(), max_points)
            colour = colors.get('sim','#0008ff') if si == 0 else V19_40_COLOURS[si % len(V19_40_COLOURS)]
            sname = v19_40_display_name(sc)
            fig.add_trace(go.Scatter(x=sx, y=sy, mode='lines', name=sname, line=dict(color=colour, width=2)), row=rix, col=1)
            simulated_entries.append((sname, v19_40_unit_for_col(sc, variable), pd.to_numeric(tmp[sc], errors='coerce')))

        if key == 'depth':
            x0, x1 = get_full_extent(obs, sim, rain)
            add_threshold(fig, x0, x1, thresholds.get('th1'), thresholds.get('th1_label'), thresholds.get('th1_color'), rix)
            add_threshold(fig, x0, x1, thresholds.get('th2'), thresholds.get('th2_label'), thresholds.get('th2_color'), rix)
        fig.update_yaxes(title_text=f'{label} ({unit})', row=rix, col=1)
        rix += 1

    if has_stats:
        # Table reflects the actually plotted period and plotted traces.
        stats_rows = v19_40_stats_rows(rain, observed_entries, simulated_entries)
        v19_40_add_stats_table(fig, stats_rows, rix)

    fig.update_layout(
        template='plotly_white',
        height=max(940, 260 * rows_count + (120 if has_stats else 0)),
        title=f'Observed vs Simulated — {str(variable or "series").capitalize()}' + (f' — {title_suffix}' if title_suffix else ''),
        hovermode='x unified',
        legend=dict(orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1),
        margin=dict(l=70, r=35, t=90, b=95),
        uirevision='v19-40-production-final'
    )
    return fig


def v19_40_apply_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    # Trace names are already correct from make_figure; this only patches observed names and stale fallback traces.
    try:
        obs_name = Path(observed_file).stem if observed_file else 'Observed'
        sim_cols = [str(c) for c in getattr(sim_df, 'columns', []) if str(c) != 'timestamp']
        if active_profile and str(active_profile) in sim_cols:
            sim_cols = [str(active_profile)]
        sim_i = 0
        fig.update_layout(title=f'Observed vs Simulated — {str(variable or "series").capitalize()}')
        for tr in getattr(fig, 'data', []) or []:
            if getattr(tr, 'type', '') == 'table':
                continue
            original = str(getattr(tr, 'name', '') or '')
            low = original.lower()
            if not original or low.startswith('rainfall') or 'threshold' in low or 'highlight' in low or '1:1 line' in low:
                continue
            if original.startswith('Observed'):
                suffix = original.replace('Observed', '', 1).strip(' :')
                tr.name = f'Observed {suffix}: {obs_name}' if suffix else f'Observed: {obs_name}'
                continue
            if original.startswith('Comparison:') or original.startswith('Simulated:'):
                continue
            if sim_i < len(sim_cols):
                tr.name = v19_40_display_name(sim_cols[sim_i])
                sim_i += 1
    except Exception:
        pass
    return fig

# Compatibility aliases used by existing callback text.
def v19_20_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_40_apply_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_22_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_40_apply_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_10_6_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_40_apply_legend_names(fig, variable, observed_file, sim_df, active_profile)

# Install final cache override on both class and existing instance, including instance attribute override.
try:
    Registry.ensure_simulated = v19_40_ensure_simulated
    REGISTRY.ensure_simulated = v19_40_ensure_simulated.__get__(REGISTRY, REGISTRY.__class__)
except Exception:
    pass

# ============================ END V19_40_PRODUCTION_FINAL_GRAPH_CACHE_FIX_MARKER ============================



# ============================== V19_50_FORCE_ALL_SELECTED_SIM_SERIES_MARKER ==============================
# V19.50 decisive graph fix: for the selected Variable panel, plot every loaded simulated/comparison column.
# Rationale: the simulated dropdown is user-authoritative. If the user selected 2 simulated files while Variable=Depth,
# both selected series must appear on the Depth plot regardless of historical channel-name inference.

V19_50_SIM_CACHE_KIND = 'simulated_v19_50_all_selected_series'
V19_50_COLOURS = ['#0008ff', '#ff7f0e', '#2ca02c', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f']

try:
    V19_10_OBS_COMPARE_PREFIX
except NameError:
    V19_10_OBS_COMPARE_PREFIX = 'OBS_COMPARE | '

_V19_50_PREV_MAKE_FIGURE = make_figure


def v19_50_as_list(x):
    if x is None or x == '':
        return []
    if isinstance(x, (list, tuple, set)):
        return list(x)
    return [x]


def v19_50_display_name(col):
    s = str(col or '').strip()
    if s.startswith(V19_10_OBS_COMPARE_PREFIX):
        return 'Comparison: ' + s.replace(V19_10_OBS_COMPARE_PREFIX, '', 1)
    if s.startswith('Comparison:') or s.startswith('Simulated:'):
        return s
    return 'Simulated: ' + s


def v19_50_cache_key_for_paths(paths, kind):
    raw = '|'.join([str(file_sig(p)) for p in (paths or [])])
    return hashlib.md5((raw + '|' + kind + '|' + str(CACHE_VERSION)).encode()).hexdigest()[:12]


def v19_50_safe_read_meta(cdir):
    p = meta_path(cdir)
    if not p.exists():
        return None
    try:
        txt = p.read_text(encoding='utf-8', errors='replace').strip()
        return json.loads(txt) if txt else None
    except Exception:
        return None

# Override global metadata reader again; older cache readers must not crash on empty/corrupt metadata.json.
def read_meta(cdir):
    return v19_50_safe_read_meta(cdir)


def v19_50_ensure_simulated(self, filenames, stage=None):
    names = v19_50_as_list(filenames)
    paths = [path_from_name(self.folder, n) for n in names]
    key = v19_50_cache_key_for_paths(paths, V19_50_SIM_CACHE_KIND)
    cdir = self.root / key
    mem = ('sim_v19_50', str(cdir))
    source_sigs = [file_sig(p) for p in paths]
    m = read_meta(cdir)
    valid = bool(m and m.get('kind') == V19_50_SIM_CACHE_KIND and m.get('source_sigs') == source_sigs and m.get('cache_version') == CACHE_VERSION and (cdir / 'data.parquet').exists())
    if mem in MEM_CACHE:
        if stage is not None:
            df, msg = MEM_CACHE[mem]
            stage.append('Simulated cache: memory hit (V19.50 all-selected-series path); columns=' + ', '.join([c for c in df.columns if c != 'timestamp']))
        return MEM_CACHE[mem]
    if not valid:
        if stage is not None:
            stage.append('Simulated cache: building parquet with V19.50 all-selected-series parser path')
        df, msg = parse_simulated_source(paths)
        cdir.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cdir / 'data.parquet', index=False)
        write_meta(cdir, {'kind': V19_50_SIM_CACHE_KIND, 'source_sigs': source_sigs, 'cache_version': CACHE_VERSION, 'rows': len(df), 'columns': [c for c in df.columns if c != 'timestamp'], 'message': msg})
    else:
        if stage is not None:
            stage.append('Simulated cache: V19.50 parquet valid')
    df = pd.read_parquet(cdir / 'data.parquet')
    msg = (read_meta(cdir) or {}).get('message', 'Simulated cache loaded')
    if stage is not None:
        stage.append('V19.50 simulated columns loaded: ' + (', '.join([str(c) for c in df.columns if c != 'timestamp']) or '(none)'))
    MEM_CACHE[mem] = (df, msg)
    return df, msg


def v19_50_unit_for_variable(variable):
    return UNITS.get(variable, '')


def v19_50_numeric_stats(values):
    s = pd.to_numeric(values, errors='coerce').dropna() if values is not None else pd.Series(dtype=float)
    def f(x):
        try:
            x = float(x)
            return '—' if not np.isfinite(x) else f'{x:.4g}'
        except Exception:
            return '—'
    return ('—' if s.empty else f(s.min()), '—' if s.empty else f(s.max()), '—' if s.empty else f(s.mean()))


def v19_50_add_stats_table(fig, rows, row_index):
    headers = ['Series', 'Unit', 'Min', 'Max', 'Average', 'Total']
    values = [[r.get(h, '—') for r in rows] for h in headers]
    fig.add_trace(go.Table(
        header=dict(values=headers, fill_color='#f2f4f7', align='center', font=dict(size=11, color='#111'), height=28),
        cells=dict(values=values, fill_color='white', align='center', font=dict(size=11, color='#111'), height=27),
        columnwidth=[310,150,80,80,90,90]
    ), row=row_index, col=1)


def v19_50_make_stats_rows(obs_entries, sim_entries, rain):
    rows = []
    for name, unit, series in obs_entries:
        mn, mx, av = v19_50_numeric_stats(series)
        rows.append({'Series': name, 'Unit': unit, 'Min': mn, 'Max': mx, 'Average': av, 'Total': '—'})
    for name, unit, series in sim_entries:
        mn, mx, av = v19_50_numeric_stats(series)
        rows.append({'Series': name, 'Unit': unit, 'Min': mn, 'Max': mx, 'Average': av, 'Total': '—'})
    if rain is not None and not getattr(rain, 'empty', True) and 'Rainfall' in rain.columns:
        r = pd.to_numeric(rain['Rainfall'], errors='coerce').dropna()
        mn, mx, av = v19_50_numeric_stats(r)
        dt = rainfall_timestep_hours(rain)
        total = float(r.sum() * dt) if dt and not r.empty else np.nan
        rows.append({'Series':'Rainfall', 'Unit':'native / mm-equivalent total', 'Min':mn, 'Max':mx, 'Average':av, 'Total':'—' if not np.isfinite(total) else f'{total:.4g}'})
    return rows or [{'Series':'—','Unit':'—','Min':'—','Max':'—','Average':'—','Total':'—'}]


def v19_50_selected_obs_columns(obs, variable):
    hydro = v18_hydro_columns(obs) if obs is not None else []
    if not hydro:
        return []
    if variable == 'all':
        return hydro
    want = V18_CHANNEL_BY_KEY.get(variable, V18_CHANNEL_BY_KEY.get('depth'))[0]
    return [want] if want in hydro else hydro[:1]


def make_figure(variable, obs, sim, rain, colors, thresholds, title_suffix='', max_points=DISPLAY_MAX_POINTS_PER_TRACE, stats_box=True, stats_start=None, stats_end=None, wapug_events=None, wapug_color=None):
    hydro_cols = v18_hydro_columns(obs) if obs is not None else []
    if not hydro_cols:
        return _V19_50_PREV_MAKE_FIGURE(variable, obs, sim, rain, colors, thresholds, title_suffix, max_points, stats_box, stats_start, stats_end, wapug_events, wapug_color)

    plotted_obs_cols = v19_50_selected_obs_columns(obs, variable)
    has_rain = rain is not None and not getattr(rain, 'empty', True)
    has_stats = bool(stats_box)
    rows_count = (1 if has_rain else 0) + len(plotted_obs_cols) + (1 if has_stats else 0)
    specs = [[{'type':'xy'}] for _ in range(rows_count)]
    if has_stats:
        specs[-1] = [{'type':'table'}]

    row_heights = []
    if has_rain:
        row_heights.append(0.16)
    row_heights += [(0.62 if has_stats else 0.80) / max(len(plotted_obs_cols), 1)] * len(plotted_obs_cols)
    if has_stats:
        row_heights.append(0.26)
    total_h = sum(row_heights) or 1.0
    row_heights = [h / total_h for h in row_heights]

    titles = (['Rainfall'] if has_rain else []) + [V18_CHANNEL_BY_COL.get(c, ('', c, '', ''))[1] for c in plotted_obs_cols] + (['Statistics'] if has_stats else [])
    fig = make_subplots(rows=rows_count, cols=1, shared_xaxes=True, row_heights=row_heights, vertical_spacing=0.065, specs=specs, subplot_titles=titles)

    row = 1
    if has_rain:
        xs, ys, hx, hy = rainfall_vertical_strokes(rain)
        fig.add_trace(go.Scattergl(x=xs, y=ys, mode='lines', name='Rainfall', line=dict(color=colors.get('rain','#4A90E2'), width=1), opacity=0.60, hoverinfo='skip'), row=row, col=1)
        rmax = rainfall_axis_max(rain, thresholds.get('rain_ymax'))
        fig.update_yaxes(title_text='Rainfall', range=[rmax, 0] if rmax else None, autorange=False if rmax else 'reversed', row=row, col=1)
        row += 1

    sim_cols = [c for c in getattr(sim, 'columns', []) if c != 'timestamp'] if sim is not None and not getattr(sim, 'empty', True) else []
    obs_entries = []
    sim_entries = []
    unit = v19_50_unit_for_variable(variable if variable != 'all' else 'depth')

    for obs_col in plotted_obs_cols:
        key, label, obs_unit, default_color = V18_CHANNEL_BY_COL.get(obs_col, ('depth', obs_col, unit, '#ff0000'))
        ox, oy = downsample_xy(obs['timestamp'].to_numpy(), obs[obs_col].to_numpy(), max_points)
        obs_name = f'Observed {label}'
        fig.add_trace(go.Scatter(x=ox, y=oy, mode='lines', name=obs_name, line=dict(color=colors.get('obs','#ff0000') if key == 'depth' else default_color, width=2.2)), row=row, col=1)
        obs_entries.append((obs_name, obs_unit, pd.to_numeric(obs[obs_col], errors='coerce')))

        # Critical behaviour: plot every selected simulated/comparison column on the selected variable panel.
        for si, sc in enumerate(sim_cols):
            tmp = sim[['timestamp', sc]].dropna(subset=[sc])
            sx, sy = downsample_xy(tmp['timestamp'].to_numpy(), tmp[sc].to_numpy(), max_points)
            sname = v19_50_display_name(sc)
            colour = v20_sim_colour(sc,sname,si,colors.get('sim','#0008ff')) if 'v20_sim_colour' in globals() else (colors.get('sim','#0008ff') if si == 0 else V19_50_COLOURS[si % len(V19_50_COLOURS)])
            fig.add_trace(go.Scatter(x=sx, y=sy, mode='lines', name=sname, line=dict(color=colour, width=2)), row=row, col=1)
            sim_entries.append((sname, obs_unit, pd.to_numeric(tmp[sc], errors='coerce')))

        if key == 'depth':
            x0, x1 = get_full_extent(obs, sim, rain)
            add_threshold(fig, x0, x1, thresholds.get('th1'), thresholds.get('th1_label'), thresholds.get('th1_color'), row)
            add_threshold(fig, x0, x1, thresholds.get('th2'), thresholds.get('th2_label'), thresholds.get('th2_color'), row)
        fig.update_yaxes(title_text=f'{label} ({obs_unit})', row=row, col=1)
        row += 1

    if has_stats:
        v19_50_add_stats_table(fig, v19_50_make_stats_rows(obs_entries, sim_entries, rain), row)

    fig.update_layout(
        template='plotly_white',
        height=max(980, 285 * rows_count + (150 if has_stats else 0)),
        title=f'Observed vs Simulated — {str(variable or "series").capitalize()}' + (f' — {title_suffix}' if title_suffix else ''),
        hovermode='x unified',
        legend=dict(orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1),
        margin=dict(l=70, r=35, t=90, b=95),
        uirevision='v19-50-force-all-selected-sim-series'
    )
    return fig


def v19_50_apply_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    try:
        obs_name = Path(observed_file).stem if observed_file else 'Observed'
        for tr in getattr(fig, 'data', []) or []:
            if getattr(tr, 'type', '') == 'table':
                continue
            original = str(getattr(tr, 'name', '') or '')
            low = original.lower()
            if not original or low.startswith('rainfall') or 'threshold' in low or 'highlight' in low or '1:1 line' in low:
                continue
            if original.startswith('Observed'):
                suffix = original.replace('Observed', '', 1).strip(' :')
                tr.name = f'Observed {suffix}: {obs_name}' if suffix else f'Observed: {obs_name}'
        fig.update_layout(title=f'Observed vs Simulated — {str(variable or "series").capitalize()}')
    except Exception:
        pass
    return fig

# Compatibility aliases.
def v19_20_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_50_apply_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_22_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_50_apply_legend_names(fig, variable, observed_file, sim_df, active_profile)

def v19_10_6_apply_native_legend_names(fig, variable, observed_file=None, sim_df=None, active_profile=None):
    return v19_50_apply_legend_names(fig, variable, observed_file, sim_df, active_profile)

try:
    Registry.ensure_simulated = v19_50_ensure_simulated
    REGISTRY.ensure_simulated = v19_50_ensure_simulated.__get__(REGISTRY, REGISTRY.__class__)
except Exception:
    pass

# ============================ END V19_50_FORCE_ALL_SELECTED_SIM_SERIES_MARKER ============================

# ========================== V19_52_SAFE_ADAPTIVE_ZOOM_PATCH ==========================
# Display-only refinement based on the working V19 baseline.
# Rainfall is left entirely under the original V19 plotting pathway.


def downsample_xy(x, y, max_points):
    x_arr=np.asarray(x); y_arr=np.asarray(y,dtype=float)
    mask=pd.notna(x_arr)&np.isfinite(y_arr); x_arr=x_arr[mask]; y_arr=y_arr[mask]; n=len(y_arr)
    if n<=max_points or n<3: return x_arr,y_arr
    edges=np.linspace(0,n,max(1,max_points//4)+1,dtype=int); keep={0,n-1}
    for a,b in zip(edges[:-1],edges[1:]):
        if b<=a: continue
        seg=y_arr[a:b]
        if len(seg):
            keep.add(a); keep.add(b-1)
            keep.add(a+int(np.nanargmin(seg))); keep.add(a+int(np.nanargmax(seg)))
    idx=np.array(sorted(keep),dtype=int); return x_arr[idx],y_arr[idx]


def rainfall_axis_max(rain, manual=None):
    try:
        if manual not in [None,'']:
            value=float(manual)
            if value>0: return value
    except Exception: pass
    try:
        values=pd.to_numeric(rain['Rainfall'],errors='coerce')
        values=values[np.isfinite(values)&(values>0)]
        return max(float(values.max())*1.15,1.0) if len(values) else 1.0
    except Exception: return None


def v19_52_iso_x(values):
    out=[]
    for value in values:
        stamp=pd.Timestamp(value)
        if pd.notna(stamp): out.append(stamp.isoformat())
    return out


def v19_52_visible_period(relayout):
    if not relayout: return None,None,False
    reset=any(str(k).startswith('xaxis') and str(k).endswith('.autorange') and bool(v) for k,v in relayout.items())
    if reset: return None,None,True
    prefixes=set()
    for key in relayout:
        text=str(key)
        if text.startswith('xaxis') and '.range' in text: prefixes.add(text.split('.range',1)[0])
    def order(prefix):
        tail=prefix.replace('xaxis','')
        return int(tail) if tail.isdigit() else 1
    for prefix in sorted(prefixes,key=order):
        k0=f'{prefix}.range[0]'; k1=f'{prefix}.range[1]'
        if k0 in relayout and k1 in relayout:
            start=pd.to_datetime(relayout[k0],errors='coerce'); end=pd.to_datetime(relayout[k1],errors='coerce')
        elif f'{prefix}.range' in relayout and isinstance(relayout[f'{prefix}.range'],(list,tuple)) and len(relayout[f'{prefix}.range'])>=2:
            start=pd.to_datetime(relayout[f'{prefix}.range'][0],errors='coerce'); end=pd.to_datetime(relayout[f'{prefix}.range'][1],errors='coerce')
        else: continue
        if pd.notna(start) and pd.notna(end): return (end,start,False) if end<start else (start,end,False)
    return None,None,False


def v19_52_hydraulic_sources(obs,sim,variable):
    sources={}
    if obs is not None and not getattr(obs,'empty',True):
        cols=v19_50_selected_obs_columns(obs,variable)
        for col in cols:
            if col not in obs.columns: continue
            label=V18_CHANNEL_BY_COL.get(col,('',col,'',''))[1]
            frame=obs[['timestamp',col]].copy(); frame[col]=pd.to_numeric(frame[col],errors='coerce'); frame=frame.dropna(subset=['timestamp',col]).sort_values('timestamp')
            sources[f'Observed {label}']=(frame['timestamp'].tolist(),frame[col].astype(float).tolist())
        if 'Observed' in obs.columns:
            frame=obs[['timestamp','Observed']].copy(); frame['Observed']=pd.to_numeric(frame['Observed'],errors='coerce'); frame=frame.dropna().sort_values('timestamp')
            sources.setdefault('Observed',(frame['timestamp'].tolist(),frame['Observed'].astype(float).tolist()))
    if sim is not None and not getattr(sim,'empty',True):
        for col in [c for c in sim.columns if c!='timestamp']:
            frame=sim[['timestamp',col]].copy(); frame[col]=pd.to_numeric(frame[col],errors='coerce'); frame=frame.dropna(subset=['timestamp',col]).sort_values('timestamp')
            sources[v19_50_display_name(col)]=(frame['timestamp'].tolist(),frame[col].astype(float).tolist())
    return sources


def v19_52_source_for_trace(trace_name,sources):
    if trace_name in sources: return sources[trace_name]
    if trace_name.startswith('Observed'):
        matches=[(key,value) for key,value in sources.items() if key.startswith('Observed') and trace_name.startswith(key)]
        if matches:
            matches.sort(key=lambda item:len(item[0]),reverse=True); return matches[0][1]
    return None


@app.callback(
    Output('chart','figure',allow_duplicate=True),
    Input('chart','relayoutData'),
    State('chart','figure'), State('variable','value'), State('observed-file','value'),
    State('simulated-files','value'), State('active-sim-profile','value'),
    prevent_initial_call=True)
def v19_52_adaptive_hydraulic_zoom(relayout,figure,variable,obs_file,sim_files,active_sim_profile):
    # Patch observed/simulated x-y arrays only. Rainfall, layout, axes, thresholds,
    # WAPUG/event overlays, annotations and statistics tables remain untouched.
    if not relayout or not figure or not obs_file: return no_update
    try:
        start,end,reset=v19_52_visible_period(relayout)
        obs,_=REGISTRY.ensure_observed(obs_file); sim,_=REGISTRY.ensure_simulated(sim_files)
        sim=active_sim_columns(sim,active_sim_profile)
        if reset:
            start,end,_=hydraulic_plot_window(obs,sim)
        if start is None or end is None: return no_update
        obs_view=filter_df_by_period(obs,start,end); sim_view=filter_df_by_period(sim,start,end)
        sources=v19_52_hydraulic_sources(obs_view,sim_view,variable)
        patch=Patch(); changed=False
        for index,trace in enumerate(figure.get('data',[])):
            name=str(trace.get('name','')); low=name.lower(); trace_type=str(trace.get('type',''))
            if trace_type=='table' or low.startswith('rainfall') or 'threshold' in low or 'highlight' in low or 'event' in low or low=='1:1 line': continue
            source=v19_52_source_for_trace(name,sources)
            if source is None: continue
            x_values,y_values=source
            if len(y_values)>DISPLAY_MAX_POINTS_PER_TRACE:
                x_values,y_values=downsample_xy(np.asarray(x_values,dtype='datetime64[ns]'),np.asarray(y_values,dtype=float),DISPLAY_MAX_POINTS_PER_TRACE)
                x_values=x_values.tolist(); y_values=y_values.tolist()
            patch['data'][index]['x']=v19_52_iso_x(x_values)
            patch['data'][index]['y']=list(y_values)
            changed=True
        return patch if changed else no_update
    except Exception:
        return no_update

# ======================== END V19_52_SAFE_ADAPTIVE_ZOOM_PATCH ========================


# ============================== V20.0 UPGRADE ==============================
V20_SIM_COLOURS = {}
V20_PALETTE = ['#0008ff','#ff7f0e','#2ca02c','#9467bd','#8c564b','#e377c2','#17becf','#bcbd22','#7f7f7f']

def v20_sim_colour(column, display, index, primary):
    for k in (str(column),str(display)):
        c=V20_SIM_COLOURS.get(k)
        if isinstance(c,str) and re.fullmatch(r'#[0-9a-fA-F]{6}',c): return c
    return primary if index==0 else V20_PALETTE[index%len(V20_PALETTE)]

def v20_card(title,children,opened=False):
    return html.Details([html.Summary(title,style={'fontWeight':'600','cursor':'pointer','padding':'11px','color':'#17324d'}),html.Div(children,style={'padding':'4px 12px 14px'})],open=opened,style={'background':'white','border':'1px solid #dbe3ea','borderRadius':'10px','marginBottom':'10px'})

def v20_table(rows):
    return _simple_table(rows,list(rows[0])) if rows else html.Div('No results available.',style={'color':'#666'})

def v20_series_keys(files):
    try:
        d,_=REGISTRY.ensure_simulated(files,[]); return [str(c) for c in d.columns if c!='timestamp']
    except Exception: return []

def v20_data_health_rows(obs_file,sim_files,rain_file,rain_profile):
    rows=[]
    def assess(label,df):
        if df is None or df.empty or 'timestamp' not in df: rows.append({'Source':label,'Status':'Error','Coverage':'Not available','Median interval':'Not available','Details':'No timestamped rows parsed.'}); return
        x=df.copy(); x['timestamp']=pd.to_datetime(x.timestamp,errors='coerce'); x=x.dropna(subset=['timestamp']).sort_values('timestamp')
        d=x.timestamp.diff().dt.total_seconds().div(60); d=d[d>0]; cols=[c for c in x.columns if c!='timestamp']; miss=sum(pd.to_numeric(x[c],errors='coerce').isna().sum() for c in cols)
        rows.append({'Source':label,'Status':'Ready' if not x.timestamp.duplicated().any() else 'Warning','Coverage':f'{fmt_dt(x.timestamp.min())} to {fmt_dt(x.timestamp.max())}','Median interval':'Not available' if d.empty else f'{d.median():.3g} min','Details':f'{len(x):,} rows; {len(cols)} channel(s); {x.timestamp.duplicated().sum()} duplicate timestamp(s); {int(miss):,} missing/non-numeric value(s).'})
    try:
        d,_=REGISTRY.ensure_observed(obs_file,[]); assess('Observed: '+str(obs_file),d)
    except Exception as e: rows.append({'Source':'Observed','Status':'Error','Coverage':'Not available','Median interval':'Not available','Details':str(e)})
    try:
        d,_=REGISTRY.ensure_simulated(sim_files,[]); assess('Simulation: '+', '.join(sim_files or []),d)
    except Exception as e: rows.append({'Source':'Simulation','Status':'Error','Coverage':'Not available','Median interval':'Not available','Details':str(e)})
    if rain_file:
        try:
            o,_=REGISTRY.ensure_observed(obs_file,[]); s,_=REGISTRY.ensure_simulated(sim_files,[]); a,b=get_full_extent(o,s); d,_=REGISTRY.query_rainfall(rain_file,a-pd.Timedelta(hours=1),b+pd.Timedelta(hours=1),rain_profile,[]); assess('Rainfall: '+str(rain_file),d)
        except Exception as e: rows.append({'Source':'Rainfall','Status':'Error','Coverage':'Not available','Median interval':'Not available','Details':str(e)})
    else: rows.append({'Source':'Rainfall','Status':'Optional','Coverage':'Not available','Median interval':'Not available','Details':'No rainfall file selected.'})
    return rows

def v20_monthly_model_volumes(flow_file,flow_profile,sim_files,active,threshold):
    if not flow_file: raise ValueError('Select an overflow link flow file.')
    if not sim_files: raise ValueError('Select simulated level data.')
    if threshold in (None,''): raise ValueError('Set Threshold 2.')
    sim,_=REGISTRY.ensure_simulated(sim_files,[]); level=active_sim_columns(sim,active); lc=[c for c in level.columns if c!='timestamp']; lcol=active if active in lc else lc[0]
    flow=parse_wide_timeseries_file(flow_file,flow_profile); fc=[c for c in flow.columns if c!='timestamp']; fcol=flow_profile if flow_profile in fc else fc[0]
    f=flow[['timestamp',fcol]].rename(columns={fcol:'q'}); l=level[['timestamp',lcol]].rename(columns={lcol:'level'})
    for d,c in ((f,'q'),(l,'level')): d['timestamp']=pd.to_datetime(d.timestamp,errors='coerce'); d[c]=clean_numeric_series(d[c]); d.dropna(subset=['timestamp'],inplace=True); d.sort_values('timestamp',inplace=True); d.drop_duplicates('timestamp',keep='last',inplace=True)
    if len(f)<2 or l.empty: raise ValueError('Insufficient flow/level data.')
    idx=l.set_index('timestamp')[['level']]; times=pd.DatetimeIndex(f.timestamp); f['level']=idx.reindex(idx.index.union(times).sort_values()).interpolate(method='time').reindex(times).level.to_numpy(float)
    f['dt']=f.timestamp.shift(-1).sub(f.timestamp).dt.total_seconds(); med=float(f.loc[f.dt.gt(0),'dt'].median()); f['valid']=f.dt.gt(0)&f.dt.le(max(3*med,med+1)); f['spill']=f.level.ge(float(threshold))&f.q.gt(0)&f.q.notna(); f['vol']=np.where(f.valid&f.spill,f.q*f.dt,0); f['dur']=np.where(f.valid&f.spill,f.dt/3600,0); f['ym']=f.timestamp.dt.to_period('M')
    rows=[]
    for ym,g in f.groupby('ym'):
        expected=g.loc[g.dt.gt(0),'dt'].sum(); valid=g.loc[g.valid&g.q.notna()&g.level.notna(),'dt'].sum(); cov=100*valid/expected if expected else 0
        rows.append({'Year':int(ym.year),'Month':pd.Timestamp(ym.start_time).strftime('%b'),'Modelled spill volume (m³)':f'{g.vol.sum():.3f}','Spill duration (hr)':f'{g.dur.sum():.3f}','Flow/level coverage':f'{cov:.1f}%'})
    return rows,{'level':lcol,'flow':fcol,'interval':med/60,'threshold':float(threshold)}

try:
    app.title='ICM CSV Calibration Viewer v20.0'
    if isinstance(app.layout.children,list):
        app.layout.children[0].children='ICM CSV Calibration Viewer v20.0 — Calibration, Spill, Storage, WAPUG and Data Assessment'
        app.layout.children.insert(2,html.Div(id='v20-status',children='V20 ready.',style={'padding':'9px 12px','margin':'10px 0','borderRadius':'8px','background':'#eef6ff','border':'1px solid #b9d8f5','color':'#17324d'}))
        app.layout.children.insert(3,v20_card('V20 workflow guide',[html.Div('Select inputs, apply the graph, review Data Health, configure profile colours, then run assessments and exports.'),html.Div('Existing controls and calculation pathways remain available below.',style={'color':'#667','marginTop':'5px'})]))
    tabs=v19_find_by_id(app.layout,'main-tabs'); tabs.children=list(tabs.children)
    tabs.children.append(dcc.Tab(label='V20 Control Centre',value='v20-centre',children=[html.Div([
      v20_card('Data Health and Compatibility',[html.Button('Run Data Health Check',id='v20-health-run',n_clicks=0,style=button_style(False,'260px')),dcc.Loading(children=html.Div(id='v20-health-out',style={'marginTop':'10px'}))],True),
      v20_card('Simulation Profile Colours',[html.Div(id='v20-colour-controls'),html.Button('Reset palette',id='v20-colour-reset',n_clicks=0,style=button_style(False,'160px')),html.Div(id='v20-colour-msg',style={'marginTop':'8px','fontSize':'13px'})],True),
      v20_card('Named Workspaces',[html.Div([dcc.Input(id='v20-ws-name',placeholder='Workspace name',style={'width':'280px'}),html.Button('Save',id='v20-ws-save',n_clicks=0,style={**button_style(False,'90px'),'marginLeft':'8px'}),html.Button('Delete',id='v20-ws-delete',n_clicks=0,style={**button_style(False,'90px'),'marginLeft':'6px'})]),dcc.Dropdown(id='v20-ws-select',placeholder='Select workspace',style={'maxWidth':'500px','marginTop':'8px'}),html.Div(id='v20-ws-msg',style={'marginTop':'8px','fontSize':'13px'})]),
      v20_card('Modelled Monthly Spill Volumes',[html.Div('Uses selected overflow flow and modelled level Threshold 2. Flow units are treated as m³/s, consistent with existing storage logic.',style={'color':'#666','fontSize':'13px'}),html.Button('Calculate Monthly Volumes',id='v20-volume-run',n_clicks=0,style={**button_style(False,'280px'),'marginTop':'8px'}),dcc.Loading(children=html.Div(id='v20-volume-out',style={'marginTop':'10px'}))],True),
      v20_card('Analysis Summary and Provenance',[html.Button('Refresh Summary',id='v20-summary-run',n_clicks=0,style=button_style(False,'180px')),html.Button('Download Markdown',id='v20-summary-download-run',n_clicks=0,style={**button_style(False,'210px'),'marginLeft':'8px'}),dcc.Download(id='v20-summary-download'),html.Div(id='v20-summary-out',style={'marginTop':'10px'})],True)
    ],style={'padding':'12px'})]))
    v20_append_once(app.layout,dcc.Store(id='v20-colours',storage_type='local',data={}),'v20-colours'); v20_append_once(app.layout,dcc.Store(id='v20-workspaces',storage_type='local',data={}),'v20-workspaces'); v20_append_once(app.layout,dcc.Store(id='v20-summary-data',data={}),'v20-summary-data')
except Exception: pass

@app.callback(Output('v20-status','children'),Input('file-status','children'),Input('period-message','children'),Input('export-message','children'),Input('spill-report-message','children'),prevent_initial_call=True)
def v20_status(a,b,c,d): return html.Div([html.Strong(str(ctx.triggered_id)+': '),{'file-status':a,'period-message':b,'export-message':c,'spill-report-message':d}.get(ctx.triggered_id)])

@app.callback(Output('v20-health-out','children'),Input('v20-health-run','n_clicks'),State('observed-file','value'),State('simulated-files','value'),State('rainfall-file','value'),State('rain-profile','value'),prevent_initial_call=True)
def v20_health(n,o,s,r,p):
    try:return v20_table(v20_data_health_rows(o,s,r,p))
    except Exception as e:return exception_panel('V20 Data Health failed',e,[])

@app.callback(Output('v20-colour-controls','children'),Output('v20-colours','data'),Input('simulated-files','value'),Input('v20-colour-reset','n_clicks'),State('v20-colours','data'))
def v20_colour_ui(files,reset,data):
    data={} if ctx.triggered_id=='v20-colour-reset' else dict(data or {}); rows=[]
    for i,k in enumerate(v20_series_keys(files)):
        v=data.get(k,'#0008ff' if i==0 else V20_PALETTE[i%len(V20_PALETTE)]); data[k]=v; rows.append(html.Div([html.Div(v19_50_display_name(k),style={'flex':'1'}),dcc.Input(id={'type':'v20-colour','key':k},type='color',value=v,style={'width':'90px','height':'34px'})],style={'display':'flex','gap':'10px','marginBottom':'6px'}))
    return rows or html.Div('Select simulation files first.',style={'color':'#666'}),data

@app.callback(Output('v20-colours','data',allow_duplicate=True),Output('v20-colour-msg','children'),Input({'type':'v20-colour','key':ALL},'value'),State({'type':'v20-colour','key':ALL},'id'),State('v20-colours','data'),prevent_initial_call=True)
def v20_colour_save(vals,ids,data):
    global V20_SIM_COLOURS
    data=dict(data or {}); data.update({str(i['key']):v for i,v in zip(ids or [],vals or []) if v}); V20_SIM_COLOURS=dict(data); return data,'Saved. Click Apply / Refresh Graph to redraw.'

@app.callback(Output('v20-workspaces','data'),Output('v20-ws-select','options'),Output('v20-ws-msg','children'),Input('v20-ws-save','n_clicks'),Input('v20-ws-delete','n_clicks'),State('v20-ws-name','value'),State('v20-ws-select','value'),State('v20-workspaces','data'),State('variable','value'),State('observed-file','value'),State('simulated-files','value'),State('rainfall-file','value'),State('threshold-1','value'),State('threshold-2','value'),State('v20-colours','data'))
def v20_ws_manage(ns,nd,name,selected,allws,var,obs,sim,rain,t1,t2,colours):
    w=dict(allws or {}); msg=''
    if ctx.triggered_id=='v20-ws-save':
        k=(name or '').strip()
        if not k:return w,[{'label':x,'value':x} for x in sorted(w)],'Enter a workspace name.'
        w[k]={'variable':var,'observed-file':obs,'simulated-files':sim,'rainfall-file':rain,'threshold-1':t1,'threshold-2':t2,'colours':colours or {}}; msg='Saved: '+k
    elif ctx.triggered_id=='v20-ws-delete' and selected:w.pop(selected,None);msg='Deleted: '+selected
    return w,[{'label':x,'value':x} for x in sorted(w)],msg

@app.callback(Output('variable','value',allow_duplicate=True),Output('observed-file','value',allow_duplicate=True),Output('simulated-files','value',allow_duplicate=True),Output('rainfall-file','value',allow_duplicate=True),Output('threshold-1','value',allow_duplicate=True),Output('threshold-2','value',allow_duplicate=True),Output('v20-colours','data',allow_duplicate=True),Input('v20-ws-select','value'),State('v20-workspaces','data'),prevent_initial_call=True)
def v20_ws_load(name,allws):
    w=(allws or {}).get(name)
    if not w:return (no_update,)*7
    return w.get('variable'),w.get('observed-file'),w.get('simulated-files'),w.get('rainfall-file'),w.get('threshold-1'),w.get('threshold-2'),w.get('colours',{})

@app.callback(Output('v20-volume-out','children'),Input('v20-volume-run','n_clicks'),State('storage-flow-file','value'),State('storage-flow-profile','value'),State('simulated-files','value'),State('active-sim-profile','value'),State('threshold-2','value'),prevent_initial_call=True)
def v20_volume(n,ff,fp,s,a,t):
    try:
        rows,m=v20_monthly_model_volumes(ff,fp,s,a,t); return html.Div([html.Div(f"Level={m['level']}; flow={m['flow']}; Threshold 2={m['threshold']:g}; median interval={m['interval']:.3g} min",style={'marginBottom':'8px'}),v20_table(rows)])
    except Exception as e:return exception_panel('V20 monthly modelled spill volume failed',e,[])

def v20_summary_dict(var,obs,sim,active,rain,t1,t2,colours):return {'App version':'20.0','Variable':var or 'Not selected','Observed file':obs or 'Not selected','Simulation files':sim or [],'Active simulation profile':active or 'Not selected','Rainfall file':rain or 'Not selected','Threshold 1':'Not set' if t1 in (None,'') else t1,'Threshold 2':'Not set' if t2 in (None,'') else t2,'Simulation colours':colours or {},'Generated':now_text()}

@app.callback(Output('v20-summary-out','children'),Output('v20-summary-data','data'),Input('v20-summary-run','n_clicks'),State('variable','value'),State('observed-file','value'),State('simulated-files','value'),State('active-sim-profile','value'),State('rainfall-file','value'),State('threshold-1','value'),State('threshold-2','value'),State('v20-colours','data'),prevent_initial_call=True)
def v20_summary(n,*x):
    d=v20_summary_dict(*x); return v20_table([{'Item':k,'Value':json.dumps(v) if isinstance(v,(dict,list)) else str(v)} for k,v in d.items()]),d

@app.callback(Output('v20-summary-download','data'),Input('v20-summary-download-run','n_clicks'),State('v20-summary-data','data'),prevent_initial_call=True)
def v20_summary_download(n,d):
    if not d:return no_update
    return dict(content='\n'.join(['# ICM CSV Calibration Viewer V20 Analysis Summary','']+[f"- **{k}:** {json.dumps(v) if isinstance(v,(dict,list)) else v}" for k,v in d.items()]),filename='icm_v20_analysis_summary.md',type='text/markdown')

# ============================ END V20.0 UPGRADE ============================


# ===================== V20_MONTHLY_SPILL_DURATION_PATCH =====================
# Reporting-only extension. Existing event detection, 12/24 counting, thresholds,
# parsing, graphing, storage, WAPUG and other calculations remain unchanged.


def monthly_spill_duration_pivot(events):
    headers=['Year']+[pd.Timestamp(2000,m,1).strftime('%b') for m in range(1,13)]+['Total']
    totals={}
    for event in events or []:
        start=pd.Timestamp(event.get('start')); stop=pd.Timestamp(event.get('stop'))
        if pd.isna(start) or pd.isna(stop) or stop<=start: continue
        cursor=start
        while cursor<stop:
            next_month=pd.Timestamp(cursor.year+1,1,1) if cursor.month==12 else pd.Timestamp(cursor.year,cursor.month+1,1)
            segment_end=min(stop,next_month); hours=(segment_end-cursor).total_seconds()/3600.0
            key=(int(cursor.year),int(cursor.month)); totals[key]=totals.get(key,0.0)+float(hours); cursor=segment_end
    if not totals:return pd.DataFrame(columns=headers)
    rows=[]
    for year in sorted({key[0] for key in totals}):
        row={'Year':year}; annual=0.0
        for month in range(1,13):
            label=pd.Timestamp(2000,month,1).strftime('%b'); value=float(totals.get((year,month),0.0)); row[label]=value; annual+=value
        row['Total']=annual; rows.append(row)
    return pd.DataFrame(rows,columns=headers)


def format_monthly_duration_table(raw_df):
    headers=['Year']+[pd.Timestamp(2000,m,1).strftime('%b') for m in range(1,13)]+['Total']
    if raw_df is None or raw_df.empty:return pd.DataFrame(columns=headers)
    display=raw_df.copy()
    for column in [c for c in display.columns if c!='Year']:
        display[column]=pd.to_numeric(display[column],errors='coerce').fillna(0.0).map(lambda value:f'{float(value):.2f}')
    display['Year']=pd.to_numeric(display['Year'],errors='coerce').astype('Int64')
    return display


def compare_monthly_spill_durations(observed_raw,model_raw):
    months=[pd.Timestamp(2000,m,1).strftime('%b') for m in range(1,13)]
    def values(frame):
        out={}
        if frame is None or frame.empty:return out
        for _,row in frame.iterrows():
            year=int(row['Year'])
            for month in months:out[(year,month)]=float(row.get(month,0.0) or 0.0)
        return out
    observed=values(observed_raw); modelled=values(model_raw); keys=sorted(set(observed)|set(modelled),key=lambda item:(item[0],months.index(item[1])))
    rows=[]
    for year,month in keys:
        obs=float(observed.get((year,month),0.0)); mod=float(modelled.get((year,month),0.0)); diff=mod-obs
        rows.append({'Year':year,'Month':month,'Observed duration (hr)':f'{obs:.2f}','Modelled duration (hr)':f'{mod:.2f}','Difference (hr)':f'{diff:.2f}'})
    return pd.DataFrame(rows,columns=['Year','Month','Observed duration (hr)','Modelled duration (hr)','Difference (hr)'])


_V20_BASE_SPILL_RESULT_FROM_SERIES=_spill_result_from_series

def _spill_result_from_series(label,df,threshold_value):
    result=_V20_BASE_SPILL_RESULT_FROM_SERIES(label,df,threshold_value)
    raw=monthly_spill_duration_pivot(result.get('events',[])); result['monthly_duration_raw']=raw; result['monthly_duration']=format_monthly_duration_table(raw)
    return result


def edm_assessment_panel(obs,threshold_value,sim=None,model_threshold_value=None,sim_files=None):
    warnings=[]; observed=_spill_result_from_series('Observed EDM / Threshold 1',obs,threshold_value)
    model_df,model_series,model_warnings=_model_series_from_simulated(sim,sim_files); warnings.extend(model_warnings)
    model=_spill_result_from_series('Model Spill / Threshold 2',model_df,model_threshold_value) if model_df is not None else _spill_result_from_series('Model Spill / Threshold 2',pd.DataFrame(columns=['timestamp','Observed']),model_threshold_value)
    count_comparison=pd.DataFrame(columns=['Year','Month','Observed spills','Modelled spills','Difference','Assessment'])
    if observed.get('ok') and model.get('ok'):count_comparison=_compare_spill_monthlies(observed['monthly'],model['monthly'])
    duration_comparison=compare_monthly_spill_durations(observed.get('monthly_duration_raw'),model.get('monthly_duration_raw'))
    children=[html.H3('EDM / Model 12/24 Monthly Spill Assessment',style={'marginTop':'20px'})]; wp=_warning_panel(warnings)
    if wp is not None:children.append(wp)
    children.append(html.Div('Spill counts retain the reviewed 12/24 logic. Spill durations use individual above-threshold event durations split across calendar month boundaries.',style={'color':'#555','fontSize':'13px','marginBottom':'10px'}))
    children += [html.H4('Observed spill assessment summary'),_simple_table(observed.get('summary',[]),['Metric','Value'])]
    if not observed.get('ok'):children.append(html.Div(observed.get('message','Observed spill assessment not available.'),style=ERROR_STYLE))
    children += [html.H4('Observed monthly 12/24 spill count',style={'marginTop':'16px'}),_simple_table(observed['monthly'].to_dict('records'),observed['monthly'].columns.tolist()),html.H4('Observed monthly spill duration (hr)',style={'marginTop':'16px'}),_simple_table(observed['monthly_duration'].to_dict('records'),observed['monthly_duration'].columns.tolist()),html.H4('Model spill assessment summary',style={'marginTop':'18px'})]
    if model_series:children.append(html.Div(f'Model series used: {model_series}',style={'color':'#555','fontSize':'13px','marginBottom':'8px'}))
    children.append(_simple_table(model.get('summary',[]),['Metric','Value']))
    if not model.get('ok'):children.append(html.Div(model.get('message','Model spill assessment not available.'),style=ERROR_STYLE))
    children += [html.H4('Model monthly 12/24 spill count',style={'marginTop':'16px'}),_simple_table(model['monthly'].to_dict('records'),model['monthly'].columns.tolist()),html.H4('Model monthly spill duration (hr)',style={'marginTop':'16px'}),_simple_table(model['monthly_duration'].to_dict('records'),model['monthly_duration'].columns.tolist()),html.H4('Observed vs Modelled monthly spill-count comparison',style={'marginTop':'18px'})]
    children.append(html.Div('Count comparison requires both thresholds and both series.',style={'color':'#666'}) if count_comparison.empty else _simple_table(count_comparison.to_dict('records'),count_comparison.columns.tolist()))
    children += [html.H4('Observed vs Modelled monthly spill-duration comparison',style={'marginTop':'18px'})]
    children.append(html.Div('Duration comparison requires detected observed or modelled spill events.',style={'color':'#666'}) if duration_comparison.empty else _simple_table(duration_comparison.to_dict('records'),duration_comparison.columns.tolist()))
    return html.Div(children,style={'marginTop':'18px'})


def _spills_report_html(variable,obs,sim,rain,thresholds,colors,observed_result,model_result,comparison_df,warnings):
    p0,p1=get_full_extent(obs,sim); fig=make_figure(variable,obs,sim,rain,colors,thresholds,'Full time period',REPORT_MAX_POINTS_PER_TRACE,True,p0,p1)
    fig_html=pio.to_html(fig,include_plotlyjs='cdn',full_html=False,config={'displaylogo':False,'responsive':True})
    css="body{font-family:Segoe UI,Arial,sans-serif;margin:18px;background:#f7f7f8;color:#111}section{background:white;border:1px solid #ddd;border-radius:8px;padding:14px;margin:18px 0}table{border-collapse:collapse;width:100%;background:white;margin:8px 0 18px}th{background:#f2f4f7;border:1px solid #ddd;padding:7px;text-align:center}td{border:1px solid #ddd;padding:7px;text-align:center}.warning{background:#fff2f2;border:1px solid #ffb3b3;color:#7a0000;padding:10px;border-radius:6px;margin:8px 0}"
    warning_html=''.join(f'<div class="warning">{warning}</div>' for warning in warnings)
    tables=[]
    for title,frame in [('Observed monthly 12/24 spill count',observed_result['monthly']),('Observed monthly spill duration (hr)',observed_result['monthly_duration']),('Model monthly 12/24 spill count',model_result['monthly']),('Model monthly spill duration (hr)',model_result['monthly_duration']),('Observed vs Modelled monthly spill-count comparison',comparison_df)]:
        tables.append('<section>'+_html_table_from_records(title,frame.to_dict('records'),frame.columns.tolist())+'</section>')
    duration_df=compare_monthly_spill_durations(observed_result.get('monthly_duration_raw'),model_result.get('monthly_duration_raw')); tables.append('<section>'+_html_table_from_records('Observed vs Modelled monthly spill-duration comparison',duration_df.to_dict('records'),duration_df.columns.tolist())+'</section>')
    return f'<!doctype html><html><head><meta charset="utf-8"><title>V20 Spill Assessment Report</title><style>{css}</style></head><body><h1>ICM CSV Calibration Viewer V20 — Spill Assessment Report</h1>{warning_html}<section><h2>1. Full time period graph</h2>{fig_html}</section>{"".join(tables)}</body></html>'

# =================== END V20_MONTHLY_SPILL_DURATION_PATCH ===================

if __name__=='__main__': app.run(debug=False,host='127.0.0.1',port=8050)

