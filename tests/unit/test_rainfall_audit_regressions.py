"""Synthetic physical-equivalence and validity cases from the October audit."""
import json

import pandas as pd
import pytest

from icm_workbench import advanced_api
from icm_workbench.analysis.events import detect_rainfall_events
from icm_workbench.analysis.exclusions import ExclusionPeriod
from icm_workbench.analysis.rainfall import daily_rainfall_support, rainfall_accumulation
from icm_workbench.analysis.review import dry_weather_flow


def rain_file(tmp_path, unit='mm', value=1, periods=12, interval=5):
    end = pd.Timestamp('2026-01-01') + pd.Timedelta(minutes=(periods-1)*interval)
    source = tmp_path / (unit.replace('/', '-') + '.R')
    source.write_text(
        f'**FIELD: 1,RAINFALL\n**UNITS: 1,{unit}\n'
        f'**CONSTANTS: 3,START,END,INTERVAL\n*CSTART\n2601010000 {end:%y%m%d%H%M} {interval}\n*CEND\n'
        + ' '.join([str(value)]*periods) + '\n'
    )
    return str(source)


def test_cumulative_bridge_resolves_declared_incremental_depth(tmp_path):
    result = json.loads(advanced_api.cumulative_rainfall_series(rain_file(tmp_path)))
    assert result['final_total_mm'] == pytest.approx(12)
    assert result['rainfall_semantics'] == 'incremental_depth'
    assert result['complete']
    assert 'incremental' in result['integration_method']


def test_cross_gauge_bridge_honours_each_source_semantics(tmp_path):
    sources = [dict(path=rain_file(tmp_path, unit, value, 288), column='rainfall', name=unit,
                    rainfall_semantics=semantics)
               for unit, value, semantics in [('mm', 1, 'incremental_depth'), ('mm/h', 12, 'intensity')]]
    result = json.loads(advanced_api.multi_gauge_rainfall_result(json.dumps(sources)))
    assert result['daily'][0]['network_mean_depth_mm'] == pytest.approx(288)
    assert result['daily'][0]['spatial_cv_percent'] == pytest.approx(0)


def test_cumulative_rejects_unresolved_semantics(tmp_path):
    source = tmp_path/'unknown.csv'
    source.write_text('Time,Value\n2026-01-01 00:00,1\n2026-01-01 00:05,1\n')
    with pytest.raises(ValueError, match='[Ss]emantics|interpretation'):
        advanced_api.cumulative_rainfall_series(str(source), 'Value')


@pytest.mark.parametrize('semantics,value', [('intensity', 12), ('incremental_depth', 1)])
def test_events_use_physical_intensity_for_threshold_and_peak(semantics, value):
    frame = pd.DataFrame({'timestamp': pd.date_range('2026-01-01', periods=12, freq='5min'), 'rainfall': value})
    events = detect_rainfall_events(frame, semantics=semantics, declared_interval_minutes=5)
    assert len(events) == 1
    assert events[0]['total_depth_mm'] == pytest.approx(12)
    assert events[0]['peak_intensity'] == pytest.approx(12)
    assert events[0]['intensity_streak_min'] == pytest.approx(60)


def test_exclusion_preserves_incremental_intensity_basis():
    frame = pd.DataFrame({'timestamp': pd.to_datetime(['2026-01-01']), 'rainfall': [1.]})
    events = detect_rainfall_events(frame, semantics='incremental_depth', declared_interval_minutes=5,
        exclusions=[ExclusionPeriod(pd.Timestamp('2026-01-01 00:02'), pd.Timestamp('2026-01-01 00:03'), 'synthetic exclusion')],
        minimum_intensity=10, minimum_intensity_duration_min=1, minimum_depth_mm=0,
        minimum_event_duration_min=0)
    assert len(events) == 2
    assert [e['peak_intensity'] for e in events] == pytest.approx([12,12])
    assert sum(e['total_depth_mm'] for e in events) == pytest.approx(.8)


@pytest.mark.parametrize('semantics', ['intensity', 'incremental_depth'])
def test_negative_rainfall_is_invalid_not_complete_dry_support(semantics):
    frame = pd.DataFrame({'timestamp': pd.date_range('2026-01-01', periods=24, freq='h'), 'rainfall': -1.})
    result = rainfall_accumulation(frame, 'rainfall', semantics=semantics, declared_interval_minutes=60)
    assert result['status'] == 'unavailable'
    assert result['total_depth_mm'] is None
    assert result['validity']['invalid_seconds'] == 86400
    assert result['segments']['value'].eq(-1).all()  # Preserve raw evidence.
    day = daily_rainfall_support(frame, 'rainfall', semantics=semantics, declared_interval_minutes=60).iloc[0]
    assert day.coverage_fraction == 0
    assert day.invalid_seconds == 86400
    assert day.status == 'unavailable'


def test_negative_rainfall_cannot_qualify_dwf():
    rain = pd.DataFrame({'timestamp': pd.date_range('2026-01-01', periods=7*24, freq='h'), 'rainfall': -1.})
    flow = pd.DataFrame({'timestamp': pd.date_range('2026-01-01', periods=7*96+1, freq='15min'), 'flow': .1})
    result = dry_weather_flow(flow, 'flow', rain, rain_interval_min=60)
    assert result['available'] != 'Yes'
    assert result['dry_days_used'] == 0


@pytest.mark.parametrize('semantics,unit,value', [('intensity','mm/h',12), ('incremental_depth','mm',1)])
def test_event_window_intersects_native_support(tmp_path, semantics, unit, value):
    result = json.loads(advanced_api.rainfall_event_scaled(rain_file(tmp_path,unit,value), 'rainfall',
        rainfall_semantics=semantics, start='2026-01-01T00:02', end='2026-01-01T00:08',
        minimum_intensity=10, minimum_intensity_duration_min=6, minimum_depth_mm=0,
        minimum_event_duration_min=6))
    assert result['count'] == 1
    event = result['events'][0]
    assert event['start'] == '2026-01-01T00:02:00'
    assert event['end'] == '2026-01-01T00:08:00'
    assert event['duration_min'] == 6
    assert event['total_depth_mm'] == pytest.approx(1.2)
    assert event['peak_intensity'] == pytest.approx(12)


def test_professional_survey_uses_equivalent_rainfall_sources(tmp_path):
    flow = tmp_path/'flow.csv'
    flow.write_text('Time,Flow (m3/s)\n' + '\n'.join(
        f'{t:%Y-%m-%d %H:%M:%S},0.1' for t in pd.date_range('2026-01-01', periods=289, freq='5min')))
    results = []
    for unit, value in [('mm',1), ('mm/h',12)]:
        source = rain_file(tmp_path,unit,value,288)
        results.append(json.loads(advanced_api.professional_flow_survey_result(
            flow_path=str(flow),flow_col='Flow (m3/s)',rain_path=source,
            network_sources_json=json.dumps([dict(path=source,column='rainfall',name='synthetic')]))))
    assert results[0]['network']['daily'] == results[1]['network']['daily']


def test_event_window_crosses_midnight_without_changing_depth_basis():
    frame = pd.DataFrame({'timestamp': pd.to_datetime(['2026-01-01 23:55', '2026-01-02 00:00']), 'rainfall': [1.,1.]})
    events = detect_rainfall_events(frame, semantics='incremental_depth', declared_interval_minutes=5,
        start='2026-01-01 23:58', end='2026-01-02 00:03', minimum_intensity=12,
        minimum_intensity_duration_min=5, minimum_depth_mm=1, minimum_event_duration_min=5)
    assert len(events) == 1
    assert events[0]['total_depth_mm'] == pytest.approx(1)
    assert events[0]['intensity_streak_min'] == 5


def test_negative_support_terminates_event_and_conserves_coverage():
    frame = pd.DataFrame({'timestamp': pd.date_range('2026-01-01', periods=3, freq='5min'), 'rainfall': [1.,-1.,1.]})
    result = rainfall_accumulation(frame, 'rainfall', semantics='incremental_depth', declared_interval_minutes=5)
    assert result['status'] == 'partial'
    assert result['total_depth_mm'] == 2
    assert result['validity']['invalid_seconds'] == 300
    assert sum(result['validity']['states'].values()) == 900
    events = detect_rainfall_events(frame, semantics='incremental_depth', declared_interval_minutes=5,
        minimum_intensity=5, minimum_intensity_duration_min=0, minimum_depth_mm=0, minimum_event_duration_min=0)
    assert len(events) == 2


def test_declared_intensity_at_threshold_survives_uneven_window_clip():
    frame = pd.DataFrame({'timestamp': pd.to_datetime(['2026-01-01']), 'rainfall': [5.]})
    events = detect_rainfall_events(frame, semantics='intensity', declared_interval_minutes=1,
        start='2026-01-01 00:00:01', end='2026-01-01 00:00:24', minimum_intensity=5,
        minimum_intensity_duration_min=23/60, minimum_depth_mm=0, minimum_event_duration_min=0)
    assert len(events) == 1
    assert events[0]['peak_intensity'] == 5


def test_incremental_intensity_at_threshold_keeps_original_support():
    frame = pd.DataFrame({'timestamp': pd.to_datetime(['2026-01-01']), 'rainfall': [1.]})
    events = detect_rainfall_events(frame, semantics='incremental_depth', declared_interval_minutes=5,
        start='2026-01-01 00:00:01', end='2026-01-01 00:00:42', minimum_intensity=12,
        minimum_intensity_duration_min=41/60, minimum_depth_mm=0, minimum_event_duration_min=0)
    assert len(events) == 1
    assert events[0]['peak_intensity'] == 12
