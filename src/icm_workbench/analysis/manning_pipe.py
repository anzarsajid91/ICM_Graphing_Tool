# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Uniform-flow Manning screening for circular pipes and prismatic sections."""
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
    return _wet_section(diameter * fraction, fraction, area, dh, slope, n, viscosity)


def _wet_section(depth, fraction, area, dh, slope, n, viscosity):
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
    return {"depth_m": depth, "depth_fraction": fraction, "area_m2": area, "hydraulic_radius_m": radius,
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


def prismatic_manning_screen(mode, shape, width_m, max_depth_m, n, gradient, viscosity_m2_s,
                             depth_fraction=None, discharge_m3_s=None, side_slope=None):
    """Screen steady uniform Manning flow in one symmetric prismatic section."""
    if mode not in ("capacity", "depth") or shape not in ("box", "rectangle", "trapezoid"):
        raise ValueError("Choose a supported prismatic section and a capacity or normal-depth calculation.")
    width = _number(width_m, "positive bottom width (0.001–100 m)", .001, 100)
    height = _number(max_depth_m, "maximum section depth (0.001–100 m)", .001, 100)
    side = _number(side_slope, "side slope (0–20 horizontal to 1 vertical)", 0, 20) if shape == "trapezoid" else 0
    slope = _number(gradient, "energy gradient (0–1 m/m)", 0, 1)
    roughness = _number(n, "Manning n (0.001–0.20 s/m^(1/3))", .001, .20)
    viscosity = _number(viscosity_m2_s, "kinematic viscosity (10⁻⁹–0.01 m²/s)", 1e-9, .01)
    target = None if mode == "capacity" else _number(discharge_m3_s, "non-negative target flow", 0)
    edge = sqrt(1 + side*side)

    def geometry(depth):
        return depth*(width+side*depth), width+2*depth*edge, width+2*side*depth

    def state(depth, full_bore=False):
        if depth == 0:
            return {**_section(height, 0, slope, roughness, viscosity), "top_width_m": width,
                    "froude": None, "specific_energy_m": None}
        area, perimeter, top_width = geometry(depth)
        if full_bore:
            perimeter += width
        result = _wet_section(depth, depth/height, area, 4*area/perimeter, slope, roughness, viscosity)
        velocity = result["velocity_m_s"]
        has_surface = not full_bore and velocity is not None
        return {**result, "top_width_m": None if full_bore else top_width,
                "froude": velocity / sqrt(GRAVITY * area / top_width) if has_surface else None,
                "specific_energy_m": depth + velocity*velocity/(2*GRAVITY) if has_surface else None}

    def solve_depth(curve, flow):
        low, high = 0, height
        for _ in range(70):
            middle = (low + high)/2
            if curve(middle) < flow:
                low = middle
            else:
                high = middle
        return (low + high)/2

    def free_discharge(depth):
        area, perimeter, _ = geometry(depth)
        return area*(area/perimeter)**(2/3)*sqrt(slope)/roughness

    def critical_discharge(depth):
        area, _, top_width = geometry(depth)
        return sqrt(GRAVITY*area**3/top_width)

    limit = state(height)
    enclosed = shape == "box"
    full = state(height, full_bore=True) if enclosed else None
    solutions = []
    if mode == "capacity":
        fraction = _number(depth_fraction, "section depth fraction (0–1)", 0, 1)
        tested = full if enclosed and fraction == 1 else state(fraction*height)
        solutions, status = [tested], tested["status"]
    elif target == 0 or slope == 0:
        status = "zero target discharge" if target == 0 else "zero gradient"
    else:
        capacity = free_discharge(height)
        tolerance = capacity*1e-12
        if target > capacity+tolerance:
            status = "above free-surface capacity"
        elif enclosed and abs(capacity-target) <= tolerance:
            status = "at free-surface crown limit"
        else:
            depth = height if abs(capacity-target) <= tolerance else solve_depth(free_discharge, target)
            point = state(depth)
            status = point["status"]
            if status == "supported":
                solutions = [point]

    free_flow = solutions[0]["discharge_m3_s"] if solutions and solutions[0]["froude"] is not None else None
    critical = solve_depth(critical_discharge, free_flow) if free_flow and free_flow <= critical_discharge(height) else None
    curve = [[i/80*height, state(i/80*height)["discharge_m3_s"]] for i in range(81)]
    return dict(method="prismatic-manning-uniform-si-v1", mode=mode, shape=shape, n=roughness, width_m=width,
                max_depth_m=height, side_slope=side, gradient=slope, viscosity_m2_s=viscosity, target_m3_s=target,
                critical_depth_m=critical, free_surface_limit=limit, full_bore=full, solutions=solutions, status=status, curve=curve)
