"""Steady uniform full-bore circular pipe capacity in SI units."""
from math import isfinite, log10, pi, sqrt

GRAVITY = 9.80665


def full_pipe_capacity(diameter_m, gradient, roughness_m, viscosity_m2_s):
    """Return full-bore capacity, declining to rate transitional flow."""
    inputs = (diameter_m, gradient, roughness_m, viscosity_m2_s)
    if not all(isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value) for value in inputs):
        raise ValueError("Enter finite numerical inputs.")
    if diameter_m <= 0 or viscosity_m2_s <= 0 or gradient < 0 or roughness_m < 0:
        raise ValueError("Diameter and viscosity must be positive. Gradient and roughness must be non-negative.")
    if not (0.001 <= diameter_m <= 20 and gradient <= 1 and 1e-9 <= viscosity_m2_s <= 0.01):
        raise ValueError("Supported ranges are 1–20,000 mm, 0–1 m/m and 10⁻⁹–0.01 m²/s.")
    relative_roughness = roughness_m / diameter_m
    if relative_roughness > 0.05:
        raise ValueError("The effective roughness exceeds 5% of the diameter, outside this calculator's range.")
    area = pi * diameter_m**2 / 4
    if gradient == 0:
        return dict(regime="zero gradient", discharge_m3_s=0, velocity_m_s=0, reynolds=0, friction_factor=None)
    laminar_v = GRAVITY * diameter_m**2 * gradient / (32 * viscosity_m2_s)
    laminar_re = laminar_v * diameter_m / viscosity_m2_s
    if laminar_re < 64e-308:
        raise ValueError("Gradient is too small to compute a finite friction factor.")
    if laminar_re < 2000:
        velocity, reynolds, regime = laminar_v, laminar_re, "laminar"
        friction = 64 / reynolds
    else:
        # Darcy–Weisbach fixes V*sqrt(f). Substitution into Colebrook–White
        # solves the uniform-flow capacity directly for a known energy slope.
        resistance_velocity = sqrt(2 * GRAVITY * diameter_m * gradient)
        velocity = -2 * resistance_velocity * log10(
            relative_roughness / 3.7 + 2.51 * viscosity_m2_s / (diameter_m * resistance_velocity)
        )
        reynolds = velocity * diameter_m / viscosity_m2_s
        if reynolds < 4000:
            return dict(regime="transitional", discharge_m3_s=None, velocity_m_s=None, reynolds=None, friction_factor=None)
        friction, regime = (resistance_velocity / velocity)**2, "turbulent"
    return dict(regime=regime, discharge_m3_s=velocity * area, velocity_m_s=velocity,
                reynolds=reynolds, friction_factor=friction)
