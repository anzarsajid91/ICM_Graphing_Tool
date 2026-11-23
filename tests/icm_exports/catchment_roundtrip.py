"""Round-trip the synthetic ICM Ruby export through Formula A review intake."""
from pathlib import Path
import sys

from icm_workbench.analysis.design_flows import preview_catchment_csv, resolve_icm_catchment_defaults

root = Path(sys.argv[1])
source = next(root.glob("hydra_formula_a_*/formula_a_catchments.csv"))
table = preview_catchment_csv(source.read_text(encoding="utf-8"))
assert table["native"]
rows = [dict(zip(table["header"], row["cells"])) for row in table["rows"]]
assert rows[0]["subcatchment_id"] == "0001"
assert rows[0]["population"] == "100"
assert rows[0]["base_flow"] == ""
assert rows[0]["additional_foul_flow"] == "0"
assert rows[1]["population"] == ""
assert rows[1]["land_use_id"] == "01"
land_use = preview_catchment_csv(source.with_name("formula_a_land_use.csv").read_text(encoding="utf-8"), "hw_land_use")
land_rows = [dict(zip(land_use["header"], row["cells"])) for row in land_use["rows"]]
assert land_rows == [{"land_use_id": "01", "population_density": "60", "connectivity": "80", "wastewater_profile": "2"}]
audited = resolve_icm_catchment_defaults(table, land_use, "ha", "people/ha")["rows"]
assert audited[0]["population"]["value"] == 100 and audited[0]["population"]["basis"] == "subcatchment"
assert audited[0]["wastewater_profile"]["value"] == 0 and audited[0]["wastewater_profile"]["basis"] == "subcatchment"
assert audited[1]["population"]["value"] == 30 and audited[1]["population"]["basis"] == "land use"
assert audited[1]["connectivity"]["value"] == 80 and audited[1]["population_times_connectivity"] == 24
assert audited[1]["wastewater_profile"]["value"] == 2
assert audited[2]["land_use_id"] == "02" and audited[2]["population"]["basis"] == "unresolved land use"
assert audited[2]["population"]["value"] is None
print("ICM_TOOLKIT_CATCHMENT_ROUNDTRIP_PASS")
