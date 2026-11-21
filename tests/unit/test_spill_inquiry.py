import json

import pytest

from icm_workbench.browser_api import review_spill_events, spill_result


def write_series(tmp_path, name, label, values):
    path = tmp_path / name
    path.write_text(f"Timestamp,{label}\n" + "\n".join(
        f"2025-01-01 00:{minute:02d}:00,{value}" for minute, value in enumerate(values)))
    return {"path": str(path), "column": label}


def test_spill_inquiry_preserves_count_basis_and_adds_supported_volume_and_rainfall(tmp_path):
    depth = write_series(tmp_path, "depth.csv", "Depth (m)", [0, 2, 2, 0, "", 0, 2, 0])
    flow = write_series(tmp_path, "flow.csv", "Flow (m3/s)", [-1, 1, 1, -1, 0, 0, 1, 0])
    rain = write_series(tmp_path, "rain.csv", "Rainfall (mm/h)", [6, 6, 6, 6, 6, 6, -1, 6])
    rain["semantics"] = "intensity"
    basis = json.loads(spill_result(**depth, threshold=1, max_gap_seconds=60))
    assert basis["total_spill_count"] == 1
    answer = json.loads(review_spill_events(**depth, events=basis["events"], max_gap_s=60, flow=flow, rainfall=rain))
    first, second = answer["rows"]
    assert [row["duration_s"] for row in answer["rows"]] == [120, 60]
    assert first["volume_m3"] == pytest.approx(90)
    assert first["rain_mm"] == pytest.approx(.2)
    assert first["flow_support_s"] == first["source_support_s"] == 120
    assert first["previous_gap_s"] is None
    assert second["volume_m3"] == pytest.approx(45)
    assert second["rain_mm"] is None and second["rain_support_s"] == 30
    assert second["previous_gap_s"] == 180 and second["previous_gap_support_s"] == 60
    assert [(row["start"], row["end"]) for row in answer["rows"]] == [(row["start"], row["end"]) for row in basis["events"]]
    assert json.loads(spill_result(**depth, threshold=1, max_gap_seconds=60))["total_spill_count"] == 1


def test_spill_inquiry_clips_signed_flow_and_withholds_incomplete_or_incompatible_evidence(tmp_path):
    depth = write_series(tmp_path, "depth.csv", "Depth (m)", [2, 2, 2, 2, 2])
    flow = write_series(tmp_path, "flow.csv", "Flow (L/s)", [-1000, 1000, -1000, 1000, -1000])
    events = [{"start": "2025-01-01T00:00:00", "end": "2025-01-01T00:02:00"},
              {"start": "2025-01-01T00:03:00", "end": "2025-01-01T00:04:00"}]
    flow["exclusions"] = [{"start": "2025-01-01T00:03:15", "end": "2025-01-01T00:03:30", "reason": "synthetic review"}]
    a, b = json.loads(review_spill_events(**depth, events=events, max_gap_s=60, flow=flow))["rows"]
    assert a["volume_m3"] == pytest.approx(30)
    assert b["volume_m3"] is None and b["flow_support_s"] == 45
    with pytest.raises(ValueError, match="ordered, nonoverlapping"):
        review_spill_events(**depth, events=events[::-1], max_gap_s=60, flow=flow)
    with pytest.raises(ValueError, match="resolved flow unit"):
        review_spill_events(**depth, events=events, max_gap_s=60, flow=depth)
