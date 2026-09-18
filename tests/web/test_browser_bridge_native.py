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
    assert cmp['validity_model']=='validity-v1'
    assert cmp['calculation_status'] in {'complete','partial'}
    assert 0 < cmp['coverage_fraction'] <= 1
    assert cmp['coverage']['validity']['model']=='validity-v1'
    spills=json.loads(bridge.spill_result(obs,'depth',1.0,'[]',max_gap_seconds=300))
    assert spills['total_spill_count']>=0
    assert spills['count_status'] in {'definitive','partial/unknown-gap'}
    assert spills['validity']['model']=='validity-v1'


def test_non_flow_diagnostics_unavailable_and_quantity_mismatch_rejected():
    import pytest
    obs=str(ROOT/'examples'/'demo'/'observed.csv'); model=str(ROOT/'examples'/'demo'/'model.csv')
    r=json.loads(bridge.diagnostic_result(obs,'depth',model,'depth'))
    assert r['flow_diagnostics_available'] is False
    assert r['cumulative']==[]
    with pytest.raises(ValueError,match='matching declared quantities'):
        bridge.compare_series(obs,'depth',model,'flow')


def test_exact_dense_native_values_and_timestamp_gap():
    import pandas as pd
    from types import SimpleNamespace
    bridge.clear_cache()
    t=pd.date_range('2026-01-01',periods=12000,freq='min')
    bridge._CACHE['dense']=SimpleNamespace(frame=pd.DataFrame({'timestamp':t,'level':range(12000)}))
    r=json.loads(bridge.series_data('dense','level',start='2026-01-01T00:00',end='2026-01-01T02:00'))
    assert r['value']==list(range(121))
    assert r['raw_count']==121
    bridge._CACHE['gap']=SimpleNamespace(frame=pd.DataFrame({'timestamp':pd.to_datetime(['2026-01-01T00:00','2026-01-01T00:01','2026-01-01T01:00','2026-01-01T01:01']),'level':[1,1,1,1]}))
    r=json.loads(bridge.series_data('gap','level',max_gap_seconds=120))
    assert r['timestamp'][2] is None
    assert r['value'][2] is None
