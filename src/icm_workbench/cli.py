from __future__ import annotations
import argparse
from pathlib import Path

def build_parser():
    p=argparse.ArgumentParser(description="ICM Calibration Workbench");p.add_argument("--data-dir",default="data",help="Registered local data root");p.add_argument("--port",type=int,default=8050);p.add_argument("--host",default="127.0.0.1",choices=["127.0.0.1","localhost"],help="Loopback only for this release");return p
def main(argv=None):
    args=build_parser().parse_args(argv);root=Path(args.data_dir).expanduser().resolve();root.mkdir(parents=True,exist_ok=True)
    if not root.is_dir():raise SystemExit(f"Data path is not a directory: {root}")
    from icm_workbench.ui.app import create_app
    app=create_app(root);app.run(debug=False,host="127.0.0.1",port=args.port);return 0
