# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Independent changes in error on a controlled verification basis."""
from __future__ import annotations

import re
from collections import defaultdict
from math import isclose, isfinite

import pandas as pd


SCHEMA = "hydra-verification-snapshot-v1"
QUANTITIES = ("flow", "depth")
AGREEMENT_KEYS = {"flow": ("peak", "volume", "timing"), "depth": ("peak", "timing")}
CHECK_UNITS = {"coverage": "%", "depth_peak": "m", "flow_peak": "%", "volume": "%", "timing": "min"}
HASH = re.compile(r"[0-9a-f]{64}")
TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?")


def _scalar(value, default=None):
    try:
        return value if type(value) in (int, float) and isfinite(value) else default
    except OverflowError:
        return default


def _reference(row):
    value = row["observed_sha256"]
    column = row["observed_column"]
    if not isinstance(value, str) or not HASH.fullmatch(value) or not isinstance(column, str) or not 0 < len(column) <= 250:
        raise ValueError("Each verification record requires an observed source fingerprint and channel.")
    return value, column


def _period(row):
    try:
        raw = tuple(row[key] for key in ("start", "end"))
        if any(not isinstance(value, str) or not TIMESTAMP.fullmatch(value) for value in raw):
            raise ValueError("Invalid timestamp syntax.")
        values = tuple(pd.Timestamp(value) for value in raw)
    except (ValueError, TypeError, KeyError) as error:
        raise ValueError("Each verification record requires a valid project-clock period.") from error
    if any(pd.isna(value) or value.tzinfo is not None for value in values) or values[1] <= values[0]:
        raise ValueError("Each verification record requires a valid project-clock period.")
    return tuple(value.isoformat() for value in values)


def _rows(snapshot):
    if not isinstance(snapshot, dict) or snapshot.get("schema") != SCHEMA or snapshot.get("quantity") not in QUANTITIES:
        raise ValueError("Open a supported Hydra Bench verification snapshot.")
    rows = snapshot.get("rows")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 512:
        raise ValueError("A snapshot must contain between 1 and 512 verification comparisons.")
    index = defaultdict(list)
    for number, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError("The snapshot contains an invalid comparison record.")
        try:
            identity = (*_reference(row), *_period(row))
        except KeyError as error:
            raise ValueError("The snapshot is missing required comparison provenance.") from error
        model, model_column = row.get("model_sha256"), row.get("model_column")
        if (not isinstance(model, str) or not HASH.fullmatch(model) or not isinstance(model_column, str)
                or not 0 < len(model_column) <= 250 or type(row.get("complete_support")) is not bool):
            raise ValueError("Each comparison requires the modelled channel and its reviewed support state.")
        index[identity].append((number, row))
    return index


def _basis(snapshot):
    method = snapshot.get("method")
    qualification = snapshot.get("rainfall_basis")
    criteria = snapshot.get("criteria")
    if (method != "project-event-screens-v1" or qualification not in ("survey", "data")
            or not isinstance(criteria, dict) or any(_scalar(value) is None for value in criteria.values())):
        raise ValueError("The snapshot requires reviewed verification and rainfall settings.")
    gap, shift = _scalar(snapshot.get("maximum_gap_seconds")), _scalar(snapshot.get("model_offset_minutes"))
    if gap is None or gap <= 0 or shift is None:
        raise ValueError("The snapshot requires finite gap and clock settings.")
    expected = {"minimum_coverage_percent", "peak_offset_minutes"}
    expected |= ({"flow_peak_floor_m3_s", "flow_volume_floor_m3", "flow_peak_error_percent", "flow_volume_error_percent"}
                 if snapshot["quantity"] == "flow" else {"depth_peak_error_m"})
    if set(criteria) != expected or any(value < 0 for value in criteria.values()) or not 0 < criteria["minimum_coverage_percent"] <= 100:
        raise ValueError("The snapshot requires complete, finite project tolerances.")
    if snapshot["quantity"] == "flow" and (criteria["flow_peak_floor_m3_s"] < 1e-12 or criteria["flow_volume_floor_m3"] < 1e-9):
        raise ValueError("The snapshot requires positive observed-flow reference floors.")
    return snapshot["quantity"], method, qualification, tuple(sorted(criteria.items())), gap, shift


def verification_snapshot_summary(snapshot):
    index = _rows(snapshot)
    _basis(snapshot)
    label = snapshot.get("label")
    if not isinstance(label, str) or not label.strip() or len(label) > 160:
        raise ValueError("A verification snapshot requires a reviewed revision name of up to 160 characters.")
    return {"label": label, "quantity": snapshot["quantity"], "comparisons": sum(len(rows) for rows in index.values())}


def _full_support(row, duration):
    evidence = row.get("evidence")
    if row.get("complete_support") is not True or not isinstance(evidence, dict) or evidence.get("status") != "complete":
        return False
    requested = _scalar(evidence.get("requested_seconds"))
    common = _scalar(evidence.get("common_support_seconds"))
    return (_scalar(evidence.get("excluded_seconds")) == 0 and requested is not None and common is not None
            and isclose(requested, duration, rel_tol=1e-12, abs_tol=1e-6)
            and isclose(common, duration, rel_tol=1e-12, abs_tol=1e-6))


def _same_observed_evidence(original, proposed, quantity):
    keys = ("observed_peak", "observed_volume_m3") if quantity == "flow" else ("observed_peak",)
    for key in keys:
        before, after = (_scalar(row["evidence"].get(key)) for row in (original, proposed))
        if before is None or after is None or not isclose(before, after, rel_tol=1e-9, abs_tol=1e-9):
            return False
    return True


def compare_verification_revisions(baseline, candidate):
    """Compare only the same measured record, exact event and common supported basis."""
    original, proposed = _rows(baseline), _rows(candidate)
    same_basis = _basis(baseline) == _basis(candidate)
    keys = AGREEMENT_KEYS[candidate["quantity"]]

    def change(key, a, b):
        left, right = a.get("checks"), b.get("checks")
        first = left.get(key) if isinstance(left, dict) else None
        second = right.get(key) if isinstance(right, dict) else None
        if not isinstance(first, dict) or not isinstance(second, dict):
            return {"status": "Not comparable", "reason": "One revision lacks the agreement criterion."}
        unit_key = candidate["quantity"] + "_peak" if key == "peak" else key
        unit = CHECK_UNITS[unit_key]
        if first.get("unit") != unit or second.get("unit") != unit:
            return {"status": "Not comparable", "reason": "The criterion units are missing or incompatible."}
        values = _scalar(first.get("value")), _scalar(second.get("value"))
        criterion_states = ("Meets", "Outside tolerance")
        if None in values or first.get("status") not in criterion_states or second.get("status") not in criterion_states:
            return {"status": "Not comparable", "reason": "At least one revision has a withheld criterion."}
        delta = abs(values[1]) - abs(values[0])
        epsilon = max(1e-12, 1e-12 * max(abs(values[0]), abs(values[1])))
        status = "Unchanged" if abs(delta) <= epsilon else "Improved" if delta < 0 else "Deteriorated"
        return dict(status=status, baseline=values[0], candidate=values[1], change_in_error_magnitude=delta,
                    unit=unit, reason=None)

    decisions = []
    def unavailable(reason):
        return {key: {"status": "Not comparable", "reason": reason} for key in keys}

    for identity, entries in proposed.items():
        duration = (pd.Timestamp(identity[3]) - pd.Timestamp(identity[2])).total_seconds()
        for number, row in entries:
            originals = original.get(identity, [])
            match = originals[0] if len(originals) == 1 else None
            reason = None
            if not same_basis:
                reason = "Review methods, rainfall basis, gap, clock settings and criteria against the same project basis."
            elif not originals:
                reason = "No baseline shares this observed record and exact event window."
            elif not match:
                reason = "More than one baseline applies to this record and event. Choose one reviewed baseline."
            elif (not isinstance(row.get("rainfall_provenance"), str) or not HASH.fullmatch(row["rainfall_provenance"])
                  or match[1].get("rainfall_provenance") != row["rainfall_provenance"]):
                reason = "Both revisions require the same identified rainfall qualification evidence."
            elif not _full_support(match[1], duration) or not _full_support(row, duration):
                reason = "Both revision records require the complete event window and zero exclusions."
            elif not _same_observed_evidence(match[1], row, candidate["quantity"]):
                reason = "The observed peak or volume differs. Check the source interpretation and supported period."
            results = unavailable(reason) if reason else {key: change(key, match[1], row) for key in keys}
            decisions.append({"candidate_row": number, "baseline_row": match[0] if match else None, "checks": results})
    for identity, entries in original.items():
        if identity not in proposed:
            for number, _ in entries:
                decisions.append({"candidate_row": None, "baseline_row": number,
                                  "checks": unavailable("No proposed record shares this baseline and exact event window.")})
    return {"method": "verification-revision-delta-v1", "rows": decisions}
