from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
if str(WEB) not in sys.path:
    sys.path.insert(0, str(WEB))

import python_bridge  # noqa: E402


def test_timezone_stamped_exclusion_requires_explicit_conversion():
    with pytest.raises(ValueError, match="Timezone-aware bounds"):
        python_bridge._exclusions(
            json.dumps(
                [{"start": "2026-01-01T00:08:00Z",
                  "end": "2026-01-01T00:10:00Z",
                  "reason": "EDM quality exclusion"}]
            )
        )

def test_analysis_bound_with_offset_requires_explicit_conversion():
    with pytest.raises(ValueError, match="Timezone-aware bounds"):
        python_bridge._model_clock_timestamp("2026-06-14T13:45:00+05:30")


def _install_series(path="/tmp/adaptive.csv"):
    python_bridge.clear_cache()
    ts = pd.date_range("2026-01-01", periods=1000, freq="min")
    values = [0.0] * 1000
    values[500] = 100.0
    values[650] = None
    python_bridge._CACHE[path] = SimpleNamespace(
        frame=pd.DataFrame({"timestamp": ts, "level": values})
    )
    return path


def test_series_data_visible_window_returns_native_timestep_when_below_cap():
    path = _install_series()
    payload = json.loads(
        python_bridge.series_data(
            path,
            "level",
            max_points=5000,
            start="2026-01-01T03:20:00",
            end="2026-01-01T03:30:00",
        )
    )
    assert payload["raw_count"] == 11
    assert payload["display_count"] == 11
    assert payload["native_resolution"] is True
    assert payload["timestamp"][0].startswith("2026-01-01T03:20:00")
    assert payload["timestamp"][-1].startswith("2026-01-01T03:30:00")


def test_display_downsampling_preserves_short_peak_and_missing_gap():
    path = _install_series()
    payload = json.loads(python_bridge.series_data(path, "level", max_points=80))
    assert payload["raw_count"] == 1000
    assert payload["display_count"] <= 80
    assert 100.0 in payload["value"]
    assert None in payload["value"]
    assert payload["native_resolution"] is False
