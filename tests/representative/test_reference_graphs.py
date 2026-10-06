"""Synthetic regression cases, never production format assumptions."""
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

import numpy as np
from icm_workbench.parsers import parse_file
from icm_workbench.browser_api import series_data, clear_cache

ROOT=Path(__file__).resolve().parents[2]/'reference/current-tool'
MANIFEST=json.loads((ROOT/'synthetic-manifest.json').read_text())


@unittest.skipUnless(ROOT.exists(), 'Reference example files are not available')
class ReferenceGraphTests(unittest.TestCase):
    def tearDown(self):
        clear_cache()

    def test_all_fdv_files_and_independent_flow_integrals(self):
        files=list((ROOT/'sample-data/fdv').glob('*.fdv'))
        self.assertEqual(len(files),9)
        for path in files:
            with self.subTest(file=path.name):
                parsed=parse_file(path)
                self.assertEqual(list(parsed.frame.columns),['timestamp','flow','depth','velocity'])
                frame=parsed.frame
                dt=np.diff(frame.timestamp.to_numpy(dtype='datetime64[ns]').astype(np.int64))/1e9
                q=frame.flow.to_numpy()
                expected=float(np.sum((q[:-1]+q[1:])/2*dt))
                data=json.loads(series_data(str(path),'flow',max_points=20))
                self.assertAlmostEqual(data['statistics']['total'],expected,places=6)
                self.assertEqual(data['statistics']['unit'],'m³/s')
                self.assertGreater(len(frame),2000)

    def test_synthetic_statistics_match_independent_generator_arithmetic(self):
        monitor=MANIFEST['monitors'][0]
        path=str(ROOT/f'sample-data/fdv/{monitor}.fdv')
        for col,expected in MANIFEST['fdv_statistics'][monitor].items():
            actual=json.loads(series_data(path,col,max_points=20))['statistics']
            for key in ['minimum','maximum','mean']:
                self.assertAlmostEqual(actual[key],expected[key],places=10)

    def test_rain_gauges_and_independent_intensity_totals(self):
        for path in (ROOT/'sample-data/rainfall').glob('*.R'):
            frame=parse_file(path).frame
            expected=float(frame.rainfall.sum()*2/60)
            s=json.loads(series_data(str(path),'rainfall',max_points=20))['statistics']
            self.assertAlmostEqual(s['total'],expected,places=6)
        s=json.loads(series_data(str(ROOT/'sample-data/rainfall/RG5097.R'),'rainfall'))['statistics']
        self.assertAlmostEqual(s['total'],MANIFEST['rainfall_statistics'][MANIFEST['gauges'][0]]['total'],places=6)

    def test_synthetic_cso_csv_unit_and_support_contracts(self):
        edm=ROOT/'sample-data/other/CS2666_EDM.csv'
        rain=ROOT/'sample-data/other/CS2666_Rainfall.csv'
        self.assertEqual(len(parse_file(edm).frame),MANIFEST['edm_rows'])
        s=json.loads(series_data(str(rain),'1',max_points=20))['statistics']
        self.assertEqual(s['quantity'],'rainfall')
        self.assertIsNone(s['unit'])
        self.assertIsNone(s['total'])
        self.assertEqual(s['status'],'partial')
        self.assertLess(s['coverage_fraction'],.5)

    def test_all_reference_reports_have_readable_plotly_payloads(self):
        files=list((ROOT/'reports/html').glob('*.html'))
        self.assertEqual(len(files),5)
        dec=json.JSONDecoder()
        for path in files:
            text=path.read_text(); tail=text.split('Plotly.newPlot(',1)[1].lstrip()
            _,n=dec.raw_decode(tail); tail=tail[n:].lstrip(' ,\n')
            traces,n=dec.raw_decode(tail)
            colours={t.get('name'):t.get('line',{}).get('color') for t in traces}
            self.assertEqual(colours['Observed Depth'],'#ff0000')
            self.assertTrue(any(t.get('line',{}).get('color')=='#0008ff' for t in traces))
            self.assertTrue(any(t.get('type')=='table' for t in traces))

    def test_model_archive_csvs_parse_without_schema_assumptions(self):
        path=ROOT/'sample-data/other/CS2666_Modelled_Data.zip'
        if not path.exists():
            self.skipTest('Binary archive unavailable in this local session; full repository CI exercises it')
        with zipfile.ZipFile(path) as archive, tempfile.TemporaryDirectory() as directory:
            members=[x for x in archive.infolist() if not x.is_dir() and x.filename.lower().endswith(('.csv','.hyd')) and '__MACOSX' not in x.filename]
            self.assertTrue(members)
            for i,member in enumerate(members):
                # Never extract untrusted archive paths into the working tree.
                target=Path(directory)/('model_'+str(i)+Path(member.filename).suffix)
                with archive.open(member) as source,target.open('wb') as out:
                    shutil.copyfileobj(source,out)
                parsed=parse_file(target)
                self.assertGreater(len(parsed.frame),0,member.filename)
                self.assertIn('timestamp',parsed.frame)
                self.assertGreater(len(parsed.frame.columns),1,member.filename)
                target.unlink()


if __name__=='__main__':
    unittest.main()
