# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Environment Agency retained continuation-flow screening for England."""
from math import fsum, isfinite

EA_FORMULA_A = (
    "https://www.gov.uk/government/publications/"
    "water-companies-environmental-permits-for-storm-overflows-and-emergency-overflows/"
    "water-companies-environmental-permits-for-storm-overflows-and-emergency-overflows#formula-a"
)
METHOD = "ea-england-formula-a-2026-11-21-v1"
CLASSIFICATIONS = {"combined", "partially-separate", "qualifying-separate", "surface-water", "excluded"}


def _nonnegative(value, label, maximum):
    if type(value) not in (int, float) or not 0 <= value <= maximum or not isfinite(value):
        raise ValueError(f"Enter a finite non-negative {label} within the supported range.")
    return value


def england_continuation_flow(catchments):
    """Calculate from explicitly reviewed daily allowances by catchment."""
    if not isinstance(catchments, list) or not 1 <= len(catchments) <= 10000:
        raise ValueError("Provide 1–10,000 reviewed catchment rows.")
    seen, rows = set(), []
    for item in catchments:
        if not isinstance(item, dict):
            raise ValueError("Each catchment requires a record.")
        identifier, classification = item.get("id"), item.get("classification")
        if not isinstance(identifier, str) or not identifier.strip() or len(identifier) > 128:
            raise ValueError("Provide a catchment ID within 128 characters.")
        identifier = identifier.strip()
        if identifier.casefold() in seen:
            raise ValueError("Catchment IDs must be unique, including excluded rows.")
        seen.add(identifier.casefold())
        if not isinstance(classification, str) or classification not in CLASSIFICATIONS:
            raise ValueError("Choose a reviewed catchment classification.")
        evidence = item.get("evidence", "")
        if not isinstance(evidence, str) or len(evidence) > 2000:
            raise ValueError("Provide an evidence note within 2,000 characters.")
        included = classification not in {"surface-water", "excluded"}
        audit = dict(id=identifier, classification=classification, included=included, evidence=evidence.strip())
        if not included:
            if not evidence.strip():
                raise ValueError("Record the basis for excluding each catchment.")
            rows.append(audit)
            continue
        eligible = classification == "qualifying-separate"
        if eligible and (item.get("eligibility_confirmed") is not True or not evidence.strip()):
            raise ValueError("Qualifying separate foul areas require engineer confirmation and evidence of minimal storm response.")
        population = _nonnegative(item.get("population"), "population", 1e9)
        allowance = _nonnegative(item.get("domestic_l_head_day"), "domestic allowance", 1e6)
        infiltration = _nonnegative(item.get("infiltration_l_day"), "infiltration allowance", 1e15)
        trade = _nonnegative(item.get("trade_l_day"), "trade allowance", 1e15)
        domestic = population * allowance
        supplement = 2 * domestic if eligible else 1360 * population
        rows.append(dict(audit, population=population, domestic_l_head_day=allowance, domestic_l_day=domestic,
                         infiltration_l_day=infiltration, trade_l_day=trade, supplement_l_day=supplement,
                         trade_supplement_l_day=2 * trade, eligibility_confirmed=eligible))
    included = [row for row in rows if row["included"]]
    if not included:
        raise ValueError("Include at least one contributing catchment.")
    keys = ("population", "domestic_l_day", "infiltration_l_day", "trade_l_day", "supplement_l_day",
            "trade_supplement_l_day")
    totals = {key: fsum(row[key] for row in included) for key in keys}
    separate = [row for row in included if row["eligibility_confirmed"]]
    totals["separate_population"] = fsum(row["population"] for row in separate)
    totals["combined_population"] = fsum(row["population"] for row in included if not row["eligibility_confirmed"])
    dwf = fsum(totals[key] for key in ("domestic_l_day", "infiltration_l_day", "trade_l_day"))
    retained = fsum((dwf, totals["supplement_l_day"], totals["trade_supplement_l_day"]))
    return dict(method=METHOD, reference=EA_FORMULA_A, rows=rows, totals=totals, dwf_l_day=dwf,
                retained_l_day=retained, retained_l_s=retained / 86400, retained_m3_s=retained / 86400000,
                regime="qualifying separate PFF" if len(separate) == len(included) else
                "mixed Formula A" if separate else "combined / partially separate Formula A")


def preview_catchment_csv(text):
    """Read one local catchment table and retain blank cells and original units."""
    import csv
    from io import StringIO

    if not isinstance(text, str) or not 1 <= len(text) <= 1_048_576 or "\x00" in text:
        raise ValueError("Choose a catchment CSV up to 1 MiB of decoded text without NUL bytes.")
    rows, header, units, descriptions = [], None, None, None
    native, in_table = False, True
    reader = csv.reader(StringIO(text.removeprefix("\ufeff"), newline=""), strict=True)
    try:
        for values in reader:
            line = reader.line_num
            if not values or all(not value.strip() for value in values):
                continue
            # Native table markers occupy the first column. Read one
            # hw_subcatchment table out of a native multi-table export.
            marker = values[0].strip().casefold()
            if marker.startswith("****") and not any(value.strip() for value in values[1:]):
                if header is not None:
                    if native:
                        break
                    raise ValueError("Unexpected native table marker inside a plain catchment CSV.")
                native = True
                in_table = marker.removeprefix("****").strip() == "hw_subcatchment"
                continue
            if not in_table:
                continue
            if header is None:
                header = [value.strip() for value in values]
                names = [value.casefold() for value in header if value]
                if not 2 <= len(header) <= 512 or len(names) != len(set(names)) or any(len(value)>256 for value in header):
                    raise ValueError("Supply 2–512 columns with unique named headings.")
                continue
            if len(values) != len(header) or any(len(value) > 32768 for value in values):
                raise ValueError(f"Malformed catchment CSV near line {line}. Check the column count and field lengths.")
            if native and not rows and marker in {"fielddescription","userunits"}:
                field = [value.strip() for value in values]
                field[0] = ""
                if marker == "fielddescription":
                    descriptions = field
                else:
                    units = field
                continue
            if len(rows) >= 100:
                raise ValueError("The reviewed catchment table supports up to 100 rows per calculation. Select the contributing catchments before export.")
            rows.append({"line":line,"cells":values})
    except csv.Error as error:
        raise ValueError(f"Malformed catchment CSV near line {reader.line_num}. Check quoting and delimiters.") from error
    if not header or not rows:
        raise ValueError("The CSV contains no catchment data rows.")
    return dict(schema="hydra-catchment-mapping-v1",native=native,header=header,units=units,descriptions=descriptions,rows=rows)
