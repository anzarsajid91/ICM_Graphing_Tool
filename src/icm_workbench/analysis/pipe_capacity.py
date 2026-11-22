# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only

"""Steady uniform full-bore circular pipe capacity in SI units."""
from math import asin, isfinite, log10, pi, sin, sqrt

GRAVITY = 9.80665


def _turbulent_velocity(hydraulic_diameter, gradient, roughness, viscosity):
    # Darcy–Weisbach fixes V*sqrt(f). Substitute it into Colebrook–White.
    resistance_velocity = sqrt(2 * GRAVITY * hydraulic_diameter * gradient)
    velocity = -2 * resistance_velocity * log10(
        roughness / (3.7 * hydraulic_diameter) + 2.51 * viscosity / (hydraulic_diameter * resistance_velocity)
    )
    return velocity, resistance_velocity


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
        velocity, resistance_velocity = _turbulent_velocity(diameter_m, gradient, roughness_m, viscosity_m2_s)
        reynolds = velocity * diameter_m / viscosity_m2_s
        if reynolds < 4000:
            return dict(regime="transitional", discharge_m3_s=None, velocity_m_s=None, reynolds=None, friction_factor=None)
        friction, regime = (resistance_velocity / velocity)**2, "turbulent"
    return dict(regime=regime, discharge_m3_s=velocity * area, velocity_m_s=velocity,
                reynolds=reynolds, friction_factor=friction)


def _circular_section(diameter, fraction):
    angle = 4 * asin(sqrt(fraction))
    # Use the small-angle expansion to avoid loss of area near the invert.
    segment = angle**3 / 6 * (1 - angle**2 / 20) if angle < 0.01 else angle - sin(angle)
    area = diameter**2 * segment / 8
    wetted_perimeter = diameter * angle / 2
    return area, 4 * area / wetted_perimeter


def circular_wetted_area(diameter_m, depth_m):
    """Circular area at a known section depth in the supported open section."""
    if not (isfinite(diameter_m) and isfinite(depth_m) and diameter_m > 0 and 0 <= depth_m <= diameter_m):
        raise ValueError("Use a positive circular diameter and depth within the pipe section.")
    return _circular_section(diameter_m, depth_m / diameter_m)[0] if depth_m > 0 else 0.0


def circular_gravity_section_review(diameter_m, depth_m, flow_m3_s, energy_gradient,
                                    density_kg_m3, minimum_velocity_m_s, uniform_confirmed):
    """Screen a supplied circular section using mean velocity and uniform-flow shear."""
    limits = ((diameter_m, .001, 20, "diameter"), (depth_m, 0, 20, "depth"),
              (flow_m3_s, 0, 1000, "forward discharge"), (energy_gradient, 0, 1, "energy gradient"),
              (density_kg_m3, 100, 3000, "fluid density"), (minimum_velocity_m_s, .001, 20, "velocity threshold"))
    for value, low, high, label in limits:
        if type(value) not in (int, float) or not low <= value <= high or not isfinite(value):
            raise ValueError(f"Enter a finite {label} within the supported range.")
    if depth_m > diameter_m:
        raise ValueError("Use a depth within the circular pipe section.")
    if depth_m == 0 and flow_m3_s > 0:
        raise ValueError("A dry section cannot convey a positive supplied discharge.")
    fraction = depth_m / diameter_m
    area, hydraulic_diameter = _circular_section(diameter_m, fraction) if fraction else (0.0, 0.0)
    if depth_m and (area <= 0 or not isfinite(flow_m3_s / area)):
        raise ValueError("The depth and discharge cannot resolve a finite hydraulic section.")
    radius = hydraulic_diameter / 4 if depth_m else None
    velocity = flow_m3_s / area if depth_m else None
    status = ("dry section" if velocity is None else
              "meets threshold" if velocity >= minimum_velocity_m_s else "below threshold")
    return dict(method="circular-gravity-velocity-and-mean-shear-v1", area_m2=area,
                hydraulic_radius_m=radius, velocity_m_s=velocity, velocity_status=status,
                flow_at_minimum_m3_s=minimum_velocity_m_s * area if depth_m else None,
                mean_shear_pa=density_kg_m3 * GRAVITY * radius * energy_gradient if uniform_confirmed is True and depth_m else None,
                uniform_confirmed=uniform_confirmed is True)


def _normal_depth_candidates(section_flow, discharge):
    """Search the circular conveyance envelope and both sides of its peak."""
    low, high = 0.5, 1.0
    for _ in range(80):
        left, right = (2*low + high) / 3, (low + 2*high) / 3
        if section_flow(left) < section_flow(right):
            low = left
        else:
            high = right
    peak = (low + high) / 2
    peak_flow = section_flow(peak)
    tolerance = peak_flow * 1e-12
    candidates = []
    if abs(discharge - peak_flow) <= tolerance:
        candidates.append(peak)
    elif discharge < peak_flow:
        for low, high in [(0.0, peak), (peak, 1.0)]:
            left, right = section_flow(low) - discharge, section_flow(high) - discharge
            if abs(right) <= tolerance and high == 1:
                candidates.append(1.0)
                continue
            if left * right >= 0:
                continue
            for _ in range(75):
                mid = (low + high) / 2
                value = section_flow(mid) - discharge
                if (value > 0) == (left > 0):
                    low = mid
                else:
                    high = mid
            candidates.append((low + high) / 2)
    return peak, peak_flow, tolerance, candidates


def normal_depth_assessment(diameter_m, gradient, roughness_m, viscosity_m2_s, discharge_m3_s):
    """Find supported turbulent normal depths for a specified circular-pipe discharge."""
    full = full_pipe_capacity(diameter_m, gradient, roughness_m, viscosity_m2_s)
    if not isinstance(discharge_m3_s, (int, float)) or isinstance(discharge_m3_s, bool) or not isfinite(discharge_m3_s) or discharge_m3_s < 0:
        raise ValueError("Enter a finite, non-negative design discharge.")
    q = discharge_m3_s
    result = dict(full_capacity_m3_s=full["discharge_m3_s"],
                  imposed_full_velocity_m_s=q / (pi * diameter_m**2 / 4),
                  status="unavailable", depths=[])
    if not isfinite(result["imposed_full_velocity_m_s"]):
        raise ValueError("Design discharge is too large to compute a finite velocity.")
    if q == 0:
        result["status"] = "zero discharge"
        return result
    if gradient == 0:
        result["status"] = "zero gradient"
        return result

    def section_flow(fraction):
        if fraction == 0:
            return 0
        area, dh = _circular_section(diameter_m, fraction)
        velocity, _ = _turbulent_velocity(dh, gradient, roughness_m, viscosity_m2_s)
        return area * max(0, velocity)

    _, q_peak, tolerance, candidates = _normal_depth_candidates(section_flow, q)

    for fraction in candidates:
        area, dh = _circular_section(diameter_m, fraction)
        velocity = q / area
        reynolds = velocity * dh / viscosity_m2_s
        if reynolds < 4000 or roughness_m / dh > 0.05:
            continue
        result["depths"].append(dict(depth_m=fraction * diameter_m, depth_fraction=fraction,
                                     area_m2=area, hydraulic_radius_m=dh / 4, hydraulic_diameter_m=dh,
                                     velocity_m_s=velocity, reynolds=reynolds,
                                     friction_factor=2 * GRAVITY * dh * gradient / velocity**2))
    if result["depths"]:
        result["status"] = "supported"
    elif q_peak > 0 and q > q_peak + tolerance:
        result["status"] = "above turbulent capacity envelope"
    return result
