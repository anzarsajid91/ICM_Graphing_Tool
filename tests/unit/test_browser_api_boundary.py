from __future__ import annotations

import importlib.util
import pytest
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


def test_user_unit_interpretation_rescales_raw_values_and_preserves_detected_unit(tmp_path):
    import json
    import pytest
    from icm_workbench.browser_api import clear_cache, parse_source, series_data, set_series_quantity

    source=tmp_path/"observed.csv"
    source.write_text("timestamp,Value\n2026-01-01T00:00:00,1000\n", encoding="utf-8")
    clear_cache()
    first=json.loads(set_series_quantity(str(source),"Value","flow",unit="L/s"))
    assert first["canonical_unit"]=="m³/s"
    assert first["detected_unit"] is None
    assert first["user_unit"]=="L/s"
    assert json.loads(series_data(str(source),"Value"))["value"]==pytest.approx([1.0])

    second=json.loads(set_series_quantity(str(source),"Value","flow",unit="m³/s"))
    assert second["conversion_factor"]==1
    assert json.loads(series_data(str(source),"Value"))["value"]==pytest.approx([1000.0])
    assert json.loads(parse_source(str(source)))["metadata"]["series_metadata"]["Value"]["detected_unit"] is None

    with pytest.raises(ValueError,match="Unsupported unit"):
        set_series_quantity(str(source),"Value","flow",unit="mm")
    assert json.loads(series_data(str(source),"Value"))["value"]==pytest.approx([1000.0])

    unresolved=json.loads(set_series_quantity(str(source),"Value","depth"))
    assert unresolved["unit_status"]=="unresolved"
    assert unresolved["user_unit"] is None
    assert json.loads(series_data(str(source),"Value"))["value"]==pytest.approx([1000.0])


def test_reliable_detected_unit_is_preserved_when_display_unit_changes(tmp_path):
    import json
    import pytest
    from icm_workbench.browser_api import clear_cache, parse_source, series_data, set_series_quantity

    source=tmp_path/"observed-level.csv"
    source.write_text(
        "timestamp,Level (m)\n"
        "2026-01-01T00:00:00,1.2\n",
        encoding="utf-8",
    )
    clear_cache()
    initial=json.loads(parse_source(str(source)))
    assert initial["metadata"]["series_metadata"]["Level (m)"]["original_unit"]=="m"
    changed=json.loads(set_series_quantity(str(source),"Level (m)","level",unit="mm"))
    assert changed["detected_unit"]=="m"
    assert changed["original_unit"]=="m"
    assert changed["user_unit"]=="mm"
    assert changed["display_unit"]=="mm"
    assert changed["canonical_unit"]=="m"
    assert changed["conversion_factor"]==pytest.approx(1.0)
    # Reliable source values remain canonical metres internally; the browser
    # converts them to the selected display unit for plotting.
    assert json.loads(series_data(str(source),"Level (m)"))["value"]==pytest.approx([1.2])



def test_filename_unit_is_not_assumed_for_unlabelled_values(tmp_path):
    import json
    from icm_workbench.browser_api import clear_cache, parse_source

    source=tmp_path/"flow_Lps.csv"
    source.write_text("timestamp,Flow\n2026-01-01T00:00:00,1000\n",encoding="utf-8")
    clear_cache()
    detail=json.loads(parse_source(str(source)))["metadata"]["series_metadata"]["Flow"]
    assert detail["original_unit"] is None
    assert detail["unit_status"]=="unresolved"
    assert detail["unit_source"]=="unresolved"


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
    import json
    import pytest
    from icm_workbench.browser_api import clear_cache, series_data, set_series_quantity

    declared=tmp_path/"Depth.csv"
    declared.write_text(
        "!Version=1,Type=HYD\n"
        "UserSettings,U_LEVEL,m AD\n"
        "P_DATETIME,Value\n"
        "2026-01-01T00:00:00,1.0\n",
        encoding="utf-8",
    )
    clear_cache()

    display=json.loads(set_series_quantity(str(declared),"value","level",unit="mm"))
    assert display["quantity"]=="level"
    assert display["canonical_unit"]=="m"
    assert display["original_unit"]=="m"
    assert display["user_unit"]=="mm"
    assert display["display_unit"]=="mm"
    # Native values remain canonical metres internally; only presentation changes.
    assert json.loads(series_data(str(declared),"value"))["value"]==pytest.approx([1.0])

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


def test_flow_display_units_preserve_detected_values_and_integrated_volume(tmp_path):
    import json
    import pytest
    from icm_workbench.browser_api import clear_cache, series_data, set_series_quantity

    source = tmp_path / 'flow-display.csv'
    source.write_text(
        'timestamp,Flow (L/s)\n'
        '2026-01-01T00:00:00,1000\n'
        '2026-01-01T01:00:00,1000\n', encoding='utf-8'
    )
    clear_cache()
    for unit in ['m³/s', 'Ml/d', 'm³/d', 'L/s', 'm³/s']:
        result = json.loads(set_series_quantity(str(source), 'Flow (L/s)', 'flow', unit=unit))
        data = json.loads(series_data(str(source), 'Flow (L/s)', max_gap_seconds=3600))
        assert result['detected_unit'] == 'L/s'
        assert result['display_unit'] == unit
        assert result['conversion_factor'] == pytest.approx(.001)
        assert data['value'] == pytest.approx([1., 1.])
        assert data['statistics']['total'] == pytest.approx(3600.)
        assert data['statistics']['total_unit'] == 'm³'


@pytest.mark.parametrize("header", ["Rainfall", "Rainfall (mm)", "Rainfall (mm/h)"])
def test_rainfall_assignment_does_not_convert_values(tmp_path, header):
    import json
    from icm_workbench.browser_api import clear_cache, parse_source, series_data, set_series_quantity
    source = tmp_path / "rainfall.csv"
    source.write_text(f"timestamp,{header}\n2026-01-01T00:00:00,2.5\n2026-01-01T00:15:00,8\n")
    clear_cache()
    parse_source(str(source))
    before = json.loads(series_data(str(source), header))["value"]
    assigned = json.loads(set_series_quantity(str(source), header, "rainfall", unit="mm/h"))
    assert assigned["canonical_unit"] == "mm/h"
    assert assigned["conversion_factor"] == 1
    assert json.loads(series_data(str(source), header))["value"] == before == [2.5, 8.0]
    cleared = json.loads(set_series_quantity(str(source), header, "rainfall", unit=""))
    assert json.loads(series_data(str(source), header))["value"] == before
    if header == "Rainfall (mm)":
        assert cleared["canonical_unit"] == "mm"
    elif header == "Rainfall":
        assert cleared["unit_status"] == "unresolved"


def test_declared_rainfall_assignment_and_reset_preserve_values(tmp_path):
    import json
    from icm_workbench.browser_api import clear_cache, parse_source, series_data, set_series_quantity
    source = tmp_path / "RG5097.R"
    source.write_bytes((Path(__file__).parents[2] / "reference/current-tool/sample-data/rainfall/RG5097.R").read_bytes())
    clear_cache()
    parsed = json.loads(parse_source(str(source)))
    column = parsed["columns"][0]
    before = json.loads(series_data(str(source), column))["value"]
    assigned = json.loads(set_series_quantity(str(source), column, "rainfall", unit="mm"))
    assert assigned["canonical_unit"] == "mm"
    assert assigned["detected_unit"] == parsed["metadata"]["original_unit"]
    assert json.loads(series_data(str(source), column))["value"] == before
    reset = json.loads(set_series_quantity(str(source), column, "rainfall", unit=""))
    assert reset["canonical_unit"] == "mm/h"
    assert json.loads(series_data(str(source), column))["value"] == before
