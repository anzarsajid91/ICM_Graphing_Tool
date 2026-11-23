# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
import pytest

from icm_workbench.analysis.structures import screen_rating_curve, screen_structure


def structure(kind, up, down, **options):
    defaults = dict(sill_m=100, datum="ODN", coefficient=.6, applicability_confirmed=True)
    defaults.update(options)
    return screen_structure(kind, up, down, **defaults)


def test_thin_plate_weir_reference_calculations():
    free = structure("sharp-crested-weir", 100.5, 99.9, width_m=1.25)
    drowned = structure("sharp-crested-weir", 100.5, 100.2, width_m=1.25)
    assert free["regime"] == "free-weir"
    assert drowned["regime"] == "submerged-weir"
    assert free["flow_m3_s"] == pytest.approx(.7828892801667422, abs=1e-12)
    assert drowned["flow_m3_s"] == pytest.approx(.6997336499310476, abs=1e-12)
    assert drowned["tailwater_ratio"] == pytest.approx(.4)
    assert structure("sharp-crested-weir", 100.05, 99.98, width_m=1)["status"] == "withheld"
    assert structure("sharp-crested-weir", 100.5, 100.5, width_m=1)["flow_m3_s"] == 0


V_NOTCH = dict(sill_m=0, coefficient=.576, notch_angle_deg=60, approach_width_m=1.524,
               vertex_height_m=.6096, head_correction_m=.0012192)


def test_fully_contracted_v_notch_reference():
    # USBR 7-3 in customary units, then ft³ to m³. tan(30°) = 1 / √3.
    # 4.28 × .576 × (0.75 + 0.004)^2.5 / √3 = 0.7026418120485214 ft³/s.
    rated = structure("v-notch-weir", .2286, -.09144, **V_NOTCH)
    assert rated["method"] == "usbr-kindsvater-shen-fully-contracted-v1"
    assert rated["regime"] == "free-v-notch"
    assert rated["effective_head_m"] == pytest.approx(.2298192)
    assert rated["flow_m3_s"] == pytest.approx(.019896600400902877, abs=1e-13)
    reverse = structure("v-notch-weir", -.09144, .2286, allow_reverse=True, **V_NOTCH)
    assert reverse["flow_m3_s"] == pytest.approx(-.019896600400902877, abs=1e-13)
    assert structure("v-notch-weir", -.09144, .2286, **V_NOTCH)["regime"] == "reverse-not-confirmed"
    assert structure("v-notch-weir", -.05, -.09, **V_NOTCH)["flow_m3_s"] == 0


@pytest.mark.parametrize("up,down,changes,regime", [
    (.06096, -.1, {}, "v-notch-head-range"),
    (.381, -.1, {}, "v-notch-head-range"),
    (.25, -.05, {}, "v-notch-tailwater"),
    (.25, .10, {}, "v-notch-tailwater"),
    (.25, -.10, {"approach_width_m": 1.0}, "v-notch-contraction"),
    (.15, -.10, {"approach_width_m": .9144}, "v-notch-contraction"),
    (.15, -.10, {"vertex_height_m": .4}, "v-notch-contraction"),
])
def test_v_notch_withholds_unsupported_regimes(up, down, changes, regime):
    setup = V_NOTCH | changes
    rated = structure("v-notch-weir", up, down, **setup)
    assert rated["regime"] == regime
    assert rated["flow_m3_s"] is None


@pytest.mark.parametrize("setting,value,message", [
    ("notch_angle_deg", 20, "Notch angle"),
    ("coefficient", .63, "effective discharge coefficient"),
    ("head_correction_m", .004, "head correction"),
    ("vertex_height_m", None, "notch vertex"),
])
def test_v_notch_rejects_unreviewed_or_invalid_parameters(setting, value, message):
    with pytest.raises(ValueError, match=message):
        structure("v-notch-weir", .2286, -.09144, **(V_NOTCH | {setting: value}))


def test_orifice_full_free_and_reverse_submerged_reference_cases():
    free = structure("orifice", 101, 99.8, coefficient=.62, opening_m=.5, orifice_shape="circular")
    assert free["effective_head_m"] == pytest.approx(.75)
    assert free["flow_m3_s"] == pytest.approx(.46690394869073065, abs=1e-12)
    setup = dict(coefficient=None, width_m=.5, opening_m=.25, orifice_shape="rectangular", submerged_coefficient=.63)
    reverse = structure("orifice",100.4,100.8,allow_reverse=True,**setup)
    assert reverse["regime"] == "submerged-opening"
    assert reverse["flow_m3_s"] == pytest.approx(-.22057479981289793, abs=1e-12)
    assert structure("orifice",100.4,100.8,**setup)["regime"] == "reverse-not-confirmed"
    assert structure("orifice",100.8,100.1,**setup)["regime"] == "partial-submergence"
    assert structure("orifice",100.15,100.1,**setup)["regime"] == "partly-wetted-opening"


def test_sluice_withholds_gate_transitions_and_applies_the_selected_coefficient():
    free = structure("sluice",100.9,100.2,width_m=.5,opening_m=.25)
    assert free["flow_m3_s"] == pytest.approx(.3151068568755684, abs=1e-12)
    assert structure("sluice",101,100.72,width_m=.5,opening_m=.25)["regime"] == "gate-transition"
    assert structure("sluice",100.3,100.2,width_m=.5,opening_m=.25)["regime"] == "low-gate-head"
    assert structure("sluice",101,100.9,width_m=.5,opening_m=.25)["regime"] == "submerged-coefficient-required"
    full = structure("sluice",101,100.9,width_m=.5,opening_m=.25,submerged_coefficient=.65)
    assert full["regime"] == "submerged-opening"
    assert full["coefficient_used"] == .65
    assert full["effective_head_m"] == pytest.approx(.1)


@pytest.mark.parametrize("invalid,message",[
    ({"datum":""},"common vertical datum"), ({"width_m":0},"crest width"),
    ({"coefficient":True},"coefficient"), ({"applicability_confirmed":False},"applicability"),
])
def test_structure_rejects_invalid_assumptions(invalid,message):
    settings = dict(width_m=1)
    settings.update(invalid)
    with pytest.raises(ValueError,match=message):
        structure("sharp-crested-weir",101,100,**settings)


def test_passive_rating_interpolates_measured_range_only():
    points = [[0,0],[.5,.1],[1.5,.4]]
    assert screen_rating_curve(points,1)["flow_m3_s"] == pytest.approx(.25)
    assert screen_rating_curve(points,-.25,True)["flow_m3_s"] == pytest.approx(-.05)
    assert screen_rating_curve(points,-.25)["status"] == "reverse-not-confirmed"
    assert screen_rating_curve(points,2)["status"] == "outside-curve"
    assert screen_rating_curve(points,0)["flow_m3_s"] == 0
    with pytest.raises(ValueError,match="nondecreasing"):
        screen_rating_curve([[0,.1],[1,0]],1)
