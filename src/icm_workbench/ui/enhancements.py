from __future__ import annotations

import base64
import json
from datetime import datetime
from pathlib import Path

import pandas as pd


def _find(component, target_id):
    if getattr(component, "id", None) == target_id:
        return component
    children = getattr(component, "children", None)
    if children is None:
        return None
    if not isinstance(children, (list, tuple)):
        children = [children]
    for child in children:
        if child is None or isinstance(child, (str, int, float)):
            continue
        found = _find(child, target_id)
        if found is not None:
            return found
    return None


def _append(component, *children):
    existing = getattr(component, "children", None)
    if existing is None:
        component.children = list(children)
    elif isinstance(existing, (list, tuple)):
        component.children = list(existing) + list(children)
    else:
        component.children = [existing, *children]


def enhance_app(app, root: Path):
    from dash import Input, Output, State, dcc, html, ctx, no_update
    import plotly.graph_objects as go

    from icm_workbench.analysis.alignment import pair_series
    from icm_workbench.analysis.comparison import compare_scenarios, preview_time_offset
    from icm_workbench.analysis.diagnostics import cumulative_volume, residual_series, time_weighted_exceedance
    from icm_workbench.analysis.events import detect_rainfall_events
    from icm_workbench.analysis.quality import quality_findings
    from icm_workbench.domain import Workspace
    from icm_workbench.parsers import parse_file
    from icm_workbench.services.batch_assessment import run_batch_config
    from icm_workbench.services.catalogue import catalogue_folder, safe_source_path
    from icm_workbench.services.graph_reports import four_graph_report_html
    from icm_workbench.services.reports import assessment_html
    from icm_workbench.services.workspace import workspace_from_dict

    app.config.suppress_callback_exceptions = True
    root = Path(root).resolve()

    _append(app.layout,
        dcc.Store(id="review-notes", storage_type="session", data=[]),
        dcc.Store(id="event-results", storage_type="session", data=[]),
        dcc.Store(id="event-index", storage_type="session", data=0),
        dcc.Download(id="workspace-download"), dcc.Download(id="four-graph-download"), dcc.Download(id="review-report-download"),
    )

    data_view = _find(app.layout, "view-data")
    _append(data_view,
        html.Div([html.H3("Quality timeline"), html.P("Findings preserve pre-cleaning context and identify intervals to inspect; range flags are not automatically sensor faults.", className="hint"), html.Div(id="quality-findings")], className="card"),
        html.Div([html.H3("Portable workspace"), html.P("Workspace JSON stores references, fingerprints, mappings, exclusions and reviewer notes; it never contains executable code.", className="hint"),
                  html.Div([html.Button("Download workspace JSON", id="workspace-save-enhanced", n_clicks=0, className="secondary"),
                            dcc.Upload(id="workspace-upload", children=html.Button("Open workspace JSON", className="secondary"), multiple=False)], className="inline-actions"),
                  html.Div(id="workspace-status", className="hint")], className="card"),
    )

    compare_view = _find(app.layout, "view-compare")
    _append(compare_view,
        html.Div([html.H3("Secondary diagnostics"), dcc.RadioItems(id="diagnostic-mode", options=[
            {"label":"Residual (model − observed)","value":"residual"}, {"label":"Cumulative flow volume","value":"cumulative"},
            {"label":"Flow-duration / exceedance","value":"fdc"}], value="residual", inline=True), dcc.Graph(id="diagnostic-chart")], className="card"),
        html.Div([html.H3("Scenario comparison table"), html.P("All selected scenarios use the same observed series and method. No best-model ranking is produced.", className="hint"),
                  dcc.Dropdown(id="scenario-files", multi=True, placeholder="Select model/comparison files"), dcc.Input(id="scenario-column", type="text", placeholder="Common model column, e.g. flow", className="text-input"),
                  dcc.Checklist(id="scenario-common-domain", options=[{"label":" Common valid domain","value":"common"}], value=["common"]), html.Button("Compare scenarios", id="scenario-run", n_clicks=0, className="secondary"), html.Div(id="scenario-table")], className="card"),
        html.Div([html.H3("Time-offset preview"), html.P("Diagnostic only. Positive offset shifts the model later; preview never changes source data.", className="hint"),
                  dcc.Input(id="offset-minutes", type="number", value=0, className="text-input"), html.Button("Preview offset", id="offset-preview", n_clicks=0, className="secondary"), html.Div(id="offset-result")], className="card"),
    )

    events_view = _find(app.layout, "view-events")
    events_view.children = [
        html.H2("Events"), html.P("Rainfall event identification is separate from response/calibration assessment. Confirm the rainfall units before calculation."),
        html.Div(className="workspace-grid", children=[
            html.Aside([html.Label("Rainfall source"), dcc.Dropdown(id="event-file"), html.Label("Rainfall column"), dcc.Dropdown(id="event-column"),
                        html.Label("Conversion factor to assessment intensity units"), dcc.Input(id="event-conversion", type="number", value=1.0, className="text-input"),
                        dcc.Checklist(id="event-units-confirmed", options=[{"label":" Units/semantics confirmed for event method","value":"yes"}], value=[]),
                        html.Label("Minimum intensity"), dcc.Input(id="event-min-intensity", type="number", value=5.0, className="text-input"),
                        html.Label("Minimum intensity duration (min)"), dcc.Input(id="event-min-intensity-duration", type="number", value=6.0, className="text-input"),
                        html.Label("Minimum event duration (min)"), dcc.Input(id="event-min-duration", type="number", value=60.0, className="text-input"),
                        html.Label("Minimum depth"), dcc.Input(id="event-min-depth", type="number", value=5.0, className="text-input"),
                        html.Label("Dry gap (min)"), dcc.Input(id="event-dry-gap", type="number", value=15.0, className="text-input"),
                        html.Button("Identify events", id="event-run", n_clicks=0, className="primary full")], className="sidepanel"),
            html.Div([html.Div(id="event-table", className="card"), html.Div([html.Button("Previous event", id="event-prev", n_clicks=0, className="secondary"), html.Button("Next event", id="event-next", n_clicks=0, className="secondary")], className="inline-actions"),
                      dcc.Graph(id="event-chart"), html.Div([html.Label("Review note"), dcc.Input(id="event-note", type="text", className="text-input"),
                      dcc.RadioItems(id="event-assessment-flag", options=[{"label":"Include","value":"include"},{"label":"Exclude from event review","value":"exclude"}], value="include", inline=True),
                      html.Button("Save event note", id="event-note-save", n_clicks=0, className="secondary"), html.Div(id="event-note-status", className="hint")], className="card")], className="canvas")
        ])
    ]

    report_view = _find(app.layout, "view-report")
    _append(report_view,
        html.Div([html.H3("Reviewer notes"), dcc.Textarea(id="review-note-text", placeholder="Assumption, site note or review observation", style={"width":"100%","minHeight":"80px"}), html.Button("Add note", id="review-note-add", n_clicks=0, className="secondary"), html.Div(id="review-note-list")], className="card"),
        html.Div([html.H3("Offline four-graph report"), html.P("Preserves the legacy complete-year / Jan–Apr / May–Aug / Sep–Dec shape, but embeds Plotly inline rather than using a CDN.", className="hint"),
                  html.Div([dcc.Input(id="report-year", type="number", placeholder="Year", className="text-input"), dcc.Input(id="report-unit", type="text", placeholder="Unit, e.g. m³/s", className="text-input"), html.Button("Download four-graph report", id="four-graph-btn", n_clicks=0, className="primary")], className="inline-actions"), html.Div(id="four-graph-status", className="hint")], className="card"),
        html.Div([html.H3("Auditable current-assessment report"), html.Button("Download with notes + exclusions", id="review-report-btn", n_clicks=0, className="secondary")], className="card"),
        html.Div([html.H3("Bounded batch assessment"), html.P("Upload an explicit JSON list of observed/model pairs. No automatic filename pairing is performed; one failed item does not abort valid items.", className="hint"), dcc.Upload(id="batch-upload", children=html.Button("Run uploaded batch JSON", className="secondary"), multiple=False), html.Div(id="batch-result")], className="card"),
    )

    @app.callback(Output("quality-findings","children"), Input("preview-file","value"))
    def quality_panel(ref):
        if not ref: return html.Div("Select a file in Data preview.", className="empty-state")
        try:
            parsed=parse_file(safe_source_path(root,ref)); findings=quality_findings(parsed.frame,max_gap_seconds=900)
            if findings.empty:return html.Div("No time-localised missing/gap/duplicate findings under the current generic audit.",className="status neutral")
            return html.Div(html.Table([html.Thead(html.Tr([html.Th(x) for x in ["Kind","Column","Start","End","Count","Detail"]])),html.Tbody([html.Tr([html.Td(getattr(r,c)) for c in ["kind","column","start","end","count","detail"]]) for r in findings.itertuples()])],className="data-table"),className="table-scroll")
        except Exception as exc:return html.Div(f"{type(exc).__name__}: {exc}",className="status error")

    @app.callback(Output("scenario-files","options"), Output("event-file","options"), Input("refresh-catalogue","n_clicks"))
    def enhancement_options(_):
        opts=[{"label":r["name"],"value":r["relative_path"]} for r in catalogue_folder(root)];return opts,opts

    @app.callback(Output("event-column","options"), Input("event-file","value"))
    def event_columns(ref):
        if not ref:return []
        try:return [{"label":c,"value":c} for c in parse_file(safe_source_path(root,ref)).frame.columns if c!="timestamp"]
        except Exception:return []

    def selected_pair(obs_ref,obs_col,model_ref,model_col):
        if not all([obs_ref,obs_col,model_ref,model_col]):raise ValueError("Select an explicit observed/model pair first")
        obs=parse_file(safe_source_path(root,obs_ref)).frame;model=parse_file(safe_source_path(root,model_ref)).frame
        return obs,model,pair_series(obs,model,obs_col,model_col)

    @app.callback(Output("diagnostic-chart","figure"), Input("diagnostic-mode","value"), Input("compare-run","n_clicks"), State("compare-observed","value"), State("compare-column","value"), State("compare-model","value"), State("compare-model-column","value"))
    def diagnostics(mode,_,obs_ref,obs_col,model_ref,model_col):
        fig=go.Figure()
        try:
            _,_,paired=selected_pair(obs_ref,obs_col,model_ref,model_col)
            if paired.empty:raise ValueError("No valid overlapping pairs under the gap policy")
            if mode=="residual":
                d=residual_series(paired);fig.add_trace(go.Scatter(x=d.timestamp,y=d.residual_model_minus_observed,mode="lines",name="Model − observed"));fig.add_hline(y=0,line_dash="dash");fig.update_yaxes(title="Residual")
            elif mode=="cumulative":
                if "flow" not in str(obs_col).lower() and "flow" not in str(model_col).lower():raise ValueError("Cumulative volume diagnostic is available only for an explicitly identified flow pair")
                d=cumulative_volume(paired);fig.add_trace(go.Scatter(x=d.timestamp,y=d.obs_cumulative_m3,mode="lines",name="Observed"));fig.add_trace(go.Scatter(x=d.timestamp,y=d.sim_cumulative_m3,mode="lines",name="Model"));fig.update_yaxes(title="Cumulative volume (m³ under declared flow units)")
            else:
                obs=time_weighted_exceedance(paired.rename(columns={"obs":"value"}),"value");sim=time_weighted_exceedance(paired.rename(columns={"sim":"value"}),"value");fig.add_trace(go.Scatter(x=obs.exceedance_fraction*100,y=obs.value,mode="lines",name="Observed"));fig.add_trace(go.Scatter(x=sim.exceedance_fraction*100,y=sim.value,mode="lines",name="Model"));fig.update_xaxes(title="Exceedance (%)");fig.update_yaxes(title="Flow")
            fig.update_layout(template="plotly_white",hovermode="closest",margin=dict(l=55,r=20,t=35,b=50));return fig
        except Exception as exc:fig.add_annotation(text=str(exc),x=.5,y=.5,xref="paper",yref="paper",showarrow=False);fig.update_layout(template="plotly_white");return fig

    @app.callback(Output("scenario-table","children"), Input("scenario-run","n_clicks"), State("compare-observed","value"), State("compare-column","value"), State("scenario-files","value"), State("scenario-column","value"), State("scenario-common-domain","value"), prevent_initial_call=True)
    def scenario_table(_,obs_ref,obs_col,refs,col,common):
        try:
            if not obs_ref or not obs_col or not refs or not col:raise ValueError("Observed source/column, scenario files and common scenario column are required")
            observed=parse_file(safe_source_path(root,obs_ref)).frame;scenarios={}
            for ref in refs:
                frame=parse_file(safe_source_path(root,ref)).frame
                if col not in frame.columns:raise ValueError(f"{ref}: column {col!r} not found")
                scenarios[ref]=(frame,col)
            out=compare_scenarios(observed,obs_col,scenarios,common_valid_domain="common" in (common or []))
            return html.Div(html.Table([html.Thead(html.Tr([html.Th(c) for c in out.columns])),html.Tbody([html.Tr([html.Td(getattr(r,c)) for c in out.columns]) for r in out.itertuples(index=False)])],className="data-table"),className="table-scroll")
        except Exception as exc:return html.Div(f"{type(exc).__name__}: {exc}",className="status error")

    @app.callback(Output("offset-result","children"), Input("offset-preview","n_clicks"), State("offset-minutes","value"), State("compare-observed","value"), State("compare-column","value"), State("compare-model","value"), State("compare-model-column","value"), prevent_initial_call=True)
    def offset_result(_,minutes,obs_ref,obs_col,model_ref,model_col):
        try:
            obs=parse_file(safe_source_path(root,obs_ref)).frame;model=parse_file(safe_source_path(root,model_ref)).frame;out=preview_time_offset(obs,model,obs_col,model_col,float(minutes or 0));rows=[]
            for key in ["pairs","rmse","mean_bias","correlation","nse","peak_timing_minutes_model_minus_observed"]:rows.append(html.Tr([html.Td(key),html.Td(out["before"].get(key)),html.Td(out["after_preview"].get(key))]))
            return html.Table([html.Thead(html.Tr([html.Th("Metric"),html.Th("Original"),html.Th("Preview")])) ,html.Tbody(rows)],className="data-table")
        except Exception as exc:return html.Div(f"{type(exc).__name__}: {exc}",className="status error")

    @app.callback(Output("event-results","data"), Output("event-table","children"), Output("event-index","data",allow_duplicate=True), Input("event-run","n_clicks"), State("event-file","value"), State("event-column","value"), State("event-conversion","value"), State("event-units-confirmed","value"), State("event-min-intensity","value"), State("event-min-intensity-duration","value"), State("event-min-duration","value"), State("event-min-depth","value"), State("event-dry-gap","value"), prevent_initial_call=True)
    def calculate_events(_,ref,col,factor,confirmed,min_i,min_i_d,min_d,min_depth,dry_gap):
        try:
            if "yes" not in (confirmed or []):raise ValueError("Confirm rainfall units/interval semantics before applying the event criteria")
            parsed=parse_file(safe_source_path(root,ref));rain=parsed.frame[["timestamp",col]].rename(columns={col:"rainfall"}).copy();rain["rainfall"]=pd.to_numeric(rain.rainfall,errors="coerce")*float(factor or 1.0);events=detect_rainfall_events(rain,intensity_col="rainfall",minimum_intensity=float(min_i),minimum_intensity_duration_min=float(min_i_d),minimum_depth_mm=float(min_depth),minimum_event_duration_min=float(min_d),dry_gap_min=float(dry_gap));serial=[{**e,"start":str(e["start"]),"end":str(e["end"])} for e in events]
            if not serial:return [],html.Div("No events satisfy the explicit criteria.",className="status neutral"),0
            cols=["event","start","end","duration_min","total_depth_mm","peak_intensity"];table=html.Div(html.Table([html.Thead(html.Tr([html.Th(c) for c in cols])),html.Tbody([html.Tr([html.Td(e.get(c)) for c in cols]) for e in serial])],className="data-table"),className="table-scroll");return serial,table,0
        except Exception as exc:return [],html.Div(f"{type(exc).__name__}: {exc}",className="status error"),0

    @app.callback(Output("event-index","data",allow_duplicate=True), Input("event-prev","n_clicks"), Input("event-next","n_clicks"), State("event-index","data"), State("event-results","data"), prevent_initial_call=True)
    def navigate_event(_,__,index,events):
        if not events:return 0
        index=int(index or 0)
        if ctx.triggered_id=="event-prev":return max(0,index-1)
        return min(len(events)-1,index+1)

    @app.callback(Output("event-chart","figure"), Input("event-index","data"), State("event-results","data"), State("event-file","value"), State("event-column","value"), State("event-conversion","value"))
    def event_chart(index,events,ref,col,factor):
        fig=go.Figure()
        try:
            if not events or not ref or not col:raise ValueError("Identify an event first")
            event=events[min(int(index or 0),len(events)-1)];parsed=parse_file(safe_source_path(root,ref));frame=parsed.frame;ts=pd.to_datetime(frame.timestamp);start=pd.Timestamp(event["start"])-pd.Timedelta(minutes=30);end=pd.Timestamp(event["end"])+pd.Timedelta(minutes=30);sub=frame[(ts>=start)&(ts<=end)];fig.add_trace(go.Bar(x=sub.timestamp,y=pd.to_numeric(sub[col],errors="coerce")*float(factor or 1),name="Rainfall"));fig.add_vrect(x0=event["start"],x1=event["end"],opacity=.15,line_width=0);fig.update_yaxes(autorange="reversed");fig.update_layout(template="plotly_white",title=f"Event {event['event']}: {event['start']} → {event['end']}");return fig
        except Exception as exc:fig.add_annotation(text=str(exc),x=.5,y=.5,xref="paper",yref="paper",showarrow=False);fig.update_layout(template="plotly_white");return fig

    @app.callback(Output("review-notes","data",allow_duplicate=True), Output("event-note-status","children"), Input("event-note-save","n_clicks"), State("event-index","data"), State("event-results","data"), State("event-note","value"), State("event-assessment-flag","value"), State("review-notes","data"), prevent_initial_call=True)
    def save_event_note(_,index,events,note,flag,current):
        if not events:return current or [],"No event selected."
        event=events[min(int(index or 0),len(events)-1)];entry={"kind":"event_review","event":event.get("event"),"event_start":event.get("start"),"event_end":event.get("end"),"assessment_flag":flag,"text":(note or "").strip(),"created_at":datetime.now().isoformat(timespec="seconds")};out=list(current or []);out.append(entry);return out,"Event review note saved in session/workspace provenance."

    @app.callback(Output("review-notes","data",allow_duplicate=True), Output("review-note-text","value"), Input("review-note-add","n_clicks"), State("review-note-text","value"), State("review-notes","data"), prevent_initial_call=True)
    def add_review_note(_,text,current):
        if not (text or "").strip():return current or [],""
        out=list(current or []);out.append({"kind":"reviewer_observation","text":text.strip(),"created_at":datetime.now().isoformat(timespec="seconds")});return out,""

    @app.callback(Output("review-note-list","children"), Input("review-notes","data"))
    def note_list(notes):
        if not notes:return html.Div("No reviewer notes.",className="empty-state")
        return html.Ul([html.Li(f"{n.get('kind')}: {n.get('text') or n.get('assessment_flag','')}") for n in notes])

    @app.callback(Output("workspace-download","data"), Input("workspace-save-enhanced","n_clicks"), State("exclusions","data"), State("review-notes","data"), State("compare-observed","value"), State("compare-column","value"), State("compare-model","value"), State("compare-model-column","value"), prevent_initial_call=True)
    def save_workspace_download(_,exclusions,notes,obs_ref,obs_col,model_ref,model_col):
        hashes={r["relative_path"]:r["sha256"] for r in catalogue_folder(root)};refs={}
        for role,ref in [("observed",obs_ref),("model",model_ref)]:
            if ref:refs[role]={"reference":ref,"sha256":hashes.get(ref)}
        ws=Workspace(schema_version=1,name="ICM Workbench workspace",source_references=refs,analysis={"observed":obs_ref,"observed_column":obs_col,"model":model_ref,"model_column":model_col},exclusions=list(exclusions or []),annotations=list(notes or []));return dict(content=json.dumps(ws.to_dict(),indent=2,default=str),filename="icm_workbench.workspace.json",type="application/json")

    @app.callback(Output("exclusions","data",allow_duplicate=True), Output("review-notes","data",allow_duplicate=True), Output("compare-observed","value"), Output("compare-column","value"), Output("compare-model","value"), Output("compare-model-column","value"), Output("workspace-status","children"), Input("workspace-upload","contents"), prevent_initial_call=True)
    def open_workspace(contents):
        if not contents:return no_update,no_update,no_update,no_update,no_update,no_update,""
        try:
            _,encoded=contents.split(",",1);data=json.loads(base64.b64decode(encoded).decode("utf-8"));ws=workspace_from_dict(data);a=ws.analysis or {};return ws.exclusions,ws.annotations,a.get("observed"),a.get("observed_column"),a.get("model"),a.get("model_column"),"Workspace loaded. Source fingerprints should be reviewed against the Data catalogue before relying on restored results."
        except Exception as exc:return no_update,no_update,no_update,no_update,no_update,no_update,f"Workspace load failed: {type(exc).__name__}: {exc}"

    @app.callback(Output("four-graph-download","data"), Output("four-graph-status","children"), Input("four-graph-btn","n_clicks"), State("report-year","value"), State("report-unit","value"), State("compare-observed","value"), State("compare-column","value"), State("compare-model","value"), State("compare-model-column","value"), State("exclusions","data"), prevent_initial_call=True)
    def four_graph(_,year,unit,obs_ref,obs_col,model_ref,model_col,exclusions):
        try:
            if not all([year,obs_ref,obs_col,model_ref,model_col]):raise ValueError("Year and an explicit Compare pair are required")
            obs=parse_file(safe_source_path(root,obs_ref)).frame;model=parse_file(safe_source_path(root,model_ref)).frame;text=four_graph_report_html(quantity=obs_col,unit=unit or "",year=int(year),observed=obs,obs_col=obs_col,scenarios={model_ref:(model,model_col)},exclusions=exclusions or []);return dict(content=text,filename=f"icm_{obs_col}_{int(year)}_4_graph_report.html",type="text/html"),"Offline four-graph report created from the selected sources."
        except Exception as exc:return no_update,f"{type(exc).__name__}: {exc}"

    @app.callback(Output("review-report-download","data"), Input("review-report-btn","n_clicks"), State("spill-result","data"), State("exclusions","data"), State("review-notes","data"), prevent_initial_call=True)
    def review_report(_,spill_result,exclusions,notes):
        summary={"spill_result":spill_result or {},"note_count":len(notes or []),"exclusion_count":len(exclusions or [])};text=assessment_html(title="ICM Calibration Workbench — Current Assessment",summary=summary,tables={},exclusions=exclusions or [],notes=notes or [],warnings=[]);return dict(content=text,filename="icm_workbench_current_assessment.html",type="text/html")

    @app.callback(Output("batch-result","children"), Input("batch-upload","contents"), prevent_initial_call=True)
    def batch_upload(contents):
        if not contents:return ""
        try:
            _,encoded=contents.split(",",1);config=json.loads(base64.b64decode(encoded).decode("utf-8"));results=run_batch_config(root,config);rows=[]
            for item in results:rows.append(html.Tr([html.Td(item.get("item_id")),html.Td(item.get("status")),html.Td(json.dumps(item.get("result") or item.get("error"),default=str)[:1000])]))
            return html.Div(html.Table([html.Thead(html.Tr([html.Th("Item"),html.Th("Status"),html.Th("Result / error")])),html.Tbody(rows)],className="data-table"),className="table-scroll")
        except Exception as exc:return html.Div(f"{type(exc).__name__}: {exc}",className="status error")

    return app
