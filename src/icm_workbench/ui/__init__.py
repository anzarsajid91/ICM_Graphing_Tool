from pathlib import Path
from .app import create_app as _create_base_app
from .enhancements import enhance_app

def create_app(data_dir):
    root=Path(data_dir).expanduser().resolve()
    return enhance_app(_create_base_app(root),root)

__all__=["create_app"]
