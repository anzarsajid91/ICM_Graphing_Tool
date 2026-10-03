import pandas as pd
from icm_workbench.analysis.survey_assessment import _gauge_weekly_rows


def test_gauge_weekly_support_keeps_dry_missing_and_fault_evidence_distinct():
    days = pd.date_range('2026-09-07', periods=14, freq='D')
    daily = pd.DataFrame({'coverage_fraction': [1.] * 7 + [0.] * 7,
                          'depth_mm': [0.] * 14}, index=days)
    rows = _gauge_weekly_rows({'RG01': daily}, [])
    assert [r['rag'] for r in rows] == ['Green', 'Grey']
    assert rows[0]['week_ending'] == pd.Timestamp('2026-09-13')
    assert rows[0]['operational_days'] == 7
    assert rows[1]['operational_days'] == 0
    faults = [{'gauge': 'RG01', 'day': days[2], 'strike': True, 'status': 'Operational'}]
    assert _gauge_weekly_rows({'RG01': daily}, faults)[0]['rag'] == 'Amber'


def test_gauge_weekly_review_does_not_attribute_network_cv_to_one_gauge():
    days = pd.date_range('2026-09-07', periods=7, freq='D')
    daily = pd.DataFrame({'coverage_fraction': [1.] * 7, 'depth_mm': [5.] * 7}, index=days)
    result = _gauge_weekly_rows({'RG01': daily}, [])
    assert result[0]['rain_total_mm'] == 35
    assert result[0]['rag'] == 'Green'
    assert result[0]['end'] == pd.Timestamp('2026-09-14')
