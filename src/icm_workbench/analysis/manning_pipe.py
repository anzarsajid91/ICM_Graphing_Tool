# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Uniform-flow Manning screening in a clean, circular gravity pipe."""
from __future__ import annotations

from math import exp, isfinite, log, pi, sqrt

from icm_workbench.analysis.pipe_capacity import GRAVITY, _circular_section, _normal_depth_candidates


def _number(value, label, minimum, maximum=None):
    if (type(value) not in (int, float) or not isfinite(value) or value < minimum
            or (maximum is not None and value > maximum)):
        raise ValueError(f"Review the supported range for {label}.")
    return float(value)


def _section(diameter, fraction, slope, n, viscosity):
    if fraction == 0:
        return {"depth_m": 0.0, "depth_fraction": 0.0, "area_m2": 0.0, "hydraulic_radius_m": 0.0,
                "velocity_m_s": None, "discharge_m3_s": 0.0, "reynolds": None, "darcy_equivalent": None, "status": "dry section"}
    area, dh = _circular_section(diameter, fraction)
    radius = dh / 4
    velocity = radius**(2/3) * sqrt(slope) / n
    discharge = area * velocity
    reynolds = velocity * dh / viscosity
    if slope == 0:
        status = "zero gradient"
    elif reynolds < 4000:
        status = "outside turbulent screening range"
    else:
        status = "supported"
    return {"depth_m": diameter * fraction, "depth_fraction": fraction, "area_m2": area, "hydraulic_radius_m": radius,
            "velocity_m_s": velocity if status != "outside turbulent screening range" else None,
            "discharge_m3_s": discharge if status != "outside turbulent screening range" else None,
            "reynolds": reynolds, "darcy_equivalent": (2 * GRAVITY * dh) * (n / radius**(2/3))**2 if status == "supported" else None,
            "status": status}


def circular_manning_screen(mode, n, viscosity_m2_s, diameter_m=None, gradient=None, depth_fraction=None, discharge_m3_s=None):
    """Compute uniform gravity capacity, normal depth or a full-bore sizing requirement."""
    if mode not in ("capacity", "depth", "diameter", "gradient"):
        raise ValueError("Choose an available uniform-flow calculation.")
    n = _number(n, "Manning n (0.001–0.20 s/m^(1/3))", .001, .20)
    viscosity = _number(viscosity_m2_s, "kinematic viscosity (10⁻⁹–0.01 m²/s)", 1e-9, .01)
    diameter = None if mode == "diameter" else _number(diameter_m, "internal diameter (0.001–20 m)", .001, 20)
    slope = None if mode == "gradient" else _number(gradient, "energy gradient (0–1 m/m)", 0, 1)
    target = None if mode == "capacity" else _number(discharge_m3_s, "non-negative target flow", 0)
    result = {"method": "circular-manning-uniform-si-v1", "mode": mode, "n": n, "viscosity_m2_s": viscosity,
              "diameter_m": diameter, "gradient": slope, "target_m3_s": target, "solutions": []}

    if mode == "diameter":
        if not target or not slope:
            return {**result, "status": "positive target and gradient required"}
        log_diameter = .375 * (log(target) + log(n) + (5/3)*log(4) - log(pi) - .5*log(slope))
        if not log(.001) <= log_diameter <= log(20):
            return {**result, "status": "outside supported diameter range"}
        diameter = exp(log_diameter)
        result["diameter_m"] = diameter
    elif mode == "gradient":
        ratio = target * n / ((pi * diameter**2 / 4) * (diameter/4)**(2/3))
        if ratio > 1:
            return {**result, "status": "outside supported gradient range"}
        slope = ratio**2
        result["gradient"] = slope

    def state(fraction):
        return _section(diameter, fraction, slope, n, viscosity)

    full = state(1)
    result["full_bore"] = full
    if mode == "capacity":
        fraction = _number(depth_fraction, "circular fill fraction (0–1)", 0, 1)
        point = state(fraction)
        result.update(status=point["status"], solutions=[point])
    elif mode in ("diameter", "gradient"):
        result.update(status=full["status"], solutions=[full])
    elif not target or not slope:
        result["status"] = "zero target discharge" if not target else "zero gradient"
    else:
        def conveyance(fraction):
            # Retain the smooth geometric envelope during the root search.
            # Screen the Reynolds number independently at each solution.
            if fraction == 0:
                return 0.0
            area, dh = _circular_section(diameter, fraction)
            return area * (dh/4)**(2/3) * sqrt(slope) / n

        peak, peak_flow, tolerance, roots = _normal_depth_candidates(conveyance, target)
        supported = [point for point in map(state, roots) if point["status"] == "supported"]
        result.update(peak_depth_fraction=peak, peak_discharge_m3_s=peak_flow if state(peak)["status"] == "supported" else None,
                      solutions=supported, status="supported" if supported else
                      "above capacity envelope" if target > peak_flow + tolerance else "outside turbulent screening range")
    result["curve"] = [[fraction * diameter, state(fraction)["discharge_m3_s"]] for fraction in (i/80 for i in range(81))]
    return result
