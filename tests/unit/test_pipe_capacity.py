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
