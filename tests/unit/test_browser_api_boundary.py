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
