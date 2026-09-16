from __future__ import annotations
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

def comparison_figure(observed:pd.DataFrame,obs_col:str,scenarios:dict[str,tuple[pd.DataFrame,str]],*,unit:str="",rainfall:pd.DataFrame|None=None,rain_col:str="rainfall",title:str="Comparison",threshold:float|None=None)->go.Figure:
    has_rain=rainfall is not None and not rainfall.empty and rain_col in rainfall.columns;fig=make_subplots(rows=2 if has_rain else 1,cols=1,shared_xaxes=True,vertical_spacing=0.04,row_heights=[0.25,0.75] if has_rain else [1.0]);row=2 if has_rain else 1
    if has_rain:fig.add_trace(go.Bar(x=rainfall.timestamp,y=rainfall[rain_col],name="Rainfall",opacity=0.55),row=1,col=1);fig.update_yaxes(title_text="Rainfall",autorange="reversed",row=1,col=1)
    fig.add_trace(go.Scatter(x=observed.timestamp,y=observed[obs_col],mode="lines",name="Observed",line=dict(width=2.2)),row=row,col=1)
    for name,(frame,col) in scenarios.items():fig.add_trace(go.Scatter(x=frame.timestamp,y=frame[col],mode="lines",name=name),row=row,col=1)
    if threshold is not None:fig.add_hline(y=float(threshold),line_dash="dash",annotation_text=f"Threshold {threshold:g} {unit}".strip(),row=row,col=1)
    fig.update_yaxes(title_text=unit or obs_col,row=row,col=1);fig.update_layout(template="plotly_white",title=title,hovermode="x unified",margin=dict(l=55,r=20,t=55,b=45),legend=dict(orientation="h"));return fig
