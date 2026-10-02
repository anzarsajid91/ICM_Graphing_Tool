"""Controlled A/B copies of user exports; expected values do not call the engine."""
from __future__ import annotations

import csv
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference/current-tool/sample-data/other"


def build_cases(destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for kind, filename in [("flooding", "Worst_Case_Volume_Sample.csv"),
                           ("level", "Worst_Case_Level_Sample.csv"),
                           ("spill", "Statistical_Template_spills_Sample.csv")]:
        with (REFERENCE / filename).open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            columns = reader.fieldnames
            original = [r for r in reader if any(str(v or "").strip() for v in r.values())]
        a = [dict(r) for r in original]
        b = [dict(r) for r in original]
        expected = []
        if kind == "flooding":
            for i, (va, vb, status, flag) in enumerate([
                ("2", "8", "detriment", "flood_detriment"),
                ("0", "0.4", "risk", "new_flooding"),
                ("10", "3", "improvement", "improvement"),
                ("2", "7", "risk", "increase_within_tolerance"),
                ("2", "2", "unchanged", "unchanged"),
            ]):
                a[i]["Max Flood/Lost Volume (m3)"] = va
                b[i]["Max Flood/Lost Volume (m3)"] = vb
                expected.append(dict(asset_id=a[i]["Node ID"], a=float(va), b=float(vb),
                                     delta=float(Decimal(vb)-Decimal(va)), status=status, flag=flag))
        elif kind == "level":
            for i, (fa, fb, status, flag) in enumerate([
                (".65", ".35", "detriment", "new_freeboard_breach"),
                (".30", ".40", "risk", "existing_breach_improving"),
                (".20", ".10", "detriment", "existing_breach_worsening"),
                (".65", ".50", "risk", "increase_within_tolerance"),
                (".65", ".65", "unchanged", "unchanged"),
            ]):
                ground = Decimal(a[i]["Ground level (m AD)"])
                va, vb = ground-Decimal(fa), ground-Decimal(fb)
                a[i]["Max Level (m AD)"], b[i]["Max Level (m AD)"] = str(va), str(vb)
                expected.append(dict(asset_id=a[i]["Node ID"], a=float(va), b=float(vb),
                                     delta=float(vb-va), freeboard_a=float(fa), freeboard_b=float(fb),
                                     status=status, flag=flag))
        else:
            # Retain exported actual duration; it differs from the event-span duration.
            b[0]["Spill Duration (mins)"] = str(Decimal(b[0]["Spill Duration (mins)"])+60)
            b[0]["End of Spill (absolute)"] = "09/12/2023 21:44"
            extra = dict(b[0])
            extra.update({"Start of Spill (absolute)": "02/01/2023 00:00",
                          "End of Spill (absolute)": "02/01/2023 01:00",
                          "Spill Duration (mins)": "60", "Spill Volume (m3)": "1"})
            b.append(extra)
            expected = [dict(asset_id=a[0]["ID"], a=124, b=125, delta=1,
                             duration_a_hours=float(Decimal("52265.2")/60),
                             duration_b_hours=float(Decimal("52385.2")/60),
                             duration_delta_hours=2, status="detriment", flag="spill_count_detriment")]
        paths = []
        for side, rows in [("a", a), ("b", b)]:
            output = destination / f"reference-{kind}-{side}.csv"
            with output.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=columns)
                writer.writeheader()
                writer.writerows(rows)
            paths.append(str(output.resolve()))
        manifest[kind] = dict(paths=paths, original=str((REFERENCE/filename).resolve()),
                              original_rows=len(original), expected=expected)
    (destination / "expected.json").write_text(json.dumps(manifest, indent=2)+"\n")
    return manifest


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    print(json.dumps(build_cases(parser.parse_args().destination), indent=2))
