"""Independent interval arithmetic for graph/report statistics."""
import json
import tempfile
import unittest
from pathlib import Path

from icm_workbench.browser_api import series_data, clear_cache


class GraphStatisticsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'observed.csv'

    def tearDown(self):
        clear_cache()
        self.tmp.cleanup()

    def load(self, header, rows, **args):
        self.path.write_text(header+'\n'+'\n'.join(rows)+'\n')
        clear_cache()
        return json.loads(series_data(str(self.path), **args))

    def test_irregular_flow_boundary_and_display_independence(self):
        rows=['2026-01-01T00:00:00,0','2026-01-01T00:01:00,2','2026-01-01T00:03:00,4']
        args=dict(start='2026-01-01T00:00:30', end='2026-01-01T00:02:00', end_exclusive=True)
        tiny=self.load('timestamp,flow (m3/s)',rows,max_points=2,**args)
        full=json.loads(series_data(str(self.path),max_points=50000,**args))
        self.assertEqual(tiny['statistics'], full['statistics'])
        s=tiny['statistics']
        # 30 s trapezoid 1→2 plus 60 s trapezoid 2→3 = 195 m³.
        self.assertAlmostEqual(s['total'],195)
        self.assertAlmostEqual(s['time_weighted_mean'],195/90)
        self.assertEqual(s['valid_count'],1)
        self.assertEqual(s['unit'],'m³/s')
        self.assertEqual(s['coverage_fraction'],1)

    def test_end_sample_excluded_but_interval_integrated(self):
        r=self.load('timestamp,flow (m3/s)', ['2026-01-01T00:00:00,1','2026-01-01T00:01:00,3'],
                    end='2026-01-01T00:01:00',end_exclusive=True)
        self.assertEqual(r['statistics']['valid_count'],1)
        self.assertEqual(r['statistics']['maximum'],1)
        self.assertEqual(r['statistics']['total'],120)

    def test_rainfall_uses_interval_mean_and_clips_boundary(self):
        r=self.load('timestamp,rainfall (mm/h)', ['2026-01-01T00:00:00,12','2026-01-01T00:01:00,6','2026-01-01T00:03:00,0'],
                    start='2026-01-01T00:00:30',end='2026-01-01T00:02:00',end_exclusive=True)
        s=r['statistics']
        self.assertEqual(s['unit'],'mm/h')
        self.assertAlmostEqual(s['total'],.2)
        self.assertAlmostEqual(s['time_weighted_mean'],8)

    def test_gap_is_not_complete_and_null_separator_survives(self):
        r=self.load('timestamp,flow (m3/s)', ['2026-01-01T00:00:00,1','2026-01-01T00:01:00,1','2026-01-01T01:00:00,1'], max_gap_seconds=120)
        self.assertEqual(r['statistics']['total'],60)
        self.assertEqual(r['statistics']['status'],'partial')
        self.assertAlmostEqual(r['statistics']['coverage_fraction'],1/60)
        self.assertIn(None,r['timestamp'])

    def test_unresolved_unit_withholds_dimensional_total(self):
        r=self.load('timestamp,flow', ['2026-01-01T00:00:00,1','2026-01-01T00:01:00,1'])
        self.assertIsNone(r['statistics']['unit'])
        self.assertIsNone(r['statistics']['total'])
        self.assertEqual(r['statistics']['mean'],1)

    def test_empty_requested_window_is_unavailable(self):
        r=self.load('timestamp,level (m)', ['2026-01-01T00:00:00,1','2026-01-01T00:01:00,1'],start='2027-01-01',end='2027-02-01')
        self.assertEqual(r['statistics']['status'],'unavailable')
        self.assertEqual(r['statistics']['valid_count'],0)
        self.assertEqual(r['statistics']['coverage_fraction'],0)


if __name__=='__main__':
    unittest.main()
