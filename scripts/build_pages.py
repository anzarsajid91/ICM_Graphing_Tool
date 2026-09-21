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


def _inject_v2_assets(build_token: str) -> None:
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
        '<link rel="stylesheet" href="assets/app.css" />\n  <link rel="stylesheet" href="assets/workbench-v2.css" />\n  <link rel="stylesheet" href="assets/workbench-survey.css" />\n  <link rel="stylesheet" href="assets/precision-workbench.css" />',
    )
    html = html.replace(
        '<script type="module" src="assets/runtime.js"></script>',
        '<script src="assets/domain-registry.js"></script>\n  <script src="assets/runtime.js"></script>\n  <script src="assets/workbench-v2.js"></script>\n  <script src="assets/fastpath-preview.js"></script>\n  <script src="assets/workbench-v2-domfix.js"></script>\n  <script src="assets/workbench-v3.js"></script>\n  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>\n  <script src="assets/workbench-survey.js"></script>\n  <script src="assets/precision-workbench.js"></script>',
    )
    required = ["domain-registry.js", "workbench-v2.css", "workbench-v2.js", "fastpath-preview.js", "workbench-v2-domfix.js", "workbench-v3.js", "workbench-survey.css", "workbench-survey.js", "precision-workbench.css", "precision-workbench.js", "xlsx@0.18.5"]
    if not all(name in html for name in required):
        raise RuntimeError("Could not inject all browser UX assets into Pages index")

    # GitHub Pages/CDN may retain same-named static assets across deployments.
    # Version every local script/style URL with the exact release SHA so index,
    # browser runtime, worker and Python package cannot be mixed across releases.
    local_assets = [
        "assets/app.css",
        "assets/workbench-v2.css",
        "assets/workbench-survey.css",
        "assets/precision-workbench.css",
        "assets/domain-registry.js",
        "assets/runtime.js",
        "assets/workbench-v2.js",
        "assets/workbench-v2-domfix.js",
        "assets/workbench-v3.js",
        "assets/workbench-survey.js",
        "assets/precision-workbench.js",
    ]
    for asset in local_assets:
        html = html.replace(f'"{asset}"', f'"{asset}?v={build_token}"')

    build_meta = f'  <meta name="icm-build-sha" content="{build_token}" />\n'
    html = html.replace('  <meta name="description"', build_meta + '  <meta name="description"', 1)
    index.write_text(html, encoding="utf-8")


def build() -> None:
    if SITE.exists():
        shutil.rmtree(SITE)
    shutil.copytree(WEB, SITE, ignore=shutil.ignore_patterns("tests"))

    python_root = SITE / "python"
    python_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(PACKAGE, python_root / "icm_workbench")

    shutil.copy2(WEB / "assets" / "runtime.release.js", SITE / "assets" / "runtime.js")
    build_token = os.environ.get("GITHUB_SHA", "local")
    _inject_v2_assets(build_token)

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
                "build_schema_version": 2,
                "commit": os.environ.get("GITHUB_SHA", "local"),
                "runtime": "worker-isolated Python kernel + canonical project registry + current engineering UX",
                "python_module_count": len(manifest),
                "ux_release": "v9-fastpath-preview",
                "architecture_version": 9,
                "execution_model": "fastpath-preview-worker + authoritative-pyodide-worker",
                "engineering_api": "icm_workbench.browser_api+advanced_api",
                "domain_registry": "icm-project-registry-v1",
                "asset_version": build_token,
                "cache_coherence": "sha-versioned-local-assets",
                "live_verification_contract": 2,
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
