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


def _summary(path: Path, label: str | None = None):
    parsed = parse_file(path)
    frame = parsed.frame
    columns = [str(c) for c in frame.columns if str(c) != "timestamp"]
    try:
        display_path = str(path.relative_to(ROOT))
    except ValueError:
        display_path = label or path.name
    return {
        "path": display_path,
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
        REF / "fdv" / "FM7413.fdv",
        REF / "rainfall" / "RG5097.R",
        REF / "other" / "CS2666_EDM.csv",
        REF / "other" / "CS2666_Rainfall.csv",
        REF / "other" / "CS2666_Modelled_Data.zip",
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
                    entry["parsed"] = _summary(extracted, info.filename)
                except Exception as exc:
                    entry["parse_error"] = f"{type(exc).__name__}: {exc}"
            result["model_zip"]["entries"].append(entry)

    print("REFERENCE_SAMPLE_SUMMARY " + json.dumps(result, ensure_ascii=False, default=str))

    manifest = json.loads((REF.parent / 'synthetic-manifest.json').read_text())
    fm01 = result['fm01']
    assert fm01['format'] == 'fdv_ascii'
    for column, unit in [('flow', 'm³/s'), ('depth', 'm'), ('velocity', 'm/s')]:
        assert fm01['metadata']['channels'][column]['canonical_unit'] == unit
        expected = manifest['fdv_statistics'][manifest['monitors'][0]][column]
        for actual_key, expected_key in [('min', 'minimum'), ('max', 'maximum'), ('mean', 'mean')]:
            assert abs(fm01['stats'][column][actual_key] - expected[expected_key]) < 1e-10
    assert result['rg01']['format'] == 'rainfall_r_ascii'
    assert result['rg01']['metadata']['canonical_unit'] == 'mm/h'
    assert result['station_edm']['format'] == 'icm_hyd_p_datetime_csv'
    assert result['station_edm']['metadata']['quantity'] == 'level'
    assert result['station_edm']['metadata']['canonical_unit'] == 'm'
    assert result['model_zip']['entries']
    assert all('parse_error' not in entry for entry in result['model_zip']['entries'])


if __name__ == '__main__':
    main()
