"""Calendar allocation regressions, including an independent block-walking oracle."""
import json
import random
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from icm_workbench.analysis.spills import apply_12_24_counting, monthly_spill_counts, spill_assessment
from icm_workbench.domain import ExclusionPeriod


def event(start, end):
    return {"start": pd.Timestamp(start), "end": pd.Timestamp(end)}


def count_map(counting):
    return {(int(r.year), int(r.month)): int(r.spill_count)
            for r in monthly_spill_counts(counting).itertuples()}


def first_discharge_oracle(events):
    """Walk fixed windows and inspect intersections, independently of row weights."""
    if not events:
        return []
    cursor = min(e["start"] for e in events)
    last_stop = max(e["end"] for e in events)
    width = pd.Timedelta(hours=12)
    stamps = []
    while cursor < last_stop:
        stop = cursor + width
        occupied = [max(e["start"], cursor) for e in events
                    if e["start"] < stop and e["end"] > cursor]
        if occupied:
            stamps.append(min(occupied))
            cursor, width = stop, pd.Timedelta(hours=24)
        else:
            remaining = [e["start"] for e in events if e["start"] >= stop]
            if not remaining:
                break
            cursor, width = min(remaining), pd.Timedelta(hours=12)
    return stamps


class SpillCalendarCountTests(unittest.TestCase):
    def assert_auditable(self, counting):
        for row in counting.itertuples():
            self.assertEqual(len(row.count_timestamps), row.spills)
            for stamp in row.count_timestamps:
                self.assertGreaterEqual(pd.Timestamp(stamp), row.spill_start)
                self.assertLess(pd.Timestamp(stamp), row.spill_stop)
        self.assertEqual(sum(count_map(counting).values()), int(counting.spills.sum()))

    def screenshot_frame(self):
        start = pd.Timestamp("2025-10-24 14:37:12")
        stop = pd.Timestamp("2025-12-26 01:16:12")
        stamps = pd.date_range("2025-10-01", stop, freq="15min").union(pd.DatetimeIndex([start, stop]))
        wet = (((stamps >= pd.Timestamp("2025-10-01 00:15")) &
                (stamps <= pd.Timestamp("2025-10-01 01:15"))) |
               ((stamps >= start) & (stamps <= stop)))
        return pd.DataFrame({"timestamp": stamps, "level": np.where(wet, 1.0, 0.0)})

    def test_exact_screenshot_reproduction_allocates_9_30_25(self):
        result = spill_assessment(self.screenshot_frame(), "level", 1, max_gap_seconds=900)
        rows = result["monthly_summary"]
        self.assertEqual(rows.month.tolist(), [10, 11, 12])
        self.assertEqual(rows.spill_count.tolist(), [9, 30, 25])
        np.testing.assert_allclose(rows.duration_hours, [178.38, 720.0, 601.27])
        self.assertEqual(result["total_spill_count"], 64)
        self.assertEqual(result["yearly_summary"].spill_count.tolist(), [64])
        self.assertEqual(result["count_status"], "definitive")
        self.assert_auditable(result["counting_windows"])

    def test_continuous_discharge_crossing_new_year(self):
        stamps = pd.date_range("2025-12-31 18:00", "2026-01-03 18:00", freq="15min")
        result = spill_assessment(pd.DataFrame({"timestamp": stamps, "level": 2.0}), "level", 1)
        self.assertEqual(result["monthly_summary"].spill_count.tolist(), [1, 3])
        self.assertEqual(result["yearly_summary"].year.tolist(), [2025, 2026])
        self.assertEqual(result["yearly_summary"].spill_count.tolist(), [1, 3])
        self.assertEqual(result["monthly_summary"].duration_hours.tolist(), [6.0, 66.0])
        self.assertEqual(result["total_spill_count"], 4)
        self.assert_auditable(result["counting_windows"])

    def test_short_cross_month_discharge_does_not_restart_counting(self):
        stamps = pd.date_range("2025-10-31 23:00", "2025-11-01 01:00", freq="15min")
        result = spill_assessment(pd.DataFrame({"timestamp": stamps, "level": 2.0}), "level", 1)
        self.assertEqual(result["monthly_summary"].spill_count.tolist(), [1, 0])
        self.assertEqual(result["monthly_summary"].duration_hours.tolist(), [1.0, 1.0])

    def test_resumed_discharge_is_attributed_to_discharge_not_empty_block_start(self):
        counting = apply_12_24_counting([
            event("2025-10-31 08:00", "2025-10-31 09:00"),
            event("2025-11-01 02:00", "2025-11-01 03:00"),
        ])
        self.assertEqual(count_map(counting), {(2025, 10): 1, (2025, 11): 1})
        self.assertEqual(counting.iloc[1].count_timestamps, ["2025-11-01T02:00:00"])
        self.assert_auditable(counting)

    def test_repeat_discharge_in_same_block_has_no_extra_count(self):
        counting = apply_12_24_counting([
            event("2025-10-31 23:00", "2025-10-31 23:30"),
            event("2025-11-01 01:00", "2025-11-01 02:00"),
        ])
        self.assertEqual(counting.spills.tolist(), [1, 0])
        self.assertEqual(count_map(counting), {(2025, 10): 1})
        self.assert_auditable(counting)

    def test_stop_exactly_at_previous_block_end_does_not_occupy_next_block(self):
        counting = apply_12_24_counting([
            event("2025-01-01 00:00", "2025-01-01 01:00"),
            event("2025-01-01 11:00", "2025-01-01 12:00"),
        ])
        self.assertEqual(counting.spills.tolist(), [1, 0])
        self.assert_auditable(counting)

    def test_restart_exactly_after_complete_dry_block(self):
        counting = apply_12_24_counting([
            event("2025-01-01 00:00", "2025-01-01 01:00"),
            event("2025-01-02 12:00", "2025-01-02 13:00"),
        ])
        self.assertEqual(counting.spills.tolist(), [1, 1])
        self.assertEqual(counting.spill_event.tolist(), [1, 2])
        self.assert_auditable(counting)

    def test_exact_window_lengths(self):
        start = pd.Timestamp("2025-10-31 12:00")
        for hours, expected in [(12, 1), (36, 2), (60, 3), (60 + 1/60, 4)]:
            with self.subTest(hours=hours):
                counting = apply_12_24_counting([event(start, start + pd.Timedelta(hours=hours))])
                self.assertEqual(int(counting.spills.sum()), expected)
                self.assert_auditable(counting)

    def test_unknown_gap_keeps_count_provisional(self):
        frame = pd.DataFrame({"timestamp": pd.to_datetime([
            "2025-10-31 23:30", "2025-10-31 23:45", "2025-11-01 00:30", "2025-11-01 00:45"]),
            "level": [2, 2, 2, 2]})
        result = spill_assessment(frame, "level", 1, max_gap_seconds=900)
        self.assertEqual(result["count_status"], "partial/unknown-gap")
        self.assertEqual(result["unknown_seconds"], 45 * 60)
        self.assertEqual(result["total_spill_count"], 1)
        self.assert_auditable(result["counting_windows"])

    def test_exclusion_does_not_manufacture_count_or_dry_reset(self):
        stamps = pd.date_range("2025-10-31 18:00", "2025-11-02 18:00", freq="15min")
        exclusion = ExclusionPeriod(pd.Timestamp("2025-11-01 05:00"), pd.Timestamp("2025-11-01 07:00"), "maintenance")
        result = spill_assessment(pd.DataFrame({"timestamp": stamps, "level": 2.0}), "level", 1, exclusions=[exclusion])
        self.assertEqual(result["count_status"], "partial/excluded-window")
        self.assertEqual(result["total_spill_duration_hours"], 46.0)
        self.assertEqual(result["monthly_summary"].spill_count.tolist(), [1, 2])
        self.assertEqual(result["counting_windows"].iloc[1].count_timestamps[0], "2025-11-01T07:00:00")
        self.assert_auditable(result["counting_windows"])

    def test_seeded_events_match_independent_fixed_window_oracle(self):
        rng = random.Random(1224)
        for fixture in range(64):
            cursor = pd.Timestamp("2025-12-20")
            events = []
            for _ in range(20):
                start = cursor + pd.Timedelta(minutes=rng.randrange(0, 4000))
                stop = start + pd.Timedelta(minutes=rng.randrange(1, 6000))
                events.append(event(start, stop))
                cursor = stop
            counting = apply_12_24_counting(events)
            actual = [pd.Timestamp(s) for stamps in counting.count_timestamps for s in stamps]
            with self.subTest(fixture=fixture):
                self.assertEqual(actual, first_discharge_oracle(events))
                self.assert_auditable(counting)

    def test_browser_bridge_serialises_timestamps_and_correct_monthly_counts(self):
        from icm_workbench.browser_api import clear_cache, spill_result
        from icm_workbench.parsers import parse_file
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "calendar-spill.csv"
            frame = self.screenshot_frame().rename(columns={"timestamp": "Time", "level": "Level (m)"})
            frame.to_csv(source, index=False)
            parsed = parse_file(source)
            column = next(c for c in parsed.frame.columns if c != "timestamp")
            payload = json.loads(spill_result(str(source), column, 1))
            self.assertEqual([r["spill_count"] for r in payload["monthly_summary"]], [9, 30, 25])
            self.assertEqual(payload["total_spill_count"], 64)
            self.assertTrue(all(isinstance(s, str) for r in payload["counting_windows"] for s in r["count_timestamps"]))
        clear_cache()


if __name__ == "__main__":
    unittest.main()
