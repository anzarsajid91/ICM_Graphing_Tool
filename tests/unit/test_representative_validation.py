from __future__ import annotations

from pathlib import Path

from scripts.validate_representative_exports import _check_case


def test_representative_export_harness_checks_units_and_samples(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    source = data_dir / "flow.csv"
    source.write_text(
        "timestamp,Flow (L/s)\n"
        "2026-01-01 00:00:00,1000\n"
        "2026-01-01 00:01:00,2000\n",
        encoding="utf-8",
    )
    case = {
        "id": "flow-fixture",
        "path": "data/flow.csv",
        "expected": {
            "rows": 2,
            "columns": ["timestamp", "Flow (L/s)"],
            "series": {
                "Flow (L/s)": {
                    "quantity": "flow",
                    "original_unit": "L/s",
                    "canonical_unit": "m³/s",
                    "unit_status": "resolved",
                }
            },
            "samples": [
                {
                    "column": "Flow (L/s)",
                    "timestamp": "2026-01-01 00:01:00",
                    "value": 2.0,
                    "tolerance": 1e-12,
                }
            ],
        },
    }
    result = _check_case(case, tmp_path)
    assert result["passed"] is True
    assert result["rows"] == 2
    assert len(result["sha256"]) == 64
    assert result["errors"] == []
