from math import pi, sqrt

import pytest

from icm_workbench.analysis.pipe_capacity import full_pipe_capacity


def test_turbulent_recovers_independently_prescribed_colebrook_state():
    diameter, viscosity, reynolds, friction = 0.4, 1e-6, 100_000, 0.025
    velocity = reynolds * viscosity / diameter
    relative_roughness = 3.7 * (10 ** (-1 / (2 * sqrt(friction))) - 2.51 / (reynolds * sqrt(friction)))
    gradient = friction * velocity**2 / (2 * 9.80665 * diameter)
    result = full_pipe_capacity(diameter, gradient, relative_roughness * diameter, viscosity)
    assert result["regime"] == "turbulent"
    assert result["friction_factor"] == pytest.approx(friction)
    assert result["reynolds"] == pytest.approx(reynolds)
    assert result["discharge_m3_s"] == pytest.approx(velocity * pi * diameter**2 / 4)


def test_laminar_zero_and_transition_contracts():
    result = full_pipe_capacity(0.01, 0.0001, 0, 1e-6)
    assert result["velocity_m_s"] == pytest.approx(0.003064578125)
    assert result["friction_factor"] == pytest.approx(64 / result["reynolds"])
    assert full_pipe_capacity(0.01, 0, 0, 1e-6)["discharge_m3_s"] == 0
    transition = full_pipe_capacity(0.01, 0.007, 0, 1e-6)
    assert transition["regime"] == "transitional"
    assert transition["discharge_m3_s"] is None


@pytest.mark.parametrize("values", [(0, .01, .001, 1e-6), (.4, -.01, 0, 1e-6),
                                    (.4, .01, .1, 1e-6), (.4, .01, 0, float("nan"))])
def test_invalid_inputs(values):
    with pytest.raises(ValueError):
        full_pipe_capacity(*values)


def test_design_flow_returns_both_roots_and_satisfies_energy_equation():
    from math import acos, log10, sin

    from icm_workbench.analysis.pipe_capacity import normal_depth_assessment

    d, slope, roughness, viscosity = .45, .005, .0015, 1e-6
    q = 1.05 * full_pipe_capacity(d, slope, roughness, viscosity)["discharge_m3_s"]
    result = normal_depth_assessment(d, slope, roughness, viscosity, q)
    shallow, deep = result["depths"]
    assert shallow["depth_fraction"] < .94 < deep["depth_fraction"] < 1
    for solution in result["depths"]:
        angle = 2 * acos(1 - 2 * solution["depth_fraction"])
        area = d**2 * (angle - sin(angle)) / 8
        hydraulic_diameter = 8 * area / (d * angle)
        velocity = q / area
        friction = solution["friction_factor"]
        reynolds = hydraulic_diameter * velocity / viscosity
        root = sqrt(friction)
        assert friction * velocity**2 / (2 * 9.80665 * hydraulic_diameter) == pytest.approx(slope)
        assert 1 / root == pytest.approx(-2 * log10(roughness / (3.7 * hydraulic_diameter) + 2.51 / (reynolds * root)))


def test_design_flow_handles_half_full_crown_and_no_supported_solution():
    from icm_workbench.analysis.pipe_capacity import normal_depth_assessment

    d, slope, roughness, viscosity = args = (.45, .005, .0015, 1e-6)
    capacity = full_pipe_capacity(*args)["discharge_m3_s"]
    half = normal_depth_assessment(*args, capacity / 2)
    assert half["depths"][0]["depth_fraction"] == pytest.approx(.5)
    full = normal_depth_assessment(*args, capacity)
    assert full["depths"][-1]["depth_fraction"] == 1
    assert normal_depth_assessment(*args, 1.25 * capacity)["depths"] == []
    assert normal_depth_assessment(*args, 0)["status"] == "zero discharge"
    assert normal_depth_assessment(d, 0, roughness, viscosity, capacity)["status"] == "zero gradient"
    assert normal_depth_assessment(*args, 1e-10)["depths"] == []
    with pytest.raises(ValueError, match="discharge"):
        normal_depth_assessment(*args, -1)
    other = normal_depth_assessment(d, 2*slope, roughness, viscosity, capacity)
    assert other["imposed_full_velocity_m_s"] == full["imposed_full_velocity_m_s"]


@pytest.mark.parametrize(
    "diameter, slope, roughness, reference_l_s",
    [
        (0.300, 0.002, 0.00150, 43.632987),
        (0.450, 0.005, 0.00150, 202.647909),
        (0.900, 0.001, 0.00150, 562.339300),
        (0.450, 0.005, 0.00015, 262.815812),
    ],
)
def test_full_flow_benchmark(diameter, slope, roughness, reference_l_s):
    # Independent friction-factor bisection values, rounded to 6 decimals.
    result = full_pipe_capacity(diameter, slope, roughness, 1e-6)
    assert result["regime"] == "turbulent"
    assert 1000 * result["discharge_m3_s"] == pytest.approx(reference_l_s, abs=5e-7, rel=0)


@pytest.mark.parametrize(
    "flow_l_s, depths_m",
    [(75, [0.189282931404]), (215, [0.404564165940, 0.437860773262])],
)
def test_normal_depth_benchmark(flow_l_s, depths_m):
    from icm_workbench.analysis.pipe_capacity import normal_depth_assessment

    result = normal_depth_assessment(0.45, 0.005, 0.0015, 1e-6, flow_l_s / 1000)
    assert result["status"] == "supported"
    assert [row["depth_m"] for row in result["depths"]] == pytest.approx(depths_m, abs=5e-12, rel=0)
