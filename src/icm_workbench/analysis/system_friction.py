# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Full-pipe series/parallel curves with Reynolds-dependent Darcy resistance."""
from math import fsum, inf, isfinite, log, log10, pi, sqrt

from .darcy_sizing import _friction_factor
from .pipe_capacity import GRAVITY

LOG_10 = log(10)


class _Branch:
    def __init__(self, properties, viscosity):
        self.properties = properties
        self.diameter = properties["diameter_m"]
        self.area = pi * self.diameter**2 / 4
        self.ld = properties["length_m"] / self.diameter
        self.k_values = tuple(properties[key] for key in ("minor_k", "entrance_k", "exit_k"))
        self.k = fsum(self.k_values)
        self.relative_roughness = properties["roughness_m"] / self.diameter
        self.velocity_per_re = viscosity / self.diameter
        self.laminar_gradient = 32 * self.velocity_per_re * self.ld / GRAVITY
        laminar_limit = 2000 * self.velocity_per_re
        turbulent_limit = 4000 * self.velocity_per_re
        self.laminar_head = self.laminar_gradient * laminar_limit + self.k * laminar_limit**2 / (2 * GRAVITY)
        self.turbulent_head = self.head(turbulent_limit, True)

    def head(self, velocity, turbulent):
        dynamic = velocity**2 / (2 * GRAVITY)
        if not turbulent:
            return self.laminar_gradient * velocity + self.k * dynamic
        factor = _friction_factor(self.relative_roughness, max(4000, velocity / self.velocity_per_re))
        return (factor * self.ld + self.k) * dynamic

    def flow(self, head, turbulent):
        if not turbulent:
            # Stable positive root of h = bV + KV²/(2g), valid also when K = 0.
            denominator = self.laminar_gradient + sqrt(self.laminar_gradient**2 + 2*self.k*head/GRAVITY)
            return self.area * (2 * head / denominator)

        # Eliminate V from Darcy–Weisbach and Colebrook using x = 1/√f.
        coefficient = 2.51 * self.velocity_per_re / sqrt(2 * GRAVITY * head)
        roughness = self.relative_roughness / 3.7
        inverse_root = 8.0
        for _ in range(16):
            geometry = sqrt(self.ld + self.k * inverse_root**2)
            argument = roughness + coefficient * geometry
            residual = inverse_root + 2 * log10(argument)
            if abs(residual) < 1e-12:
                break
            derivative = 1 + 2/LOG_10 * coefficient * self.k * inverse_root / (geometry * argument)
            inverse_root -= residual / derivative
        else:
            raise ArithmeticError("A turbulent branch did not converge within the numerical tolerance.")
        return self.area * inverse_root * sqrt(2 * GRAVITY * head / (self.ld + self.k * inverse_root**2))

    def row(self, flow, turbulent):
        velocity = flow / self.area
        reynolds = velocity / self.velocity_per_re
        factor = (_friction_factor(self.relative_roughness, max(4000, reynolds)) if turbulent
                  else 64/reynolds if reynolds > 0 else None)
        if factor is not None and not isfinite(factor):
            factor = None
        dynamic = velocity**2 / (2 * GRAVITY)
        friction = factor * self.ld * dynamic if turbulent else self.laminar_gradient * velocity
        fittings, entrance, exit_loss = (coefficient * dynamic for coefficient in self.k_values)
        return dict(self.properties, flow_m3_s=flow, velocity_m_s=velocity, reynolds=reynolds, darcy_factor=factor,
                    regime="turbulent" if turbulent else "laminar" if flow else "zero flow", friction_m=friction,
                    fittings_m=fittings, entrance_m=entrance, exit_m=exit_loss,
                    loss_m=fsum((friction, fittings, entrance, exit_loss)))


class _Stage:
    def __init__(self, pipes, viscosity):
        self.branches = [_Branch(pipe, viscosity) for pipe in pipes]
        gaps = []
        for start, end in sorted((branch.laminar_head, branch.turbulent_head) for branch in self.branches):
            if gaps and start <= gaps[-1][1]:
                gaps[-1] = gaps[-1][0], max(end, gaps[-1][1])
            else:
                gaps.append((start, end))
        self.intervals = []
        for low, high in zip([0, *(end for _, end in gaps)], [*(start for start, _ in gaps), inf]):
            turbulent = tuple(low >= branch.turbulent_head for branch in self.branches)
            minimum = fsum(self.flows(low, turbulent))
            maximum = inf if high == inf else fsum(self.flows(high, turbulent))
            self.intervals.append((minimum, maximum, low, high, turbulent))

    def flows(self, head, turbulent):
        return [branch.flow(head, regime) for branch, regime in zip(self.branches, turbulent)]

    def solve(self, flow):
        for index, (minimum, maximum, low, high, turbulent) in enumerate(self.intervals):
            if minimum <= flow < maximum:
                if len(self.branches) == 1:
                    branch = self.branches[0]
                    return index, branch.head(flow/branch.area, turbulent[0]), [flow], turbulent
                if flow == minimum:
                    return index, low, self.flows(low, turbulent), turbulent
                # Putting the entire flow through any branch gives an upper head bound.
                single_branch_head = min(branch.head(flow/branch.area, regime)
                                         for branch, regime in zip(self.branches, turbulent))
                high = min(high, max(low, single_branch_head))
                for _ in range(58):
                    head = (low + high) / 2
                    if fsum(self.flows(head, turbulent)) < flow:
                        low = head
                    else:
                        high = head
                head = (low + high) / 2
                return index, head, self.flows(head, turbulent), turbulent
        return None


def calculated_system_curve(pipes, static, flow, upper, viscosity):
    """Apply common head to parallel branches and common flow to series stages."""
    stages = [_Stage(branches, viscosity) for branches in pipes]
    duty = [stage.solve(flow) for stage in stages]
    loss = None
    rows = []
    if all(result is not None for result in duty):
        loss = fsum(result[1] for result in duty)
        for index, (stage, (_, _, flows, regimes)) in enumerate(zip(stages, duty), 1):
            rows.extend(dict(branch.row(q, turbulent), stage=index, branch=branch_index)
                        for branch_index, (branch, q, turbulent) in enumerate(zip(stage.branches, flows, regimes), 1))

    curve = []
    previous = None
    for step in range(41):
        q = upper * step / 40
        solved = [stage.solve(q) for stage in stages]
        if any(result is None for result in solved):
            curve.append((q, None))
            previous = None
            continue
        intervals = tuple(result[0] for result in solved)
        if previous is not None and previous != intervals:
            for stage, before, after in zip(stages, previous, intervals):
                if before != after:
                    left, right = stage.intervals[before][1], stage.intervals[after][0]
                    curve.append(((left + right) / 2, None))
                    break
        curve.append((q, static + fsum(result[1] for result in solved)))
        previous = intervals
    return dict(method="steady-calculated-darcy-v1", static_head_m=static, loss_m=loss,
                total_head_m=None if loss is None else static+loss, viscosity_m2_s=viscosity, rows=rows, curve=curve)
