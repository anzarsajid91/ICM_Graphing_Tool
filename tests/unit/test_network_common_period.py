import pandas as pd
import numpy as np
import pytest
from icm_workbench.analysis.network_spills import common_period_assessment
from icm_workbench.analysis.spills import spill_assessment
from icm_workbench.domain import ExclusionPeriod
from datetime import datetime


def frame():
    t = pd.date_range('2023-12-01', '2025-01-01', freq='h')
    return pd.DataFrame({'timestamp': t, 'flow': np.zeros(len(t))})


def test_common_counts_keep_original_counting_phase():
    x = frame()
    x.loc[(x.timestamp >= '2024-03-31T20:00') & (x.timestamp < '2024-04-01T08:00'), 'flow'] = 2
    a, b = '2024-04-01T00:00', '2024-07-01T00:00'
    out = common_period_assessment(x, 'flow', 1, a, b, max_gap_seconds=3700)
    full = spill_assessment(x, 'flow', 1, max_gap_seconds=3700)
    expected = sum(pd.Timestamp(a) <= pd.Timestamp(t) < pd.Timestamp(b)
                   for row in full['counting_windows'].to_dict('records') for t in row['count_timestamps'])
    assert out['spill_count'] == expected == 0
    assert out['duration_hours'] == pytest.approx(7.5)
    assert out['eligible'] and out['count_status'] == 'definitive'
    # Starting the engine at the window would incorrectly create a new count.
    clipped = spill_assessment(x, 'flow', 1, start=a, end=b, max_gap_seconds=3700)
    assert clipped['total_spill_count'] == 1


def test_common_zero_gap_and_exclusions_remain_distinct():
    x = frame()
    out = common_period_assessment(x, 'flow', 0, '2024-01-01', '2025-01-01', comparison='gt', max_gap_seconds=3700)
    assert out['spill_count'] == out['duration_hours'] == 0
    x.loc[x.timestamp == '2024-04-01', 'flow'] = np.nan
    out = common_period_assessment(x, 'flow', 0, '2024-01-01', '2025-01-01', comparison='gt', max_gap_seconds=3700)
    assert out['unknown_hours'] == 2
    assert out['count_status'] == 'partial/unknown-gap'
    exc = ExclusionPeriod(datetime(2024, 5, 1), datetime(2024, 5, 2), 'fault')
    out = common_period_assessment(frame(), 'flow', 0, '2024-01-01', '2025-01-01', comparison='gt', max_gap_seconds=3700, exclusions=[exc])
    assert out['excluded_hours'] == 24
    assert out['count_status'] == 'partial/excluded-window'


def test_common_short_and_invalid_windows():
    out = common_period_assessment(frame(), 'flow', 0, '2024-01-01', '2024-02-01', comparison='gt', max_gap_seconds=3700)
    assert not out['eligible'] and out['spill_count'] is None
    with pytest.raises(ValueError, match='within one'):
        common_period_assessment(frame(), 'flow', 0, '2023-12-01', '2024-02-01')
    with pytest.raises(ValueError, match='outside'):
        common_period_assessment(frame(), 'flow', 0, '2025-01-01', '2025-04-01')
