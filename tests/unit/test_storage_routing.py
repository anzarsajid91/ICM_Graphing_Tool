# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
import json
from math import nan

import pytest

from icm_workbench.analysis.storage_routing import route_storage
from icm_workbench.browser_api import screen_storage_routing


def test_rectangular_inflow_conserves_release_storage_and_spill():
    result = route_storage([0, 10, 20], [2, 2, 2], [0, 5, 30], 0, 1, 10)
    assert result["elapsed_s"] == 20
    for row, retained, spilled in zip(result["rows"], [0, 5, 20], [20, 15, 0]):
        assert row["inflow_m3"] == 40
        assert row["passed_m3"] == 20
        assert row["final_m3"] == retained
        assert row["spill_m3"] == spilled
        assert row["mass_residual_m3"] == 0


def test_cap_crossing_preserves_empty_and_full_portions_of_interval():
    rising = route_storage([0, 10], [0, 2], [0, 1, 3], 0, 1, 10)["rows"]
    # The two half-intervals each contain a triangular 2.5 m³ deficit or surplus.
    assert [row["spill_m3"] for row in rising] == [2.5, 1.5, 0]
    assert [row["final_m3"] for row in rising] == [0, 1, 2.5]
    assert [row["passed_m3"] for row in rising] == [7.5, 7.5, 7.5]
    falling = route_storage([0, 10], [2, 0], [1, 2], 1, 1, 10)["rows"]
    assert [row["spill_m3"] for row in falling] == [2.5, 1.5]
    assert [row["passed_m3"] for row in falling] == [8.5, 9.5]
    assert [row["final_m3"] for row in falling] == [0, 0]


def test_first_missing_sample_or_timestep_stops_routing_without_reset():
    for time, flow, reason in [
        ([0, 5, 10, 15], [2, 2, nan, 4], "missing inflow sample"),
        ([0, 5, 25, 30], [2, 2, 4, 4], "unsupported gap"),
    ]:
        result = route_storage(time, flow, [8], 1, 1, 5)
        assert result["stop_reason"] == reason
        assert result["available_s"] == time[-1]
        assert result["elapsed_s"] == 5
        assert result["rows"][0]["final_m3"] == 6
    with pytest.raises(ValueError, match="first interval"):
        route_storage([0, 5, 10], [nan, 2, 2], [8], 1, 1, 5)


def test_zero_discharge_keeps_initial_storage_and_counts_volume_at_capacity():
    result = route_storage([0, 5], [1, 1], [2, 3], 2, 0, 5)
    assert [row["spill_m3"] for row in result["rows"]] == [5, 4]
    assert [row["passed_m3"] for row in result["rows"]] == [0, 0]
    assert all(row["mass_residual_m3"] == 0 for row in result["rows"])


@pytest.mark.parametrize("time, flow, capacity, initial, release, message", [
    ([0, 0, 5], [0, 2, 2], [1], 0, 1, "repeated"),
    ([0, 5], [0, -2], [1], 0, 1, "negative"),
    ([0, 5], [0, 2], [2, 1], 0, 1, "increasing"),
    ([0, 5], [0, 2], [1], 2, 1, "Initial storage"),
    ([0, 5], [0, 2], [1], 0, -1, "Pass-forward"),
])
def test_route_rejects_invalid_temporal_or_operating_inputs(time, flow, capacity, initial, release, message):
    with pytest.raises(ValueError, match=message):
        route_storage(time, flow, capacity, initial, release, 5)


def test_browser_bridge_resolves_units_window_and_existing_exclusion(tmp_path):
    source = tmp_path / "tank.csv"
    source.write_text(
        "Timestamp,Flow (L/s)\n"
        "2025-01-01 00:00:00,2000\n"
        "2025-01-01 00:00:10,2000\n"
        "2025-01-01 00:00:20,2000\n"
        "2025-01-01 00:00:30,2000\n"
    )
    options = dict(path=source, column="Flow (L/s)", capacities_m3=[0, 5], initial_m3=0,
                   release_m3_s=1, max_gap_s=10)
    result = json.loads(screen_storage_routing(**options, start="2025-01-01T00:00:10", exclusions_json=[dict(
        start="2025-01-01T00:00:21", end="2025-01-01T00:00:25", reason="Logger offline",
    )]))
    assert result["assessed_through"] == "2025-01-01T00:00:20"
    assert result["stop_reason"] == "reviewed exclusion"
    assert result["rows"][1]["spill_m3"] == 5
    assert result["rows"][1]["inflow_m3"] == 20
    with pytest.raises(ValueError, match="match actual samples"):
        screen_storage_routing(**options, end="2025-01-01T00:00:12")


def test_browser_bridge_rejects_duplicate_timestamps(tmp_path):
    source = tmp_path / "repeat.csv"
    source.write_text("Timestamp,Flow (m3/s)\n2025-01-01 00:00,1\n2025-01-01 00:00,2\n2025-01-01 00:05,2\n")
    with pytest.raises(ValueError, match="repeated"):
        screen_storage_routing(source, "Flow (m3/s)", [0, 30], 0, 1, 900)
