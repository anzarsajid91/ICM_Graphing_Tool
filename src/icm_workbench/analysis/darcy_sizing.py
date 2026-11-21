# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Full-bore circular geometry inverses for Darcy–Weisbach and Colebrook–White."""
from __future__ import annotations

from math import exp, isfinite, log, log10, pi

from icm_workbench.analysis.pipe_capacity import GRAVITY, _circular_section, _turbulent_velocity, full_pipe_capacity


def _finite(value):
    return type(value) in (int, float) and isfinite(value)


def _friction_factor(relative_roughness, reynolds):
    if reynolds < 2000:
        return 64 / reynolds
    if reynolds < 4000:
        return None

    def residual(inverse_root):
        return inverse_root + 2 * log10(relative_roughness / 3.7 + 2.51 * inverse_root / reynolds)

    lower, upper = 1.0, 32.0
    while residual(upper) < 0:
        upper *= 2
    for _ in range(80):
        middle = (lower + upper) / 2
        if residual(middle) < 0:
            lower = middle
        else:
            upper = middle
    return 1 / ((lower + upper) / 2)**2


def _target_components(diameter, target, roughness, viscosity):
    velocity = target / (pi * diameter**2 / 4)
    reynolds = velocity * diameter / viscosity
    if not isfinite(velocity) or not isfinite(reynolds) or reynolds < 64e-308:
        return None
    friction = _friction_factor(roughness / diameter, reynolds)
    gradient = None if friction is None else (32 * viscosity * velocity / (GRAVITY * diameter**2) if reynolds < 2000
                                              else friction * velocity * velocity / (2 * GRAVITY * diameter))
    return {"gradient": gradient, "reynolds": reynolds, "friction_factor": friction, "velocity_m_s": velocity,
            "diameter_m": diameter, "regime": "laminar" if reynolds < 2000 else "transitional" if reynolds < 4000 else "turbulent"}


def circular_darcy_requirement(mode, roughness_m, viscosity_m2_s, discharge_m3_s, diameter_m=None, gradient=None):
    """Find the supported full-bore diameter or gradient for a reviewed flow."""
    if mode not in ("diameter", "gradient"):
        raise ValueError("Choose required full-bore diameter or gradient.")
    for value, message in [(roughness_m, "Use a finite non-negative absolute roughness."),
                           (discharge_m3_s, "Use a finite non-negative target discharge.")]:
        if not _finite(value) or value < 0:
            raise ValueError(message)
    if not _finite(viscosity_m2_s) or not 1e-9 <= viscosity_m2_s <= .01:
        raise ValueError("Kinematic viscosity must be between 10⁻⁹ and 0.01 m²/s.")
    q, roughness, viscosity = float(discharge_m3_s), float(roughness_m), float(viscosity_m2_s)
    common = {"method": "circular-darcy-uniform-inverse-si-v1", "mode": mode, "target_m3_s": q,
              "roughness_m": roughness, "viscosity_m2_s": viscosity_m2_s, "solutions": []}
    if mode == "gradient":
        full_pipe_capacity(diameter_m, 0, roughness, viscosity)
        if q == 0:
            solved = {"diameter_m": diameter_m, "gradient": 0, "velocity_m_s": 0, "reynolds": 0,
                      "friction_factor": None, "regime": "zero gradient"}
            return _complete(common, solved, q, status="zero gradient")
        solved = _target_components(diameter_m, q, roughness, viscosity)
        if not solved or solved["gradient"] is None:
            return {**common, "diameter_m": diameter_m, "status": "unsupported target flow regime"}
        if not _finite(solved["gradient"]) or solved["gradient"] > 1:
            return {**common, "diameter_m": diameter_m, "status": "outside supported gradient range"}
        return _complete(common, solved, q)

    if not _finite(gradient) or not 0 <= gradient <= 1:
        raise ValueError("Use a gradient between zero and 1 m/m.")
    if q == 0 or gradient == 0:
        return {**common, "gradient": gradient, "status": "positive target and gradient required"}
    diameter_min = max(.001, 20 * roughness)
    laminar_log = (log(128) + log(viscosity) + log(q) - log(pi * GRAVITY * gradient)) / 4
    if diameter_min <= 20 and log(diameter_min) <= laminar_log <= log(20):
        laminar_d = exp(laminar_log)
        fitted = _target_components(laminar_d, q, roughness, viscosity)
        if fitted and fitted["regime"] == "laminar":
            return _complete(common, {**fitted, "gradient": gradient}, q)

    # For a fixed Q, Re = 4Q/(πDν). Stay inside the target turbulent domain.
    diameter_max = min(20.0, (q / (pi * viscosity)) * .001)
    if diameter_min > diameter_max:
        return {**common, "gradient": gradient, "status": "no diameter in supported range"}

    def capacity(diameter):
        if 2 * GRAVITY * diameter * gradient == 0:
            return 0.0
        velocity, _ = _turbulent_velocity(diameter, gradient, roughness, viscosity)
        return max(0.0, velocity) * pi * diameter**2 / 4

    if not capacity(diameter_min) <= q <= capacity(diameter_max):
        return {**common, "gradient": gradient, "status": "no diameter in supported range"}
    lower, upper = diameter_min, diameter_max
    for _ in range(80):
        middle = (lower + upper) / 2
        if capacity(middle) < q:
            lower = middle
        else:
            upper = middle
    solved = _target_components((lower + upper) / 2, q, roughness, viscosity)
    if not solved or solved["regime"] != "turbulent":
        return {**common, "gradient": gradient, "status": "unsupported target flow regime"}
    return _complete(common, {**solved, "gradient": gradient}, q)


def _complete(common, solved, discharge, *, status="supported"):
    diameter = solved["diameter_m"]
    section = {**solved, "depth_m": diameter, "depth_fraction": 1.0, "area_m2": pi * diameter**2 / 4,
               "hydraulic_radius_m": diameter/4, "discharge_m3_s": discharge}
    result = {**common, "diameter_m": diameter, "gradient": solved["gradient"], "status": status,
              "solutions": [section], "full_bore": section}
    if solved["regime"] != "turbulent":
        return result
    roughness, viscosity = common["roughness_m"], common["viscosity_m2_s"]
    curve = [[0.0, 0.0]]
    for step in range(1, 81):
        fraction = step / 80
        area, dh = _circular_section(diameter, fraction)
        flow = None
        if roughness / dh <= .05 and 2 * GRAVITY * dh * solved["gradient"] > 0:
            velocity, _ = _turbulent_velocity(dh, solved["gradient"], roughness, viscosity)
            if velocity * dh / viscosity >= 4000:
                flow = area * velocity
        curve.append([fraction * diameter, flow])
    result["curve"] = curve
    return result
