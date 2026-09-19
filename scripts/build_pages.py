from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
SRC = ROOT / "src"
PACKAGE = SRC / "icm_workbench"
SITE = ROOT / "_site"


def _inject_v2_assets() -> None:
    """Load the reviewed release runtime plus the current UX overlays.

    The original runtime intentionally remains a separately reviewable source file. The
    UX overlays need access to its browser-local state/engine to provide observed-only
    mapping, adaptive visible-range graph retrieval, the redesigned spill workflow and
    cumulative multi-file rainfall review. Classic scripts share the page's global
    lexical environment; ES modules do not.
    """
    index = SITE / "index.html"
    html = index.read_text(encoding="utf-8")
    html = html.replace(
        '<link rel="stylesheet" href="assets/app.css" />',
        '<link rel="stylesheet" href="assets/app.css" />\n  <link rel="stylesheet" href="assets/workbench-v2.css" />\n  <link rel="stylesheet" href="assets/workbench-survey.css" />',
    )
    html = html.replace(
        '<script type="module" src="assets/runtime.js"></script>',
        '<script src="assets/runtime.js"></script>\n  <script src="assets/workbench-v2.js"></script>\n  <script src="assets/workbench-v2-domfix.js"></script>\n  <script src="assets/workbench-v3.js"></script>\n  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>\n  <script src="assets/workbench-survey.js"></script>',
    )
    required = ["workbench-v2.css", "workbench-v2.js", "workbench-v2-domfix.js", "workbench-v3.js", "workbench-survey.css", "workbench-survey.js", "xlsx@0.18.5"]
    if not all(name in html for name in required):
        raise RuntimeError("Could not inject all browser UX assets into Pages index")
    index.write_text(html, encoding="utf-8")


def build() -> None:
    if SITE.exists():
        shutil.rmtree(SITE)
    shutil.copytree(WEB, SITE, ignore=shutil.ignore_patterns("tests"))

    python_root = SITE / "python"
    python_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(PACKAGE, python_root / "icm_workbench")

    shutil.copy2(WEB / "assets" / "runtime.release.js", SITE / "assets" / "runtime.js")
    _inject_v2_assets()

    manifest = [
        path.relative_to(SRC).as_posix()
        for path in sorted(PACKAGE.rglob("*.py"))
        if "__pycache__" not in path.parts
    ]
    (python_root / "package-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    (SITE / ".nojekyll").touch()
    (SITE / "build.json").write_text(
        json.dumps(
            {
                "commit": os.environ.get("GITHUB_SHA", "local"),
                "runtime": "release runtime + usability/progress workflow + complete-survey engineering UX",
                "python_module_count": len(manifest),
                "ux_release": "v6-usability-progress-verification",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    if not manifest:
        raise RuntimeError("No Python modules were discovered for the Pages artifact")
    print(f"Built {SITE} with {len(manifest)} Python modules")


if __name__ == "__main__":
    build()
