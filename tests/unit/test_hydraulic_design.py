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


def test_calculated_darcy_friction_for_turbulent_series_and_negative_static_head():
    # Choose roughness to satisfy the published Colebrook equation at f = .02.
    diameter, velocity, reynolds = .6, 1.5, 900000
    roughness = diameter * 3.7 * (10**(-.5/sqrt(.02)) - 2.51/(reynolds*sqrt(.02)))
    q = velocity * pi * diameter**2 / 4
    raw = pipe(diameter_m=diameter, length_m=120, roughness_m=roughness, darcy_factor=None)
    result = system_curve([[raw], [dict(raw, length_m=240)]], -2, q, .6,
                          friction_method="calculated", viscosity_m2_s=1e-6)
    dynamic_head = 1.5**2/(2*9.80665)
    assert result["total_head_m"] == pytest.approx(-2 + 19*dynamic_head, abs=1e-10)
    assert result["rows"][0]["darcy_factor"] == pytest.approx(.02)
    assert result["rows"][0]["reynolds"] == pytest.approx(900000)
    assert result["rows"][0]["fittings_m"] == pytest.approx(2*dynamic_head)
    assert result["rows"][0]["entrance_m"] == pytest.approx(.5*dynamic_head)
    assert result["rows"][0]["exit_m"] == pytest.approx(dynamic_head)


def test_calculated_parallel_common_head_with_different_flow_regimes():
    g = 9.80665
    q_large = 1.5 * pi*.6**2/4
    q_small = .1 * pi*.01**2/4
    head = 7.5*1.5**2/(2*g)
    # Independently select a laminar tube's length at the reference common head.
    length_small = g*.01**2*head/(32*1e-6*.1)
    roughness = .6*3.7*(10**(-.5/sqrt(.02)) - 2.51/(900000*sqrt(.02)))
    pipes = [pipe(diameter_m=.6, length_m=120, roughness_m=roughness),
             pipe(diameter_m=.01, length_m=length_small, roughness_m=0, minor_k=0, entrance_k=0, exit_k=0)]
    result = system_curve([pipes], 0, q_large+q_small, .5,
                          friction_method="calculated", viscosity_m2_s=1e-6)
    assert [row["regime"] for row in result["rows"]] == ["turbulent", "laminar"]
    assert [row["flow_m3_s"] for row in result["rows"]] == pytest.approx([q_large,q_small], rel=1e-8)
    assert [row["loss_m"] for row in result["rows"]] == pytest.approx([head,head], rel=1e-8)


def test_calculated_transition_is_a_gap_even_between_curve_samples():
    pipes = [[pipe(diameter_m=.01, length_m=2, roughness_m=0)]]
    q = .3 * pi*.01**2/4  # Re 3,000, with the first positive display sample above Re 4,000.
    result = system_curve(pipes, -1, q, .01, friction_method="calculated", viscosity_m2_s=1e-6)
    assert result["total_head_m"] is None
    assert result["rows"] == []
    assert result["curve"][0] == (0, -1)
    assert any(0 < flow < .00025 and head is None for flow, head in result["curve"])
    assert result["curve"][-1][1] > 0
    with pytest.raises(ValueError, match="roughness"):
        system_curve([[dict(pipes[0][0], roughness_m=.001)]], 0, q, .01,
                     friction_method="calculated", viscosity_m2_s=1e-6)


def test_calculated_parallel_solves_positive_flows_near_zero():
    raw = pipe(diameter_m=.01, length_m=2, roughness_m=0, minor_k=0, entrance_k=0, exit_k=0)
    result = system_curve([[raw, dict(raw, length_m=4)]], 0, 1e-30, .01,
                          friction_method="calculated", viscosity_m2_s=1e-6)
    assert [row["flow_m3_s"] for row in result["rows"]] == pytest.approx([2e-30/3, 1e-30/3], rel=1e-8, abs=0)
    zero = system_curve([[raw, raw]], 0, 0, .01, friction_method="calculated", viscosity_m2_s=1e-6)
    assert [row["darcy_factor"] for row in zero["rows"]] == [None, None]
    assert zero["total_head_m"] == 0


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


def test_pump_curve_csv_preserves_order_and_converts_reviewed_columns():
    from icm_workbench.analysis.pumping import map_pump_curve_csv, preview_pump_curve_csv

    text = '\ufeff"Test head",Setup,"Rated flow"\r\n"10",A,"0"\r\n\r\n"8",A,"360"\r\n'
    assert preview_pump_curve_csv(text)["headers"] == ["Test head", "Setup", "Rated flow"]
    result = map_pump_curve_csv(text, 2, 0, "m³/h", "ft")
    assert result["points"][0] == pytest.approx([0, 3.048])
    assert result["points"][1] == pytest.approx([.1, 2.4384])
    assert result["head_column"] == "Test head"


def test_pump_curve_csv_rejects_ambiguous_units_or_invalid_rows():
    from icm_workbench.analysis.pumping import map_pump_curve_csv, preview_pump_curve_csv

    for text, message in [('q,h\n0,2\n0,3', "strictly"), ('q,h\n0,2\n1,', "numeric"),
                          ('q,h\n0,2\n1,=1+2', "numeric"), ('q,h\n0,2\n1,1e999', "finite")]:
        with pytest.raises(ValueError, match=message):
            map_pump_curve_csv(text, 0, 1, "L/s", "m")
    with pytest.raises(ValueError, match="unit"):
        map_pump_curve_csv('q,h\n0,2\n1,3', 0, 1, "gpm", "m")
    with pytest.raises(ValueError, match="distinct"):
        map_pump_curve_csv('q,h\n0,2\n1,3', 0, 0, "L/s", "m")
    with pytest.raises(ValueError, match="quoting"):
        preview_pump_curve_csv('q,h\n0,2\n1,"untied')
    with pytest.raises(ValueError, match="500"):
        preview_pump_curve_csv('q,h\n'+"1,2\n"*501)


def test_native_catchment_preview_retains_units_and_missing_population():
    from icm_workbench.analysis.design_flows import preview_catchment_csv

    raw = ('\ufeff**** hw_node\nnode_id,x,y\nA,0,1\n'
           '**** hw_subcatchment\nsubcatchment_id,population,trade_flow\n'
           'FieldDescription,Population,Trade flow\nUserUnits,,l/s\n'
           '0012,,0\n0013,#D,"0.1"\n'
           '**** hw_conduit\nfrom,to\nA,B\n')
    result = preview_catchment_csv(raw)
    assert result["native"] is True
    assert result["header"] == ["subcatchment_id","population","trade_flow"]
    assert result["units"] == ["","","l/s"]
    assert result["rows"] == [{"line":8,"cells":["0012","","0"]},{"line":9,"cells":["0013","#D","0.1"]}]


def test_catchment_preview_rejects_malformed_and_oversized_tables():
    from icm_workbench.analysis.design_flows import preview_catchment_csv

    for raw,message in [("ID,id\nA,B","unique"),('ID,Pop\nA,"untied',"quoting"),("ID,Pop\nA,2,3","column count"),
                        ("ID,Pop\n"+"A,1\n"*101,"100 rows"),("**\0**", "NUL")]:
        with pytest.raises(ValueError,match=message):
            preview_catchment_csv(raw)
