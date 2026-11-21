# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
import math

import pytest

from icm_workbench.analysis.manning_pipe import circular_manning_screen


def test_full_and_half_circular_flow_match_independent_reference():
    result = circular_manning_screen("capacity", .013, 1e-6, .6, .005, .5)
    half, full = result["solutions"][0], result["full_bore"]
    assert half["velocity_m_s"] == pytest.approx(1.5355683631445425)
    assert full["discharge_m3_s"] == pytest.approx(.4341717259865819)
    assert half["discharge_m3_s"] == pytest.approx(.217085862993291)
    assert half["hydraulic_radius_m"] == pytest.approx(.15)
    assert half["area_m2"] == pytest.approx(math.pi * .6**2 / 8)
    assert half["reynolds"] == pytest.approx(921341.0178867255)
    assert half["darcy_equivalent"] == pytest.approx(2 * 9.80665 * .6 * .005 / 1.5355683631445425**2)


def test_both_circular_normal_depth_limb_solutions_have_target_discharge():
    trace = circular_manning_screen("depth", .013, 1e-6, .6, .005, discharge_m3_s=.45)
    assert .93 < trace["peak_depth_fraction"] < .94
    assert 1 < trace["peak_discharge_m3_s"] / trace["full_bore"]["discharge_m3_s"] < 1.08
    assert len(trace["solutions"]) == 2
    shallow, deeper = trace["solutions"]
    assert shallow["depth_fraction"] < trace["peak_depth_fraction"] < deeper["depth_fraction"] < 1
    assert all(point["discharge_m3_s"] == pytest.approx(.45) for point in trace["solutions"])
    half = circular_manning_screen("depth", .013, 1e-6, .6, .005, discharge_m3_s=.217085862993291)
    assert [point["depth_m"] for point in half["solutions"]] == pytest.approx([.3])


def test_full_bore_sizing_matches_independent_si_targets_and_round_trip():
    d = circular_manning_screen("diameter", .013, 1e-6, gradient=.015, discharge_m3_s=.5)
    assert d["diameter_m"] == pytest.approx(.5148511533724144)
    assert d["full_bore"]["discharge_m3_s"] == pytest.approx(.5)
    higher_n = circular_manning_screen("diameter", .017, 1e-6, gradient=.015, discharge_m3_s=.5)
    assert higher_n["diameter_m"] == pytest.approx(.5693394511964198)
    s = circular_manning_screen("gradient", .013, 1e-6, .6, discharge_m3_s=.4341717259865819)
    assert s["gradient"] == pytest.approx(.005)
    assert s["full_bore"]["discharge_m3_s"] == pytest.approx(.4341717259865819)


def test_unsupported_or_empty_hydraulic_cases_are_explicit():
    dry = circular_manning_screen("capacity", .013, 1e-6, .6, .005, 0)
    assert dry["solutions"][0]["discharge_m3_s"] == 0 and dry["solutions"][0]["velocity_m_s"] is None
    flat = circular_manning_screen("capacity", .013, 1e-6, .6, 0, 1)
    assert flat["status"] == "zero gradient" and flat["full_bore"]["discharge_m3_s"] == 0
    low = circular_manning_screen("capacity", .013, .01, .01, .0005, 1)
    assert low["status"] == "outside turbulent screening range" and low["full_bore"]["discharge_m3_s"] is None
    assert circular_manning_screen("depth", .013, 1e-6, .6, .005, discharge_m3_s=.9)["status"] == "above capacity envelope"
    assert circular_manning_screen("diameter", .013, 1e-6, gradient=.005, discharge_m3_s=1e100)["status"] == "outside supported diameter range"
    assert circular_manning_screen("gradient", .013, 1e-6, .6, discharge_m3_s=1e100)["status"] == "outside supported gradient range"
    with pytest.raises(ValueError, match="fill fraction"):
        circular_manning_screen("capacity", .013, 1e-6, .6, .005, 1.01)
