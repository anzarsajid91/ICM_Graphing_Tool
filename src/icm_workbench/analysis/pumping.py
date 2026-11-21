# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Steady full-pipe system curves with specified Darcy factors and pump duties."""
from itertools import pairwise
from math import fsum, isfinite, pi, sqrt

from .pipe_capacity import GRAVITY

METHOD = "steady-fixed-darcy-v1"


def _number(value, label, low, high):
    if type(value) not in (int, float) or not low <= value <= high or not isfinite(value):
        raise ValueError(f"{label} must be between {low:g} and {high:g}.")
    return value


def _pipe_properties(stages):
    if not isinstance(stages, list) or not 1 <= len(stages) <= 100:
        raise ValueError("Provide 1–100 stages in series.")
    prepared = []
    for stage in stages:
        if not isinstance(stage, list) or not 1 <= len(stage) <= 100:
            raise ValueError("Provide 1–100 parallel pipe branches per stage.")
        pipes = []
        for row in stage:
            if not isinstance(row, dict):
                raise ValueError("Provide every pipe as a record.")
            diameter = _number(row.get("diameter_m"), "Diameter in metres", .001, 20)
            length = _number(row.get("length_m"), "Length in metres", .001, 1e7)
            minor = _number(row.get("minor_k"), "Fitting loss coefficient", 0, 100000)
            entrance = _number(row.get("entrance_k"), "Entrance loss coefficient", 0, 100000)
            exit_k = _number(row.get("exit_k"), "Exit loss coefficient", 0, 100000)
            pipes.append(dict(diameter_m=diameter, length_m=length, minor_k=minor, entrance_k=entrance, exit_k=exit_k))
        prepared.append(pipes)
    return prepared


def _system(stages, static_head_m):
    static = _number(static_head_m, "Static head in metres", -100000, 100000)
    prepared = []
    for source_stage, stage in zip(stages, _pipe_properties(stages)):
        pipes = []
        for source, properties in zip(source_stage, stage):
            darcy = _number(source.get("darcy_factor"), "Darcy friction factor", .0001, 1)
            diameter, length = properties["diameter_m"], properties["length_m"]
            area = pi * diameter**2 / 4
            velocity_factor = 1 / (2 * GRAVITY * area**2)
            components = (darcy * length / diameter, properties["minor_k"], properties["entrance_k"], properties["exit_k"])
            resistance = fsum(components) * velocity_factor
            pipes.append((dict(properties, darcy_factor=darcy), area, velocity_factor, components, resistance))
        conductance = fsum(1 / sqrt(pipe[-1]) for pipe in pipes)
        prepared.append((pipes, conductance))
    return static, prepared, fsum(1 / conductance**2 for _, conductance in prepared)


def system_curve(stages, static_head_m, flow_m3_s, curve_max_m3_s, *, friction_method="fixed", viscosity_m2_s=None):
    """Evaluate duty head, component losses and a bounded display curve."""
    flow = _number(flow_m3_s, "Duty flow in m³/s", 0, 1000)
    upper = _number(curve_max_m3_s, "Maximum curve flow in m³/s", 1e-9, 1000)
    if friction_method == "calculated":
        from .system_friction import calculated_system_curve

        static = _number(static_head_m, "Static head in metres", -100000, 100000)
        viscosity = _number(viscosity_m2_s, "Kinematic viscosity in m²/s", 1e-9, .01)
        prepared = _pipe_properties(stages)
        if sum(map(len, prepared)) > 100:
            raise ValueError("Use at most 100 branches for a calculated-friction system curve.")
        for stage, raw_stage in zip(prepared, stages):
            for pipe, raw in zip(stage, raw_stage):
                pipe["roughness_m"] = _number(raw.get("roughness_m"), "Absolute roughness in metres", 0, .05*pipe["diameter_m"])
        return calculated_system_curve(prepared, static, flow, upper, viscosity)
    if friction_method != "fixed":
        raise ValueError("Choose fixed or calculated Darcy friction.")
    static, prepared, resistance = _system(stages, static_head_m)
    rows = []
    for stage, (pipes, conductance) in enumerate(prepared, start=1):
        for pipe, (properties, area, factor, components, r) in enumerate(pipes, start=1):
            branch = flow / (sqrt(r) * conductance)
            friction, fittings, entrance, exit_loss = [k * factor * branch**2 for k in components]
            rows.append(dict(properties, stage=stage, branch=pipe, flow_m3_s=branch, velocity_m_s=branch / area,
                             friction_m=friction, fittings_m=fittings, entrance_m=entrance, exit_m=exit_loss,
                             loss_m=fsum((friction, fittings, entrance, exit_loss))))
    curve = [(upper*i/40, static + resistance*(upper*i/40)**2) for i in range(41)]
    return dict(method=METHOD, static_head_m=static, loss_m=resistance * flow**2,
                total_head_m=static + resistance * flow**2, resistance=resistance, rows=rows, curve=curve)


def pump_duty(stages, static_head_m, points, arrangement, pump_count, density_kg_m3, efficiency):
    """Intersect linear supplied pump segments with the quadratic system curve."""
    static, _, resistance = _system(stages, static_head_m)
    if not isinstance(arrangement, str) or arrangement not in {"single", "series", "parallel"}:
        raise ValueError("Choose a supported pump arrangement.")
    if type(pump_count) is not int or not 1 <= pump_count <= 20 or (arrangement == "single" and pump_count != 1):
        raise ValueError("Use one pump for single operation or 1–20 identical pumps in series or parallel.")
    density = _number(density_kg_m3, "Density in kg/m³", 100, 3000)
    efficiency = None if efficiency is None else _number(efficiency, "Overall efficiency", .01, 1)
    if not isinstance(points, list) or not 2 <= len(points) <= 500:
        raise ValueError("Provide 2–500 measured pump curve points.")
    curve = []
    for point in points:
        if not isinstance(point, list) or len(point) != 2:
            raise ValueError("Provide flow and head for each pump curve point.")
        flow = _number(point[0], "Pump flow in m³/s", 0, 1000)
        head = _number(point[1], "Pump head in metres", 0, 100000)
        combo = (flow * (pump_count if arrangement == "parallel" else 1),
                 head * (pump_count if arrangement == "series" else 1))
        if curve and combo[0] <= curve[-1][0]:
            raise ValueError("Pump flows must increase strictly in the supplied order.")
        curve.append(combo)

    duties = []
    for (left, h0), (right, h1) in pairwise(curve):
        slope = (h1 - h0) / (right - left)
        if not isfinite(slope):
            raise ValueError("Two pump flows are too close to define a finite curve segment.")

        def residual(q):
            return h0 + slope*(q-left) - static - resistance*q*q

        def near_zero(q, value):
            return abs(value) <= 1e-10 * max(1, abs(h0+slope*(q-left)), abs(static+resistance*q*q))

        # The residual is concave. Split at its maximum to find both roots
        # on a rising pump segment, including an isolated tangency.
        peak = slope / (2*resistance)
        bounds = [left, peak, right] if left < peak < right else [left, right]
        for start, end in pairwise(bounds):
            lo, hi = start, end
            a, b = residual(lo), residual(hi)
            roots = [q for q, value in ((lo, a), (hi, b)) if near_zero(q,value)]
            if not roots and (a > 0) != (b > 0):
                for _ in range(60):
                    middle = (lo+hi)/2
                    if (residual(middle) > 0) == (a > 0):
                        lo = middle
                    else:
                        hi = middle
                roots.append((lo+hi)/2)
            for q in sorted(roots):
                derivative = slope - 2*resistance*q
                slope_state = ("near tangency" if abs(derivative) <= 1e-10*max(1, abs(slope), 2*resistance*q)
                               else "falling residual" if derivative < 0 else "rising residual")
                if duties and abs(q-duties[-1]["flow_m3_s"]) <= 1e-10*max(1, q):
                    if duties[-1]["local_slope"] != slope_state:
                        duties[-1]["local_slope"] = "slope changes at a supplied point"
                    continue
                head = h0+slope*(q-left)
                hydraulic = density*GRAVITY*q*head/1000
                duties.append(dict(flow_m3_s=q, head_m=head, hydraulic_kw=hydraulic,
                                   input_kw=None if efficiency is None else hydraulic/efficiency,
                                   local_slope=slope_state))
    max_flow = curve[-1][0]
    system = [(max_flow*i/60, static + resistance*(max_flow*i/60)**2) for i in range(61)]
    return dict(method=METHOD, duties=duties, pump_curve=curve, system_curve=system,
                measured_range_m3_s=[curve[0][0], max_flow])
