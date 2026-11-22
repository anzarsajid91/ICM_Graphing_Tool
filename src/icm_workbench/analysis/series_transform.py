# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Immutable resampling onto a reviewed project-clock grid."""
from __future__ import annotations

import math

import numpy as np


MAX_OUTPUT_PERIODS = 25_000
MAX_SOURCE_SAMPLES = 500_000


def parse_derived_series_record(text):
    """Validate a portable interval result without reclassifying it as observations."""
    import json
    import re

    from pandas import Timestamp

    from icm_workbench.parsers.common import canonical_unit

    if not isinstance(text, str) or not 1 <= len(text) <= 8 * 1024 * 1024 or "\0" in text:
        raise ValueError("Choose a local derived series JSON up to 8 MiB.")

    def object_from(items):
        result = dict(items)
        if len(result) != len(items):
            raise ValueError("The derived series JSON has duplicate keys.")
        return result

    try:
        raw = json.loads(text, object_pairs_hook=object_from)
    except (json.JSONDecodeError, RecursionError) as error:
        raise ValueError("The derived series file is malformed JSON.") from error
    if not isinstance(raw, dict) or raw.get("schema") != "hydra-derived-series-v1":
        raise ValueError("Choose a supported Hydra Bench derived series record.")

    def bounded(value, maximum, nullable=False):
        return (nullable and value is None) or (isinstance(value, str) and len(value) <= maximum)

    def number(value):
        return type(value) in (int, float) and abs(value) <= 1e308 and math.isfinite(value)

    def clock(value):
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,9})?", value):
            raise ValueError("Derived intervals require valid timezone-free project-clock timestamps.")
        try:
            return Timestamp(value).value
        except (ValueError, OverflowError) as error:
            raise ValueError("Derived interval timestamp is out of range.") from error

    def provenance(entry):
        if not isinstance(entry, dict) or any(not bounded(entry.get(key), limit) or not entry[key]
                for key, limit in (("name", 2048), ("column", 512), ("sha256", 64))):
            raise ValueError("The derived source identity is invalid.")
        if not re.fullmatch(r"[a-f0-9]{64}", entry["sha256"]) or not bounded(entry.get("source_unit"), 128, True):
            raise ValueError("The derived source fingerprint or unit is invalid.")
        exclusions = entry.get("exclusions")
        if not isinstance(exclusions, list) or len(exclusions) > 1000:
            raise ValueError("Review the source exclusions in the derived record.")
        reviewed = []
        for item in exclusions:
            if not isinstance(item, dict) or clock(item.get("start")) >= clock(item.get("end")):
                raise ValueError("Review increasing excluded periods in the derived record.")
            keys = ("start", "end", "id", "exclusion_id", "reason", "source", "scope", "time_basis")
            if any(key in item and not bounded(item[key], 4096, True) for key in keys):
                raise ValueError("Review the derived source exclusion metadata.")
            saved = {key: item[key] for key in keys if key in item}
            if "enabled" in item and type(item["enabled"]) is bool:
                saved["enabled"] = item["enabled"]
            if "target" in item:
                target = item["target"]
                target_keys = ("sha256", "display_name", "file_name", "column", "asset_id", "role", "quantity", "unit", "reference")
                if target is not None and (not isinstance(target, dict) or any(not bounded(target.get(key), 2048, True) for key in target_keys)):
                    raise ValueError("Review the excluded source reference in the derived record.")
                saved["target"] = None if target is None else {key: target[key] for key in target_keys if key in target}
            reviewed.append(saved)
        return dict(name=entry["name"], sha256=entry["sha256"], column=entry["column"], source_unit=entry.get("source_unit"), exclusions=reviewed)

    result = raw.get("result")
    if not bounded(raw.get("build"), 128) or not isinstance(result, dict) or result.get("method") != "temporal-support-grid-v1":
        raise ValueError("The derived record method or build is unsupported.")
    quantity, operation, output, unit = (result.get(key) for key in ("quantity", "operation", "output", "unit"))
    if quantity not in ("flow", "rainfall", "depth", "level", "velocity") or operation not in ("single", "add", "subtract"):
        raise ValueError("The derived quantity or arithmetic method is unsupported.")
    if operation == "add" and quantity not in ("flow", "rainfall"):
        raise ValueError("The derived addition uses an unsupported quantity.")
    expected = {"flow": ("m³", "L"), "rainfall": ("mm",)}
    if not bounded(unit, 128) or not ((output == "total" and unit in expected.get(quantity, ())) or
            (output == "mean" and canonical_unit(quantity, unit)[0] is not None and (quantity != "rainfall" or unit == "mm/h"))):
        raise ValueError("The derived result unit or period statistic is incompatible.")
    datum = result.get("datum")
    if not bounded(datum, 128, True) or quantity == "level" and operation == "subtract" and not datum:
        raise ValueError("The derived level difference requires its reviewed datum.")
    width, gap = result.get("interval_s"), result.get("max_gap_s")
    if not (number(width) and width >= .001 and number(gap) and gap >= .001):
        raise ValueError("The derived interval or maximum source gap is invalid.")
    source = provenance(raw.get("source"))
    reference = None if operation == "single" else provenance(raw.get("reference"))
    if operation == "single" and raw.get("reference") is not None:
        raise ValueError("A single derived source cannot contain a second operand.")
    inputs = result.get("inputs")
    operand_count = 1 if reference is None else 2
    if not isinstance(inputs, list) or len(inputs) != operand_count:
        raise ValueError("The derived record does not describe each operand.")
    reviewed_inputs = []
    for entry in inputs:
        if not isinstance(entry, dict) or entry.get("convention") not in ("instantaneous", "interval_average", "interval_depth"):
            raise ValueError("The source interval convention in the derived record is unsupported.")
        contract = entry.get("contract")
        keys = ("quantity", "original_unit", "canonical_unit", "unit_status", "unit_source")
        if not isinstance(contract, dict) or contract.get("quantity") != quantity or any(not bounded(contract.get(key), 256, True) for key in keys):
            raise ValueError("The source quantity contract in the derived record is invalid.")
        convention = entry["convention"]
        expected_unit = ({"interval_average": "mm/h", "interval_depth": "mm"}.get(convention) if quantity == "rainfall"
                         else {"flow": "m³/s", "depth": "m", "level": "m", "velocity": "m/s"}[quantity] if convention == "instantaneous" else None)
        if expected_unit is None or contract.get("canonical_unit") != expected_unit:
            raise ValueError("The derived source unit conflicts with its interval convention.")
        scale = contract.get("scale_to_canonical")
        shift, samples, excluded = (entry.get(key) for key in ("shift_s", "source_samples", "exclusions"))
        if not (number(scale) and scale > 0 and number(shift) and type(samples) is int and 1 <= samples <= MAX_SOURCE_SAMPLES
                and type(excluded) is int and 0 <= excluded <= 1000):
            raise ValueError("The derived source scaling, shift or counts are invalid.")
        reviewed_inputs.append(dict(contract={**{key: contract.get(key) for key in keys}, "scale_to_canonical": scale},
                                    convention=entry["convention"], shift_s=shift, source_samples=samples, exclusions=excluded))
    rows = result.get("rows")
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_OUTPUT_PERIODS:
        raise ValueError("The derived record needs 1 to 25,000 intervals.")
    previous, complete = None, 0
    for index, row in enumerate(rows):
        if not isinstance(row, list) or len(row) != 3 + operand_count:
            raise ValueError("The derived interval shape is incompatible with its operands.")
        first, last = clock(row[0]), clock(row[1])
        period = (last-first)/1e9
        if period <= 0 or (previous is not None and previous != first):
            raise ValueError("The derived series must contain contiguous project-clock intervals.")
        previous = last
        tolerance = 1e-8 + period*1e-12
        if period > width+tolerance or (index < len(rows)-1 and abs(period-width) > tolerance):
            raise ValueError("The derived interval widths conflict with its declared period.")
        if any(not number(valid) or valid < 0 or valid > period+tolerance for valid in row[3:]):
            raise ValueError("The derived interval has invalid source support.")
        has_value = row[2] is not None
        # ISO timestamps retain nanoseconds, while period widths originate as floats.
        if (has_value and (not number(row[2]) or any(abs(valid-period) > tolerance+1e-9 for valid in row[3:]))) or (
                not has_value and all(abs(valid-period) < tolerance-1e-9 for valid in row[3:])):
            raise ValueError("Derived readings require complete temporal support for each operand.")
        complete += has_value
    if type(result.get("complete_periods")) is not int or result["complete_periods"] != complete:
        raise ValueError("The derived series valid period count differs from its interval evidence.")
    kept = {key: result.get(key) for key in ("method", "quantity", "operation", "output", "unit", "datum", "interval_s", "max_gap_s", "complete_periods", "rows")}
    return dict(schema="hydra-derived-series-v1", build=raw["build"], source=source, reference=reference,
                result={**kept, "inputs": reviewed_inputs})


def period_boundaries(duration: float, interval: float) -> np.ndarray:
    """Cover the whole window, retaining a shorter final period when needed."""
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Choose an increasing transformation period.")
    if not math.isfinite(interval) or interval < 0.001:
        raise ValueError("The output period must be at least 0.001 seconds.")
    ratio = duration / interval
    if ratio > MAX_OUTPUT_PERIODS:
        raise ValueError("Choose a shorter period or larger timestep. The output limit is 25,000 periods.")
    edges = np.arange(max(1, math.ceil(ratio)), dtype=float) * interval
    return np.append(edges[edges < duration], duration)


def integrate_periods(
    times: np.ndarray,
    values: np.ndarray,
    edges: np.ndarray,
    *,
    convention: str,
    maximum_gap: float,
    trailing_support: float | None = None,
    exclusions: tuple[tuple[float, float], ...] = (),
    positive_only: bool = False,
) -> tuple[np.ndarray, np.ndarray]:
    """Return signed integrals and valid seconds for each half-open period.

    Times and edges use seconds on the same clock. Interval averages and
    depths are left-labelled. The input unit for rainfall rates here is
    depth/second. No source values or timestamps are modified.
    """
    if convention not in {"instantaneous", "interval_average", "interval_depth"}:
        raise ValueError("The source temporal support is unresolved.")
    if not math.isfinite(maximum_gap) or maximum_gap < 0.001:
        raise ValueError("The valid source gap must be at least 0.001 seconds.")
    if trailing_support is not None and (not math.isfinite(trailing_support) or trailing_support <= 0):
        raise ValueError("Invalid declared interval support.")
    if len(times) != len(values) or len(times) > MAX_SOURCE_SAMPLES:
        raise ValueError("A transformation supports up to 500,000 source samples.")
    if not np.isfinite(times).all() or np.any(np.diff(times) <= 0):
        raise ValueError("Resolve invalid, out-of-order and duplicate source timestamps before transforming.")

    left, right = times[:-1], times[1:]
    opening, closing = values[:-1], values[1:]
    if convention != "instantaneous" and trailing_support is not None and len(times):
        left, right = times, np.append(right, times[-1] + trailing_support)
        opening = values
    if not len(left):
        return np.zeros(len(edges) - 1), np.zeros(len(edges) - 1)

    # Insert every internal source/segment boundary, so each elementary
    # piece lies within one source interval and one requested period.
    first, last = edges[0], edges[-1]
    trimmed_exclusions = [(max(first, a), min(last, b)) for a, b in exclusions if a < last and b > first and b > a]
    source_boundaries = times[(times > first) & (times < last)]
    final = [right[-1]] if first < right[-1] < last else []
    points = np.unique(np.concatenate((edges, source_boundaries, final, np.ravel(trimmed_exclusions))))
    a, b = points[:-1], points[1:]
    index = np.searchsorted(left, a, side="right") - 1
    safe = np.clip(index, 0, len(left) - 1)
    period = np.searchsorted(edges, a, side="right") - 1
    duration = right[safe] - left[safe]
    opened = opening[safe]
    keep = (index >= 0) & (b <= right[safe]) & (duration <= maximum_gap) & np.isfinite(opened)
    if trimmed_exclusions:
        # Difference marking computes the union of overlapping exclusions
        # without scanning every source sample for each decision.
        excluded = np.zeros(len(points), dtype=np.int64)
        starts, ends = np.asarray(trimmed_exclusions, dtype=float).T
        np.add.at(excluded, np.searchsorted(points, starts), 1)
        np.add.at(excluded, np.searchsorted(points, ends), -1)
        keep &= np.cumsum(excluded[:-1]) == 0
    if convention == "instantaneous":
        keep &= np.isfinite(closing[safe])
    else:
        keep &= opened >= 0  # Negative rainfall is invalid support.

    safe, duration, opened = safe[keep], duration[keep], opened[keep]
    widths = b[keep] - a[keep]
    if convention == "instantaneous":
        fraction = ((a[keep] - left[safe]) + widths / 2) / duration
        mean = opened * (1 - fraction) + closing[safe] * fraction
        if positive_only:
            half_width = widths / 2 / duration
            left_fraction, right_fraction = fraction - half_width, fraction + half_width
            end = closing[safe]
            p = opened * (1 - left_fraction) + end * left_fraction
            q = opened * (1 - right_fraction) + end * right_fraction
            upper, lower = np.maximum(p, q), np.minimum(p, q)
            crossing = (upper > 0) & (lower < 0)
            mean = np.maximum(mean, 0)
            mean[crossing] = upper[crossing] * .5 / (1 + np.abs(lower[crossing]) / upper[crossing])
    else:
        mean = opened / duration if convention == "interval_depth" else opened
    count = len(edges) - 1
    totals = np.bincount(period[keep], weights=mean * widths, minlength=count)
    support = np.bincount(period[keep], weights=widths, minlength=count)
    if not np.isfinite(totals).all():
        raise ValueError("A resampled integral exceeded the finite supported range.")
    return totals, support
