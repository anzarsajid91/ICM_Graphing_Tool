from __future__ import annotations

import json
import math
import tempfile
import zipfile
from pathlib import Path

from icm_workbench.parsers import parse_file

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "reference" / "current-tool" / "sample-data"


def _finite_stats(series):
    values = [float(v) for v in series if v is not None and math.isfinite(float(v))]
    return {
        "count": len(values),
        "min": min(values) if values else None,
        "max": max(values) if values else None,
        "mean": sum(values) / len(values) if values else None,
    }


def _summary(path: Path):
    parsed = parse_file(path)
    frame = parsed.frame
    columns = [str(c) for c in frame.columns if str(c) != "timestamp"]
    return {
        "path": str(path.relative_to(ROOT)),
        "format": parsed.format_name,
        "rows": int(len(frame)),
        "start": None if frame.empty else str(frame["timestamp"].min()),
        "end": None if frame.empty else str(frame["timestamp"].max()),
        "columns": columns,
        "metadata": parsed.metadata,
        "audit": parsed.audit,
        "stats": {c: _finite_stats(frame[c]) for c in columns},
    }


def main():
    required = [
        REF / "fdv" / "FM01.fdv",
        REF / "rainfall" / "RG01.R",
        REF / "other" / "StationA_EDM.csv",
        REF / "other" / "StationA_Rainfall.csv",
        REF / "other" / "StationA_Modelled Data.zip",
    ]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        raise SystemExit("Reference samples missing: " + ", ".join(missing))

    result = {
        "fm01": _summary(required[0]),
        "rg01": _summary(required[1]),
        "station_edm": _summary(required[2]),
        "station_rainfall": _summary(required[3]),
        "model_zip": {"path": str(required[4].relative_to(ROOT)), "entries": []},
    }

    with zipfile.ZipFile(required[4]) as archive, tempfile.TemporaryDirectory() as tmp:
        archive.extractall(tmp)
        for info in archive.infolist():
            if info.is_dir():
                continue
            entry = {
                "name": info.filename,
                "compressed_bytes": info.compress_size,
                "uncompressed_bytes": info.file_size,
            }
            extracted = Path(tmp) / info.filename
            if extracted.suffix.lower() in {".csv", ".hyd", ".fdv", ".r"}:
                try:
                    entry["parsed"] = _summary(extracted)
                    entry["parsed"]["path"] = info.filename
                except Exception as exc:
                    entry["parse_error"] = f"{type(exc).__name__}: {exc}"
            result["model_zip"]["entries"].append(entry)

    print("REFERENCE_SAMPLE_SUMMARY " + json.dumps(result, ensure_ascii=False, default=str))

    # Stable contracts demonstrated by the user's reference examples.
    fm01 = result["fm01"]
    assert fm01["format"] == "fdv_ascii"
    assert fm01["metadata"]["channels"]["flow"]["canonical_unit"] == "m³/s"
    assert fm01["metadata"]["channels"]["depth"]["canonical_unit"] == "m"
    assert fm01["metadata"]["channels"]["velocity"]["canonical_unit"] == "m/s"
    assert abs(fm01["stats"]["flow"]["min"] - 0.039) < 1e-12
    assert abs(fm01["stats"]["flow"]["max"] - 0.769) < 1e-12
    assert abs(fm01["stats"]["depth"]["min"] - 0.113) < 1e-12
    assert abs(fm01["stats"]["depth"]["max"] - 0.47) < 1e-12
    assert abs(fm01["stats"]["velocity"]["min"] - 0.42) < 1e-12
    assert abs(fm01["stats"]["velocity"]["max"] - 1.48) < 1e-12

    rg01 = result["rg01"]
    assert rg01["format"] == "rainfall_r_ascii"
    assert rg01["metadata"]["canonical_unit"] == "mm/h"
    assert abs(rg01["stats"]["rainfall"]["max"] - 66.0) < 1e-12

    edm = result["station_edm"]
    assert edm["format"] == "icm_hyd_p_datetime_csv"
    assert edm["metadata"]["quantity"] == "level"
    assert edm["metadata"]["canonical_unit"] == "m"

    if not result["model_zip"]["entries"]:
        raise AssertionError("StationA model ZIP contains no files")


if __name__ == "__main__":
    main()
