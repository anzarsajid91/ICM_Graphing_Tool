from __future__ import annotations
from datetime import datetime
from pathlib import Path
import json
import pandas as pd
from icm_workbench.analysis.spills import spill_assessment
from icm_workbench.domain import ExclusionPeriod
from icm_workbench.parsers import parse_file
from icm_workbench.services.catalogue import catalogue_folder,safe_source_path
from icm_workbench.services.reports import assessment_html


def _dash():
    try:
        from dash import Dash,Input,Output,State,dcc,html,no_update,ctx,ALL
        import plotly.graph_objects as go
    except ImportError as exc:raise RuntimeError("Dash/Plotly UI dependencies are not installed. Run install_workbench.bat first.") from exc
    return Dash,Input,Output,State,dcc,html,no_update,ctx,ALL,go


def _exc(raw):return ExclusionPeriod(datetime.fromisoformat(raw["start"]),datetime.fromisoformat(raw["end"]),raw["reason"],raw.get("source","user"),raw.get("exclusion_id"))


def create_app(data_dir):
    Dash,Input,Output,State,dcc,html,no_update,ctx,ALL,go=_dash();root=Path(data_dir).expanduser().resolve();root.mkdir(parents=True,exist_ok=True)
    app=Dash(__name__,title="ICM Calibration Workbench",assets_folder=str(Path(__file__).with_name("assets")))
    def nav(label,value):return html.Button(label,id={"type":"nav","view":value},n_clicks=0,className="nav-button")
    app.layout=html.Div([
        dcc.Store(id="active-view",data="data"),dcc.Store(id="exclusions",storage_type="session",data=[]),dcc.Store(id="spill-result",data=None),
        html.Header([html.Div([html.H1("ICM Calibration Workbench"),html.Div("Exported-data calibration and spill assessment",className="subtitle")]),html.Div([html.Button("Save workspace",id="save-workspace",className="secondary"),html.Button("Help",id="help-button",className="secondary")],className="top-actions")],className="topbar"),
        html.Div([html.Nav([nav("Data","data"),nav("Compare","compare"),nav("Events","events"),nav("Spills","spills"),nav("Report","report")],className="navrail"),html.Main([
            html.Div([html.Div([html.Span("Data root",className="context-label"),html.Span(str(root))]),html.Div([html.Span("Analysis",className="context-label"),html.Span("Not run",id="context-analysis")]),html.Div([html.Span("Quality",className="context-label"),html.Span("Pending")])],className="context-strip"),
            html.Div("Ready. Source files are never modified.",id="status-area",className="status info"),
            html.Section(id="view-data",className="view",children=[html.Div([html.H2("Data"),html.P("Catalogue supported exports inside the registered data root. Invalid telemetry sentinels remain missing with an import audit; they are never silently converted to zero."),html.Button("Refresh catalogue",id="refresh-catalogue",n_clicks=0,className="primary")],className="section-heading"),html.Div(id="catalogue-table"),html.Div([html.H3("Preview"),dcc.Dropdown(id="preview-file",placeholder="Choose a source"),html.Pre(id="preview-output",className="code-preview")],className="card")]),
            html.Section(id="view-compare",className="view hidden",children=[html.Div(className="workspace-grid",children=[html.Aside([html.H2("Compare"),html.Label("Observed source"),dcc.Dropdown(id="compare-observed"),html.Label("Observed column"),dcc.Dropdown(id="compare-column"),html.Label("Model/comparison source"),dcc.Dropdown(id="compare-model"),html.Label("Model/comparison column"),dcc.Dropdown(id="compare-model-column"),html.Button("Analyse",id="compare-run",n_clicks=0,className="primary full"),html.Div("Pan/zoom changes only the view. Analysis settings are explicit.",className="hint")],className="sidepanel"),html.Div([dcc.Graph(id="compare-chart"),html.Div(id="compare-metrics",className="metrics-grid")],className="canvas")])]),
            html.Section(id="view-events",className="view hidden",children=[html.H2("Events"),html.P("Rainfall-event identification is separated from hydraulic response assessment. Event inclusion/exclusion and notes are stored independently of source data."),html.Div("Event service is available in the new calculation core; representative utility criteria remain subject to project/UAT confirmation.",className="status neutral")]),
            html.Section(id="view-spills",className="view hidden",children=[html.H2("Spills"),html.P("Counts, physical durations and exclusions are separate. Exclusions remove unreliable time from assessment; missing unexcluded data remains unknown."),html.Div(className="workspace-grid",children=[html.Aside([html.H3("Assessment inputs"),html.Label("Series source"),dcc.Dropdown(id="spill-file"),html.Label("Value column"),dcc.Dropdown(id="spill-column"),html.Label("Threshold"),dcc.Input(id="spill-threshold",type="number",debounce=True,className="text-input"),html.Label("Maximum bridgeable gap (min)"),dcc.Input(id="spill-gap",type="number",value=15,min=0.1,debounce=True,className="text-input"),html.Button("Calculate spills",id="spill-run",n_clicks=0,className="primary full")],className="sidepanel"),html.Div([html.Div([html.H3("Exclusion periods"),html.P("Add one or more known EDM/model problem intervals. Each needs a reason; edits are reversible and raw data is preserved.",className="hint"),html.Div([html.Div([html.Label("Start"),dcc.Input(id="exc-start",type="text",placeholder="YYYY-MM-DDTHH:MM",className="text-input")]),html.Div([html.Label("End"),dcc.Input(id="exc-end",type="text",placeholder="YYYY-MM-DDTHH:MM",className="text-input")]),html.Div([html.Label("Reason"),dcc.Input(id="exc-reason",type="text",placeholder="e.g. EDM logger fault",className="text-input")]),html.Button("Add exclusion",id="exc-add",n_clicks=0,className="secondary")],className="exclusion-editor"),html.Div(id="exclusion-list"),html.Div([dcc.Dropdown(id="exc-remove-select",placeholder="Select exclusion to remove"),html.Button("Remove",id="exc-remove",n_clicks=0,className="danger"),html.Button("Clear all",id="exc-clear",n_clicks=0,className="secondary")],className="inline-actions")],className="card"),html.Div(id="spill-summary",className="card"),html.Div(id="spill-monthly",className="card")],className="canvas")])]),
            html.Section(id="view-report",className="view hidden",children=[html.H2("Report"),html.P("Exports use the stored result and exclusion audit rather than silently recalculating with different settings."),html.Button("Download current spill assessment HTML",id="report-download-btn",n_clicks=0,className="primary"),dcc.Download(id="report-download"),html.Div(id="report-preview",className="card")])
        ],className="content")],className="shell")])

    @app.callback(Output("active-view","data"),Input({"type":"nav","view":ALL},"n_clicks"),prevent_initial_call=True)
    def switch_view(_):
        triggered=ctx.triggered_id;return triggered["view"] if isinstance(triggered,dict) else "data"

    @app.callback(*[Output(f"view-{name}","className") for name in ["data","compare","events","spills","report"]],Input("active-view","data"))
    def render_view(active):return tuple("view" if active==name else "view hidden" for name in ["data","compare","events","spills","report"])

    def options():
        rows=catalogue_folder(root);return [{"label":r["name"],"value":r["relative_path"]} for r in rows],rows

    @app.callback(Output("catalogue-table","children"),Output("preview-file","options"),Output("compare-observed","options"),Output("compare-model","options"),Output("spill-file","options"),Input("refresh-catalogue","n_clicks"))
    def refresh(_):
        opts,rows=options()
        if not rows:return html.Div("No supported files found. Use the synthetic demo or copy exports into the registered data root.",className="empty-state"),opts,opts,opts,opts
        body=[html.Tr([html.Td(r["name"]),html.Td(f"{r['size_bytes']:,}"),html.Td(r["sha256"][:16]+"…")]) for r in rows]
        table=html.Div(html.Table([html.Thead(html.Tr([html.Th(x) for x in ["File","Size","SHA-256"]])),html.Tbody(body)],className="data-table"),className="table-scroll")
        return table,opts,opts,opts,opts

    @app.callback(Output("preview-output","children"),Input("preview-file","value"))
    def preview(ref):
        if not ref:return "Select a file."
        try:
            parsed=parse_file(safe_source_path(root,ref));return json.dumps({"format":parsed.format_name,"metadata":parsed.metadata,"audit":parsed.audit},indent=2,default=str)+"\n\n"+parsed.frame.head(8).to_string(index=False)
        except Exception as exc:return f"{type(exc).__name__}: {exc}"

    def cols(ref):
        if not ref:return []
        try:return [{"label":c,"value":c} for c in parse_file(safe_source_path(root,ref)).frame.columns if c!="timestamp"]
        except Exception:return []
    @app.callback(Output("compare-column","options"),Input("compare-observed","value"))
    def obs_cols(ref):return cols(ref)
    @app.callback(Output("compare-model-column","options"),Input("compare-model","value"))
    def model_cols(ref):return cols(ref)
    @app.callback(Output("spill-column","options"),Input("spill-file","value"))
    def spill_cols(ref):return cols(ref)

    @app.callback(Output("compare-chart","figure"),Output("compare-metrics","children"),Input("compare-run","n_clicks"),State("compare-observed","value"),State("compare-column","value"),State("compare-model","value"),State("compare-model-column","value"),prevent_initial_call=True)
    def compare(_,obs_ref,obs_col,mod_ref,mod_col):
        fig=go.Figure()
        if not obs_ref or not obs_col:fig.add_annotation(text="Select observed source and column",x=.5,y=.5,xref="paper",yref="paper",showarrow=False);return fig,[]
        obs=parse_file(safe_source_path(root,obs_ref)).frame;fig.add_trace(go.Scatter(x=obs.timestamp,y=obs[obs_col],mode="lines",name="Observed"));metrics=[]
        if mod_ref and mod_col:
            from icm_workbench.analysis.alignment import pair_series
            from icm_workbench.analysis.metrics import calibration_metrics
            mod=parse_file(safe_source_path(root,mod_ref)).frame;fig.add_trace(go.Scatter(x=mod.timestamp,y=mod[mod_col],mode="lines",name="Model/comparison"));m=calibration_metrics(pair_series(obs,mod,obs_col,mod_col));metrics=[html.Div([html.Span(k,className="metric-label"),html.Strong("—" if v is None else f"{v:.4g}" if isinstance(v,float) else str(v))],className="metric") for k,v in m.items()]
        fig.update_layout(template="plotly_white",hovermode="x unified",margin=dict(l=50,r=20,t=30,b=50),uirevision="compare");return fig,metrics

    @app.callback(Output("exclusions","data"),Input("exc-add","n_clicks"),Input("exc-remove","n_clicks"),Input("exc-clear","n_clicks"),State("exc-start","value"),State("exc-end","value"),State("exc-reason","value"),State("exc-remove-select","value"),State("exclusions","data"),prevent_initial_call=True)
    def edit_exclusions(_,__,___,start,end,reason,remove_id,current):
        current=list(current or [])
        if ctx.triggered_id=="exc-clear":return []
        if ctx.triggered_id=="exc-remove":return [x for x in current if x.get("exclusion_id")!=remove_id]
        if not start or not end or not (reason or "").strip():return current
        try:exc=ExclusionPeriod(datetime.fromisoformat(start),datetime.fromisoformat(end),reason.strip())
        except Exception:return current
        if not any(x.get("exclusion_id")==exc.exclusion_id for x in current):current.append(exc.to_dict())
        return current

    @app.callback(Output("exclusion-list","children"),Output("exc-remove-select","options"),Input("exclusions","data"))
    def exclusion_table(data):
        data=data or [];opts=[{"label":f"{x['start']} → {x['end']} — {x['reason']}","value":x["exclusion_id"]} for x in data]
        if not data:return html.Div("No exclusions. All otherwise valid time is assessable.",className="empty-state"),opts
        rows=[html.Tr([html.Td(x["start"]),html.Td(x["end"]),html.Td(x["reason"]),html.Td(x.get("source","user"))]) for x in data]
        return html.Div(html.Table([html.Thead(html.Tr([html.Th("Start"),html.Th("End"),html.Th("Reason"),html.Th("Source")])),html.Tbody(rows)],className="data-table"),className="table-scroll"),opts

    @app.callback(Output("spill-summary","children"),Output("spill-monthly","children"),Output("spill-result","data"),Output("context-analysis","children"),Input("spill-run","n_clicks"),State("spill-file","value"),State("spill-column","value"),State("spill-threshold","value"),State("spill-gap","value"),State("exclusions","data"),prevent_initial_call=True)
    def run_spills(_,ref,col,threshold,gap_min,raw_exclusions):
        if not ref or not col or threshold is None:return html.Div("Select source, column and threshold.",className="status error"),"",None,"Not run"
        try:
            parsed=parse_file(safe_source_path(root,ref));exclusions=[_exc(x) for x in (raw_exclusions or [])];result=spill_assessment(parsed.frame,col,float(threshold),max_gap_seconds=float(gap_min or 15)*60.0,exclusions=exclusions)
            summary=[("Physical spill intervals",len(result["events"])),("12/24 spill count",result["total_spill_count"]),("Physical spill duration",f"{result['total_spill_duration_hours']:.3f} h"),("Excluded assessment time",f"{result['excluded_seconds']/3600:.3f} h"),("Unknown unexcluded time",f"{result['unknown_seconds']/3600:.3f} h"),("Coverage",f"{result['coverage_fraction']*100:.1f}%"),("Count status",result["count_status"])]
            summary_ui=html.Div([html.H3("Spill summary"),html.Table([html.Thead(html.Tr([html.Th("Metric"),html.Th("Value")])),html.Tbody([html.Tr([html.Td(k),html.Td(v)]) for k,v in summary])],className="data-table")])
            count=result["monthly_counts"];duration=result["monthly_durations"];keys=sorted(set(zip(count.year,count.month))|set(zip(duration.year,duration.month)));rows=[]
            for y,m in keys:
                c=count[(count.year==y)&(count.month==m)].spill_count;d=duration[(duration.year==y)&(duration.month==m)].duration_hours;rows.append((int(y),int(m),int(c.iloc[0]) if len(c) else 0,float(d.iloc[0]) if len(d) else 0.0))
            monthly_ui=html.Div([html.H3("Monthly audit"),html.Table([html.Thead(html.Tr([html.Th(x) for x in ["Year","Month","12/24 count","Duration (h)"]])),html.Tbody([html.Tr([html.Td(v) for v in r]) for r in rows])],className="data-table")])
            serial={k:v for k,v in result.items() if k not in {"counting_windows","monthly_counts","monthly_durations"}};serial["monthly_counts"]=count.to_dict("records");serial["monthly_durations"]=duration.to_dict("records");serial["events"]=[{**e,"start":str(e["start"]),"end":str(e["end"])} for e in serial["events"]]
            return summary_ui,monthly_ui,serial,f"Spill assessment: {result['count_status']}"
        except Exception as exc:return html.Div(f"{type(exc).__name__}: {exc}",className="status error"),"",None,"Failed"

    @app.callback(Output("report-download","data"),Output("report-preview","children"),Input("report-download-btn","n_clicks"),State("spill-result","data"),State("exclusions","data"),prevent_initial_call=True)
    def report(_,result,exclusions):
        if not result:return no_update,"Run a spill assessment first."
        counts=pd.DataFrame(result.get("monthly_counts",[]));durations=pd.DataFrame(result.get("monthly_durations",[]));summary={k:v for k,v in result.items() if k not in {"events","monthly_counts","monthly_durations","exclusion_audit"}};warnings=["Counts are definitive only where unexcluded data coverage is complete."] if result.get("count_status")!="definitive" else []
        text=assessment_html(title="ICM Calibration Workbench — Spill Assessment",summary=summary,tables={"Monthly 12/24 counts":counts,"Monthly physical durations":durations},exclusions=exclusions or [],warnings=warnings)
        return dict(content=text,filename="icm_workbench_spill_assessment.html",type="text/html"),html.Div([html.Strong("Report scope ready"),html.P(f"{len(exclusions or [])} exclusion period(s) included in the audit.")])
    return app
