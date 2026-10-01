import json
import csv

import pytest

from icm_workbench import advanced_api as api


def report(tmp_path, name, rows, mapping, **extra):
    path=tmp_path/name
    with path.open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    return dict(path=str(path),mapping=dict(mapping),name=name,unit='m³',duration_unit='h',datum='AOD',
                scope='30-year matched storm set',period_start='2025-01-01',period_end='2026-01-01',template='UK12/24 same threshold/integral',**extra)


def calculate(kind,a,b,**kwargs):
    assert callable(getattr(api,'detriment_result',None)), 'detriment_result is not implemented'
    criteria=dict(scope_confirmed=True,threshold=5,freeboard_required=None,counting_mode='summary')
    criteria.update(kwargs.pop('criteria',{}))
    return json.loads(api.detriment_result(kind,json.dumps(a),json.dumps(b),json.dumps(criteria),**kwargs))


def floods(tmp_path, a='2', b='8', asset='001'):
    mapping={'asset_id':'Node ID','value':'Flood volume (m³)','critical_simulation':'Simulation'}
    return [report(tmp_path,n,[{'Node ID':asset,'Flood volume (m³)':v,'Simulation':s}],mapping) for n,v,s in [('a.csv',a,'30y-60min'),('b.csv',b,'30y-120min')]]


def test_flooding_change_retains_id_and_critical_simulations(tmp_path):
    r=calculate('flooding',*floods(tmp_path))
    row=r['rows'][0]
    assert row['asset_id']=='001'
    assert (row['a'],row['b'],row['delta'])==(2,8,6)
    assert row['status']=='detriment'
    assert row['critical_a']=='30y-60min' and row['critical_b']=='30y-120min'
    assert r['summary']['detriment']==1


@pytest.mark.parametrize('a,b,threshold,status,flag', [('0','.4',5,'risk','new_flooding'),('2','7',5,'risk','increase_within_tolerance'),('10','3',5,'improvement','improvement'),('2','2',0,'unchanged','unchanged')])
def test_flood_threshold_boundaries_and_improvements(tmp_path,a,b,threshold,status,flag):
    row=calculate('flooding',*floods(tmp_path,a,b),criteria={'threshold':threshold})['rows'][0]
    assert row['status']==status and flag in row['flags']


def test_outer_join_does_not_turn_missing_asset_into_zero(tmp_path):
    a,b=floods(tmp_path);b['path']=report(tmp_path,'other.csv',[{'Node ID':'002','Flood volume (m³)':'8'}],b['mapping'])['path']
    rows=calculate('flooding',a,b)['rows']
    assert len(rows)==2
    assert rows[0]['a']==2 and rows[0]['b'] is None and rows[0]['delta'] is None
    assert rows[1]['a'] is None and rows[1]['b']==8
    assert all(x['status']=='unmatched' for x in rows)


def test_duplicate_summary_ids_are_rejected(tmp_path):
    a,b=floods(tmp_path)
    a['path']=report(tmp_path,'dup.csv',[{'Node ID':'001','Flood volume (m³)':'2'}]*2,a['mapping'])['path']
    with pytest.raises(ValueError,match='[Dd]uplicate'):calculate('flooding',a,b)


@pytest.mark.parametrize('bad',['','—','NaN','inf','1,25'])
def test_missing_and_invalid_numeric_values_are_unavailable(tmp_path,bad):
    row=calculate('flooding',*floods(tmp_path,b=bad))['rows'][0]
    assert row['status']=='unavailable' and row['b'] is None and row['delta'] is None


def test_large_report_volume_is_not_a_timeseries_sentinel(tmp_path):
    row=calculate('flooding',*floods(tmp_path,b='9999'))['rows'][0]
    assert row['b']==9999 and row['status']=='detriment'


def levels(tmp_path,a='99.35',b='99.65',ground='100'):
    mapping={'asset_id':'ID','value':'Max level (m)','ground':'Ground level (m)'}
    sources=[report(tmp_path,n,[{'ID':'MH01','Max level (m)':v,'Ground level (m)':ground}],mapping) for n,v in [('la.csv',a),('lb.csv',b)]]
    for s in sources:s['unit']='m'
    return sources


def test_level_rise_and_new_freeboard_breach_are_independent(tmp_path):
    row=calculate('level',*levels(tmp_path),criteria={'threshold':.15,'freeboard_required':.5})['rows'][0]
    assert row['delta']==pytest.approx(.3)
    assert row['freeboard_a']==pytest.approx(.65) and row['freeboard_b']==pytest.approx(.35)
    assert {'level_detriment','new_freeboard_breach'}<=set(row['flags'])


def test_existing_freeboard_breach_improving_is_not_new_detriment(tmp_path):
    row=calculate('level',*levels(tmp_path,'99.70','99.60'),criteria={'threshold':.15,'freeboard_required':.5})['rows'][0]
    assert row['status']=='risk' and 'existing_breach_improving' in row['flags']
    assert row['freeboard_b']==pytest.approx(.4)


def test_missing_ground_does_not_hide_valid_level_detriment(tmp_path):
    a,b=levels(tmp_path,ground='')
    row=calculate('level',a,b,criteria={'threshold':.15,'freeboard_required':.5})['rows'][0]
    assert row['status']=='detriment' and 'freeboard_unavailable' in row['flags']
    assert row['freeboard_b'] is None


def test_separate_ground_table_and_mm_levels_convert_once(tmp_path):
    a,b=levels(tmp_path,'99350','99650',ground='')
    for s in [a,b]:s['mapping']['value']='Water elevation (mm)';s['unit']='mm'
    for name,s,value in [('ma.csv',a,'99350'),('mb.csv',b,'99650')]:
        s['path']=report(tmp_path,name,[{'ID':'MH01','Water elevation (mm)':value}],{'asset_id':'ID','value':'Water elevation (mm)'})['path'];s['mapping'].pop('ground')
    g=report(tmp_path,'ground.csv',[{'ID':'MH01','GL':'100'}],{'asset_id':'ID','ground':'GL'});g['unit']='m'
    row=calculate('level',a,b,criteria={'threshold':.15,'freeboard_required':.5},ground_json=json.dumps(g))['rows'][0]
    assert row['delta']==pytest.approx(.3) and row['freeboard_b']==pytest.approx(.35)


def test_incompatible_datums_and_depth_columns_are_rejected(tmp_path):
    a,b=levels(tmp_path);b['datum']='AD'
    with pytest.raises(ValueError,match='datum'):calculate('level',a,b)
    b['datum']='AOD';a['mapping']['value']='Maximum depth (m)'
    a['path']=report(tmp_path,'depth.csv',[{'ID':'MH01','Maximum depth (m)':'1'}],a['mapping'])['path']
    with pytest.raises(ValueError,match='elevation|depth'):calculate('level',a,b)


def spills(tmp_path,nb='15',tb='22'):
    mapping={'asset_id':'CSO ID','count':'Spill count','duration':'Total duration of exceedances (h)'}
    return [report(tmp_path,n,[{'CSO ID':'CSO01','Spill count':count,'Total duration of exceedances (h)':duration}],mapping) for n,count,duration in [('sa.csv','12','18'),('sb.csv',nb,tb)]]


def test_spill_count_and_duration_increases_are_separate(tmp_path):
    row=calculate('spill',*spills(tmp_path))['rows'][0]
    assert row['delta']==3 and row['duration_delta_hours']==4
    assert {'spill_count_detriment','duration_increase'}<=set(row['flags'])


def test_reduced_count_with_longer_duration_is_mixed_risk(tmp_path):
    row=calculate('spill',*spills(tmp_path,'10','24'))['rows'][0]
    assert row['delta']==-2 and row['duration_delta_hours']==6
    assert row['status']=='risk' and 'mixed_result' in row['flags']


def test_spill_period_and_template_mismatch_block_comparison(tmp_path):
    a,b=spills(tmp_path);b['period_end']='2026-02-01'
    with pytest.raises(ValueError,match='period'):calculate('spill',a,b)
    b['period_end']=a['period_end'];b['template']='different integral'
    with pytest.raises(ValueError,match='template'):calculate('spill',a,b)


def test_detail_only_requires_explicit_counting_semantics(tmp_path):
    mapping={'asset_id':'CSO ID','duration':'Exceedance duration (mins)','start':'Start of exceedance (Absolute)'}
    a=report(tmp_path,'da.csv',[{'CSO ID':'CSO01','Exceedance duration (mins)':'60','Start of exceedance (Absolute)':'2025-01-01 00:00'}],mapping)
    b=report(tmp_path,'db.csv',[{'CSO ID':'CSO01','Exceedance duration (mins)':'60','Start of exceedance (Absolute)':'2025-01-01 00:00'},{'CSO ID':'CSO01','Exceedance duration (mins)':'120','Start of exceedance (Absolute)':'2025-02-01 00:00'}],mapping)
    for s in [a,b]:s['report_kind']='spill_detail';s['duration_unit']='min'
    with pytest.raises(ValueError,match='Summary|counting'):calculate('spill',a,b)
    row=calculate('spill',a,b,criteria={'counting_mode':'block-rows'})['rows'][0]
    assert row['delta']==1 and row['duration_delta_hours']==2
    assert len(row['details_b'])==2


def test_report_parser_reads_icm_preamble_and_pasted_tsv(tmp_path):
    path=tmp_path/'grid.csv';path.write_text('Worst Case Report\nNode ID\tFlood volume (m³)\tSimulation\n001\t8\t30y-60min\n')
    assert callable(getattr(api,'parse_detriment_report',None)), 'report adapter is not implemented'
    r=json.loads(api.parse_detriment_report(str(path),'flooding'))
    assert r['metadata']['source_kind']=='detriment_report'
    assert r['preview_rows'][0]['Node ID']=='001'
    assert r['metadata']['mapping_suggestions']['value']=='Flood volume (m³)'
    assert r['start'] is None and r['end'] is None


def test_scope_confirmation_and_invalid_tolerance_block_comparison(tmp_path):
    a,b=floods(tmp_path)
    with pytest.raises(ValueError,match='confirm'):calculate('flooding',a,b,criteria={'scope_confirmed':False})
    with pytest.raises(ValueError,match='threshold|tolerance'):calculate('flooding',a,b,criteria={'threshold':-1})
