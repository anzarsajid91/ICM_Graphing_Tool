from pathlib import Path
from icm_workbench.ui import create_app

def test_enhanced_app_exposes_required_review_workflows():
    root=Path(__file__).parents[2]/"examples"/"demo";app=create_app(root);text=str(app.layout)
    for component in ["quality-findings","diagnostic-chart","scenario-table","offset-result","event-table","workspace-upload","workspace-download","review-notes","four-graph-download","batch-upload"]:assert component in text
    assert len(app.callback_map)>=25
