from __future__ import annotations
import argparse,json
from pathlib import Path

def build_parser():
    p=argparse.ArgumentParser(description="ICM Calibration Workbench");p.add_argument("--data-dir",default="data",help="Registered local data root");p.add_argument("--port",type=int,default=8050);p.add_argument("--host",default="127.0.0.1",choices=["127.0.0.1","localhost"],help="Loopback only for this release");p.add_argument("--batch-config",help="Run an explicit saved calibration-pair batch JSON instead of starting Dash");p.add_argument("--batch-output",help="Optional JSON output path for batch results");return p
def main(argv=None):
    args=build_parser().parse_args(argv);root=Path(args.data_dir).expanduser().resolve();root.mkdir(parents=True,exist_ok=True)
    if not root.is_dir():raise SystemExit(f"Data path is not a directory: {root}")
    if args.batch_config:
        from icm_workbench.services.batch_assessment import run_batch_file
        result=run_batch_file(root,args.batch_config);text=json.dumps(result,indent=2,default=str)
        if args.batch_output:Path(args.batch_output).write_text(text,encoding="utf-8")
        else:print(text)
        return 2 if any(x.get("status")=="error" for x in result) else 0
    from icm_workbench.ui.app import create_app
    app=create_app(root);app.run(debug=False,host="127.0.0.1",port=args.port);return 0
