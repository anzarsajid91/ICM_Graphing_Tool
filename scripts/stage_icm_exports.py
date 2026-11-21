"""Build standalone, versioned read-only ICM export downloads."""
from pathlib import Path
import re
import shutil


JOBS = {
    "network-geometry": "geometry",
    "simulation-series": "simulation",
    "formula-a-catchments": "formula_a",
    "spill-storage-continuation": "spill_storage",
    "monitoring-results": "monitoring",
    "detriment-results": "detriment",
}


def stage_icm_exports(root: Path, destination: Path) -> str:
    library = (root / "tools/icm_export/toolkit.rb").read_text(encoding="utf-8")
    version_match = re.search(r"^  VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'\.freeze$", library, re.MULTILINE)
    if version_match is None:
        raise ValueError("ICM export library must declare a toolkit version.")
    version = version_match[1]
    destination.mkdir(parents=True, exist_ok=True)
    for download, job in JOBS.items():
        source = (
            "# Hydra Bench standalone InfoWorks ICM UI export\n"
            "# See the ICM Export Toolkit guide for workflow, versions, units and prerequisites.\n\n"
            + library
            + "\n# Set documented extra_fields, link_tables or result_fields here when needed.\n"
            + f"HydraIcmExport.run(:{job}, {{}})\n"
        )
        (destination / f"{download}-v{version}.rb").write_text(source, encoding="utf-8")
    shutil.copy2(root / "docs/icm-export-toolkit.md", destination / f"icm-export-guide-v{version}.md")
    return version
