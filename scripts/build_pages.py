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


def build() -> None:
    if SITE.exists():
        shutil.rmtree(SITE)
    shutil.copytree(WEB, SITE, ignore=shutil.ignore_patterns("tests"))

    python_root = SITE / "python"
    python_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(PACKAGE, python_root / "icm_workbench")

    # The release runtime is deliberately staged over runtime.js so index.html has
    # one stable script URL while development history remains reviewable in Git.
    shutil.copy2(WEB / "assets" / "runtime.release.js", SITE / "assets" / "runtime.js")

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
                "runtime": "assets/runtime.release.js staged as assets/runtime.js",
                "python_module_count": len(manifest),
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
