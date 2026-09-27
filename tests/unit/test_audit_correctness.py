import json

import pandas as pd
import pytest

from icm_workbench.analysis.spills import spill_assessment
from icm_workbench.browser_api import _model_clock_timestamp, series_data


def test_excluded_graph_total_clips_both_boundaries_without_changing_raw_total(tmp_path):
    path = tmp_path / "flow.csv"
    path.write_text(
        "timestamp,Flow (m3/s)\n"
        "2024-01-01 00:00:00,1\n"
        "2024-01-01 00:01:00,3\n"
        "2024-01-01 00:02:00,1\n"
    )
    result = json.loads(series_data(str(path), "Flow (m3/s)", exclusions_json=json.dumps([
        {"start": "2024-01-01T00:00:30", "end": "2024-01-01T00:01:30", "reason": "suspect"}
    ])))
    assert result["statistics"]["total"] == pytest.approx(240.0)
    assessed = result["assessment_statistics"]
    assert assessed["total"] == pytest.approx(90.0)
    assert assessed["valid_support_seconds"] == pytest.approx(60.0)
    assert assessed["coverage_fraction"] == pytest.approx(1.0)
    assert assessed["mean"] == pytest.approx(1.0)


def test_yearly_spill_rows_expose_exact_calendar_assessment_bounds():
    source = pd.DataFrame({
        "timestamp": pd.to_datetime(["2023-12-31 23:45", "2024-01-01 00:00", "2024-01-01 00:15"]),
        "level": [0.0, 1.0, 0.0],
    })
    result = spill_assessment(source, "level", 0.5, max_gap_seconds=900)
    rows = {row["year"]: row for row in result["yearly_summary"].to_dict("records")}
    assert rows[2023]["analysis_end"] == rows[2024]["analysis_start"]
    assert rows[2024]["analysis_end"] == "2024-01-01T00:15:00"


def test_timezone_offset_must_not_be_silently_dropped():
    with pytest.raises(ValueError, match="Timezone-aware bounds"):
        _model_clock_timestamp("2024-01-01T00:00:00+05:30")
