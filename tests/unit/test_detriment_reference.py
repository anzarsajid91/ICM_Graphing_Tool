import csv
import json
from pathlib import Path

import pytest

from icm_workbench.detriment_api import parse_detriment_report, detriment_result
from scripts.detriment_reference_cases import build_cases


@pytest.fixture
def cases(tmp_path):
    return build_cases(tmp_path)


def source(path, kind):
    parsed = json.loads(parse_detriment_report(path))
    return dict(path=path, mapping=parsed["metadata"]["mapping_suggestions"],
                report_kind=parsed["metadata"]["report_kind"], scope="Reference matched scope",
                datum="AD", period_start="2023-01-01", period_end="2025-01-01",
                template="Reference exported row basis", duration_unit="auto")


@pytest.mark.parametrize("kind", ["flooding", "level", "spill"])
def test_original_csv_structure_and_reference_scenario_results(cases, kind):
    case = cases[kind]
    parsed = json.loads(parse_detriment_report(case["original"]))
    assert parsed["rows"] == case["original_rows"]
    assert parsed["metadata"]["report_kind"] == ("spill_detail" if kind == "spill" else kind)
    a, b = [source(p, kind) for p in case["paths"]]
    if kind == "flooding":
        assert a["mapping"]["value"] == "Max Flood/Lost Volume (m3)"
    if kind == "spill":
        assert a["mapping"]["duration"] == "Spill Duration (mins)"
        assert a["mapping"]["start"] == "Start of Spill (absolute)"
        assert a["mapping"]["end"] == "End of Spill (absolute)"
    criteria = dict(scope_confirmed=True, elevation_confirmed=True, threshold=".15" if kind == "level" else "5",
                    freeboard_required=".5" if kind == "level" else None,
                    counting_mode="block-rows" if kind == "spill" else "summary")
    result = json.loads(detriment_result(kind, json.dumps(a), json.dumps(b), json.dumps(criteria)))
    for expected in case["expected"]:
        row = next(r for r in result["rows"] if r["asset_id"] == expected["asset_id"])
        for key, value in expected.items():
            if key == "flag":
                assert value in row["flags"]
            elif isinstance(value, (int, float)):
                assert row[key] == pytest.approx(value)
            else:
                assert row[key] == value
    assert result["summary"]["unresolved"] == 0
    if kind == "spill":
        assert len(result["rows"][0]["details_b"]) == 125
        assert result["counting_mode"] == "block-rows"
        with pytest.raises(ValueError, match="Summary|counting"):
            detriment_result(kind, json.dumps(a), json.dumps(b), json.dumps(dict(criteria, counting_mode="summary")))


def test_flood_and_flood_lost_measures_cannot_be_mixed(cases):
    a, b = [source(p, "flooding") for p in cases["flooding"]["paths"]]
    b["mapping"]["value"] = "Max Flood volume (m3)"
    with pytest.raises(ValueError, match="measure"):
        detriment_result("flooding", json.dumps(a), json.dumps(b), json.dumps(dict(scope_confirmed=True, elevation_confirmed=True)))


def test_flood_critical_report_cannot_supply_worst_case_levels(cases):
    a, b = [source(p, "level") for p in cases["flooding"]["paths"]]
    for item in (a, b):
        item["mapping"]["value"] = "Max Level (m AD)"
    with pytest.raises(ValueError, match="critical|worst.case"):
        detriment_result("level", json.dumps(a), json.dumps(b), json.dumps(dict(scope_confirmed=True, elevation_confirmed=True)))


def test_reference_audit_reports_ancillary_date_values_and_date_only_end(cases):
    level = json.loads(parse_detriment_report(cases["level"]["original"]))
    assert level["audit"]["numeric_date_cells"] == 122
    spill = json.loads(parse_detriment_report(cases["spill"]["original"]))
    assert spill["audit"]["date_only_boundaries"] == 1
    assert spill["metadata"]["warnings"]


@pytest.mark.parametrize("change", ["duplicate", "mixed-run"])
def test_reference_detail_duplicate_and_mixed_scenarios_block_counting(cases, change):
    a, b = [source(p, "spill") for p in cases["spill"]["paths"]]
    with Path(b['path']).open(newline='') as stream:
        reader = csv.DictReader(stream)
        columns, rows = reader.fieldnames, list(reader)
    if change == 'duplicate':
        rows.append(dict(rows[0]))
    else:
        rows[-1]['Run'] = 'Unrelated model run'
    with Path(b['path']).open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader(); writer.writerows(rows)
    with pytest.raises(ValueError, match='[Dd]uplicate|multiple.*Run'):
        detriment_result('spill', json.dumps(a), json.dumps(b), json.dumps(dict(scope_confirmed=True, elevation_confirmed=True, counting_mode='block-rows')))


def test_missing_attribute_selection_is_not_a_zero_result(cases):
    a,b=[source(p,'spill') for p in cases['spill']['paths']]
    a['attribute_value']='Nonexistent attribute'
    with pytest.raises(ValueError,match='No report rows'):
        detriment_result('spill',json.dumps(a),json.dumps(b),json.dumps(dict(scope_confirmed=True, elevation_confirmed=True,counting_mode='block-rows')))
