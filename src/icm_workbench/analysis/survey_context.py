from __future__ import annotations

import math
import re
from typing import Any

import numpy as np
import pandas as pd

from icm_workbench.analysis.integration import integrate_series


_HEADER_ALIASES = {
    "monitor": {
        "fm", "fdv", "fdvname", "fdvmonitor", "monitor", "monitorname",
        "flowmonitor", "flowmonitorname", "site", "sitename",
    },
    "rain_gauge": {
        "rg", "rgused", "raingauge", "raingaugeused", "rainfallgauge",
        "associatedrg", "associatedraingauge", "gauge",
    },
    "diameter_mm": {
        "diameter", "diametermm", "pipediameter", "pipediametermm",
        "pipediam", "pipeidmm",
    },
    "upstream": {
        "upstream", "upstreamtrace", "upstreammonitor", "upstreammonitors",
        "upstreamflowmonitor", "upstreamflowmonitors", "upstreamfm",
    },
}


def _header_token(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in {"nan", "none", "null"} else text


def _float_or_none(value: Any) -> float | None:
    text = _clean_text(value)
    if not text:
        return None
    try:
        number = float(text.replace(",", ""))
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _split_upstream(value: Any) -> list[str]:
    text = _clean_text(value)
    if not text:
        return []
    parts = [x.strip() for x in re.split(r"[,;\n]+", text) if x.strip()]
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        key = _header_token(part)
        if key and key not in seen:
            seen.add(key)
            out.append(part)
    return out


def normalise_association_table(
    headers: list[Any],
    rows: list[list[Any]],
) -> dict[str, Any]:
    """Normalise the four-column fm_rg_assoc.xlsx contract.

    Header aliases are preferred. Missing/unknown headers fall back to positional
    columns 1..4: monitor, rain gauge, pipe diameter (mm), upstream flow monitors.
    Duplicate/conflicting monitor rows are surfaced; no values are silently merged.
    """
    headers = list(headers or [])
    tokens = [_header_token(x) for x in headers]
    positions: dict[str, int] = {}
    for field, aliases in _HEADER_ALIASES.items():
        positions[field] = next(
            (i for i, token in enumerate(tokens) if token in aliases),
            -1,
        )
    for field, fallback in (
        ("monitor", 0),
        ("rain_gauge", 1),
        ("diameter_mm", 2),
        ("upstream", 3),
    ):
        if positions[field] < 0 and len(headers) > fallback:
            positions[field] = fallback

    records: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    by_monitor: dict[str, dict[str, Any]] = {}
    for row_index, raw in enumerate(rows or [], start=2):
        row = list(raw or [])

        def cell(field: str) -> Any:
            pos = positions[field]
            return row[pos] if pos >= 0 and pos < len(row) else None

        monitor = _clean_text(cell("monitor"))
        if not monitor:
            if any(_clean_text(x) for x in row):
                issues.append(
                    {
                        "severity": "warning",
                        "row": row_index,
                        "field": "monitor",
                        "message": "Ignored non-empty row because monitor name is blank.",
                    }
                )
            continue
        record = {
            "monitor": monitor,
            "rain_gauge": _clean_text(cell("rain_gauge")) or None,
            "diameter_mm": _float_or_none(cell("diameter_mm")),
            "upstream": _split_upstream(cell("upstream")),
            "source": "fm_rg_assoc.xlsx",
            "row": row_index,
        }
        if _clean_text(cell("diameter_mm")) and record["diameter_mm"] is None:
            issues.append(
                {
                    "severity": "warning",
                    "row": row_index,
                    "monitor": monitor,
                    "field": "diameter_mm",
                    "message": "Pipe diameter is not numeric; workbook value retained as unresolved.",
                }
            )
        if record["diameter_mm"] is not None and record["diameter_mm"] <= 0:
            issues.append(
                {
                    "severity": "warning",
                    "row": row_index,
                    "monitor": monitor,
                    "field": "diameter_mm",
                    "message": "Pipe diameter must be positive; value treated as unresolved.",
                }
            )
            record["diameter_mm"] = None

        key = _header_token(monitor)
        previous = by_monitor.get(key)
        if previous is not None:
            same = (
                previous.get("rain_gauge") == record.get("rain_gauge")
                and previous.get("diameter_mm") == record.get("diameter_mm")
                and [_header_token(x) for x in previous.get("upstream", [])]
                == [_header_token(x) for x in record.get("upstream", [])]
            )
            issues.append(
                {
                    "severity": "warning" if same else "error",
                    "row": row_index,
                    "monitor": monitor,
                    "field": "monitor",
                    "message": (
                        "Duplicate monitor row matches the earlier definition."
                        if same
                        else "Conflicting duplicate monitor row; first workbook row remains authoritative."
                    ),
                }
            )
            continue
        by_monitor[key] = record
        records.append(record)

    known = {_header_token(x["monitor"]): x["monitor"] for x in records}
    for record in records:
        monitor_key = _header_token(record["monitor"])
        for upstream in record["upstream"]:
            key = _header_token(upstream)
            if key == monitor_key:
                issues.append(
                    {
                        "severity": "error",
                        "row": record["row"],
                        "monitor": record["monitor"],
                        "field": "upstream",
                        "message": "Monitor cannot reference itself as an upstream monitor.",
                    }
                )
            elif key not in known:
                issues.append(
                    {
                        "severity": "warning",
                        "row": record["row"],
                        "monitor": record["monitor"],
                        "field": "upstream",
                        "message": f"Upstream monitor {upstream!r} is not defined elsewhere in the association workbook.",
                    }
                )

    return {
        "records": records,
        "issues": issues,
        "columns": {
            field: (
                headers[pos]
                if pos >= 0 and pos < len(headers)
                else None
            )
            for field, pos in positions.items()
        },
        "status": (
            "error"
            if any(x["severity"] == "error" for x in issues)
            else ("warning" if issues else "ok")
        ),
        "method": "fm-rg-association-v1",
        "precedence": "workbook-authoritative",
    }


def merge_authoritative_associations(
    records: list[dict[str, Any]],
    inferred: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Apply workbook precedence and expose conflicts with inferred source metadata."""
    inferred = inferred or {}
    inferred_by_key = {_header_token(k): v for k, v in inferred.items()}
    merged: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    for original in records or []:
        record = dict(original)
        source = inferred_by_key.get(_header_token(record.get("monitor")), {})
        inf_diameter = _float_or_none(source.get("diameter_mm"))
        if (
            record.get("diameter_mm") is not None
            and inf_diameter is not None
            and not math.isclose(float(record["diameter_mm"]), inf_diameter, rel_tol=0.0, abs_tol=0.5)
        ):
            conflicts.append(
                {
                    "monitor": record["monitor"],
                    "field": "diameter_mm",
                    "workbook": record["diameter_mm"],
                    "inferred": inf_diameter,
                    "resolution": "workbook",
                }
            )
        if record.get("diameter_mm") is None and inf_diameter is not None:
            record["diameter_mm_inferred"] = inf_diameter

        inf_rg = _clean_text(source.get("rain_gauge"))
        if (
            record.get("rain_gauge")
            and inf_rg
            and _header_token(record["rain_gauge"]) != _header_token(inf_rg)
        ):
            conflicts.append(
                {
                    "monitor": record["monitor"],
                    "field": "rain_gauge",
                    "workbook": record["rain_gauge"],
                    "inferred": inf_rg,
                    "resolution": "workbook",
                }
            )
        if not record.get("rain_gauge") and inf_rg:
            record["rain_gauge_inferred"] = inf_rg
        merged.append(record)

    return {
        "records": merged,
        "conflicts": conflicts,
        "precedence": "fm_rg_assoc.xlsx overrides inferred FDV/source metadata",
    }


def classify_volume_balance(
    downstream_volume_m3: float | None,
    upstream_volume_m3: float | None,
    *,
    complete: bool = True,
    amber_tolerance_percent: float = 10.0,
) -> dict[str, Any]:
    if (
        not complete
        or downstream_volume_m3 is None
        or upstream_volume_m3 is None
        or not np.isfinite(downstream_volume_m3)
        or not np.isfinite(upstream_volume_m3)
    ):
        return {
            "rag": "Grey",
            "ratio": None,
            "deficit_m3": None,
            "deficit_percent": None,
            "reason": "Incomplete assessable support.",
        }
    lhs = float(downstream_volume_m3)
    rhs = float(upstream_volume_m3)
    if rhs <= 0:
        return {
            "rag": "Grey",
            "ratio": None,
            "deficit_m3": lhs - rhs,
            "deficit_percent": None,
            "reason": "Upstream signed volume is non-positive; verify sign convention and source mapping.",
        }
    ratio = lhs / rhs
    deficit = lhs - rhs
    deficit_pct = (rhs - lhs) / rhs * 100.0
    amber_floor = 1.0 - max(0.0, float(amber_tolerance_percent)) / 100.0
    if ratio >= 1.0:
        rag = "Green"
        reason = "Downstream volume is at least the summed upstream measured volume."
    elif ratio >= amber_floor:
        rag = "Amber"
        reason = "Downstream volume is slightly below the summed upstream measured volume."
    else:
        rag = "Red"
        reason = "Downstream volume is materially below the summed upstream measured volume."
    return {
        "rag": rag,
        "ratio": float(ratio),
        "deficit_m3": float(deficit),
        "deficit_percent": float(deficit_pct),
        "reason": reason,
    }


def _normalise_flow_frame(frame: pd.DataFrame, column: str) -> pd.DataFrame:
    if frame is None or getattr(frame, "empty", True):
        return pd.DataFrame(columns=["timestamp", "flow"])
    out = frame[["timestamp", column]].copy()
    out["timestamp"] = pd.to_datetime(out["timestamp"], errors="coerce")
    out["flow"] = pd.to_numeric(out[column], errors="coerce")
    return (
        out[["timestamp", "flow"]]
        .dropna(subset=["timestamp"])
        .sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
        .reset_index(drop=True)
    )


def _inside_exclusion(stamp: pd.Timestamp, exclusions: list[Any]) -> bool:
    for exc in exclusions or []:
        start = pd.Timestamp(getattr(exc, "start", exc.get("start") if isinstance(exc, dict) else None))
        end = pd.Timestamp(getattr(exc, "end", exc.get("end") if isinstance(exc, dict) else None))
        if pd.notna(start) and pd.notna(end) and start <= stamp < end:
            return True
    return False


def _legacy_signed_volume(
    frame: pd.DataFrame,
    start: pd.Timestamp,
    end: pd.Timestamp,
    exclusions: list[Any],
) -> tuple[float | None, bool, int]:
    x = frame.loc[
        (frame["timestamp"] >= start) & (frame["timestamp"] < end)
    ].copy()
    if exclusions:
        x = x.loc[
            ~x["timestamp"].map(lambda t: _inside_exclusion(pd.Timestamp(t), exclusions))
        ]
    q = pd.to_numeric(x["flow"], errors="coerce")
    valid = x["timestamp"].notna() & q.notna()
    x = x.loc[valid].copy()
    q = pd.to_numeric(x["flow"], errors="coerce")
    n_valid = int(len(q))
    zero_issue = bool(n_valid and (q == 0.0).mean() > 0.50)
    if n_valid < 2:
        return None, zero_issue, n_valid
    t = pd.to_datetime(x["timestamp"], errors="coerce")
    dt = t.diff().dt.total_seconds().iloc[1:].to_numpy(dtype=float)
    q0 = q.iloc[:-1].to_numpy(dtype=float)
    q1 = q.iloc[1:].to_numpy(dtype=float)
    good = np.isfinite(dt) & (dt > 0)
    if not np.any(good):
        return None, zero_issue, n_valid
    volume = float(np.sum((q0[good] + q1[good]) * 0.5 * dt[good]))
    return volume, zero_issue, n_valid


def _diagnostic_recommendation(
    downstream: str,
    upstream: list[str],
    volumes: dict[str, dict[str, Any]],
    classification: dict[str, Any],
) -> tuple[str, str]:
    involved = [downstream, *upstream]
    incomplete = [
        name for name in involved
        if (volumes.get(name) or {}).get("status") != "complete"
    ]
    if incomplete:
        return (
            ", ".join(incomplete),
            "Resolve incomplete/gapped support for the listed monitor(s) before interpreting continuity. Excluded time is not treated as non-flow.",
        )

    zero_issue = [
        name for name in involved if bool((volumes.get(name) or {}).get("zero_issue"))
    ]
    rag = classification.get("rag")
    if rag == "Green":
        return (
            "No specific monitor indicated",
            "No measured volume deficit is indicated. A downstream excess may reflect legitimate lateral/unmonitored inflow; investigate only if the magnitude is implausible.",
        )

    downstream_zero = downstream in zero_issue
    upstream_values = [
        (name, float((volumes.get(name) or {}).get("volume_m3") or 0.0))
        for name in upstream
    ]
    dominant = max(upstream_values, key=lambda x: x[1], default=(None, 0.0))[0]
    if downstream_zero:
        source = downstream
        evidence = "Downstream monitor has >50% exact-zero valid flow values in this week."
    elif dominant:
        source = f"{dominant} (largest upstream contributor; not proof of fault)"
        evidence = "No direct single-monitor fault is proven by the balance alone."
    else:
        source = "Downstream/upstream measurement set"
        evidence = "The balance alone cannot isolate a single monitor."

    deficit = classification.get("deficit_percent")
    if rag == "Red":
        action = (
            f"Measured downstream volume is {deficit:.1f}% below the upstream sum. "
            if deficit is not None
            else "Measured downstream volume is materially below the upstream sum. "
        )
    else:
        action = (
            f"Measured downstream volume is {deficit:.1f}% below the upstream sum and within the Amber tolerance. "
            if deficit is not None
            else "Measured downstream volume is slightly below the upstream sum. "
        )
    return (
        source,
        action
        + evidence
        + " Check source QA, monitor zero/flatline behaviour, clock alignment, sign convention and sensor/installation performance before attributing the imbalance. Lateral and unmonitored inflows mean this is a diagnostic, not a closed-system mass balance.",
    )


def survey_volume_balance(
    flows: dict[str, pd.DataFrame],
    associations: list[dict[str, Any]],
    *,
    start: Any = None,
    end: Any = None,
    exclusions: list[Any] | None = None,
    max_gap_seconds: float = 900.0,
    amber_tolerance_percent: float = 10.0,
) -> dict[str, Any]:
    """Weekly W-SUN FSAT parity plus support-aware continuity diagnostic."""
    exclusions = list(exclusions or [])
    flow_frames = {
        str(name): _normalise_flow_frame(frame, "flow")
        for name, frame in (flows or {}).items()
    }
    timestamps = [
        x["timestamp"]
        for x in flow_frames.values()
        if x is not None and not x.empty
    ]
    if not timestamps:
        return {
            "rows": [],
            "monitor_weeks": [],
            "summary": {"Green": 0, "Amber": 0, "Red": 0, "Grey": 0},
            "method": "weekly-volume-balance-v2",
            "reason": "No mapped flow data available.",
        }
    all_ts = pd.concat(timestamps, ignore_index=True).dropna()
    domain_start = pd.Timestamp(start) if start else pd.Timestamp(all_ts.min())
    domain_end = pd.Timestamp(end) if end else pd.Timestamp(all_ts.max())
    if domain_end <= domain_start:
        raise ValueError("Analysis end must be after analysis start.")

    first_period = domain_start.to_period("W-SUN")
    last_period = domain_end.to_period("W-SUN")
    periods = pd.period_range(first_period, last_period, freq="W-SUN")

    monitor_weeks: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    summary = {"Green": 0, "Amber": 0, "Red": 0, "Grey": 0}

    assoc_by_monitor = {str(x.get("monitor")): x for x in associations or []}
    for period in periods:
        week_start = max(pd.Timestamp(period.start_time), domain_start)
        week_end = min(pd.Timestamp(period.end_time).floor("D") + pd.Timedelta(days=1), domain_end)
        if week_end <= week_start:
            continue
        week_volumes: dict[str, dict[str, Any]] = {}
        for monitor, frame in flow_frames.items():
            legacy_volume, zero_issue, n_valid = _legacy_signed_volume(
                frame, week_start, week_end, exclusions
            )
            result = integrate_series(
                frame,
                "flow",
                week_start,
                week_end,
                semantics="instantaneous",
                max_gap_seconds=float(max_gap_seconds),
                exclusions=exclusions,
            )
            volume = float(result["integral"]) if result.get("valid_seconds", 0.0) > 0 else None
            rec = {
                "week_ending": pd.Timestamp(period.end_time).floor("D"),
                "monitor": monitor,
                "volume_m3": volume,
                "legacy_volume_m3": legacy_volume,
                "zero_issue": zero_issue,
                "n_valid": n_valid,
                "coverage_fraction": result.get("coverage_fraction"),
                "status": result.get("status"),
                "valid_seconds": result.get("valid_seconds"),
                "gap_seconds": result.get("gap_seconds"),
                "excluded_seconds": result.get("excluded_seconds"),
                "uncovered_seconds": result.get("uncovered_seconds"),
            }
            week_volumes[monitor] = rec
            monitor_weeks.append(dict(rec))

        for downstream, assoc in assoc_by_monitor.items():
            upstream = [str(x) for x in assoc.get("upstream", []) if str(x)]
            if not upstream:
                continue
            down = week_volumes.get(downstream)
            ups = [week_volumes.get(name) for name in upstream]
            if down is None or any(x is None for x in ups):
                missing = [downstream] if down is None else []
                missing += [name for name, item in zip(upstream, ups) if item is None]
                classification = classify_volume_balance(None, None, complete=False)
                source, recommendation = (
                    ", ".join(missing),
                    "Map/load the missing flow monitor source(s) before interpreting continuity.",
                )
                lhs = rhs = None
                legacy_status = "NA"
                coverage = None
            else:
                lhs = down.get("volume_m3")
                rhs_values = [x.get("volume_m3") for x in ups]
                rhs = (
                    float(sum(float(x) for x in rhs_values))
                    if all(x is not None for x in rhs_values)
                    else None
                )
                complete = bool(
                    down.get("status") == "complete"
                    and all(x.get("status") == "complete" for x in ups)
                )
                classification = classify_volume_balance(
                    lhs,
                    rhs,
                    complete=complete,
                    amber_tolerance_percent=amber_tolerance_percent,
                )
                legacy_lhs = down.get("legacy_volume_m3")
                legacy_rhs_values = [x.get("legacy_volume_m3") for x in ups]
                if legacy_lhs is None or any(x is None for x in legacy_rhs_values):
                    legacy_status = "NA"
                else:
                    legacy_rhs = float(sum(float(x) for x in legacy_rhs_values))
                    legacy_status = "OK" if float(legacy_lhs) >= legacy_rhs else "Not OK"
                    if down.get("zero_issue") or any(x.get("zero_issue") for x in ups):
                        legacy_status += "*"
                source, recommendation = _diagnostic_recommendation(
                    downstream, upstream, week_volumes, classification
                )
                fractions = [
                    x.get("coverage_fraction")
                    for x in [down, *ups]
                    if x.get("coverage_fraction") is not None
                ]
                coverage = min(fractions) if fractions else None

            rag = classification["rag"]
            summary[rag] = summary.get(rag, 0) + 1
            rows.append(
                {
                    "week_ending": pd.Timestamp(period.end_time).floor("D"),
                    "downstream_monitor": downstream,
                    "upstream_monitors": upstream,
                    "downstream_volume_m3": lhs,
                    "upstream_sum_m3": rhs,
                    "balance_ratio": classification.get("ratio"),
                    "deficit_m3": classification.get("deficit_m3"),
                    "deficit_percent": classification.get("deficit_percent"),
                    "legacy_fsat_status": legacy_status,
                    "rag": rag,
                    "rag_reason": classification.get("reason"),
                    "minimum_coverage_fraction": coverage,
                    "likely_source": source,
                    "recommendation": recommendation,
                    "workbook_diameter_mm": assoc.get("diameter_mm"),
                    "mapped_rain_gauge": assoc.get("rain_gauge"),
                }
            )

    return {
        "rows": rows,
        "monitor_weeks": monitor_weeks,
        "summary": summary,
        "period": {"start": domain_start, "end": domain_end},
        "criteria": {
            "week_grouping": "W-SUN",
            "legacy_method": "signed trapezoidal integration; OK when downstream >= summed upstream; * when any involved monitor has >50% exact-zero valid flow values",
            "enhanced_method": "actual-timestep support-aware integration with analysis bounds, exclusions and maximum-gap validity",
            "green": "balance ratio >= 1.00",
            "amber": f"{1.0 - float(amber_tolerance_percent) / 100.0:.3f} <= ratio < 1.00",
            "red": f"ratio < {1.0 - float(amber_tolerance_percent) / 100.0:.3f}",
            "grey": "incomplete/unsupported calculation",
            "amber_tolerance_percent": float(amber_tolerance_percent),
        },
        "method": "weekly-volume-balance-v2",
        "caveat": "Diagnostic continuity check only. Lateral inflows, unmonitored branches, storage and timing effects mean it is not a closed-system mass balance.",
    }


def _indexed_series(
    hydraulic: pd.DataFrame,
    column: str | None,
) -> pd.Series:
    if not column or column not in hydraulic.columns:
        return pd.Series(dtype=float)
    x = hydraulic[["timestamp", column]].copy()
    x["timestamp"] = pd.to_datetime(x["timestamp"], errors="coerce")
    x[column] = pd.to_numeric(x[column], errors="coerce")
    x = (
        x.dropna(subset=["timestamp"])
        .sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
    )
    return pd.Series(x[column].to_numpy(dtype=float), index=x["timestamp"])


def _mask_exclusions_series(series: pd.Series, exclusions: list[Any]) -> pd.Series:
    if series.empty or not exclusions:
        return series
    out = series.copy()
    for exc in exclusions:
        start = pd.Timestamp(getattr(exc, "start", exc.get("start") if isinstance(exc, dict) else None))
        end = pd.Timestamp(getattr(exc, "end", exc.get("end") if isinstance(exc, dict) else None))
        if pd.notna(start) and pd.notna(end):
            out.loc[(out.index >= start) & (out.index < end)] = np.nan
    return out


def _longest_flatline(series: pd.Series, tolerance: float, expected_step_min: float) -> float:
    if series.empty:
        return 0.0
    x = series.sort_index()
    longest = current = 0.0
    previous_time = None
    previous_value = None
    for stamp, value in x.items():
        if (
            previous_time is not None
            and np.isfinite(previous_value)
            and np.isfinite(value)
        ):
            dt = float((pd.Timestamp(stamp) - pd.Timestamp(previous_time)).total_seconds() / 60.0)
            same = (
                dt > 0
                and dt <= max(expected_step_min * 3.0, expected_step_min + 1.0)
                and abs(float(value) - float(previous_value)) <= tolerance
            )
            current = current + dt if same else 0.0
            longest = max(longest, current)
        else:
            current = 0.0
        previous_time = stamp
        previous_value = value
    return float(longest)


def fsat_event_response_assessment(
    hydraulic: pd.DataFrame,
    rain_frame: pd.DataFrame,
    *,
    rain_col: str,
    rain_interval_min: float | None,
    diameter_mm: float | None,
    network_wapug_events: list[dict[str, Any]] | None,
    depth_col: str | None = None,
    velocity_col: str | None = None,
    flow_col: str | None = None,
    monitor_type: str = "FM",
    start: Any = None,
    end: Any = None,
    exclusions: list[Any] | None = None,
    rain_exclusions: list[Any] | None = None,
) -> dict[str, Any]:
    """Port FSAT Event Response diameter gates and derived criteria."""
    hydraulic_exclusions = list(exclusions or [])
    rainfall_exclusions = (
        hydraulic_exclusions
        if rain_exclusions is None
        else list(rain_exclusions or [])
    )
    if hydraulic is None or getattr(hydraulic, "empty", True):
        return {"rows": [], "reason": "Hydraulic data unavailable.", "method": "fsat-event-response-v60-browser"}
    rain = rain_frame[["timestamp", rain_col]].copy()
    rain["timestamp"] = pd.to_datetime(rain["timestamp"], errors="coerce")
    rain[rain_col] = pd.to_numeric(rain[rain_col], errors="coerce")
    rain = (
        rain.dropna(subset=["timestamp"])
        .sort_values("timestamp")
        .drop_duplicates("timestamp", keep="last")
    )
    rain_series = pd.Series(rain[rain_col].to_numpy(dtype=float), index=rain["timestamp"])
    rain_series = _mask_exclusions_series(rain_series, rainfall_exclusions)
    interval = float(rain_interval_min or 2.0)
    rain_increment = rain_series * interval / 60.0

    depth = _mask_exclusions_series(
        _indexed_series(hydraulic, depth_col), hydraulic_exclusions
    )
    velocity = _mask_exclusions_series(
        _indexed_series(hydraulic, velocity_col), hydraulic_exclusions
    )
    flow = _mask_exclusions_series(
        _indexed_series(hydraulic, flow_col), hydraulic_exclusions
    )
    dt_candidates = []
    for series in (depth, velocity, flow):
        if len(series.index) > 1:
            diff = pd.Series(series.index).diff().dt.total_seconds().div(60.0)
            diff = diff[(diff > 0) & np.isfinite(diff)]
            if not diff.empty:
                dt_candidates.append(float(diff.median()))
    dt_h = float(np.median(dt_candidates)) if dt_candidates else interval

    events = list(network_wapug_events or [])
    if start:
        s = pd.Timestamp(start)
        events = [e for e in events if pd.Timestamp(e["end"]) >= s]
    if end:
        emax = pd.Timestamp(end)
        events = [e for e in events if pd.Timestamp(e["start"]) <= emax]

    diameter = _float_or_none(diameter_mm)
    rows: list[dict[str, Any]] = []
    for event in events:
        t0, t1 = pd.Timestamp(event["start"]), pd.Timestamp(event["end"])
        rain_event = rain_series.loc[t0:t1].dropna()
        peak_rain_time = (
            rain_event.idxmax()
            if not rain_event.empty and float(rain_event.max()) > 0.0
            else None
        )
        row: dict[str, Any] = {
            "event": event.get("event"),
            "event_start": t0,
            "event_end": t1,
            "network_wapug": bool(event.get("qualifies_network_wapug", True)),
            "operational_gauges": event.get("operational_gauges"),
            "spatial_cv_percent": event.get("spatial_cv_percent"),
            "diameter_mm": diameter,
            "rain_peak_time": peak_rain_time,
            "depth_velocity_response": "No (DQ: No)",
            "min_depth_at_peak_flow_m": None,
            "min_depth_threshold_m": None,
            "min_depth_pass": None,
            "response_ratio": None,
            "response_ratio_threshold": None,
            "response_ratio_pass": None,
            "q_peak_m3s": None,
            "q_initial_m3s": None,
            "q_dwf_m3s": None,
            "comments": [],
        }
        if peak_rain_time is None:
            row["comments"].append("No mapped rain peak in event window.")
            rows.append(row)
            continue

        response_end = peak_rain_time + pd.Timedelta(hours=18)
        linked_depth = linked_velocity = False
        dq_skip_depth = dq_skip_velocity = False
        if not depth.empty:
            depth_window = depth.loc[peak_rain_time:response_end]
            flat = _longest_flatline(depth_window, 1e-4, dt_h)
            dq_skip_depth = bool(flat >= 60.0 and flat / (18.0 * 60.0) >= 0.50)
            if not dq_skip_depth:
                antecedent = depth.loc[
                    max(depth.index.min(), peak_rain_time - pd.Timedelta(hours=1)):peak_rain_time
                ].dropna()
                post = depth.loc[peak_rain_time:response_end].dropna()
                if not antecedent.empty and not post.empty:
                    linked_depth = float(post.max() - antecedent.min()) >= 0.10

        if monitor_type.upper() in {"FM", "SM"} and not velocity.empty:
            velocity_window = velocity.loc[peak_rain_time:response_end]
            flat = _longest_flatline(velocity_window, 1e-3, dt_h)
            dq_skip_velocity = bool(flat >= 60.0 and flat / (18.0 * 60.0) >= 0.50)
            if not dq_skip_velocity:
                antecedent = velocity.loc[
                    max(velocity.index.min(), peak_rain_time - pd.Timedelta(hours=1)):peak_rain_time
                ].dropna()
                post = velocity.loc[peak_rain_time:response_end].dropna()
                if not antecedent.empty and not post.empty:
                    linked_velocity = float(post.max() - antecedent.min()) >= 0.15

        if monitor_type.upper() in {"DM", "RM"}:
            linked_velocity = False
        if linked_depth or linked_velocity:
            tag = "D+V" if linked_depth and linked_velocity else ("D" if linked_depth else "V")
            row["depth_velocity_response"] = f"Yes ({tag})"
        else:
            dq_any = bool(
                (not linked_depth and dq_skip_depth)
                or (
                    monitor_type.upper() in {"FM", "SM"}
                    and not linked_velocity
                    and dq_skip_velocity
                )
            )
            row["depth_velocity_response"] = f"No (DQ: {'Yes' if dq_any else 'No'})"

        if diameter is None or diameter < 300.0:
            row["comments"].append(
                "Derived Min D / response-ratio criteria not evaluated: "
                + ("missing pipe diameter." if diameter is None else "pipe diameter < 300 mm.")
            )
            rows.append(row)
            continue
        flow_window = flow.loc[peak_rain_time:response_end].dropna() if not flow.empty else pd.Series(dtype=float)
        if (
            flow_window.empty
            or float(flow_window.max() - flow_window.min()) <= 1e-9
            or float(flow_window.abs().max()) <= 0.005
        ):
            row["comments"].append("Flow missing/flat/near-zero in the 0–18 h window after rain peak.")
            rows.append(row)
            continue

        peak_flow_time = flow_window.idxmax()
        q_peak = float(flow_window.max())
        row["q_peak_m3s"] = q_peak
        depth_valid = depth.dropna()
        if not depth_valid.empty:
            loc = depth_valid.index.get_indexer([peak_flow_time], method="nearest")
            if len(loc) and loc[0] >= 0:
                d_at = float(depth_valid.iloc[loc[0]])
                threshold_d = 0.150 if diameter <= 900.0 else 0.300
                row["min_depth_at_peak_flow_m"] = d_at
                row["min_depth_threshold_m"] = threshold_d
                row["min_depth_pass"] = bool(d_at >= threshold_d)

        flow_valid = flow.dropna()
        if not flow_valid.empty:
            loc0 = flow_valid.index.get_indexer([t0], method="nearest")
            if len(loc0) and loc0[0] >= 0:
                row["q_initial_m3s"] = float(flow_valid.iloc[loc0[0]])

        steps = max(1, int(np.ceil(12.0 * 60.0 / max(interval, 1e-6))))
        wet_mask = (rain_increment.fillna(0.0) >= 0.05).astype(int).rolling(
            window=steps, min_periods=1
        ).sum() > 0
        q_dwf = None
        for back_h in range(0, 14 * 24 + 1):
            candidate_end = t0 - pd.Timedelta(hours=back_h)
            candidate_start = candidate_end - pd.Timedelta(hours=24)
            wet = wet_mask.loc[candidate_start:candidate_end]
            if wet.empty or bool(wet.any()):
                continue
            q = flow.loc[candidate_start:candidate_end].dropna()
            if q.empty:
                continue
            candidate = float(q.mean())
            if np.isfinite(candidate) and candidate > 0.0:
                q_dwf = candidate
                break
        row["q_dwf_m3s"] = q_dwf

        if q_dwf is None:
            row["comments"].append("No dry 24 h DWF window found within 14 days before the event.")
        elif row["q_initial_m3s"] is None:
            row["comments"].append("Initial flow unavailable at event start.")
        else:
            ratio = (q_peak - float(row["q_initial_m3s"])) / float(q_dwf)
            threshold_r = 5.0 if diameter <= 900.0 else 3.0
            row["response_ratio"] = float(ratio)
            row["response_ratio_threshold"] = threshold_r
            row["response_ratio_pass"] = bool(ratio >= threshold_r)
        rows.append(row)

    return {
        "rows": rows,
        "criteria": {
            "diameter_gate_mm": 300.0,
            "min_depth_threshold_300_to_900_mm_m": 0.150,
            "min_depth_threshold_over_900_mm_m": 0.300,
            "response_ratio_threshold_300_to_900_mm": 5.0,
            "response_ratio_threshold_over_900_mm": 3.0,
            "response_window_hours": 18.0,
            "dwf_search_days": 14,
            "dwf_window_hours": 24,
            "raw_depth_rise_threshold_m": 0.10,
            "raw_velocity_rise_threshold_m_s": 0.15,
        },
        "exclusion_policy": {
            "hydraulic_exclusion_count": len(hydraulic_exclusions),
            "rainfall_exclusion_count": len(rainfall_exclusions),
            "scoped": True,
        },
        "method": "fsat-event-response-v60-browser",
        "method_note": "Min D and response-ratio thresholds are ported from fdv_weekly_assessment_irish_water_v60.py. Raw D/V response thresholds are used because browser-loaded FDV sources do not carry the companion workbook residual columns.",
    }
