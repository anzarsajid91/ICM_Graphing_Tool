# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
import json

import numpy as np
import pandas as pd
import pytest

from icm_workbench.analysis.series_quality import clock_candidates, inspect_series
from icm_workbench.browser_api import inspect_local_series


def make_frame(seconds, values):
    time = pd.Timestamp("2025-01-01") + pd.to_timedelta(seconds, unit="s")
    return pd.DataFrame({"timestamp":time,"value":values})


def test_reports_distinct_flags_and_preserves_original_data():
    frame=make_frame([0,60,120,180,240,300,360,360,480,510,570,630],
                     [1,1.04,1.03,1,5,1,np.nan,2,2,-1,-1,-1])
    original=frame.copy()
    quality=inspect_series(frame,"value",expected_step_s=60,jitter_s=0,flat_amplitude=.05,flat_seconds=120,
                           change_limit=3,lower=0,upper=3)
    assert quality["diagnostics_by_kind"]=={
        "duplicate-timestamp":1,"missing-values":1,"long-timestep":1,"short-timestep":1,
        "flatline":2,"isolated-spike":1,"abrupt-change":2,"below-screening-bound":1,"above-screening-bound":1,
    }
    flat = [row for row in quality["findings"] if row["kind"]=="flatline"]
    assert flat[0]["end"]=="2025-01-01T00:03:00"
    assert flat[0]["observed"]==pytest.approx(.04)
    pd.testing.assert_frame_equal(frame,original)


def test_flatlining_cannot_bridge_a_gap_or_accumulate_slow_drift():
    frame=make_frame([0,60,120,180,300,360,420], [0,.04,.08,.12,.12,.12,.12])
    quality=inspect_series(frame,"value",expected_step_s=60,jitter_s=1,flat_amplitude=.05,flat_seconds=120)
    rows=[row for row in quality["findings"] if row["kind"]=="flatline"]
    assert len(rows)==1
    assert rows[0]["start"]=="2025-01-01T00:05:00"


def test_clock_candidate_uses_exact_matches_and_reports_potential_drift():
    samples = np.random.default_rng(30).normal(size=220)
    times = np.arange(len(samples))*60
    primary=make_frame(times,samples)
    reference=make_frame(times+np.where(times<6600,120,180),samples)
    result=clock_candidates(primary,reference,"value","value",60,6)
    assert result["status"]=="review-candidates"
    assert result["early"]["best"]["reference_shift_s"]==-120
    assert result["late"]["best"]["reference_shift_s"]==-180
    assert result["change_in_candidate_shift_s"]==-60
    assert result["early"]["best"]["correlation"]==pytest.approx(1)
    assert result["early"]["best"]["sample_pairs"]>90
    quiet=make_frame(times,np.ones(len(times)))
    assert clock_candidates(quiet,quiet,"value","value",60,6)["status"]=="inconclusive"


def test_browser_contract_rejects_thresholds_when_units_unresolved(tmp_path):
    file=tmp_path/"untagged.csv"
    file.write_text("Timestamp,Reading\n2025-01-01 00:00,1\n2025-01-01 00:01,4\n")
    timing=dict(expected_step_s=60,jitter_s=1)
    result=json.loads(inspect_local_series(file,"Reading",timing))
    assert result["source_contract"]["canonical_unit"] is None
    with pytest.raises(ValueError,match="Confirm source quantity and units"):
        inspect_local_series(file,"Reading",dict(timing,lower=0,upper=3))


@pytest.mark.parametrize("settings",[{"jitter_s":60},{"flat_amplitude":0.1},{"lower":5,"upper":2}])
def test_invalid_user_criteria_are_rejected(settings):
    frame=make_frame([0,60,120],[1,1,1])
    options=dict(expected_step_s=60,jitter_s=0,**{k:v for k,v in settings.items() if k!="jitter_s"})
    options.update(settings)
    with pytest.raises(ValueError,match="Review the paired"):
        inspect_series(frame,"value",**options)
