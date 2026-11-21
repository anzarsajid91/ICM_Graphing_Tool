from math import pi, sqrt

import pytest

from icm_workbench.analysis.design_flows import england_continuation_flow
from icm_workbench.analysis.pumping import pump_duty, system_curve


def catchment(identifier, classification, p, g, i, e, **extra):
    return dict(id=identifier, classification=classification, population=p, domestic_l_head_day=g,
                infiltration_l_day=i, trade_l_day=e, **extra)


def test_england_combined_and_explicit_zero():
    result = england_continuation_flow([catchment("A", "partially-separate", 100, 150, 3000, 2000)])
    assert result["dwf_l_day"] == 20000
    assert result["retained_l_day"] == 160000
    assert result["retained_l_s"] == pytest.approx(160000 / 86400)
    assert result["retained_m3_s"] == pytest.approx(160000 / 86400000)
    assert england_continuation_flow([catchment("A", "combined", 0, 0, 0, 0)])["retained_l_day"] == 0


def test_england_separate_and_mixed_allowances():
    a = catchment("A", "combined", 100, 150, 3000, 2000)
    b = catchment("B", "qualifying-separate", 50, 120, 1000, 500,
                  eligibility_confirmed=True, evidence="Reviewed synthetic storm-response records")
    assert england_continuation_flow([b])["retained_l_day"] == 20500
    result = england_continuation_flow([a, b, {"id":"C", "classification":"surface-water", "evidence":"No foul input"}])
    assert result["retained_l_day"] == 180500
    assert result["dwf_l_day"] == 27500
    assert result["totals"]["domestic_l_day"] == 21000
    assert result["totals"]["separate_population"] == 50
    assert result["totals"]["combined_population"] == 100
    assert result["rows"][-1]["included"] is False


@pytest.mark.parametrize("value", [None, "", -1, float("nan"), float("inf"), True])
def test_england_requires_reviewed_numeric_inputs(value):
    with pytest.raises(ValueError, match="infiltration"):
        england_continuation_flow([catchment("A", "combined", 100, 150, value, 0)])


def test_england_guards_eligibility_and_duplicate_rows():
    a = catchment("A", "qualifying-separate", 50, 120, 1000, 500, evidence="Only a note")
    with pytest.raises(ValueError, match="confirmation"):
        england_continuation_flow([a])
    a["eligibility_confirmed"] = True
    with pytest.raises(ValueError, match="unique"):
        england_continuation_flow([a, {"id":"a", "classification":"excluded", "evidence":"Duplicate"}])
    with pytest.raises(ValueError, match="basis"):
        england_continuation_flow([{"id":"S", "classification":"surface-water"}])


def pipe(**updates):
    return dict(dict(diameter_m=.3, length_m=1000, darcy_factor=.02, minor_k=2, entrance_k=.5, exit_k=1), **updates)


def test_fixed_darcy_components_negative_static_and_zero_flow():
    expected_v = .05/(pi*.3**2/4)
    dynamic = expected_v**2/(2*9.80665)
    result = system_curve([[pipe()]], -10, .05, .1)
    assert result["loss_m"] == pytest.approx((.02*1000/.3 + 3.5)*dynamic)
    assert result["total_head_m"] == pytest.approx(-10+result["loss_m"])
    row = result["rows"][0]
    assert row["friction_m"] == pytest.approx(.02*1000/.3*dynamic)
    assert row["fittings_m"] == pytest.approx(2*dynamic)
    assert row["entrance_m"] == pytest.approx(.5*dynamic)
    assert row["exit_m"] == pytest.approx(dynamic)
    assert system_curve([[pipe()]], -10, 0, .1)["total_head_m"] == -10


def test_series_and_unequal_parallel_branches():
    a = pipe(minor_k=0, entrance_k=0, exit_k=0)
    b = dict(a, length_m=4000)
    result = system_curve([[a,b],[a]], 0, .09, .1)
    one = system_curve([[a]], 0, .09, .1)
    assert [row["flow_m3_s"] for row in result["rows"]] == pytest.approx([.06,.03,.09])
    assert result["rows"][0]["loss_m"] == pytest.approx(result["rows"][1]["loss_m"])
    assert result["loss_m"] == pytest.approx(one["loss_m"]*(1+4/9))
    with pytest.raises(ValueError, match="Darcy"):
        system_curve([[pipe(darcy_factor=0)]],0,.05,.1)


def unit_resistance():
    # A = 1 m². Setting fL/D = 2g makes R exactly 1 in the
    # closed-form head equation with zero minor losses.
    diameter = sqrt(4/pi)
    return [[pipe(diameter_m=diameter, length_m=2*9.80665*diameter/.02, minor_k=0, entrance_k=0, exit_k=0)]]


def test_pump_multiple_and_tangent_intersections_on_one_segment():
    args = (unit_resistance(), 2, [[0,0],[4,12]], "single", 1, 1000, .5)
    result = pump_duty(*args)
    assert [row["flow_m3_s"] for row in result["duties"]] == pytest.approx([1,2])
    assert [row["local_slope"] for row in result["duties"]] == ["rising residual","falling residual"]
    assert result["duties"][1]["input_kw"] == pytest.approx(2*9.80665*6/.5)
    tangent = pump_duty(args[0], 2.25, *args[2:])
    assert len(tangent["duties"]) == 1
    assert tangent["duties"][0]["flow_m3_s"] == pytest.approx(1.5)
    assert tangent["duties"][0]["local_slope"] == "near tangency"


def test_pump_no_extrapolation_shared_vertex_and_identical_configurations():
    stages = unit_resistance()
    assert pump_duty(stages, 0, [[2,1],[3,1]], "single", 1, 1000, None)["duties"] == []
    duty = pump_duty(stages, 0, [[0,3],[1,1],[2,0]], "single", 1, 1000, None)["duties"]
    assert len(duty) == 1 and duty[0]["flow_m3_s"] == pytest.approx(1)
    assert duty[0]["input_kw"] is None
    series = pump_duty(stages, 0, [[0,2],[3,2]], "series", 2, 1000, None)
    assert series["duties"][0]["flow_m3_s"] == pytest.approx(2)
    assert series["pump_curve"][-1] == (3,4)
    parallel = pump_duty(stages, 0, [[0,4],[1.5,4]], "parallel", 2, 1000, None)
    assert parallel["duties"][0]["flow_m3_s"] == pytest.approx(2)
    assert parallel["measured_range_m3_s"] == [0,3]
    with pytest.raises(ValueError, match="strictly"):
        pump_duty(stages, 0, [[1,4],[1,3]], "single", 1, 1000, None)
