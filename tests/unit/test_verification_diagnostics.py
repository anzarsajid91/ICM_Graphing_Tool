# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
import pytest

from icm_workbench.analysis.verification_diagnostics import investigate_calibration


LIMITS = {"dry_rain_mm": .1, "dry_mean_m3_s": .05, "storm_excess_m3": 5,
          "recovery_mean_m3_s": .08, "depth_difference_m": .1}


def phase(duration, obs=None, model=None, **other):
    return {"status": "complete", "requested_seconds": duration, "common_support_seconds": duration,
            "excluded_seconds": 0, "observed_volume_m3": obs, "modelled_volume_m3": model, **other}


def test_exact_phase_screen_under_full_supported_rainfall_and_flow():
    storm = {"values": phase(120, 30, 48), "checks": {"peak": {"value": 20, "unit": "%", "status": "Outside tolerance"},
              "timing": {"value": None, "status": "Withheld", "reason": "Tied peaks."}}}
    result = investigate_calibration(storm, settings=LIMITS, dry=phase(80, 8, 16),
                                     rainfall={"depth_mm": .02, "valid_seconds": 80, "requested_seconds": 80},
                                     recovery=phase(60, 10.8, 21), depth=phase(120, observed_peak=.5, modelled_peak=.8))
    assert result["preceding_reviewed"]
    review = result["findings"]
    assert review["dry_mean"]["difference"] == pytest.approx(.1)
    assert review["storm_excess"]["observed"] == pytest.approx(18)
    assert review["storm_excess"]["modelled"] == pytest.approx(24)
    assert review["storm_excess"]["status"] == "Review difference"
    assert review["recovery"]["difference"] == pytest.approx(.07)
    assert review["recovery"]["status"] == "Within review range"
    assert review["hydraulic_context"]["difference"] == pytest.approx(.30)
    assert review["peak"]["value"] == 20 and review["timing"]["basis"] == "Tied peaks."


@pytest.mark.parametrize("rain", [None, {"depth_mm": .5, "valid_seconds": 80, "requested_seconds": 80},
                                   {"depth_mm": 0, "valid_seconds": 70, "requested_seconds": 80},
                                   {"depth_mm": 0, "valid_seconds": 60, "requested_seconds": 60}])
def test_unknown_mismatched_or_wet_rain_cannot_qualify_preceding_flow(rain):
    result = investigate_calibration({"values": phase(120, 30, 48)}, settings=LIMITS,
                                     dry=phase(80, 8, 16), rainfall=rain, recovery=phase(60, 12, 15))
    assert not result["preceding_reviewed"]
    for key in ("dry_mean", "storm_excess", "recovery", "hydraulic_context"):
        assert result["findings"][key]["status"] == "Withheld"


def test_gapped_storm_and_depth_do_not_imply_hydraulic_context():
    partial = phase(120, 30, 48)
    partial["common_support_seconds"] = 60
    result = investigate_calibration({"values": partial}, settings=LIMITS, dry=phase(80, 8, 16),
                                     rainfall={"depth_mm": 0, "valid_seconds": 80, "requested_seconds": 80},
                                     depth=phase(120, observed_peak=.5, modelled_peak=.8))
    assert result["preceding_reviewed"]
    assert result["findings"]["hydraulic_context"]["status"] == "Withheld"
    assert result["findings"]["storm_excess"]["status"] == "Withheld"
