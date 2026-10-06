"""Structural, metadata and independent numerical checks for synthetic fixtures."""
import hashlib
import json
import zipfile
from pathlib import Path
import numpy as np
from icm_workbench.parsers import parse_file
from icm_workbench.analysis.survey_context import normalise_association_table
from scripts.reference_workflow_simulation import _xlsx_first_sheet

ROOT=Path(__file__).resolve().parents[2]
REF=ROOT/'reference/current-tool'
MANIFEST=json.loads((REF/'synthetic-manifest.json').read_text())


def test_every_generated_data_file_matches_its_manifest():
    for relative,digest in MANIFEST['files'].items():
        assert hashlib.sha256((REF/relative).read_bytes()).hexdigest()==digest,relative
    for path in REF.rglob('*.zip'):
        with zipfile.ZipFile(path) as z:
            assert not z.comment
            assert len(z.namelist())==1
            assert all(not i.extra and not i.comment and not i.filename.startswith('/') and '..' not in i.filename for i in z.infolist())


def test_workbook_relationships_are_complete_and_acyclic():
    headers,rows=_xlsx_first_sheet(REF/'sample-data/rainfall/fm_rg_assoc.xlsx')
    result=normalise_association_table(headers,rows)
    assert not result['issues']
    records=result['records']
    assert len(records)==len(MANIFEST['monitors'])
    lookup={r['monitor']:r for r in records}
    assert set(lookup)==set(MANIFEST['monitors'])
    assert {r['rain_gauge'] for r in records}==set(MANIFEST['associated_gauges'])
    def visit(name,path):
        assert name not in path
        for upstream in lookup[name]['upstream']:visit(upstream,path+[name])
    for r in records:
        assert r['diameter_mm']>0
        assert (REF/f"sample-data/fdv/{r['monitor']}.fdv").exists()
        assert (REF/f"sample-data/rainfall/{r['rain_gauge']}.R").exists()
        visit(r['monitor'],[])


def test_generated_hydraulics_follow_circular_pipe_area_with_rounding_tolerance():
    for monitor,_,diameter,_ in MANIFEST['association_rows']:
        f=parse_file(REF/f'sample-data/fdv/{monitor}.fdv').frame
        d=diameter/1000
        theta=2*np.arccos(np.clip(1-2*f.depth.to_numpy()/d,-1,1))
        expected=d*d/8*(theta-np.sin(theta))*f.velocity.to_numpy()
        # Integer L/s and mm plus 2-decimal velocity introduce quantisation.
        assert np.max(np.abs(f.flow.to_numpy()-expected))<.002


def test_gauge_totals_match_independent_raw_fixture_arithmetic():
    for gauge in MANIFEST['gauges']:
        parsed=parse_file(REF/f'sample-data/rainfall/{gauge}.R')
        actual=float(parsed.frame.rainfall.sum())*parsed.metadata['interval_min']/60
        assert abs(actual-MANIFEST['rainfall_statistics'][gauge]['total'])<1e-8


def test_runtime_sources_do_not_load_reference_fixtures():
    for root in [ROOT/'src',ROOT/'web/assets']:
        for path in root.rglob('*'):
            if path.suffix in ['.js','.py','.html']:
                text=path.read_text(encoding="utf-8")
                assert 'reference/current-tool' not in text,path
                for name in MANIFEST['monitors']+MANIFEST['gauges']+[MANIFEST['station']]:
                    assert name not in text,path
