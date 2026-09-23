import json
from types import SimpleNamespace

import numpy as np
import pandas as pd

from icm_workbench import advanced_api, browser_api
from icm_workbench.analysis.review import rating_curve_fit
from icm_workbench.analysis.survey_context import normalise_association_table


def test_association_diameter_units_are_canonicalised_to_mm():
    metres = normalise_association_table(
        ["FM", "RG", "Pipe Diameter (m)", "Upstream"],
        [["FM01", "RG01", "0.45", ""]],
    )
    centimetres = normalise_association_table(
        ["FM", "RG", "Pipe Diameter (cm)", "Upstream"],
        [["FM01", "RG01", "45", ""]],
    )
    assert metres["records"][0]["diameter_mm"] == 450.0
    assert metres["records"][0]["diameter_source_unit"] == "m"
    assert centimetres["records"][0]["diameter_mm"] == 450.0
    assert centimetres["records"][0]["diameter_source_unit"] == "cm"


def test_association_unsupported_or_ambiguous_diameter_is_not_silently_applied():
    unsupported = normalise_association_table(
        ["FM", "RG", "Pipe Diameter (in)", "Upstream"],
        [["FM01", "RG01", "18", ""]],
    )
    assert unsupported["records"][0]["diameter_mm"] is None
    assert any("unsupported" in x["message"].lower() for x in unsupported["issues"])

    duplicate = normalise_association_table(
        ["FM", "RG", "Pipe Diameter (mm)", "Upstream"],
        [
            ["FM01", "RG01", "450", ""],
            ["FM01", "RG01", "600", ""],
        ],
    )
    assert duplicate["status"] == "error"
    assert len(duplicate["records"]) == 1
    assert duplicate["records"][0]["diameter_mm"] == 450.0
    assert any(x["severity"] == "error" for x in duplicate["issues"])


def test_rating_curve_fit_exposes_generic_and_diameter_informed_context():
    depth = pd.Series(np.linspace(0.08, 0.40, 20))
    flow = 0.7 * depth ** 1.6

    generic = rating_curve_fit(depth, flow)
    informed = rating_curve_fit(depth, flow, diameter_m=0.30)

    assert generic["ok"] is True
    assert generic["rating_mode"] == "data-fitted-generic"
    assert informed["ok"] is True
    assert informed["rating_mode"] == "diameter-informed-data-fit"
    assert informed["diameter_mm"] == 300.0
    assert informed["free_surface_pairs"] > 0
    assert informed["surcharged_pairs"] > 0
    assert informed["k_at_h_over_d_1"] > 0
    assert "theoretical" in informed["diameter_method_note"].lower()


def test_rating_curve_fit_withholds_flat_data():
    depth = pd.Series([0.30] * 20)
    flow = pd.Series([0.20] * 20)
    result = rating_curve_fit(depth, flow, diameter_m=0.45)
    assert result["ok"] is False
    assert "variation" in result["message"].lower()


def test_rating_sources_uses_canonical_pairs_exclusions_and_diameter(monkeypatch):
    timestamps = pd.date_range("2026-01-01", periods=12, freq="5min")
    depth = pd.DataFrame({"timestamp": timestamps, "depth": np.linspace(0.1, 0.32, 12)})
    flow = pd.DataFrame({"timestamp": timestamps, "flow": 0.8 * np.linspace(0.1, 0.32, 12) ** 1.5})

    def scaled(path, column, **kwargs):
        frame = depth.copy() if path == "depth" else flow.copy()
        contract = {
            "quantity": "depth" if path == "depth" else "flow",
            "canonical_unit": "m" if path == "depth" else "m³/s",
            "original_unit": "m" if path == "depth" else "m³/s",
            "scale_to_canonical": 1.0,
            "unit_status": "resolved",
            "unit_source": "test",
        }
        return frame, contract

    monkeypatch.setattr(advanced_api.python_bridge, "_scaled_dimensional_frame", scaled)
    monkeypatch.setattr(
        advanced_api.python_bridge,
        "_exclusions",
        lambda _: [SimpleNamespace(start=timestamps[2], end=timestamps[4])],
    )

    result = json.loads(
        advanced_api.rating_sources_result(
            "depth",
            "depth",
            "flow",
            "flow",
            diameter_mm=300,
            diameter_source={"file": "fm_rg_assoc.xlsx", "row": 2},
            monitor="FM01",
            obs_exclusions_json="[]",
        )
    )

    assert result["observed"]["ok"] is True
    assert result["observed"]["paired_count"] == 10
    assert result["observed"]["rating_mode"] == "diameter-informed-data-fit"
    assert result["diameter_context"]["status"] == "applied"
    assert result["diameter_context"]["monitor"] == "FM01"
    assert result["diameter_context"]["source"]["file"] == "fm_rg_assoc.xlsx"
    assert "display downsampling not used" in result["observed"]["source_resolution"]


def test_compare_series_applies_explicit_unit_overrides_before_pairing(monkeypatch):
    timestamps = pd.date_range("2026-01-01", periods=6, freq="5min")
    observed = SimpleNamespace(
        frame=pd.DataFrame({"timestamp": timestamps, "depth": [100, 150, 200, 250, 300, 350]}),
        metadata={
            "quantity_by_column": {"depth": "depth"},
            "series_metadata": {"depth": {"quantity": "depth", "unit_status": "unresolved"}},
        },
        format_name="tabular_csv",
    )
    modelled = SimpleNamespace(
        frame=pd.DataFrame({"timestamp": timestamps, "depth": [0.10, 0.15, 0.20, 0.25, 0.30, 0.35]}),
        metadata={
            "quantity_by_column": {"depth": "depth"},
            "series_metadata": {"depth": {"quantity": "depth", "unit_status": "unresolved"}},
        },
        format_name="tabular_csv",
    )

    monkeypatch.setattr(
        browser_api,
        "_load",
        lambda path: observed if path == "observed" else modelled,
    )

    result = json.loads(
        browser_api.compare_series(
            "observed",
            "depth",
            "modelled",
            "depth",
            obs_unit="mm",
            model_unit="m",
        )
    )

    assert result["observed_unit"] == "m"
    assert result["modelled_unit"] == "m"
    assert result["metrics"]["pairs"] == 6
    assert abs(result["metrics"]["rmse"]) < 1e-12
    assert abs(result["metrics"]["mean_bias"]) < 1e-12
    assert [row["obs"] for row in result["paired"]] == [0.10, 0.15, 0.20, 0.25, 0.30, 0.35]
