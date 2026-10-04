import json
import csv

import pytest

from icm_workbench import advanced_api as api


def report(tmp_path, name, rows, mapping, **extra):
    path=tmp_path/name
    with path.open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    return dict(path=str(path),mapping=dict(mapping),name=name,unit='m³',duration_unit='h',datum='AOD',
                scope='30-year matched storm set',period_start='2025-01-01',period_end='2026-01-01',template='UK12/24 same threshold/integral',**extra)


def calculate(kind,a,b,**kwargs):
    assert callable(getattr(api,'detriment_result',None)), 'detriment_result is not implemented'
    criteria=dict(scope_confirmed=True,elevation_confirmed=True,threshold=5,freeboard_required=None,counting_mode='summary')
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


def test_any_new_flooding_policy_overrides_volume_tolerance(tmp_path):
    row=calculate(
        'flooding',
        *floods(tmp_path,'0','.4'),
        criteria={'threshold':5,'new_flooding_policy':'any_new_flooding'},
    )['rows'][0]
    assert row['status']=='detriment'
    assert {'new_flooding','new_flooding_policy_detriment'}<=set(row['flags'])


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


def test_explicit_either_spill_policy_treats_duration_breach_as_detriment(tmp_path):
    row=calculate(
        'spill',
        *spills(tmp_path,'10','24'),
        criteria={
            'count_tolerance':0,
            'duration_tolerance_hours':1,
            'spill_combination_policy':'either_criterion',
        },
    )['rows'][0]
    assert row['count_status']=='improvement'
    assert row['duration_status']=='detriment'
    assert row['status']=='detriment'


def test_spill_count_and_duration_tolerances_are_independent(tmp_path):
    row=calculate(
        'spill',
        *spills(tmp_path,'13','20'),
        criteria={
            'count_tolerance':2,
            'duration_tolerance_hours':3,
            'spill_combination_policy':'either_criterion',
        },
    )['rows'][0]
    assert row['count_status']=='risk'
    assert row['duration_status']=='risk'
    assert row['status']=='risk'


def test_spill_period_and_template_mismatch_block_comparison(tmp_path):
    a,b=spills(tmp_path);b['period_end']='2026-02-01'
    with pytest.raises(ValueError,match='period'):calculate('spill',a,b)
    b['period_end']=a['period_end'];b['template']='different integral'
    with pytest.raises(ValueError,match='template'):calculate('spill',a,b)


def test_detail_only_requires_explicit_counting_semantics(tmp_path):
    mapping={'asset_id':'CSO ID','duration':'Exceedance duration (mins)','start':'Start of exceedance (Absolute)','end':'End of exceedance (Absolute)'}
    a=report(tmp_path,'da.csv',[{'CSO ID':'CSO01','Exceedance duration (mins)':'60','Start of exceedance (Absolute)':'2025-01-01 00:00','End of exceedance (Absolute)':'2025-01-01 01:00'}],mapping)
    b=report(tmp_path,'db.csv',[{'CSO ID':'CSO01','Exceedance duration (mins)':'60','Start of exceedance (Absolute)':'2025-01-01 00:00','End of exceedance (Absolute)':'2025-01-01 01:00'},{'CSO ID':'CSO01','Exceedance duration (mins)':'120','Start of exceedance (Absolute)':'2025-02-01 00:00','End of exceedance (Absolute)':'2025-02-01 02:00'}],mapping)
    for s in [a,b]:s['report_kind']='spill_detail';s['duration_unit']='min'
    with pytest.raises(ValueError,match='Summary|counting'):calculate('spill',a,b)
    row=calculate('spill',a,b,criteria={'counting_mode':'block-rows'})['rows'][0]
    assert row['delta']==1 and row['duration_delta_hours']==2
    assert len(row['details_b'])==2


def test_report_parser_reads_icm_preamble_and_pasted_tsv(tmp_path):
    path=tmp_path/'grid.csv';path.write_text('Scenario: Baseline\nDatum: AOD\nStorm set: 30-year matched\nWorst Case Report\nNode ID\tFlood volume (m³)\tSimulation\n001\t8\t30y-60min\n')
    assert callable(getattr(api,'parse_detriment_report',None)), 'report adapter is not implemented'
    r=json.loads(api.parse_detriment_report(str(path),'flooding'))
    assert r['metadata']['source_kind']=='detriment_report'
    assert r['preview_rows'][0]['Node ID']=='001'
    assert r['metadata']['mapping_suggestions']['value']=='Flood volume (m³)'
    assert r['metadata']['source_context']['scenario']['value']=='Baseline'
    assert r['metadata']['source_context']['scenario']['basis']=='source_verified'
    assert r['metadata']['source_context']['datum']['value']=='AOD'
    assert r['start'] is None and r['end'] is None


def test_generic_volume_mapping_requires_explicit_flood_measure(tmp_path):
    a,b=floods(tmp_path)
    b['path']=report(tmp_path,'mapped.csv',[{'Identifier':'001','Outcome':'8'}],{'asset_id':'Identifier','value':'Outcome'})['path']
    b['mapping']={'asset_id':'Identifier','value':'Outcome'}
    with pytest.raises(ValueError,match='Declare whether|generic volume'):
        calculate('flooding',a,b)
    b['flood_measure']='flood_volume'
    row=calculate('flooding',a,b)['rows'][0]
    assert row['delta']==6 and row['status']=='detriment'


def test_scope_confirmation_and_invalid_tolerance_block_comparison(tmp_path):
    a,b=floods(tmp_path)
    with pytest.raises(ValueError,match='confirm'):calculate('flooding',a,b,criteria={'scope_confirmed':False})
    with pytest.raises(ValueError,match='threshold|tolerance'):calculate('flooding',a,b,criteria={'threshold':-1})


@pytest.mark.parametrize('kind',['flooding','level','spill'])
@pytest.mark.parametrize('missing',[None,'',' \t\n '])
def test_missing_scope_is_distinct_from_mismatched_scope(tmp_path,kind,missing):
    a,b=floods(tmp_path)
    for slot in ('a','b','both'):
        baseline,proposed=dict(a),dict(b)
        if slot in ('a','both'):baseline['scope']=missing
        if slot in ('b','both'):proposed['scope']=missing
        with pytest.raises(ValueError,match='Enter a common assessment scope'):
            calculate(kind,baseline,proposed)


def test_scope_trims_whitespace_but_rejects_different_storm_sets(tmp_path):
    a,b=floods(tmp_path)
    a['scope']=' 30-year matched storm set \n'
    result=calculate('flooding',a,b)
    assert result['scenario_a']['scope']==result['scenario_b']['scope']=='30-year matched storm set'
    assert result['rows'][0]['delta']==6
    b['scope']='100-year matched storm set'
    with pytest.raises(ValueError,match='scopes must match'):calculate('flooding',a,b)


@pytest.mark.parametrize('kind,column,unit',[('flooding','Flood volume (m)','m³'),('level','Maximum level (m³)','m')])
def test_known_unit_of_wrong_dimension_cannot_be_overridden(tmp_path,kind,column,unit):
    mapping={'asset_id':'ID','value':column}
    a,b=[report(tmp_path,n,[{'ID':'001',column:v}],mapping) for n,v in [('ua.csv','2'),('ub.csv','8')]]
    for s in (a,b):s['unit']=unit
    with pytest.raises(ValueError,match='dimension|incompatible'):calculate(kind,a,b)


def test_inline_ground_datum_must_match_water_level_datum(tmp_path):
    a,b=levels(tmp_path,'99.35','99.30')
    for n,s,v in [('gda.csv',a,'99.35'),('gdb.csv',b,'99.30')]:
        s['mapping']['ground']='Ground level (m AD)'
        s['path']=report(tmp_path,n,[{'ID':'MH01','Max level (m)':v,'Ground level (m AD)':'100'}],s['mapping'])['path']
    with pytest.raises(ValueError,match='datum'):calculate('level',a,b,criteria={'threshold':.15,'freeboard_required':.5})


@pytest.mark.parametrize('field,column',[('count','Number of exceedances'),('duration','Total period of exceedances (h)')])
def test_recognizable_incompatible_spill_statistics_are_rejected(tmp_path,field,column):
    a,b=spills(tmp_path)
    for n,s,c,t in [('xa.csv',a,'12','18'),('xb.csv',b,'15','22')]:
        old=s['mapping'][field];s['mapping'][field]=column
        row={'CSO ID':'CSO01','Spill count':c,'Total duration of exceedances (h)':t};row[column]=row.pop(old)
        s['path']=report(tmp_path,n,row and [row],s['mapping'])['path']
    with pytest.raises(ValueError,match='count|duration|period|statistic'):calculate('spill',a,b)


@pytest.mark.parametrize('start,end',[('2024-01-01 00:00','2024-01-01 01:00'),('2026-01-01 00:00','2026-01-01 01:00'),('2025-12-31 23:00','2026-01-01 01:00'),('bad-date','2025-01-01 01:00'),('2025-01-01 02:00','2025-01-01 01:00')])
def test_detail_period_and_boundary_validation(tmp_path,start,end):
    mapping={'asset_id':'CSO ID','duration':'Duration (h)','start':'Start','end':'End'}
    a,b=[report(tmp_path,n,[{'CSO ID':'CSO01','Duration (h)':'1','Start':start,'End':end}],mapping,report_kind='spill_detail') for n in ['pa.csv','pb.csv']]
    with pytest.raises(ValueError,match='period|date|boundary|end'):calculate('spill',a,b,criteria={'counting_mode':'block-rows'})


def test_detail_year_boundary_exact_end_and_day_first_dates(tmp_path):
    mapping={'asset_id':'CSO ID','duration':'Duration (h)','start':'Start','end':'End'}
    a,b=[report(tmp_path,n,[{'CSO ID':'CSO01','Duration (h)':'1','Start':'31/12/2025 23:00','End':'01/01/2026 00:00'}],mapping,report_kind='spill_detail') for n in ['ya.csv','yb.csv']]
    r=calculate('spill',a,b,criteria={'counting_mode':'block-rows'})
    assert r['rows'][0]['a']==1 and r['rows'][0]['duration_a_hours']==1
    assert r['date_convention']=='ISO or day/month/year model clock'


def test_result_distinguishes_engineer_declared_and_source_verified_context(tmp_path):
    a,b=floods(tmp_path)
    for source,label in ((a,'Baseline'),(b,'Proposed')):
        original=open(source['path'],encoding='utf-8').read()
        open(source['path'],'w',encoding='utf-8').write('Scenario: '+label+'\n'+original)
    result=calculate('flooding',a,b)
    assert result['provenance']['scope']['scenario_a']['basis']=='engineer_declared'
    assert result['provenance']['source_context_a']['scenario']['basis']=='source_verified'
    assert result['provenance']['source_context_a']['scenario']['value']=='Baseline'


def test_export_provenance_retains_optional_detail_sources_and_settings(tmp_path):
    a,b=spills(tmp_path)
    mapping={'asset_id':'CSO ID','duration':'Duration (h)','start':'Start','end':'End'}
    detail=report(tmp_path,'evidence.csv',[{'CSO ID':'CSO01','Duration (h)':'1','Start':'2025-01-01 00:00','End':'2025-01-01 01:00'}],mapping,sha256='detail-fingerprint')
    r=calculate('spill',a,b,detail_b_json=json.dumps(detail))
    assert r['detail_source_b']['sha256']=='detail-fingerprint'
    assert r['detail_source_b']['mapping']==mapping


def test_spill_count_column_cannot_be_a_volume_unit(tmp_path):
    a,b=spills(tmp_path)
    for n,s,c,t in [('cua.csv',a,'12','18'),('cub.csv',b,'15','22')]:
        s['mapping']['count']='Spill count (m³)'
        s['path']=report(tmp_path,n,[{'CSO ID':'CSO01','Spill count (m³)':c,'Total duration of exceedances (h)':t}],s['mapping'])['path']
    with pytest.raises(ValueError,match='dimension|incompatible'):calculate('spill',a,b)
