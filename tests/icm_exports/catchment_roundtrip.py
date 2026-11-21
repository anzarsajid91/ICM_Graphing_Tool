"""Round-trip the synthetic ICM Ruby export through Formula A review intake."""
from pathlib import Path
import sys

from icm_workbench.analysis.design_flows import preview_catchment_csv

root = Path(sys.argv[1])
source = next(root.glob("hydra_formula_a_*/formula_a_catchments.csv"))
table = preview_catchment_csv(source.read_text(encoding="utf-8"))
assert table["native"]
rows = [dict(zip(table["header"], row["cells"])) for row in table["rows"]]
assert rows[0]["subcatchment_id"] == "0001"
assert rows[0]["population"] == "100"
assert rows[0]["base_flow"] == ""
assert rows[0]["additional_foul_flow"] == "0"
print("ICM_TOOLKIT_CATCHMENT_ROUNDTRIP_PASS")
