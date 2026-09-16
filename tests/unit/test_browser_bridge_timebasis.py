from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
if str(WEB) not in sys.path:
    sys.path.insert(0, str(WEB))

import python_bridge  # noqa: E402


def test_timezone_stamped_exclusion_is_normalised_to_naive_model_clock():
    exclusions = python_bridge._exclusions(
        json.dumps(
            [
                {
                    "start": "2026-01-01T00:08:00Z",
                    "end": "2026-01-01T00:10:00Z",
                    "reason": "EDM quality exclusion",
                }
            ]
        )
    )

    assert len(exclusions) == 1
    exclusion = exclusions[0]
    assert exclusion.start.tzinfo is None
    assert exclusion.end.tzinfo is None
    assert exclusion.start.isoformat() == "2026-01-01T00:08:00"
    assert exclusion.end.isoformat() == "2026-01-01T00:10:00"


def test_analysis_bound_with_offset_is_normalised_without_utc_conversion():
    stamp = python_bridge._model_clock_timestamp("2026-06-14T13:45:00+05:30")
    assert stamp.tzinfo is None
    assert stamp.isoformat() == "2026-06-14T13:45:00"
