from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
if str(WEB) not in sys.path:
    sys.path.insert(0, str(WEB))

import advanced_bridge  # noqa: E402


def _write_r(path: Path, values: str) -> Path:
    path.write_text(
        "*CSTART\n2601010000 2601010006 2\n*CEND\n" + values + "\n",
        encoding="utf-8",
    )
    return path


def test_cumulative_rainfall_integrates_full_interval_series_before_display_sampling(tmp_path):
    source = _write_r(tmp_path / "storm.r", "6 12 0 3")
    result = json.loads(
        advanced_bridge.cumulative_rainfall_series(
            str(source), conversion_factor=2.0, max_points=3
        )
    )

    assert result["raw_count"] == 4
    assert result["display_count"] <= 4
    assert result["interval_min"] == pytest.approx(2.0)
    assert result["final_total_mm"] == pytest.approx(1.4)
    assert result["complete"] is True
    assert result["integration_method"] == "interval-average intensity × interval minutes / 60"


def test_cumulative_rainfall_flags_sentinel_intervals_as_partial(tmp_path):
    source = _write_r(tmp_path / "storm-missing.R", "6 9999 0 3")
    result = json.loads(advanced_bridge.cumulative_rainfall_series(str(source)))

    assert result["missing_count"] == 1
    assert result["complete"] is False
    assert result["final_total_mm"] == pytest.approx(0.3)
    assert None in result["value"]
