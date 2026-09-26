from __future__ import annotations

import argparse
import json
import math
import re
import zipfile
from collections import Counter
from pathlib import Path
from statistics import median
from typing import Any
from xml.etree import ElementTree as ET

import pandas as pd

from icm_workbench import advanced_api
from icm_workbench.analysis.rainfall import rainfall_accumulation
from icm_workbench.analysis.survey_assessment import network_rainfall_assessment
from icm_workbench.analysis.survey_context import normalise_association_table
from icm_workbench.browser_api import clear_cache, spill_result
from icm_workbench.parsers import parse_file


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference" / "current-tool"
SAMPLE = REFERENCE / "sample-data"
VALID_RAGS = {"Green", "Amber", "Red", "Grey"}


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _series_column(parsed) -> str:
    cols = [str(c) for c in parsed.frame.columns if str(c) != "timestamp"]
    if not cols:
        raise AssertionError(f"{parsed.format_name} source has no value series")
    return cols[0]


def _finite(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    values = values.where(values.map(lambda x: math.isfinite(float(x)) if pd.notna(x) else False))
    return values.dropna()


def _xlsx_first_sheet(path: Path) -> tuple[list[Any], list[list[Any]]]:
    """Read the first worksheet using only the standard library."""
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for si in root.findall("x:si", ns):
                shared.append("".join(t.text or "" for t in si.findall(".//x:t", ns)))

        sheet_name = "xl/worksheets/sheet1.xml"
        if sheet_name not in archive.namelist():
            candidates = sorted(
                name for name in archive.namelist()
                if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
            )
            if not candidates:
                raise AssertionError("fm_rg_assoc.xlsx contains no worksheet")
            sheet_name = candidates[0]

        root = ET.fromstring(archive.read(sheet_name))
        ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

        def col_index(ref: str) -> int:
            letters = re.match(r"([A-Z]+)", ref or "")
            if not letters:
                return 0
            value = 0
            for ch in letters.group(1):
                value = value * 26 + ord(ch) - 64
            return value - 1

        rows: list[list[Any]] = []
        for row in root.findall(".//x:sheetData/x:row", ns):
            values: dict[int, Any] = {}
            for cell in row.findall("x:c", ns):
                idx = col_index(cell.attrib.get("r", "A1"))
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    node = cell.find("x:is/x:t", ns)
                    value = node.text if node is not None else ""
                else:
                    node = cell.find("x:v", ns)
                    raw = node.text if node is not None else ""
                    if cell_type == "s" and raw != "":
                        try:
                            value = shared[int(raw)]
                        except Exception:
                            value = raw
                    else:
                        value = raw
                values[idx] = value
            if values:
                width = max(values) + 1
                rows.append([values.get(i, "") for i in range(width)])

    if not rows:
        raise AssertionError("fm_rg_assoc.xlsx first worksheet is empty")
    width = max(len(row) for row in rows)
    padded = [row + [""] * (width - len(row)) for row in rows]
    return padded[0], padded[1:]


def _token(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _monitor_type(name: str) -> str:
    match = re.match(r"(FM|SM|DM|RM)", str(name or "").upper())
    return match.group(1) if match else "FM"


def _legacy_threshold_candidate(path: Path, level_min: float, level_max: float) -> tuple[float | None, dict[str, Any]]:
    """Discover a defensible repeated horizontal threshold from legacy Plotly HTML."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    candidates: list[float] = []
    named_hit_count = 0

    for match in re.finditer(r"(?i)(threshold|spill level|spill_level)", text):
        named_hit_count += 1
        segment = text[max(0, match.start() - 3500): min(len(text), match.end() + 3500)]
        for y0, y1 in re.findall(
            r'"y0"\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*,\s*"y1"\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)',
            segment,
        ):
            a, b = float(y0), float(y1)
            if abs(a - b) <= 1e-10 and level_min <= a <= level_max:
                candidates.append(a)
        for payload in re.findall(r'"y"\s*:\s*\[([^\]]{1,1600})\]', segment):
            numbers = re.findall(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", payload)
            if 2 <= len(numbers) <= 50:
                vals = [float(v) for v in numbers]
                if max(vals) - min(vals) <= 1e-10 and level_min <= vals[0] <= level_max:
                    candidates.append(vals[0])

    if not candidates:
        return None, {"source": "not-found", "candidate_count": 0, "named_hit_count": named_hit_count}
    counts = Counter(round(v, 6) for v in candidates)
    value, count = counts.most_common(1)[0]
    return float(value), {
        "source": "legacy-report-horizontal-line",
        "candidate_count": len(candidates),
        "repeat_count": int(count),
        "all_candidates": [{"value": float(k), "count": int(v)} for k, v in counts.most_common(8)],
    }


def _event_level_response(level_frame: pd.DataFrame, level_col: str, events: list[dict[str, Any]]) -> dict[str, Any]:
    x = level_frame[["timestamp", level_col]].copy()
    x["timestamp"] = pd.to_datetime(x["timestamp"], errors="coerce")
    x[level_col] = pd.to_numeric(x[level_col], errors="coerce")
    x = x.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    s = pd.Series(x[level_col].to_numpy(dtype=float), index=x["timestamp"])
    rows = []
    for event in events:
        t0, t1 = pd.Timestamp(event["start"]), pd.Timestamp(event["end"])
        pre = s.loc[max(s.index.min(), t0 - pd.Timedelta(hours=1)):t0].dropna()
        post = s.loc[t0:min(s.index.max(), t1 + pd.Timedelta(hours=18))].dropna()
        if pre.empty or post.empty:
            continue
        baseline = float(pre.median())
        peak = float(post.max())
        uplift = peak - baseline
        rows.append({
            "event": event.get("event"),
            "start": t0,
            "baseline_m": baseline,
            "peak_m": peak,
            "uplift_m": uplift,
            "clear_hydraulic_response": bool(uplift >= 0.10),
        })
    uplifts = [float(row["uplift_m"]) for row in rows if math.isfinite(float(row["uplift_m"]))]
    return {
        "rows": rows,
        "assessed_event_count": len(rows),
        "clear_response_count": sum(1 for row in rows if row["clear_hydraulic_response"]),
        "positive_response_count": sum(1 for row in rows if row["uplift_m"] > 0),
        "median_uplift_m": median(uplifts) if uplifts else None,
        "maximum_uplift_m": max(uplifts) if uplifts else None,
    }


def _edm_workflow() -> dict[str, Any]:
    edm_path = SAMPLE / "other" / "StationA_EDM.csv"
    rain_path = SAMPLE / "other" / "StationA_Rainfall.csv"
    legacy_path = REFERENCE / "reports" / "html" / "StationA_CSO_Spills_2024.html"

    edm = parse_file(edm_path)
    rain = parse_file(rain_path)
    level_col = _series_column(edm)
    rain_col = _series_column(rain)
    levels = _finite(edm.frame[level_col])
    if levels.empty:
        raise AssertionError("Station A EDM reference contains no finite level data")

    rain_meta = rain.metadata or {}
    rain_interval = rain_meta.get("interval_min")
    accumulation = rainfall_accumulation(
        rain.frame[["timestamp", rain_col]].copy(),
        rain_col,
        semantics="intensity",
        declared_interval_minutes=float(rain_interval) if rain_interval else None,
    )

    wapug_over = json.loads(advanced_api.rainfall_event_scaled(
        str(rain_path), rain_col,
        minimum_intensity=5.0,
        minimum_intensity_duration_min=6.0,
        minimum_depth_mm=5.0,
        minimum_event_duration_min=60.0,
        dry_gap_min=15.0,
    ))
    wapug_under = json.loads(advanced_api.rainfall_event_scaled(
        str(rain_path), rain_col,
        minimum_intensity=5.0,
        minimum_intensity_duration_min=4.0,
        minimum_depth_mm=5.0,
        minimum_event_duration_min=30.0,
        dry_gap_min=15.0,
    ))

    response = _event_level_response(edm.frame, level_col, wapug_over.get("events") or [])

    level_min, level_max = float(levels.min()), float(levels.max())
    threshold, threshold_evidence = _legacy_threshold_candidate(legacy_path, level_min, level_max)
    if threshold is None:
        threshold = float(levels.quantile(0.95))
        threshold_evidence = {
            **threshold_evidence,
            "source": "simulation-p95-level",
            "warning": "Historical threshold could not be extracted defensibly; p95 is used only to exercise spill logic and is not a site threshold.",
        }

    spills = json.loads(spill_result(
        str(edm_path),
        level_col,
        threshold,
        exclusions_json="[]",
        max_gap_seconds=900.0,
    ))

    total_mm = accumulation.get("total_depth_mm")
    checks = {
        "edm_declared_as_level_m": bool(
            edm.format_name == "icm_hyd_p_datetime_csv"
            and (edm.metadata or {}).get("quantity") == "level"
            and (edm.metadata or {}).get("canonical_unit") == "m"
        ),
        "rainfall_total_reconciles_reference": bool(total_mm is not None and 2700.0 <= float(total_mm) <= 3050.0),
        "population_presets_produce_events": bool((wapug_over.get("count") or 0) > 0 and (wapug_under.get("count") or 0) > 0),
        "under50_not_more_restrictive": bool((wapug_under.get("count") or 0) >= (wapug_over.get("count") or 0)),
        "threshold_inside_observed_level_range": bool(level_min <= float(threshold) <= level_max),
        "spill_calculation_available": bool(spills.get("status") not in {"unavailable", None} and isinstance(spills.get("events"), list)),
    }

    observations = []
    if response["assessed_event_count"]:
        fraction = response["clear_response_count"] / response["assessed_event_count"]
        observations.append(
            f"{response['clear_response_count']}/{response['assessed_event_count']} >50k WAPUG events show >=0.10 m level uplift within the response window ({fraction:.0%})."
        )
        if fraction < 0.5:
            observations.append(
                "Rainfall does not explain most large level behaviour in this reference period; tidal/pumping/operational influence is a credible review comment rather than an automatic data-quality failure."
            )
    if threshold_evidence.get("source") == "simulation-p95-level":
        observations.append(
            "Spill count is a workflow simulation only because no defensible site spill threshold was extracted from the historical HTML; production assessment must use the engineer/site threshold."
        )
    else:
        observations.append(
            f"Historical-report evidence yielded a repeated horizontal level threshold at {threshold:.4f} m for the spill-workflow simulation."
        )

    return {
        "workflow": "standalone-edm-timeseries",
        "observed": {
            "path": str(edm_path.relative_to(ROOT)),
            "format": edm.format_name,
            "rows": int(len(edm.frame)),
            "column": level_col,
            "level_min_m": level_min,
            "level_max_m": level_max,
            "level_mean_m": float(levels.mean()),
            "start": str(edm.frame["timestamp"].min()),
            "end": str(edm.frame["timestamp"].max()),
        },
        "rainfall": {
            "path": str(rain_path.relative_to(ROOT)),
            "rows": int(len(rain.frame)),
            "column": rain_col,
            "source_unit_status": ((rain.metadata or {}).get("series_metadata") or {}).get(rain_col, {}).get("unit_status"),
            "explicit_simulation_semantics": "mm/h intensity, based on the supplied historical report/reference contract",
            "interval_min": rain_interval,
            "total_depth_mm": total_mm,
            "calculation_status": accumulation.get("status"),
            "coverage_fraction": accumulation.get("coverage_fraction"),
        },
        "wapug": {
            "over_50k": {"criteria": wapug_over.get("criteria"), "event_count": wapug_over.get("count")},
            "under_or_equal_50k": {"criteria": wapug_under.get("criteria"), "event_count": wapug_under.get("count")},
        },
        "event_overlay_response": response,
        "spills": {
            "threshold_m": threshold,
            "threshold_evidence": threshold_evidence,
            "calculation_status": spills.get("status"),
            "event_count": len(spills.get("events") or []),
            "yearly_summary": spills.get("yearly_summary") or [],
            "coverage_fraction": spills.get("coverage_fraction"),
            "excluded_seconds": spills.get("excluded_seconds"),
        },
        "checks": checks,
        "engineering_observations": observations,
    }


def _flow_survey_workflow() -> dict[str, Any]:
    assoc_path = SAMPLE / "rainfall" / "fm_rg_assoc.xlsx"
    headers, raw_rows = _xlsx_first_sheet(assoc_path)
    assoc_result = normalise_association_table(headers, raw_rows)
    associations = assoc_result["records"]

    fdv_paths = sorted((SAMPLE / "fdv").glob("*.fdv"))
    fdv_by_token = {_token(path.stem): path for path in fdv_paths}
    monitor_sources = []
    unmatched_assoc = []
    for assoc in associations:
        monitor = str(assoc.get("monitor") or "").strip()
        path = fdv_by_token.get(_token(monitor))
        if path is None:
            unmatched_assoc.append(monitor)
            continue
        parsed = parse_file(path)
        columns = set(map(str, parsed.frame.columns))
        monitor_sources.append({
            "monitor": monitor,
            "path": str(path),
            "monitor_type": _monitor_type(monitor),
            "depth_col": "depth" if "depth" in columns else None,
            "velocity_col": "velocity" if "velocity" in columns else None,
            "flow_col": "flow" if "flow" in columns else None,
        })

    rain_sources = []
    gauges = {}
    for path in sorted((SAMPLE / "rainfall").glob("RG*.R")):
        parsed = parse_file(path)
        col = _series_column(parsed)
        interval = (parsed.metadata or {}).get("interval_min")
        rain_sources.append({"name": path.stem, "path": str(path), "column": col})
        gauges[path.stem] = (parsed.frame.copy(), col, float(interval) if interval else None)

    network_over = network_rainfall_assessment(gauges, population_above_50k=True, apply_fault_cutoff=False)
    network_under = network_rainfall_assessment(gauges, population_above_50k=False, apply_fault_cutoff=False)

    batch = json.loads(advanced_api.professional_survey_batch_result(
        association_json=json.dumps(associations),
        monitor_sources_json=json.dumps(monitor_sources),
        rain_sources_json=json.dumps(rain_sources),
        population_above_50k=True,
        apply_fault_cutoff=False,
        rain_factor=1.0,
        exclusions_json="[]",
        max_gap_seconds=900.0,
        amber_tolerance_percent=10.0,
    ))

    monitor_summary = []
    for row in batch.get("monitors") or []:
        weeks = (row.get("weekly") or {}).get("weeks") or []
        rag_counts = Counter(str(w.get("rag") or "Grey") for w in weeks)
        invalid_rags = [rag for rag in rag_counts if rag not in VALID_RAGS]
        if invalid_rags:
            raise AssertionError(f"Unexpected weekly RAG values for {row.get('monitor')}: {invalid_rags}")
        worst = max(
            (str(w.get("rag") or "Grey") for w in weeks),
            key=lambda rag: {"Grey": 0, "Green": 1, "Amber": 2, "Red": 3}.get(rag, -1),
            default="Grey",
        )
        events = (row.get("event_response") or {}).get("rows") or []
        event_flags = sum(
            1 for event in events
            if event.get("min_depth_pass") is False or event.get("response_ratio_pass") is False
        )
        monitor_summary.append({
            "monitor": row.get("monitor"),
            "status": row.get("status"),
            "rain_gauge": row.get("rain_gauge"),
            "diameter_mm": row.get("diameter_mm"),
            "week_count": len(weeks),
            "weekly_rag": dict(rag_counts),
            "worst_rag": worst,
            "event_response_rows": len(events),
            "event_response_flagged": event_flags,
            "reason": row.get("reason"),
        })

    volume = batch.get("volume_balance") or {}
    volume_rows = volume.get("rows") or []
    non_green_volume = [
        row for row in volume_rows if str(row.get("rag") or "Grey") in {"Amber", "Red"}
    ]

    complete_monitors = [row for row in batch.get("monitors") or [] if row.get("status") == "complete"]
    qualified = (batch.get("network") or {}).get("qualified_wapug_events") or []
    gauge_summary = (batch.get("network") or {}).get("gauge_summary") or []

    checks = {
        "association_workbook_parsed": bool(associations),
        "fdv_sources_match_authoritative_monitors": bool(monitor_sources),
        "all_four_reference_gauges_loaded": bool((batch.get("network") or {}).get("gauge_count") == 4),
        "network_wapug_events_available": bool(len(qualified) > 0),
        "complete_monitor_assessments_available": bool(len(complete_monitors) > 0),
        "raw_sources_remain_immutable": bool((batch.get("source_policy") or {}).get("raw_sources_mutated") is False),
        "workbook_precedence_retained": bool((batch.get("source_policy") or {}).get("association_workbook_authoritative") is True),
        "volume_balance_rags_valid": all(str(row.get("rag") or "Grey") in VALID_RAGS for row in volume_rows),
        "non_green_balance_has_recommendation": all(bool(row.get("recommendation")) for row in non_green_volume),
        "under50_network_not_more_restrictive": bool(
            len(network_under.get("qualified_wapug_events") or []) >= len(network_over.get("qualified_wapug_events") or [])
        ),
    }

    observations = []
    unavailable = [row for row in batch.get("monitors") or [] if row.get("status") != "complete"]
    if unavailable:
        observations.append(
            f"{len(unavailable)} workbook monitor(s) are partial/unavailable in the supplied reference set; the UI must surface this as readiness evidence rather than silently dropping them."
        )
    red_amber = [m for m in monitor_summary if m["worst_rag"] in {"Red", "Amber"}]
    observations.append(
        f"{len(red_amber)}/{len(monitor_summary)} assessed workbook monitor rows have an Amber/Red worst weekly result, giving realistic exceptions for engineer review rather than an all-green demonstration dataset."
    )
    if any(m["event_response_flagged"] for m in monitor_summary):
        observations.append(
            "Event Response produces monitor-level flags on the real FDV/rainfall data; these need drill-down evidence and should not be collapsed into a single unexplained RAG."
        )
    if non_green_volume:
        observations.append(
            f"{len(non_green_volume)} weekly volume-balance path row(s) are Amber/Red; recommendations/likely-source evidence are therefore materially useful in the monthly review."
        )
    faulted = [
        g for g in gauge_summary
        if g.get("suggested_fault_cutoff") or str(g.get("status") or "") in {"Amber", "Red"}
    ]
    if faulted:
        observations.append(
            f"{len(faulted)} rain gauge(s) carry fault/review evidence, confirming that Rainfall Check needs gauge-detail drill-down instead of only event totals."
        )

    return {
        "workflow": "flow-survey-monthly-assessment",
        "association": {
            "path": str(assoc_path.relative_to(ROOT)),
            "headers": headers,
            "record_count": len(associations),
            "issues": assoc_result.get("issues") or [],
            "matched_fdv_source_count": len(monitor_sources),
            "unmatched_workbook_monitors": unmatched_assoc,
        },
        "rainfall": {
            "gauge_count": (batch.get("network") or {}).get("gauge_count"),
            "gauge_summary": gauge_summary,
            "over_50k_qualified_event_count": len(network_over.get("qualified_wapug_events") or []),
            "under_or_equal_50k_qualified_event_count": len(network_under.get("qualified_wapug_events") or []),
            "criteria_over_50k": network_over.get("criteria"),
            "criteria_under_or_equal_50k": network_under.get("criteria"),
        },
        "monitors": monitor_summary,
        "volume_balance": {
            "summary": volume.get("summary") or {},
            "row_count": len(volume_rows),
            "non_green_row_count": len(non_green_volume),
            "non_green_rows": [
                {
                    "week_ending": row.get("week_ending"),
                    "downstream_monitor": row.get("downstream_monitor"),
                    "upstream_monitors": row.get("upstream_monitors"),
                    "balance_ratio": row.get("balance_ratio"),
                    "rag": row.get("rag"),
                    "likely_source": row.get("likely_source"),
                    "recommendation": row.get("recommendation"),
                }
                for row in non_green_volume[:20]
            ],
        },
        "checks": checks,
        "engineering_observations": observations,
        "source_policy": batch.get("source_policy"),
    }


def _markdown(result: dict[str, Any]) -> str:
    edm = result["edm"]
    survey = result["flow_survey"]
    lines = [
        "# Real-world reference workflow simulation",
        "",
        "This evidence uses the committed reference/current-tool files and checks engineering interpretation, not only software execution.",
        "",
        "## 1. Standalone EDM / telemetry workflow",
        "",
        f"- Observed level: {edm['observed']['rows']:,} rows, {edm['observed']['level_min_m']:.3f}-{edm['observed']['level_max_m']:.3f} m.",
        f"- Rainfall: {edm['rainfall']['rows']:,} rows; explicit reference assumption = {edm['rainfall']['explicit_simulation_semantics']}.",
        f"- Support-aware rainfall depth: {edm['rainfall']['total_depth_mm']:.3f} mm; status {edm['rainfall']['calculation_status']}.",
        f"- WAPUG events: >50k = {edm['wapug']['over_50k']['event_count']}; <=50k = {edm['wapug']['under_or_equal_50k']['event_count']}.",
        f"- Event overlay response: {edm['event_overlay_response']['clear_response_count']}/{edm['event_overlay_response']['assessed_event_count']} assessed >50k events show >=0.10 m uplift.",
        f"- Spill workflow simulation threshold: {edm['spills']['threshold_m']:.4f} m ({edm['spills']['threshold_evidence']['source']}); detected events = {edm['spills']['event_count']}; status {edm['spills']['calculation_status']}.",
        "",
        "Engineering observations:",
    ]
    lines.extend(f"- {x}" for x in edm["engineering_observations"])
    lines += ["", "## 2. Flow Survey workflow", ""]
    lines += [
        f"- Authoritative fm_rg_assoc rows: {survey['association']['record_count']}; matched FDV sources: {survey['association']['matched_fdv_source_count']}.",
        f"- Rain gauges: {survey['rainfall']['gauge_count']}; network-qualified WAPUG events >50k: {survey['rainfall']['over_50k_qualified_event_count']}; <=50k sensitivity: {survey['rainfall']['under_or_equal_50k_qualified_event_count']}.",
        f"- Volume-balance rows: {survey['volume_balance']['row_count']}; non-Green rows: {survey['volume_balance']['non_green_row_count']}.",
        "",
        "| Monitor | Status | RG | Worst weekly | Weeks | Event rows | Flagged event rows |",
        "|---|---|---|---|---:|---:|---:|",
    ]
    for row in survey["monitors"]:
        lines.append(
            f"| {row['monitor']} | {row['status']} | {row.get('rain_gauge') or '-'} | {row['worst_rag']} | {row['week_count']} | {row['event_response_rows']} | {row['event_response_flagged']} |"
        )
    lines += ["", "Engineering observations:"]
    lines.extend(f"- {x}" for x in survey["engineering_observations"])
    lines += ["", "## Acceptance checks", ""]
    for group_name, checks in (("EDM", edm["checks"]), ("Flow Survey", survey["checks"])):
        lines.append(f"### {group_name}")
        for key, passed in checks.items():
            lines.append(f"- {'PASS' if passed else 'FAIL'} - {key}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", type=Path, default=None)
    parser.add_argument("--markdown", type=Path, default=None)
    args = parser.parse_args()

    clear_cache()
    edm = _edm_workflow()
    clear_cache()
    flow_survey = _flow_survey_workflow()
    result = {
        "schema_version": 1,
        "reference_root": str(REFERENCE.relative_to(ROOT)),
        "edm": edm,
        "flow_survey": flow_survey,
    }
    all_checks = list(edm["checks"].values()) + list(flow_survey["checks"].values())
    result["passed"] = all(bool(x) for x in all_checks)
    rendered = json.dumps(_jsonable(result), indent=2, ensure_ascii=False)
    markdown = _markdown(result)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(rendered + "\n", encoding="utf-8")
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(markdown, encoding="utf-8")

    print(markdown)
    print("REFERENCE_WORKFLOW_RESULT " + json.dumps({
        "passed": result["passed"],
        "edm_checks": edm["checks"],
        "flow_survey_checks": flow_survey["checks"],
        "edm_wapug_over50": edm["wapug"]["over_50k"]["event_count"],
        "survey_wapug_over50": flow_survey["rainfall"]["over_50k_qualified_event_count"],
        "monitor_count": len(flow_survey["monitors"]),
        "volume_non_green": flow_survey["volume_balance"]["non_green_row_count"],
    }, separators=(",", ":")))

    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
