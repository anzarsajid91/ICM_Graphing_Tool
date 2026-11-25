"""DE-02 independent references: constant q * shared seconds, signed linear areas."""
from datetime import datetime

import pandas as pd
import pytest

from icm_workbench.analysis.survey_context import survey_volume_balance
from icm_workbench.domain import ExclusionPeriod


def frame(seconds, values=0.1):
    return pd.DataFrame({'timestamp': pd.Timestamp('2026-01-05') + pd.to_timedelta(seconds, unit='s'), 'flow': values})


def run(exclusions=None, flows=None, **kwargs):
    return survey_volume_balance(flows or {'UP':frame([0,60,120,180,240]),'DOWN':frame([0,60,120,180,240])}, [{'monitor':'DOWN','upstream':['UP']}], start='2026-01-05',end='2026-01-05T00:04:00',exclusions_by_monitor=exclusions,max_gap_seconds=120,**kwargs)


def exc(a,b):
    return ExclusionPeriod(datetime.fromisoformat('2026-01-05T00:'+a),datetime.fromisoformat('2026-01-05T00:'+b),'approved QA')


def test_full_aligned_requested_support():
    row=run()['rows'][0]
    assert row['downstream_volume_m3']==pytest.approx(24)
    assert row['upstream_sum_m3']==pytest.approx(24)
    assert row['balance_ratio']==pytest.approx(1)
    assert row['common_valid_seconds']==240
    assert row['requested_seconds']==240
    assert row['rag']=='Green'


@pytest.mark.parametrize('subject',['UP','DOWN'])
def test_one_sided_exclusion_is_aligned_diagnostic_not_formal_decision(subject):
    result=run({subject:[exc('00:00','02:00')]})
    row=result['rows'][0]
    assert row['downstream_volume_m3']==pytest.approx(12)
    assert row['upstream_sum_m3']==pytest.approx(12)
    assert row['balance_ratio']==pytest.approx(1)
    assert row['common_valid_seconds']==120
    assert row['requested_seconds']==240
    assert row['requested_coverage_fraction']==0.5
    assert row['eligible_retained_seconds']==120
    assert row['rag']=='Grey'
    assert row['formal_decision_eligible'] is False
    assert row['likely_source']=='Common support requires review'
    assert 'common' in row['recommendation'].lower()
    by={x['monitor']:x for x in result['monitor_weeks']}
    assert by[subject]['excluded_seconds']==120
    assert by['DOWN' if subject=='UP' else 'UP']['excluded_seconds']==0


def test_symmetric_approved_exclusion_preserves_retained_period_green():
    row=run({'UP':[exc('00:00','02:00')],'DOWN':[exc('00:00','02:00')]})['rows'][0]
    assert row['balance_ratio']==pytest.approx(1)
    assert row['rag']=='Green'
    assert row['decision_basis']=='complete-approved-retained-period'
    assert row['requested_coverage_fraction']==0.5
    assert row['retained_coverage_fraction']==1


def test_disjoint_support_has_no_ratio():
    row=run({'UP':[exc('00:00','02:00')],'DOWN':[exc('02:00','04:00')]})['rows'][0]
    assert row['common_valid_seconds']==0
    assert row['balance_ratio'] is None
    assert row['downstream_volume_m3'] is None
    assert row['rag']=='Grey'


def test_multiple_tributaries_unequal_steps_linear_interpolation_and_missing_downstream():
    flows={'UP':frame([0,120,240],[0,0.2,0.4]),'UP2':frame([0,80,160,240],0.1),'DOWN':frame([0,60,120,180,240],[0.1,0.2,0.3,0.4,float('nan')])}
    result=survey_volume_balance(flows,[{'monitor':'DOWN','upstream':['UP','UP2']}],start='2026-01-05',end='2026-01-05T00:04:00',max_gap_seconds=120)
    row=result['rows'][0]
    # Shared 0..180 s: UP triangle 27 + UP2 rectangle 18 = DOWN trapezoid45.
    assert row['common_valid_seconds']==180
    assert row['downstream_volume_m3']==pytest.approx(45)
    assert row['upstream_sum_m3']==pytest.approx(45)
    assert row['balance_ratio']==pytest.approx(1)
    assert row['requested_coverage_fraction']==0.75
    assert row['rag']=='Grey'


def test_week_boundary_clips_signed_linear_support_without_sample_loss():
    origin=pd.Timestamp('2026-01-11T23:58:00')
    flows={name:pd.DataFrame({'timestamp':origin+pd.to_timedelta([0,60,120,180,240],unit='s'),'flow':-0.1}) for name in ['UP','DOWN']}
    rows=survey_volume_balance(flows,[{'monitor':'DOWN','upstream':['UP']}],max_gap_seconds=90)['rows']
    assert len(rows)==2
    for row in rows:
        assert row['common_valid_seconds']==120
        assert row['downstream_volume_m3']==pytest.approx(-12)
        assert row['upstream_sum_m3']==pytest.approx(-12)
        assert row['rag']=='Grey'  # preserve non-positive upstream rule
