from pathlib import Path
from icm_workbench.ui.app import create_app

def test_app_factory_builds_all_primary_views():
    root=Path(__file__).parents[2]/"examples"/"demo";app=create_app(root);text=str(app.layout)
    for view in ["view-data","view-compare","view-events","view-spills","view-report"]:assert view in text
    for store in ["active-view","exclusions","spill-result"]:assert store in text
    assert len(app.callback_map)>=10
