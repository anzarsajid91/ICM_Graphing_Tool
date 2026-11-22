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
NRW_OVERFLOWS = "https://cdnfd.cyfoethnaturiol.cymru/2tihrspr/gn066-how-to-classify-storm-overflow-performance.pdf"
IRELAND_OVERFLOWS = "https://www.epa.ie/publications/licensing--permitting/waste-water/UrbanWasteWater2.pdf"
SEPA_METHOD = "sepa-scotland-wat-g-058-v1-2025-08"
CLASSIFICATIONS = {"combined", "partially-separate", "qualifying-separate", "surface-water", "excluded"}


def _nonnegative(value, label, maximum):
    if type(value) not in (int, float) or not 0 <= value <= maximum or not isfinite(value):
        raise ValueError(f"Enter a finite non-negative {label} within the supported range.")
    return value


def _reviewed_catchments(catchments, separate_evidence):
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
        rows.append(dict(audit, population=population, domestic_l_head_day=allowance, domestic_l_day=domestic,
                         infiltration_l_day=infiltration, trade_l_day=trade, eligibility_confirmed=eligible))
    if not any(row["included"] for row in rows):
        raise ValueError("Include at least one contributing catchment.")
    return rows


def _composition(rows, extra_keys):
    included = [row for row in rows if row["included"]]
    keys = ("population", "domestic_l_day", "infiltration_l_day", "trade_l_day") + extra_keys
    totals = {key: fsum(row[key] for row in included) for key in keys}
    separate = [row for row in included if row["eligibility_confirmed"]]
    totals["separate_population"] = fsum(row["population"] for row in separate)
    totals["combined_population"] = fsum(row["population"] for row in included if not row["eligibility_confirmed"])
    dwf = fsum(totals[key] for key in ("domestic_l_day", "infiltration_l_day", "trade_l_day"))
    return totals, dwf


def _reviewed_continuation_flow(catchments, *, method, reference, separate_evidence, combined_basis=False):
    rows = _reviewed_catchments(catchments, separate_evidence)
    included = [row for row in rows if row["included"]]
    for row in included:
        row["supplement_l_day"] = (2 * row["domestic_l_day"] if row["eligibility_confirmed"] and not combined_basis
                                   else 1360 * row["population"])
        row["trade_supplement_l_day"] = 2 * row["trade_l_day"]
    totals, dwf = _composition(rows, ("supplement_l_day", "trade_supplement_l_day"))
    separate_count = sum(row["eligibility_confirmed"] for row in included)
    retained = fsum((dwf, totals["supplement_l_day"], totals["trade_supplement_l_day"]))
    return dict(method=method, reference=reference, rows=rows, totals=totals, dwf_l_day=dwf,
                retained_l_day=retained, retained_l_s=retained / 86400, retained_m3_s=retained / 86400000,
                regime="qualifying separate PFF" if separate_count == len(included) else
                "mixed Formula A" if separate_count else "combined / partially separate Formula A")


def england_continuation_flow(catchments):
    """Calculate England retained flow from explicitly reviewed daily allowances."""
    return _reviewed_continuation_flow(catchments, method=METHOD, reference=EA_FORMULA_A,
        separate_evidence="Qualifying separate foul areas require engineer confirmation and evidence of minimal storm response.")


def _review_note(value, label, maximum=2000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f"Record the reviewed {label}.")
    return value.strip()


def wales_continuation_flow(catchments, evidence):
    """Screen the design flow under NRW GN066 section 2.7."""
    basis = _review_note(evidence, "GN066 applicability")
    return dict(_reviewed_continuation_flow(catchments, method="nrw-wales-gn066-v2-2026-07",
        reference=NRW_OVERFLOWS,
        separate_evidence="Record the GN066 evidence for drainage design, current separation and minimal storm response."),
        applicability={"evidence":basis})


def ireland_combined_continuation_flow(catchments, evidence):
    """Screen the combined minimum setting from the EPA-published DOE guidance."""
    basis = _review_note(evidence, "Irish combined design and licence applicability")
    if isinstance(catchments, list) and any(isinstance(row, dict) and row.get("classification") == "qualifying-separate"
                                            for row in catchments):
        raise ValueError("The Irish combined method requires the reviewed combined basis. Use a documented project method for a separate allowance.")
    return dict(_reviewed_continuation_flow(catchments, method="ie-doe-epa-swo-section-6-2-combined-v1",
        reference=IRELAND_OVERFLOWS, separate_evidence="Choose the reviewed combined basis."),
        applicability={"evidence":basis})


def documented_continuation_flow(catchments, methodology):
    """Apply a documented additive design rule without evaluating user expressions."""
    if not isinstance(methodology, dict):
        raise ValueError("Choose a documented continuation method.")
    name = _review_note(methodology.get("name"), "method name", 128)
    reference = _review_note(methodology.get("reference"), "method reference", 512)
    evidence = _review_note(methodology.get("evidence"), "method applicability")
    weights = {
        "domestic_factor": _nonnegative(methodology.get("domestic_factor"), "domestic factor", 1000),
        "infiltration_factor": _nonnegative(methodology.get("infiltration_factor"), "infiltration factor", 1000),
        "trade_factor": _nonnegative(methodology.get("trade_factor"), "trade factor", 1000),
        "population_allowance_l_head_day": _nonnegative(methodology.get("population_allowance_l_head_day"), "population allowance", 1e6),
    }
    rows = _reviewed_catchments(catchments, "Record the documented evidence for a separate classification.")
    components = {
        "custom_domestic_l_day": ("domestic_l_day", "domestic_factor"),
        "custom_infiltration_l_day": ("infiltration_l_day", "infiltration_factor"),
        "custom_trade_l_day": ("trade_l_day", "trade_factor"),
        "custom_population_l_day": ("population", "population_allowance_l_head_day"),
    }
    for row in rows:
        if row["included"]:
            row.update({component: row[field] * weights[weight] for component, (field, weight) in components.items()})
    totals, dwf = _composition(rows, tuple(components))
    retained = fsum(totals[key] for key in components)
    return dict(method="documented-project-continuation-v1", reference=reference, rows=rows, totals=totals,
                regime=name, applicability=dict(name=name, evidence=evidence, **weights), dwf_l_day=dwf,
                retained_l_day=retained, retained_l_s=retained / 86400, retained_m3_s=retained / 86400000)


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


def review_continuation_flow(catchments, framework, basis=None, sensitivity_percent=None, permitted=None, pipe=None):
    """Replay a verified method for reviewed sensitivity and independent flow comparisons."""
    calculators = {
        "england": england_continuation_flow,
        "scotland": scotland_continuation_flow,
        "wales": wales_continuation_flow,
        "ireland": ireland_combined_continuation_flow,
        "documented": documented_continuation_flow,
    }
    if not isinstance(framework, str) or framework not in calculators:
        raise ValueError("Choose a supported continuation-flow framework.")

    def calculate(rows):
        calculator = calculators[framework]
        return calculator(rows) if framework == "england" else calculator(rows, basis)

    result = calculate(catchments)
    result["sensitivity"], result["comparisons"] = [], []
    if sensitivity_percent is not None:
        percent = _nonnegative(sensitivity_percent, "sensitivity percentage", 100)
        result["sensitivity_percent"] = percent
        original = [row for row in result["rows"] if row["included"]]
        canonical = {row["id"].casefold(): row for row in original}
        for key in ("population", "domestic_l_head_day", "infiltration_l_day", "trade_l_day"):
            outcomes = {}
            for direction, factor_percent in (("low", 100 - percent), ("high", 100 + percent)):
                changed = [dict(row, **{key: canonical[row["id"].strip().casefold()][key] * factor_percent / 100})
                           if row["id"].strip().casefold() in canonical else row for row in catchments]
                try:
                    outcomes[direction + "_l_day"] = calculate(changed)["retained_l_day"]
                    outcomes[direction + "_note"] = None
                except ValueError as error:
                    outcomes[direction + "_l_day"] = None
                    outcomes[direction + "_note"] = str(error)
            result["sensitivity"].append(dict(key=key, **outcomes))

    def compare(key, available, **details):
        difference = available - result["retained_l_s"] if available is not None else None
        status = ("unavailable" if difference is None else
                  "below screening flow" if difference < 0 else "at or above screening flow")
        result["comparisons"].append(dict(key=key, available_l_s=available, difference_l_s=difference, status=status, **details))

    if permitted is not None:
        if not isinstance(permitted, dict):
            raise ValueError("Provide a reviewed permit flow.")
        evidence = _review_note(permitted.get("evidence"), "permit flow evidence")
        available = _nonnegative(permitted.get("flow_l_s"), "permit pass-forward flow", 1e9)
        compare("permit", available, evidence=evidence)
    if pipe is not None:
        from icm_workbench.analysis.pipe_capacity import full_pipe_capacity

        if not isinstance(pipe, dict) or set(pipe) != {"diameter_m", "gradient", "roughness_m", "viscosity_m2_s"}:
            raise ValueError("Provide the reviewed circular pipe capacity inputs.")
        capacity = full_pipe_capacity(**pipe)
        discharge = capacity["discharge_m3_s"]
        compare("pipe", discharge * 1000 if discharge is not None else None, regime=capacity["regime"])
    return result


def modelled_continuation_during_spills(
    overflow_times, overflow_values, continuation_times, continuation_values,
    start_ms, end_ms, maximum_gap_seconds, spill_threshold_m3_s,
    overflow_direction, continuation_direction, required_m3_s,
):
    """Compare signed continuation over canonical physical spill intervals."""
    import numpy as np
    import pandas as pd
    from icm_workbench.analysis.series_transform import integrate_periods
    from icm_workbench.analysis.spills import detect_spill_intervals

    if (type(start_ms) is not int or type(end_ms) is not int or end_ms <= start_ms
            or not -9223372036854 <= start_ms < end_ms <= 9223372036854):
        raise ValueError("Choose an increasing project-clock period within the supported timestamp range.")
    gap = _nonnegative(maximum_gap_seconds, "sample gap in seconds", 31_536_000)
    if gap < .001:
        raise ValueError("The permitted sample gap must be at least one millisecond.")
    threshold = _nonnegative(spill_threshold_m3_s, "spill threshold in m³/s", 1e9)
    required = _nonnegative(required_m3_s, "continuation requirement in m³/s", 1e12)

    def channel(times, values, direction):
        if type(direction) is not int or direction not in (-1, 1):
            raise ValueError("Review the positive flow direction for both links.")
        times, values = np.asarray(times, dtype=float), np.asarray(values, dtype=float)
        if times.ndim != 1 or values.shape != times.shape or times.size > 250_000:
            raise ValueError("Provide up to 250,000 aligned samples per channel.")
        if (not np.isfinite(times).all() or (np.abs(times) > 9223372036854).any()
                or (times != np.floor(times)).any() or (np.diff(times) <= 0).any()):
            raise ValueError("Result timestamps must be strictly increasing project-clock milliseconds.")
        if (np.abs(values) > 1e9).any():
            raise ValueError("A flow sample exceeds the supported calculation range.")
        return times, values * direction

    overflow_times, overflow = channel(overflow_times, overflow_values, overflow_direction)
    continuation_times, continuation = channel(continuation_times, continuation_values, continuation_direction)
    start, end = pd.Timestamp(start_ms, unit="ms"), pd.Timestamp(end_ms, unit="ms")
    duration = (end_ms - start_ms) / 1000
    physical = detect_spill_intervals(
        pd.DataFrame({"timestamp": pd.to_datetime(overflow_times.astype(np.int64), unit="ms"), "flow": overflow}),
        "flow", threshold, start=start, end=end, max_gap_seconds=gap, comparison="gt",
    )
    overflow_support = float(physical.get("valid_seconds", 0.0))
    result = {"method": "modelled-continuation-linear-support-v1", "status": physical["status"],
              "start": start.isoformat(), "end": end.isoformat(), "review_seconds": duration,
              "overflow_valid_seconds": overflow_support, "overflow_unknown_seconds": max(0.0, duration - overflow_support),
              "physical_spill_seconds": 0.0 if overflow_support else None, "continuation_valid_seconds": 0.0,
              "continuation_unknown_seconds": 0.0, "deficit_m3": None, "above_requirement_m3": None, "rows": []}
    events = physical["events"]
    if not events:
        return result
    if len(events) > 25_000:
        raise ValueError("Choose a shorter review period to assess up to 25,000 physical spill intervals.")

    # Integrate all disjoint windows in one pass over only the selected channel.
    origin = start.value
    boundaries = [(event[edge].value - origin) / 1e9 for event in events for edge in ("start", "end")]
    edges, edge_indexes = np.unique(boundaries, return_inverse=True)
    windows = edge_indexes[::2]
    times = (continuation_times - start_ms) / 1000
    deficit, support = integrate_periods(times, required - continuation, edges,
                                         convention="instantaneous", maximum_gap=gap, positive_only=True)
    above, _ = integrate_periods(times, continuation - required, edges,
                                 convention="instantaneous", maximum_gap=gap, positive_only=True)
    for event, index in zip(events, windows):
        assessed = float(edges[index + 1] - edges[index])
        covered = float(support[index])
        result["rows"].append({"start": event["start"].isoformat(), "end": event["end"].isoformat(),
                               "spill_seconds": assessed, "valid_seconds": covered,
                               "unknown_seconds": max(0.0, assessed - covered),
                               "deficit_m3": float(deficit[index]) if covered else None,
                               "above_requirement_m3": float(above[index]) if covered else None})
    rows = result["rows"]
    spill_seconds = fsum(row["spill_seconds"] for row in rows)
    covered = fsum(row["valid_seconds"] for row in rows)
    unknown = fsum(row["unknown_seconds"] for row in rows)
    status = "unavailable" if not covered else "partial" if physical["status"] != "complete" or unknown > 1e-6 else "complete"
    result.update(status=status, physical_spill_seconds=spill_seconds, continuation_valid_seconds=covered,
                  continuation_unknown_seconds=unknown, deficit_m3=fsum(deficit[windows]) if covered else None,
                  above_requirement_m3=fsum(above[windows]) if covered else None)
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


def preview_catchment_csv(text, table="hw_subcatchment"):
    """Read a local catchment or land-use table with original units and blanks."""
    import csv
    from io import StringIO

    if table not in ("hw_subcatchment", "hw_land_use", "lateral-link-report"):
        raise ValueError("Select a supported ICM catchment source table.")
    label, maximum = {
        "hw_subcatchment": ("catchment", 100),
        "hw_land_use": ("land-use", 1000),
        "lateral-link-report": ("lateral link", 1000),
    }[table]
    if not isinstance(text, str) or not 1 <= len(text) <= 1_048_576 or "\x00" in text:
        raise ValueError(f"Choose a {label} CSV up to 1 MiB of decoded text without NUL bytes.")
    rows, header, units, descriptions = [], None, None, None
    native, in_table = False, True
    reader = csv.reader(StringIO(text.removeprefix("\ufeff"), newline=""), strict=True)
    try:
        for values in reader:
            line = reader.line_num
            if not values or all(not value.strip() for value in values):
                continue
            # Native table markers occupy the first column. Read just the
            # requested table from a native multi-table export.
            marker = values[0].strip().casefold()
            if marker.startswith("****") and not any(value.strip() for value in values[1:]):
                if table == "lateral-link-report":
                    raise ValueError("Use a flat lateral link report from the ICM Open Data Export Centre.")
                if header is not None:
                    if native:
                        break
                    raise ValueError("Unexpected native table marker inside a plain catchment CSV.")
                native = True
                in_table = marker.removeprefix("****").strip() == table
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
            if len(rows) >= maximum:
                raise ValueError(f"The reviewed {label} table supports up to {maximum} rows per calculation. Select the applicable records before export.")
            rows.append({"line":line,"cells":values})
    except csv.Error as error:
        raise ValueError(f"Malformed catchment CSV near line {reader.line_num}. Check quoting and delimiters.") from error
    if not header or not rows:
        raise ValueError(f"The CSV contains no {label} data rows.")
    return dict(schema="hydra-catchment-mapping-v1", table=table, native=native, header=header,
                units=units, descriptions=descriptions, rows=rows)


def resolve_icm_catchment_defaults(catchments, land_use, area_unit, density_unit):
    """Resolve documented ICM modelling defaults for explicit engineer review."""
    import re

    def records(source, table, required):
        if (not isinstance(source, dict) or source.get("table") != table
                or source.get("schema") != "hydra-catchment-mapping-v1"):
            raise ValueError("Provide reviewed ICM catchment and land-use tables.")
        headings = [key.casefold() for key in source["header"]]
        if not set(required).issubset(headings):
            raise ValueError(f"Include the native {table} fields {', '.join(required)}.")
        units = dict(zip(headings, source["units"] or []))
        return units, [(item["line"], dict(zip(headings, item["cells"]))) for item in source["rows"]]

    units, sub_rows = records(catchments, "hw_subcatchment", ("subcatchment_id", "land_use_id"))
    land_units, land_rows = records(land_use, "hw_land_use", ("land_use_id", "population_density"))

    def token(unit):
        return unit.strip().lower().replace(" ", "").replace("²", "2").replace("^", "").replace("hectares", "ha")

    area_scales = {"ha": 1.0, "m2": .0001, "km2": 100.0, "acre": .40468564224}
    density_scales = {"people/ha": 1.0, "people/m2": 10000.0, "people/km2": .01, "people/acre": 1 / .40468564224}

    def scale(value, declared, choices, name):
        key, claim = token(value), token(declared)
        if key not in choices or claim and claim != key:
            raise ValueError(f"Confirm the supported {name} unit and resolve any conflict with the export.")
        return choices[key]

    area_factor = scale(area_unit, units.get("contributing_area", ""), area_scales, "area")
    density_factor = scale(density_unit, land_units.get("population_density", ""), density_scales, "population density")
    for declared in (units.get("connectivity", ""), land_units.get("connectivity", "")):
        if token(declared) not in ("", "%", "percent"):
            raise ValueError("Review the native connectivity unit as a percentage.")

    lookup = {}
    for line, fields in land_rows:
        identifier = fields["land_use_id"].strip().casefold()
        if not identifier or len(identifier) > 64:
            raise ValueError("Provide a land-use ID within 64 characters on each source row.")
        if identifier in lookup:
            raise ValueError("Resolve duplicate land-use IDs before applying inherited values.")
        lookup[identifier] = line, fields

    numeric = re.compile(r"[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?", re.I)

    def value(raw, maximum, integer=False):
        if not numeric.fullmatch(raw.strip()):
            return None
        number = float(raw)
        if not 0 <= number <= maximum or integer and not number.is_integer():
            return None
        return number

    rows = []
    for line, fields in sub_rows:
        land_id = fields["land_use_id"].strip()
        land_line, defaults = lookup.get(land_id.casefold(), (None, {}))
        area = value(fields.get("contributing_area", ""), 1e12)
        density = value(defaults.get("population_density", ""), 1e9)
        inherited_population = area * area_factor * density * density_factor if area is not None and density is not None else None

        def resolve(key, maximum, candidate, integer=False):
            raw = fields.get(key)
            if raw is None:
                return dict(value=None, basis="field unavailable in export", source_line=line)
            if raw.strip():
                direct = value(raw, maximum, integer)
                return dict(value=direct, basis="subcatchment" if direct is not None else "unresolved source token", source_line=line)
            if land_line is None:
                return dict(value=None, basis="unresolved land use", source_line=None)
            if candidate is None or candidate > maximum:
                return dict(value=None, basis="unresolved default", source_line=land_line)
            return dict(value=candidate, basis="land use", source_line=land_line)

        population = resolve("population", 1e9, inherited_population)
        connectivity = resolve("connectivity", 100, value(defaults.get("connectivity", ""), 100, True), True)
        profile = resolve("wastewater_profile", 999, value(defaults.get("wastewater_profile", ""), 999, True), True)
        p, c = population["value"], connectivity["value"]
        raw_fields = ("system_type", "drains_to", "node_id", "link_suffix", "to_subcatchment_id", "ground_node",
                      "ground_id", "contributing_area", "population", "connectivity", "wastewater_profile",
                      "base_flow", "additional_foul_flow", "trade_flow", "trade_profile", "lateral_weights")
        rows.append(dict(line=line, id=fields["subcatchment_id"].strip(), land_use_id=land_id, land_line=land_line,
                         population=population, connectivity=connectivity, wastewater_profile=profile,
                         population_times_connectivity=p * c / 100 if p is not None and c is not None else None,
                         source_attributes={key: fields[key] for key in raw_fields if key in fields},
                         source_units={key: units.get(key, "") for key in raw_fields if key in fields},
                         land_attributes={key: defaults[key] for key in ("population_density", "connectivity", "wastewater_profile")
                                          if key in defaults}))
    return dict(method="icm-2026-land-use-review-v1", area_unit=area_unit, density_unit=density_unit, rows=rows)
