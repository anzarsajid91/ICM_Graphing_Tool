"""Release numbers: v1.000 at inception, one increment per merged main PR.

Historical PRs are recorded explicitly because early merges had no PR marker.
Later merge/squash commits must retain GitHub's PR number in the subject.
No network lookup is made by the app or the build.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(ROOT), *args], text=True).strip()


def format_version(iteration: int) -> str:
    major, minor = divmod(iteration, 1000)
    return f"v{1 + major}.{minor:03d}"


def release_version() -> dict:
    ledger = json.loads((ROOT / "release-history.json").read_text())
    baseline = ledger["baseline_commit"]
    # Fail closed on a shallow checkout rather than silently publishing an old number.
    git("merge-base", "--is-ancestor", baseline, "HEAD")
    known = {entry["number"] for entry in ledger["merged_prs"]}
    history = git("log", "--first-parent", "--format=%s", f"{baseline}..HEAD")
    for subject in history.splitlines():
        match = re.search(r"^Merge (?:pull request|PR) #(\d+)\b|\(#(\d+)\)$", subject)
        if match:
            known.add(int(match.group(1) or match.group(2)))
    preview = os.environ.get("GITHUB_EVENT_NAME") == "pull_request"
    if preview:
        # A PR is the next release only after merging; preview is clearly labelled.
        iteration = len(known) + 1
    else:
        iteration = len(known)
    return {"app_version": format_version(iteration) + ("-preview" if preview else ""),
            "release_iteration": iteration, "version_policy": "one-per-merged-main-pr"}
