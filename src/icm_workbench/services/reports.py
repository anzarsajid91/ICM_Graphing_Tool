import html,json
from datetime import datetime
from pathlib import Path
import pandas as pd

_REPORT_CSS="""
:root{--ink:#182433;--muted:#667788;--line:#d9e1e8;--soft:#f5f8fa;--accent:#315b9b}
*{box-sizing:border-box}
html{background:#eef2f5}
body{font-family:"Segoe UI",Arial,sans-serif;margin:0;color:var(--ink);background:#fff;font-size:13px;line-height:1.45}
main{max-width:1180px;margin:auto;padding:30px 34px 42px}
header{border-bottom:3px solid var(--accent);padding-bottom:16px;margin-bottom:22px}
header h1{font-size:26px;line-height:1.15;margin:0 0 6px}
header .muted{margin:0}
section{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:14px 0;break-inside:avoid}
h2{font-size:17px;margin:0 0 10px}
.table-wrap{width:100%;max-width:100%;overflow-x:auto;border:1px solid var(--line);border-radius:7px}
table{border-collapse:collapse;width:100%;min-width:620px}
th,td{border-bottom:1px solid #e8edf1;padding:7px 9px;text-align:left;vertical-align:top;font-size:11.5px}
th{background:var(--soft);color:#435466;text-transform:uppercase;letter-spacing:.025em;font-size:10.5px}
tr:last-child td{border-bottom:0}
.warn{background:#fff7e6;border-left:4px solid #b7791f;padding:9px 11px;margin:10px 0}
.muted{color:var(--muted);font-size:12px}
footer{border-top:1px solid var(--line);margin-top:30px;padding-top:10px;color:var(--muted);font-size:11px;display:flex;justify-content:space-between;gap:12px}
@media(max-width:760px){main{padding:20px 16px}table{min-width:560px}}
@media print{html{background:#fff}main{max-width:none;padding:0}section,.table-wrap{break-inside:avoid}}
@page{size:A4 portrait;margin:12mm}
"""

def _table(frame,title):
    if frame is None or frame.empty:
        return f"<section><h2>{html.escape(title)}</h2><p class='muted'>No rows.</p></section>"
    headers="".join(f"<th>{html.escape(str(c))}</th>" for c in frame.columns)
    body=[]
    for _,row in frame.iterrows():
        body.append("<tr>"+"".join(f"<td>{html.escape(str(row[c]))}</td>" for c in frame.columns)+"</tr>")
    return (
        f"<section><h2>{html.escape(title)}</h2>"
        f"<div class='table-wrap'><table><thead><tr>{headers}</tr></thead>"
        f"<tbody>{''.join(body)}</tbody></table></div></section>"
    )

def assessment_html(*,title,summary,tables,exclusions=None,notes=None,warnings=None):
    summary_rows=pd.DataFrame([
        {"Item":k,"Value":json.dumps(v,default=str) if isinstance(v,(dict,list,tuple)) else v}
        for k,v in summary.items()
    ])
    generated=datetime.now().isoformat(timespec="seconds")
    parts=[
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(title)}</title><style>{_REPORT_CSS}</style></head><body><main>",
        f"<header><h1>{html.escape(title)}</h1>"
        f"<p class='muted'>Generated {html.escape(generated)} · ICM Calibration Workbench</p></header>",
    ]
    for warning in warnings or []:
        parts.append(f"<div class='warn'>{html.escape(str(warning))}</div>")
    parts.append(_table(summary_rows,"Analysis summary"))
    parts.append(_table(
        pd.DataFrame(exclusions or [],columns=["exclusion_id","start","end","reason","source"]),
        "Exclusion audit",
    ))
    if notes:
        parts.append(_table(pd.DataFrame(notes),"Reviewer notes"))
    for name,frame in tables.items():
        parts.append(_table(frame,name))
    parts.append(
        "<footer><span>Engineering review output</span>"
        "<span>© 2026 Anzar Sajid</span></footer></main></body></html>"
    )
    return "".join(parts)

def write_manifest(path,manifest):
    Path(path).write_text(
        json.dumps(manifest,indent=2,sort_keys=True,default=str),
        encoding="utf-8",
    )
