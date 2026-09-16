from __future__ import annotations
import html
import pandas as pd
import plotly.io as pio
from icm_workbench.plotting.figures import comparison_figure

def year_periods(year:int):
    y=int(year);return [(f"{y}_complete",f"{y} Complete Period",pd.Timestamp(y,1,1),pd.Timestamp(y,12,31,23,59,59)),(f"{y}_jan_apr",f"{y} Jan-Apr",pd.Timestamp(y,1,1),pd.Timestamp(y,4,30,23,59,59)),(f"{y}_may_aug",f"{y} May-Aug",pd.Timestamp(y,5,1),pd.Timestamp(y,8,31,23,59,59)),(f"{y}_sep_dec",f"{y} Sep-Dec",pd.Timestamp(y,9,1),pd.Timestamp(y,12,31,23,59,59))]
def _clip(df,start,end):
    if df is None or df.empty:return df
    ts=pd.to_datetime(df.timestamp,errors="coerce");return df[(ts>=start)&(ts<=end)].copy()
def four_graph_report_html(*,quantity,unit,year,observed,obs_col,scenarios,rainfall=None,rain_col="rainfall",threshold=None,exclusions=None,warnings=None):
    sections=[]
    for index,(_,title,start,end) in enumerate(year_periods(year)):
        obs=_clip(observed,start,end);sims={name:(_clip(frame,start,end),col) for name,(frame,col) in scenarios.items()};rain=_clip(rainfall,start,end);fig=comparison_figure(obs,obs_col,sims,unit=unit,rainfall=rain,rain_col=rain_col,title=title,threshold=threshold);div=pio.to_html(fig,include_plotlyjs=True if index==0 else False,full_html=False,config={"displaylogo":False,"responsive":True});sections.append(f'<section class="graph-section"><h2>{html.escape(title)}</h2>{div}</section>')
    warning_html="".join(f'<div class="warn">{html.escape(str(x))}</div>' for x in (warnings or []));exc_rows="".join(f"<tr><td>{html.escape(str(x.get('start','')))}</td><td>{html.escape(str(x.get('end','')))}</td><td>{html.escape(str(x.get('reason','')))}</td></tr>" for x in (exclusions or []));audit=f'<section><h2>Exclusion audit</h2><table><tr><th>Start</th><th>End</th><th>Reason</th></tr>{exc_rows}</table></section>';css='body{font-family:Segoe UI,Arial,sans-serif;margin:18px;background:#f7f7f8;color:#17212b}.graph-section,section{background:white;border:1px solid #dfe5eb;border-radius:8px;padding:14px;margin:18px 0}.graph-section{page-break-after:always}.warn{background:#fff7e6;border-left:4px solid #b7791f;padding:9px;margin:8px 0}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e6ebef;padding:7px;text-align:left}'
    return f'<!doctype html><html><head><meta charset="utf-8"><title>ICM {year} {html.escape(quantity)} Graph Report</title><style>{css}</style></head><body><h1>ICM Calibration Workbench Graph Report</h1><div>Variable: {html.escape(quantity)} | Unit: {html.escape(unit)} | Year: {int(year)}</div>{warning_html}{audit}{"".join(sections)}</body></html>'
