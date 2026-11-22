# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
"""Reviewed continuation-flow and treatment design allowances."""
from math import fsum, isfinite

EA_FORMULA_A = (
    "https://www.gov.uk/government/publications/"
    "water-companies-environmental-permits-for-storm-overflows-and-emergency-overflows/"
    "water-companies-environmental-permits-for-storm-overflows-and-emergency-overflows#formula-a"
)
EA_TREATMENT = EA_FORMULA_A.split("#")[0] + "#flow-to-full-treatment-settings-at-waste-water-treatment-works"
UISCE_WASTEWATER = (
    "https://www.water.ie/sites/default/files/2025-08/"
    "Code-of-Practice-for-Wastewater-Infrastructure-CDS-5020-03-Rev-03.pdf"
)
METHOD = "ea-england-formula-a-2026-11-21-v1"
SEPA_OVERFLOWS = "https://www.sepa.org.uk/media/rdphwj00/wat-g-058_permit-guide_sewer_overflows.docx"
SEPA_TREATMENT = "https://www.sepa.org.uk/media/zz4ereqb/wat-g-065_permit_guide_municipal_sewage_treatment-_works.docx"
SEPA_METHOD = "sepa-scotland-wat-g-058-v1-2025-08"
CLASSIFICATIONS = {"combined", "partially-separate", "qualifying-separate", "surface-water", "excluded"}


def _nonnegative(value, label, maximum):
    if type(value) not in (int, float) or not 0 <= value <= maximum or not isfinite(value):
        raise ValueError(f"Enter a finite non-negative {label} within the supported range.")
    return value


def _reviewed_continuation_flow(catchments, *, method, reference, separate_evidence, combined_basis=False):
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
            raise ValueError(separate_evidence)
        population = _nonnegative(item.get("population"), "population", 1e9)
        allowance = _nonnegative(item.get("domestic_l_head_day"), "domestic allowance", 1e6)
        infiltration = _nonnegative(item.get("infiltration_l_day"), "infiltration allowance", 1e15)
        trade = _nonnegative(item.get("trade_l_day"), "trade allowance", 1e15)
        domestic = population * allowance
        supplement = 2 * domestic if eligible and not combined_basis else 1360 * population
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
    return dict(method=method, reference=reference, rows=rows, totals=totals, dwf_l_day=dwf,
                retained_l_day=retained, retained_l_s=retained / 86400, retained_m3_s=retained / 86400000,
                regime="qualifying separate PFF" if len(separate) == len(included) else
                "mixed Formula A" if separate else "combined / partially separate Formula A")


def england_continuation_flow(catchments):
    """Calculate England retained flow from explicitly reviewed daily allowances."""
    return _reviewed_continuation_flow(catchments, method=METHOD, reference=EA_FORMULA_A,
        separate_evidence="Qualifying separate foul areas require engineer confirmation and evidence of minimal storm response.")


def scotland_continuation_flow(catchments, applicability):
    """Apply WAT-G-058 only to a confirmed low-significance inland discharge."""
    if not isinstance(applicability, dict):
        raise ValueError("Record the SEPA low-significance applicability basis.")
    dilution = _nonnegative(applicability.get("dilution"), "river-to-DWF dilution ratio", 1e12)
    equivalent = _nonnegative(applicability.get("population_equivalent"), "population equivalent", 1e9)
    if not (dilution > 8 and equivalent < 10000 and applicability.get("no_interaction") is True
            and applicability.get("inland") is True):
        raise ValueError("This method requires an inland discharge, dilution greater than 8:1, population equivalent below 10,000 and no interaction with other discharges.")
    if applicability.get("imax_confirmed") is not True:
        raise ValueError("Confirm the reviewed maximum infiltration (Imax) allowances for every contributing catchment.")
    evidence = applicability.get("evidence")
    if not isinstance(evidence, str) or not evidence.strip() or len(evidence) > 2000:
        raise ValueError("Record the reviewed permit and low-significance evidence within 2,000 characters.")
    if isinstance(catchments, list) and any(isinstance(row, dict) and row.get("classification") == "partially-separate" for row in catchments):
        raise ValueError("Split each partially separate catchment into explicitly reviewed combined and separate foul portions for the Scottish method.")
    combined_basis = applicability.get("simpler_combined") is True
    fraction, rationale = None, None
    if combined_basis:
        fraction = _nonnegative(applicability.get("separate_fraction_percent"), "reviewed separate-drainage percentage", 100)
        rationale = applicability.get("allocation_basis")
        if not 0 < fraction < 20 or not isinstance(rationale, str) or not rationale.strip() or len(rationale) > 2000:
            raise ValueError("Using the simpler combined equation requires a reviewed separate-drainage share below 20% and its allocation basis.")
    result = _reviewed_continuation_flow(catchments, method=SEPA_METHOD, reference=SEPA_OVERFLOWS,
        separate_evidence="Review the separate foul classification and record the evidence for each separate catchment.",
        combined_basis=combined_basis)
    classes = {row["classification"] for row in result["rows"] if row["included"]}
    if combined_basis and classes != {"combined", "qualifying-separate"}:
        raise ValueError("The simpler combined equation option requires reviewed combined and separate foul contributions.")
    regimes = {frozenset({"combined"}): "Fully combined Formula A",
               frozenset({"qualifying-separate"}): "Fully separate flow to full treatment",
               frozenset({"combined", "qualifying-separate"}): "Part combined / part separate Formula A"}
    result["regime"] = "Reviewed mixed catchment using the simpler combined equation" if combined_basis else regimes[frozenset(classes)]
    result["applicability"] = {"dilution": dilution, "population_equivalent": equivalent,
        "no_interaction": True, "inland": True, "imax_confirmed": True, "evidence": evidence.strip(),
        "separate_fraction_percent": fraction, "allocation_basis": rationale.strip() if rationale else None}
    result["infiltration_basis"] = "Reviewed maximum infiltration (Imax)"
    return result


def _treatment_components(population, domestic_l_head_day, infiltration_dwf_l_day,
                          infiltration_max_l_day, trade_l_day):
    people = _nonnegative(population, "population", 1e9)
    allowance = _nonnegative(domestic_l_head_day, "domestic allowance", 1e6)
    dry = _nonnegative(infiltration_dwf_l_day, "dry-weather infiltration", 1e15)
    maximum = _nonnegative(infiltration_max_l_day, "maximum infiltration", 1e15)
    trade = _nonnegative(trade_l_day, "trade effluent", 1e15)
    if maximum < dry:
        raise ValueError("Maximum infiltration must be at least the dry-weather infiltration allowance.")
    domestic = people * allowance
    dwf = fsum((domestic, dry, trade))
    fft = fsum((3 * domestic, maximum, 3 * trade))
    return dict(domestic_l_day=domestic, dwf_l_day=dwf, fft_l_day=fft,
                dwf_l_s=dwf / 86400, fft_l_s=fft / 86400, dwf_m3_s=dwf / 86400000, fft_m3_s=fft / 86400000)


def scotland_treatment_design_flows(population, domestic_l_head_day, infiltration_dwf_l_day,
                                   infiltration_max_l_day, trade_l_day):
    """Keep ordinary DWF and FFT infiltration bases distinct under WAT-G-065."""
    return dict(method="sepa-scotland-wat-g-065-v1-2025-08", reference=SEPA_TREATMENT,
                **_treatment_components(population, domestic_l_head_day, infiltration_dwf_l_day,
                                        infiltration_max_l_day, trade_l_day))


def england_treatment_design_flows(periods):
    """Use the governing reviewed EA FFT case for an annual or seasonal assessment."""
    if not isinstance(periods, dict) or set(periods) not in ({"annual"}, {"winter", "summer"}):
        raise ValueError("Supply one reviewed annual case or separate winter and summer cases.")
    rows = []
    for period in ("annual", "winter", "summer"):
        if period not in periods:
            continue
        inputs = periods[period]
        if not isinstance(inputs, dict) or set(inputs) != {"population", "domestic_l_head_day", "infiltration_dwf_l_day",
                                                           "infiltration_max_l_day", "trade_l_day"}:
            raise ValueError("Provide the reviewed population and all daily flow allowances for each period.")
        rows.append(dict(period=period, **_treatment_components(**inputs)))
    fft = max(row["fft_l_day"] for row in rows)
    return dict(method="ea-england-fft-2026-11-22-v1", reference=EA_TREATMENT, periods=rows,
                governing_periods=[row["period"] for row in rows if row["fft_l_day"] == fft],
                fft_l_day=fft, fft_l_s=fft / 86400, fft_m3_s=fft / 86400000)


def uisce_peak_foul_flow(population, domestic_l_head_day, commercial_l_day, infiltration_l_day,
                        trade_l_day, domestic_factor, commercial_factor, trade_factor):
    """Apply Uisce Éireann design foul flow Eq. 1 to reviewed inputs for a new network."""
    domestic = (_nonnegative(population, "population", 1e9)
                * _nonnegative(domestic_l_head_day, "domestic allowance", 1e6))
    commercial = _nonnegative(commercial_l_day, "commercial domestic component", 1e15)
    infiltration = _nonnegative(infiltration_l_day, "infiltration allowance", 1e15)
    trade = _nonnegative(trade_l_day, "trade allowance", 1e15)

    def peak(value, factor, label):
        if _nonnegative(factor, label + " peaking factor", 1000) < 1:
            raise ValueError(f"Use a {label} peaking factor of at least one.")
        return value * factor

    peak_domestic = peak(domestic, domestic_factor, "domestic")
    peak_commercial = peak(commercial, commercial_factor, "commercial")
    peak_trade = peak(trade, trade_factor, "trade")
    total = fsum((peak_domestic, peak_commercial, infiltration, peak_trade))
    return dict(method="uisce-eireann-cds-5030-03-rev3-2025-eq1-v1", reference=UISCE_WASTEWATER,
                base_domestic_l_day=domestic, peak_domestic_l_day=peak_domestic,
                peak_commercial_l_day=peak_commercial, infiltration_l_day=infiltration,
                peak_trade_l_day=peak_trade, peak_l_day=total, peak_l_s=total / 86400, peak_m3_s=total / 86400000)


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
