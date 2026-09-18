from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import pandas as pd

from icm_workbench.parsers import parse_file


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _normalise_timestamp(value: Any) -> pd.Timestamp | None:
    if value in (None, ""):
        return None
    ts = pd.to_datetime(value, errors="coerce")
    return None if pd.isna(ts) else pd.Timestamp(ts)


def _check_case(case: dict, manifest_dir: Path) -> dict:
    case_id = str(case.get("id") or case.get("path") or "unnamed")
    rel = case.get("path")
    if not rel:
        return {"id": case_id, "passed": False, "errors": ["Missing case.path"]}

    path = (manifest_dir / rel).resolve()
    errors: list[str] = []
    checks: list[str] = []
    if not path.exists():
        return {
            "id": case_id,
            "path": str(path),
            "passed": False,
            "errors": ["Representative file does not exist."],
        }

    try:
        parsed = parse_file(path)
    except Exception as exc:
        return {
            "id": case_id,
            "path": str(path),
            "sha256": _sha256(path),
            "passed": False,
            "errors": [f"Parser raised {type(exc).__name__}: {exc}"],
        }

    expected = case.get("expected") or {}
    frame = parsed.frame
    metadata = parsed.metadata or {}

    fmt = expected.get("format_name")
    if fmt is not None:
        if parsed.format_name != fmt:
            errors.append(
                f"format_name expected {fmt!r}, got {parsed.format_name!r}"
            )
        else:
            checks.append(f"format_name={fmt}")

    exact_rows = expected.get("rows")
    min_rows = expected.get("min_rows")
    if exact_rows is not None:
        if len(frame) != int(exact_rows):
            errors.append(f"rows expected {exact_rows}, got {len(frame)}")
        else:
            checks.append(f"rows={len(frame)}")
    elif min_rows is not None:
        if len(frame) < int(min_rows):
            errors.append(f"rows expected >= {min_rows}, got {len(frame)}")
        else:
            checks.append(f"rows>={min_rows}")

    required_columns = expected.get("columns") or []
    missing_columns = [c for c in required_columns if c not in frame.columns]
    if missing_columns:
        errors.append(f"missing columns: {missing_columns}")
    elif required_columns:
        checks.append(f"columns={len(required_columns)} required")

    if "timestamp" in frame.columns and not frame.empty:
        ts = pd.to_datetime(frame["timestamp"], errors="coerce").dropna()
        if not ts.empty:
            expected_start = _normalise_timestamp(expected.get("timestamp_start"))
            expected_end = _normalise_timestamp(expected.get("timestamp_end"))
            actual_start, actual_end = pd.Timestamp(ts.min()), pd.Timestamp(ts.max())
            if expected_start is not None and actual_start != expected_start:
                errors.append(
                    f"timestamp_start expected {expected_start}, got {actual_start}"
                )
            if expected_end is not None and actual_end != expected_end:
                errors.append(
                    f"timestamp_end expected {expected_end}, got {actual_end}"
                )

    series_expected = expected.get("series") or {}
    series_metadata = metadata.get("series_metadata") or {}
    for column, wanted in series_expected.items():
        actual = series_metadata.get(column)
        if actual is None:
            errors.append(f"series metadata missing for {column!r}")
            continue
        for key in ("quantity", "original_unit", "canonical_unit", "unit_status"):
            if key in wanted and actual.get(key) != wanted.get(key):
                errors.append(
                    f"{column}.{key} expected {wanted.get(key)!r}, "
                    f"got {actual.get(key)!r}"
                )

    for sample in expected.get("samples") or []:
        column = sample.get("column")
        timestamp = _normalise_timestamp(sample.get("timestamp"))
        if not column or timestamp is None or column not in frame.columns:
            errors.append(f"invalid sample definition: {sample}")
            continue
        ts = pd.to_datetime(frame["timestamp"], errors="coerce")
        matches = frame.loc[ts.eq(timestamp), column]
        if matches.empty:
            errors.append(f"no sample at {timestamp} for {column}")
            continue
        actual = pd.to_numeric(matches.iloc[-1], errors="coerce")
        wanted = float(sample["value"])
        tolerance = float(sample.get("tolerance", 1e-9))
        if pd.isna(actual) or abs(float(actual) - wanted) > tolerance:
            errors.append(
                f"sample {column}@{timestamp} expected {wanted}±{tolerance}, "
                f"got {actual}"
            )

    return {
        "id": case_id,
        "path": str(path),
        "sha256": _sha256(path),
        "format_name": parsed.format_name,
        "rows": int(len(frame)),
        "passed": not errors,
        "checks": checks,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Validate representative real ICM/vendor exports against an explicit "
            "engineering acceptance manifest."
        )
    )
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if int(manifest.get("schema_version", 0)) != 1:
        raise ValueError("Representative manifest schema_version must be 1")

    cases = manifest.get("cases") or []
    if not cases:
        raise ValueError("Representative manifest contains no cases")

    results = [_check_case(case, manifest_path.parent) for case in cases]
    summary = {
        "schema_version": 1,
        "manifest": str(manifest_path),
        "passed": all(r["passed"] for r in results),
        "case_count": len(results),
        "passed_count": sum(1 for r in results if r["passed"]),
        "failed_count": sum(1 for r in results if not r["passed"]),
        "results": results,
    }

    rendered = json.dumps(summary, indent=2, default=str)
    print(rendered)
    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered + "\n", encoding="utf-8")
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
