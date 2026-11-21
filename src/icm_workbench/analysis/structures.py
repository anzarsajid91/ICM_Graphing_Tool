# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Steady hydraulic screening with explicit applicability and coefficients."""
from bisect import bisect_left
from math import isfinite, pi, sqrt


GRAVITY = 9.80665
METHOD = "hydraulic-structure-screening-v1"
WEIR_MIN_HEAD_M = 0.06096  # USBR sharp-crested weir nappe recommendation (0.2 ft).


def _checked(value, name, minimum, maximum):
    if type(value) not in (int, float) or not isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum:g} and {maximum:g}.")
    return float(value)


def screen_structure(kind, level_up, level_down, sill_m, datum, coefficient,
                     width_m=None, opening_m=None, orifice_shape=None,
                     submerged_coefficient=None, allow_reverse=False, applicability_confirmed=False):
    if kind not in {"sharp-crested-weir", "orifice", "sluice"}:
        raise ValueError("Choose a supported structure type.")
    if not isinstance(datum, str) or not datum.strip() or len(datum) > 128:
        raise ValueError("Enter the common vertical datum for both levels and the structure.")
    if applicability_confirmed is not True:
        raise ValueError("Review applicability, the approach conditions and coefficient evidence first.")
    up = _checked(level_up, "Nominal upstream level in m", -1e5, 1e5)
    down = _checked(level_down, "Nominal downstream level in m", -1e5, 1e5)
    sill = _checked(sill_m, "Crest or opening invert in m", -1e5, 1e5)
    cd = None if coefficient is None else _checked(coefficient, "Free-flow coefficient", 1e-9, 1)
    submerged_cd = None if submerged_coefficient is None else _checked(submerged_coefficient, "Submerged-flow coefficient", 1e-9, 1)
    if kind == "sharp-crested-weir":
        width = _checked(width_m, "Effective crest width in m", 1e-6, 10000)
        opening = area = None
    elif kind == "orifice" and orifice_shape == "circular":
        opening = _checked(opening_m, "Orifice diameter in m", 1e-6, 10000)
        width, area = None, pi * opening ** 2 / 4
    else:
        if kind == "orifice" and orifice_shape != "rectangular":
            raise ValueError("Select a circular or rectangular opening.")
        width = _checked(width_m, "Opening width in m", 1e-6, 10000)
        opening = _checked(opening_m, "Opening height in m", 1e-6, 10000)
        area = width * opening

    high, low = max(up, down) - sill, min(up, down) - sill
    signed = up - down
    ratio = max(0, low) / high if high > 0 else None
    evidence = dict(method=METHOD, structure=kind, datum=datum.strip(), nominal_upstream_level_m=up,
                    nominal_downstream_level_m=down, sill_m=sill, reverse_confirmed=allow_reverse is True,
                    signed_level_difference_m=signed, high_head_m=high, low_head_m=low, tailwater_ratio=ratio,
                    width_m=width, opening_m=opening, area_m2=area, orifice_shape=orifice_shape,
                    free_coefficient=cd, submerged_coefficient=submerged_coefficient)

    def result(status, regime, flow_magnitude, formula, explanation, effective_head=None, used_cd=None):
        flow = None if flow_magnitude is None else (-flow_magnitude if signed < 0 and flow_magnitude else flow_magnitude)
        return dict(**evidence, status=status, regime=regime, flow_m3_s=flow,
                    effective_head_m=effective_head, coefficient_used=used_cd, equation=formula, explanation=explanation)

    if high <= 0 or signed == 0:
        return result("available", "no-driving-head", 0.0, "Q = 0", "Both levels are below the structure or the driving levels are equal.")
    if signed < 0 and allow_reverse is not True:
        return result("withheld", "reverse-not-confirmed", None, None, "Confirm a symmetric, reversible structure without a flap or directional loss.")

    if kind == "sharp-crested-weir":
        if high < WEIR_MIN_HEAD_M:
            return result("withheld", "low-weir-head", None, None, "The head is below the 0.06096 m sharp-crested nappe screening threshold.")
        if cd is None:
            return result("withheld", "weir-coefficient-required", None, None, "Enter a justified thin-plate discharge coefficient.")
        free_flow = (2 / 3) * cd * width * sqrt(2 * GRAVITY) * high ** 1.5
        if low <= 0:
            return result("available", "free-weir", free_flow, "Q = (2/3) Cd W √(2g) H^1.5",
                          "Thin-plate rectangular crest, free nappe and reviewed coefficient.", high, cd)
        factor = (1 - ratio ** 1.5) ** .385
        return result("available", "submerged-weir", free_flow * factor, "Q = Qfree [1 − (Hd/H)^1.5]^0.385",
                      "Villemonte reduction for a sharp-crested rectangular weir. Review tailwater location and limitations at high submergence.", high, cd)

    if kind == "sluice" and high <= 1.25 * opening:
        return result("withheld", "low-gate-head", None, None, "Headwater must exceed 1.25 times the gate opening. Weir and opening-transition flow are outside this screen.")
    if kind == "orifice" and high < opening:
        return result("withheld", "partly-wetted-opening", None, None, "The high side does not wet the entire opening. Use an applicable partial-opening model.")

    if kind == "sluice" and ratio >= .67 and ratio < .80:
        return result("withheld", "gate-transition", None, None, "Tailwater ratio is in the 0.67–0.80 transition range. Use an applicable gate model.")
    free = low <= 0 if kind == "orifice" else ratio < .67
    if free:
        if cd is None:
            return result("withheld", "free-coefficient-required", None, None, "Enter a separately justified free-discharge coefficient.")
        head = high - opening / 2 if kind == "orifice" else high
        return result("available", "free-opening", cd * area * sqrt(2 * GRAVITY * head), "Q = Cd A √(2g H)",
                      "Free orifice head is referenced to the opening centre. Free sluice head is referenced to the sill.", head, cd)
    if low < opening:
        return result("withheld", "partial-submergence", None, None, "The receiving side only partly submerges the opening. Use a model for the transition.")
    if submerged_cd is None:
        return result("withheld", "submerged-coefficient-required", None, None, "Enter a separately justified submerged-discharge coefficient.")
    difference = abs(signed)
    return result("available", "submerged-opening", submerged_cd * area * sqrt(2 * GRAVITY * difference),
                  "Q = Cd A √(2g |ΔH|)", "Both sides wet the full opening. Use the measured level difference.", difference, submerged_cd)


def screen_rating_curve(points, head_difference_m, reversible=False):
    """Linear interpolation inside a supplied head-difference curve only."""
    if not isinstance(points, list) or not 2 <= len(points) <= 100:
        raise ValueError("Supply 2 to 100 rated head and flow pairs.")
    entries = [(_checked(head,"Rated head in m",0,1e5),_checked(flow,"Rated discharge in m³/s",0,1e5))
               for head,flow in points]
    if any(b[0] <= a[0] or b[1] < a[1] for a,b in zip(entries, entries[1:])):
        raise ValueError("Supply strictly increasing heads and nondecreasing discharges.")
    if entries[0][0] == 0 and entries[0][1] != 0:
        raise ValueError("A passive differential-head curve must have zero discharge at zero head.")
    difference = _checked(head_difference_m, "Signed head difference in m", -1e5, 1e5)
    magnitude = abs(difference)
    result = dict(method=METHOD, signed_head_difference_m=difference, points=entries, flow_m3_s=None,
                  reversible=reversible is True, interpolation="piecewise-linear")
    if difference < 0 and reversible is not True:
        return dict(result, status="reverse-not-confirmed")
    if magnitude < entries[0][0] or magnitude > entries[-1][0]:
        return dict(result, status="outside-curve")
    index = bisect_left([point[0] for point in entries], magnitude)
    upper = entries[index]
    if upper[0] == magnitude:
        flow = upper[1]
    else:
        lower = entries[index - 1]
        flow = lower[1] + (upper[1] - lower[1]) * (magnitude - lower[0]) / (upper[0] - lower[0])
    return dict(result, status="available", flow_m3_s=-flow if difference < 0 else flow)
