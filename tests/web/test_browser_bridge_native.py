import importlib.util, json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('browser_bridge',ROOT/'web'/'python_bridge.py')
bridge=importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)

def test_bridge_parses_demo_and_preserves_sentinel_missingness():
    meta=json.loads(bridge.parse_source(str(ROOT/'examples'/'demo'/'observed.csv')))
    assert meta['rows']==8
    assert {'depth','flow','velocity'}.issubset(meta['columns'])
    assert meta['audit']['column_audit']['depth']['sentinel_count']==1

def test_bridge_compare_and_spills():
    obs=str(ROOT/'examples'/'demo'/'observed.csv'); model=str(ROOT/'examples'/'demo'/'model.csv')
    cmp=json.loads(bridge.compare_series(obs,'depth',model,'depth',max_gap_seconds=300))
    assert cmp['metrics']['pairs']>=6
    assert cmp['metrics']['rmse'] is not None
    spills=json.loads(bridge.spill_result(obs,'depth',1.0,'[]',max_gap_seconds=300))
    assert spills['total_spill_count']>=0
    assert spills['count_status'] in {'definitive','partial/unknown-gap'}
