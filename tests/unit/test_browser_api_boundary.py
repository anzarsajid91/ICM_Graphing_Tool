from __future__ import annotations

import importlib.util
from pathlib import Path

from icm_workbench import browser_api, advanced_api


ROOT = Path(__file__).resolve().parents[2]


def _load_shim(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_web_python_bridge_is_thin_compatibility_shim():
    shim = _load_shim("browser_bridge_shim", ROOT / "web" / "python_bridge.py")
    assert shim.parse_source is browser_api.parse_source
    assert shim.compare_series is browser_api.compare_series
    assert shim._load is browser_api._load
    assert len((ROOT / "web" / "python_bridge.py").read_text(encoding="utf-8").splitlines()) < 20


def test_web_advanced_bridge_is_thin_compatibility_shim():
    shim = _load_shim("advanced_bridge_shim", ROOT / "web" / "advanced_bridge.py")
    assert shim.professional_survey_batch_result is advanced_api.professional_survey_batch_result
    assert shim.survey_volume_balance_result is advanced_api.survey_volume_balance_result
    assert len((ROOT / "web" / "advanced_bridge.py").read_text(encoding="utf-8").splitlines()) < 20


def test_compare_series_explains_undefined_constant_series_metrics(tmp_path):
    import json
    from icm_workbench.browser_api import compare_series, clear_cache
    obs=tmp_path/"obs.csv"; model=tmp_path/"model.csv"
    body="timestamp,flow (m3/s)\n2026-01-01T00:00:00,1\n2026-01-01T00:01:00,1\n2026-01-01T00:02:00,1\n"
    obs.write_text(body); model.write_text(body); clear_cache()
    result=json.loads(compare_series(str(obs),"flow (m3/s)",str(model),"flow (m3/s)",max_gap_seconds=120))
    metrics=result["metrics"]
    assert metrics["nse"] is None
    assert metrics["correlation"] is None
    assert "zero variance" in metrics["unavailable_reasons"]["nse"]
    assert "non-zero variance" in metrics["unavailable_reasons"]["correlation"]
