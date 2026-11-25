import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import pandas as pd
from icm_workbench import browser_api as api

class ExactSourcePointTests(unittest.TestCase):
    def tearDown(self):
        api.clear_cache()

    def point(self, frame, **kwargs):
        with patch.object(api, '_load', return_value=SimpleNamespace(frame=frame)):
            return json.loads(api.series_point('synthetic.csv', 'depth', **kwargs))

    def test_missing_zero_duplicate_last_and_exact_window(self):
        frame=pd.DataFrame({'timestamp':['2026-01-01T00:00','2026-01-01T00:07','2026-01-01T00:15','2026-01-01T00:15'], 'depth':[0,None,2,-.4]})
        zero=self.point(frame)
        self.assertEqual((zero['count'],zero['value'],zero['source_index']),(3,0,0))
        missing=self.point(frame,index=1)
        self.assertIsNone(missing['value'])
        self.assertFalse(missing['interval_supported'])
        last=self.point(frame,start='2026-01-01T00:07',end='2026-01-01T00:15',index=100)
        self.assertEqual((last['count'],last['index'],last['value']),(2,1,-.4))
        self.assertEqual(last['timestamp'],'2026-01-01T00:15:00')
        self.assertIsNone(last['next_sample_seconds'])

    def test_exclusion_is_disclosed_without_erasing_raw_sample(self):
        frame=pd.DataFrame({'timestamp':pd.date_range('2026-01-01',periods=3,freq='min'),'depth':[1,2,3]})
        result=self.point(frame,index=1,exclusions_json=json.dumps([{'start':'2026-01-01T00:01','end':'2026-01-01T00:02','reason':'Synthetic test'}]))
        self.assertTrue(result['excluded'])
        self.assertEqual(result['value'],2)
        self.assertEqual(result['next_sample_seconds'],60)

    def test_large_cohort_constant_response_and_clock_seek(self):
        frame=pd.DataFrame({'timestamp':pd.date_range('2026-01-01',periods=200001,freq='s'),'depth':range(200001)})
        result=self.point(frame,timestamp='2026-01-02T00:00:00')
        self.assertEqual((result['count'],result['index'],result['value']),(200001,86400,86400))
        self.assertLess(len(json.dumps(result)),1200)
        empty=self.point(frame,start='2027-01-01')
        self.assertEqual(empty['count'],0)

if __name__=='__main__': unittest.main()
