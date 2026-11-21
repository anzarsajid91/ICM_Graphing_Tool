import pytest

from icm_workbench.analysis.design_flows import scotland_continuation_flow, scotland_treatment_design_flows


APPLICABILITY = {"dilution": 9, "population_equivalent": 250, "inland": True, "no_interaction": True, "imax_confirmed": True,
                 "evidence": "Synthetic reviewed low-significance inland discharge basis"}


def catchment(identifier, classification, population=100, domestic=150, infiltration=6000, trade=4000):
    return {"id": identifier, "classification": classification, "population": population,
            "domestic_l_head_day": domestic, "infiltration_l_day": infiltration, "trade_l_day": trade,
            "eligibility_confirmed": classification == "qualifying-separate", "evidence": "Synthetic reviewed drainage class"}


def test_sepa_combined_and_separate_pass_forward_cases():
    combined = scotland_continuation_flow([catchment("A", "combined")], APPLICABILITY)
    assert combined["dwf_l_day"] == 25_000
    assert combined["retained_l_day"] == 169_000
    assert combined["retained_l_s"] == pytest.approx(169_000 / 86_400)
    assert combined["retained_m3_s"] == pytest.approx(169_000 / 86_400_000)
    separate = scotland_continuation_flow([catchment("B", "qualifying-separate")], APPLICABILITY)
    assert separate["retained_l_day"] == 63_000
    assert separate["regime"] == "Fully separate flow to full treatment"


def test_sepa_mixed_uses_reviewed_allowances_and_limits_simpler_basis():
    rows = [catchment("A", "combined", 80, 150, 5000, 3000),
            catchment("B", "qualifying-separate", 20, 160, 1000, 1000)]
    mixed = scotland_continuation_flow(rows, APPLICABILITY)
    assert mixed["dwf_l_day"] == 25_200
    assert mixed["retained_l_day"] == 148_400
    simpler = scotland_continuation_flow(rows, {**APPLICABILITY, "simpler_combined": True,
        "separate_fraction_percent": 18, "allocation_basis": "Synthetic reviewed drainage area proportion"})
    assert simpler["retained_l_day"] == 169_200
    assert simpler["totals"]["separate_population"] == 20
    with pytest.raises(ValueError, match="below 20%"):
        scotland_continuation_flow(rows, {**APPLICABILITY, "simpler_combined": True,
            "separate_fraction_percent": 20, "allocation_basis": "Synthetic permit allocation"})


@pytest.mark.parametrize("change", [{"dilution": 8}, {"population_equivalent": 10000}, {"inland": False}, {"no_interaction": False}])
def test_sepa_requires_every_low_significance_condition(change):
    with pytest.raises(ValueError, match="inland discharge"):
        scotland_continuation_flow([catchment("A", "combined")], {**APPLICABILITY, **change})


def test_sepa_requires_reviewed_classification_and_independent_treatment_infiltration():
    with pytest.raises(ValueError, match="Split each partially separate"):
        scotland_continuation_flow([catchment("A", "partially-separate")], APPLICABILITY)
    with pytest.raises(ValueError, match="Review the separate foul classification"):
        scotland_continuation_flow([{**catchment("A", "qualifying-separate"), "eligibility_confirmed": False}], APPLICABILITY)
    with pytest.raises(ValueError, match="maximum infiltration"):
        scotland_continuation_flow([catchment("A", "combined")], {**APPLICABILITY, "imax_confirmed": False})
    result = scotland_treatment_design_flows(100, 150, 2000, 6000, 4000)
    assert result["dwf_l_day"] == 21_000
    assert result["fft_l_day"] == 63_000
    with pytest.raises(ValueError, match="at least the dry-weather"):
        scotland_treatment_design_flows(100, 150, 6000, 2000, 4000)
