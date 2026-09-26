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


def test_generic_series_quantity_can_be_explicitly_classified_without_guessing_units(tmp_path):
    import json
    from icm_workbench.browser_api import clear_cache, parse_source, set_series_quantity
    generic=tmp_path/"generic.csv"
    generic.write_text("Time,Value\n01/01/2024 00:00,1.58\n01/01/2024 00:15,2.73\n",encoding="utf-8")
    clear_cache()
    before=json.loads(parse_source(str(generic)))
    assert before["metadata"]["quantity_by_column"]["Value"] is None
    updated=json.loads(set_series_quantity(str(generic),"Value","level"))
    assert updated["quantity"]=="level"
    assert updated["unit"] is None
    assert updated["unit_status"]=="unresolved"
    after=json.loads(parse_source(str(generic)))
    assert after["metadata"]["series_metadata"]["Value"]["quantity"]=="level"
    assert after["metadata"]["series_metadata"]["Value"]["quantity_source"]=="user"
    cleared=json.loads(set_series_quantity(str(generic),"Value",None))
    assert cleared["quantity"] is None


def test_inferred_tabular_quantity_can_be_retyped_without_stale_unit_scaling(tmp_path):
    import json
    import pytest
    from icm_workbench.browser_api import clear_cache, parse_source, series_data, set_series_quantity

    inferred=tmp_path/"flow.csv"
    inferred.write_text(
        "timestamp,Flow (L/s)\n"
        "2026-01-01T00:00:00,1000\n"
        "2026-01-01T00:01:00,2000\n",
        encoding="utf-8",
    )
    clear_cache()
    initial=json.loads(parse_source(str(inferred)))
    meta=initial["metadata"]["series_metadata"]["Flow (L/s)"]
    assert meta["quantity_source"]=="inferred"
    assert meta["canonical_unit"]=="m³/s"
    assert json.loads(series_data(str(inferred),"Flow (L/s)"))["value"]==pytest.approx([1.0,2.0])

    depth=json.loads(set_series_quantity(str(inferred),"Flow (L/s)","depth"))
    assert depth["quantity"]=="depth"
    assert depth["unit_status"]=="unresolved"
    assert depth["canonical_unit"] is None
    # The old L/s→m³/s factor must be reversed when L/s is no longer a flow unit.
    assert json.loads(series_data(str(inferred),"Flow (L/s)"))["value"]==pytest.approx([1000.0,2000.0])

    flow=json.loads(set_series_quantity(str(inferred),"Flow (L/s)","flow"))
    assert flow["canonical_unit"]=="m³/s"
    assert flow["conversion_factor"]==pytest.approx(0.001)
    assert json.loads(series_data(str(inferred),"Flow (L/s)"))["value"]==pytest.approx([1.0,2.0])


def test_clearing_user_override_restores_tabular_inference(tmp_path):
    import json
    from icm_workbench.browser_api import clear_cache, parse_source, set_series_quantity

    inferred=tmp_path/"levels.csv"
    inferred.write_text("timestamp,Level (m)\n2026-01-01T00:00:00,1.2\n",encoding="utf-8")
    clear_cache()
    changed=json.loads(set_series_quantity(str(inferred),"Level (m)","depth"))
    assert changed["quantity"]=="depth"
    restored=json.loads(set_series_quantity(str(inferred),"Level (m)",None))
    assert restored["quantity"]=="level"
    assert restored["quantity_source"]=="inferred"
    after=json.loads(parse_source(str(inferred)))
    assert after["metadata"]["series_metadata"]["Level (m)"]["quantity"]=="level"
    assert after["metadata"]["series_metadata"]["Level (m)"]["quantity_source"]=="inferred"


def test_native_declared_series_quantity_cannot_be_silently_retyped(tmp_path):
    import pytest
    from icm_workbench.browser_api import clear_cache, set_series_quantity

    declared=tmp_path/"Depth.csv"
    declared.write_text(
        "!Version=1,Type=HYD\n"
        "UserSettings,U_LEVEL,m AD\n"
        "P_DATETIME,Value\n"
        "2026-01-01T00:00:00,1.0\n",
        encoding="utf-8",
    )
    clear_cache()
    with pytest.raises(ValueError,match="already has declared quantity"):
        set_series_quantity(str(declared),"value","flow")

def test_generic_numeric_series_can_compare_without_quantity_classification(tmp_path):
    import json
    from icm_workbench.browser_api import compare_series, clear_cache

    obs = tmp_path / "observed-generic.csv"
    model = tmp_path / "model-generic.csv"
    obs.write_text(
        "Time,Value\n"
        "01/01/2024 00:00,1.0\n"
        "01/01/2024 00:15,2.0\n"
        "01/01/2024 00:30,3.0\n",
        encoding="utf-8",
    )
    model.write_text(
        "Time,Value\n"
        "01/01/2024 00:00,1.1\n"
        "01/01/2024 00:15,1.9\n"
        "01/01/2024 00:30,3.2\n",
        encoding="utf-8",
    )
    clear_cache()
    result = json.loads(
        compare_series(
            str(obs),
            "Value",
            str(model),
            "Value",
            max_gap_seconds=1800,
        )
    )
    assert result["generic_numeric_comparison"] is True
    assert result["observed_quantity"] == "value"
    assert result["modelled_quantity"] == "value"
    assert result["metrics"]["pairs"] == 3
    assert result["metrics"]["rmse"] is not None
    assert len(result["paired"]) == 3
    assert result["comparison_unit"] is None

def test_known_observed_and_unresolved_model_can_compare_as_raw_numeric_values(tmp_path):
    import json
    from icm_workbench.browser_api import compare_series, clear_cache

    obs = tmp_path / "observed-level.csv"
    model = tmp_path / "model-generic.csv"
    obs.write_text(
        "timestamp,Level (m)\n"
        "2026-01-01T00:00:00,1.0\n"
        "2026-01-01T00:15:00,2.0\n"
        "2026-01-01T00:30:00,3.0\n",
        encoding="utf-8",
    )
    model.write_text(
        "timestamp,Dummy_Node.1\n"
        "2026-01-01T00:00:00,1.1\n"
        "2026-01-01T00:15:00,1.9\n"
        "2026-01-01T00:30:00,3.2\n",
        encoding="utf-8",
    )
    clear_cache()
    result = json.loads(
        compare_series(
            str(obs),
            "Level (m)",
            str(model),
            "Dummy_Node.1",
            max_gap_seconds=1800,
        )
    )
    assert result["generic_numeric_comparison"] is True
    assert result["source_observed_quantity"] == "level"
    assert result["source_modelled_quantity"] is None
    assert result["observed_quantity"] == "value"
    assert result["modelled_quantity"] == "value"
    assert result["comparison_unit"] is None
    assert result["metrics"]["pairs"] == 3
    assert len(result["paired"]) == 3

