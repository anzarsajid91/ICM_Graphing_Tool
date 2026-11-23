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


def test_prismatic_manning_uses_fhwa_trapezoid_reference():
    from icm_workbench.analysis.manning_pipe import prismatic_manning_screen

    # FHWA HDS-4 example 4.1 gives rounded 1.36 m/s and 2.0 m³/s.
    # These fixed references evaluate the published inputs without intermediate rounding.
    inputs = dict(shape="trapezoid", width_m=2, max_depth_m=1, side_slope=2, n=.02,
                  gradient=.003, viscosity_m2_s=1e-6)
    output = prismatic_manning_screen("capacity", depth_fraction=.5, **inputs)
    known = output["solutions"][0]
    assert known["area_m2"] == 1.5
    assert known["top_width_m"] == 4
    assert known["velocity_m_s"] == pytest.approx(1.3707224439828323)
    assert known["discharge_m3_s"] == pytest.approx(2.0560836659742483)
    assert known["reynolds"] == pytest.approx(1941502.050387576)
    normal = prismatic_manning_screen("depth", discharge_m3_s=2.0560836659742483, **inputs)
    assert normal["solutions"][0]["depth_m"] == pytest.approx(.5, abs=1e-12)


def test_box_crown_limit_and_full_bore_are_distinct():
    from icm_workbench.analysis.manning_pipe import prismatic_manning_screen

    inputs = dict(shape="box", width_m=2, max_depth_m=1, n=.013, gradient=.001, viscosity_m2_s=1e-6)
    result = prismatic_manning_screen("capacity", depth_fraction=1, **inputs)
    assert result["free_surface_limit"]["discharge_m3_s"] == pytest.approx(3.064784761275729)
    assert result["full_bore"]["discharge_m3_s"] == pytest.approx(2.338868511061827)
    assert result["solutions"][0]["froude"] is None
    assert result["solutions"][0]["specific_energy_m"] is None
    assert result["curve"][-1] == pytest.approx([1, 3.064784761275729])
    closed_limit = prismatic_manning_screen("depth", discharge_m3_s=3.064784761275729, **inputs)
    assert closed_limit["status"] == "at free-surface crown limit" and not closed_limit["solutions"]


def test_prismatic_critical_depth_and_explicit_unsupported_outcomes():
    from icm_workbench.analysis.manning_pipe import prismatic_manning_screen

    inputs = dict(shape="rectangle", width_m=2, max_depth_m=1, n=.013, gradient=.001, viscosity_m2_s=1e-6)
    output = prismatic_manning_screen("depth", discharge_m3_s=2.2143452756966333, **inputs)
    assert output["critical_depth_m"] == pytest.approx(.5, abs=1e-12)
    point = output["solutions"][0]
    depth, v = point["depth_m"], point["velocity_m_s"]
    assert point["froude"] == pytest.approx(v / math.sqrt(9.80665 * depth))
    assert point["specific_energy_m"] == pytest.approx(depth + v*v / (2 * 9.80665))
    assert prismatic_manning_screen("depth", discharge_m3_s=1e308, **inputs)["status"] == "above free-surface capacity"
    assert prismatic_manning_screen("depth", discharge_m3_s=0, **inputs)["critical_depth_m"] is None
    assert prismatic_manning_screen("capacity", depth_fraction=0, **inputs)["solutions"][0]["froude"] is None
    assert prismatic_manning_screen("capacity", depth_fraction=1, **{**inputs, "gradient": 0})["status"] == "zero gradient"
    with pytest.raises(ValueError, match="positive bottom width|bottom width"):
        prismatic_manning_screen("capacity", depth_fraction=.5, **{**inputs, "width_m": 0})
