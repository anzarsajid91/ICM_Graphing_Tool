# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
import math

import pytest

from icm_workbench.analysis.darcy_sizing import circular_darcy_requirement
from icm_workbench.analysis.pipe_capacity import full_pipe_capacity


def test_turbulent_inverse_matches_independent_exact_colebrook_construction():
    diameter, velocity, viscosity, friction = .6, 1.5, 1e-6, .02
    reynolds = velocity * diameter / viscosity
    x = 1 / math.sqrt(friction)
    roughness = 3.7 * diameter * (10**(-x/2) - 2.51*x/reynolds)
    q = math.pi * diameter**2 * velocity / 4
    slope = friction * velocity**2 / (2 * 9.80665 * diameter)
    result = circular_darcy_requirement("gradient", roughness, viscosity, q, diameter_m=diameter)
    assert result["gradient"] == pytest.approx(slope, rel=1e-12)
    assert result["full_bore"]["friction_factor"] == pytest.approx(friction, rel=1e-12)
    assert result["full_bore"]["reynolds"] == pytest.approx(900_000)
    size = circular_darcy_requirement("diameter", roughness, viscosity, q, gradient=slope)
    assert size["diameter_m"] == pytest.approx(diameter, rel=1e-12)
    refitted = full_pipe_capacity(size["diameter_m"], slope, roughness, viscosity)
    assert refitted["discharge_m3_s"] == pytest.approx(q, rel=1e-12)


def test_laminar_inverse_uses_the_same_collected_circular_hydraulics():
    diameter, viscosity, velocity = .01, 1e-6, .1
    q = math.pi * diameter**2 * velocity / 4
    slope = 32 * viscosity * velocity / (9.80665 * diameter**2)
    expected = circular_darcy_requirement("gradient", 0, viscosity, q, diameter_m=diameter)
    assert expected["full_bore"]["regime"] == "laminar"
    assert expected["gradient"] == pytest.approx(slope, rel=1e-12)
    assert expected["full_bore"]["friction_factor"] == pytest.approx(.064)
    result = circular_darcy_requirement("diameter", 0, viscosity, q, gradient=slope)
    assert result["diameter_m"] == pytest.approx(diameter, rel=1e-12)


def test_unsupported_regime_oversizing_and_zero_energy():
    q = math.pi * .01**2 * .3 / 4
    transition = circular_darcy_requirement("gradient", 0, 1e-6, q, diameter_m=.01)
    assert transition["status"] == "unsupported target flow regime"
    assert "gradient" not in transition
    assert circular_darcy_requirement("gradient", 0, 1e-6, 0, diameter_m=.6)["gradient"] == 0
    assert circular_darcy_requirement("diameter", .001, 1e-6, .6, gradient=0)["status"] == "positive target and gradient required"
    assert circular_darcy_requirement("diameter", .001, 1e-6, 1e100, gradient=.01)["status"] == "no diameter in supported range"
