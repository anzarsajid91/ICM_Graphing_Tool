import html,json
from datetime import datetime
from pathlib import Path
import pandas as pd

def _table(frame,title):
    if frame is None or frame.empty:return f"<section><h2>{html.escape(title)}</h2><p>No rows.</p></section>"
    headers="".join(f"<th>{html.escape(str(c))}</th>" for c in frame.columns);body=[]
    for _,row in frame.iterrows():body.append("<tr>"+"".join(f"<td>{html.escape(str(row[c]))}</td>" for c in frame.columns)+"</tr>")
    return f"<section><h2>{html.escape(title)}</h2><table><thead><tr>{headers}</tr></thead><tbody>{''.join(body)}</tbody></table></section>"
def assessment_html(*,title,summary,tables,exclusions=None,notes=None,warnings=None):
    css="body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#17202a;background:#f6f8fa}main{max-width:1400px;margin:auto}section{background:white;border:1px solid #dfe5eb;border-radius:8px;padding:16px;margin:14px 0}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e6ebef;padding:7px 9px;text-align:left}th{background:#f1f5f8}.warn{background:#fff7e6;border-left:4px solid #b7791f;padding:9px}.muted{color:#5b6773;font-size:13px}"
    summary_rows=pd.DataFrame([{"Item":k,"Value":json.dumps(v,default=str) if isinstance(v,(dict,list,tuple)) else v} for k,v in summary.items()]);parts=[f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(title)}</title><style>{css}</style></head><body><main>",f"<h1>{html.escape(title)}</h1><div class='muted'>Generated {html.escape(datetime.now().isoformat(timespec='seconds'))}</div>"]
    for warning in warnings or []:parts.append(f"<div class='warn'>{html.escape(str(warning))}</div>")
    parts.append(_table(summary_rows,"Analysis summary"));parts.append(_table(pd.DataFrame(exclusions or [],columns=["exclusion_id","start","end","reason","source"]),"Exclusion audit"))
    if notes:parts.append(_table(pd.DataFrame(notes),"Reviewer notes"))
    for name,frame in tables.items():parts.append(_table(frame,name))
    parts.append("</main></body></html>");return "".join(parts)
def write_manifest(path,manifest):Path(path).write_text(json.dumps(manifest,indent=2,sort_keys=True,default=str),encoding="utf-8")
