import sympy as sp

from quickmaths_formal.symbolic import linear_entails, obvious_polynomial_relation


def v(name):
    return {"kind": "var", "id": name}


def i(value):
    return {"kind": "int", "value": value}


def rel(kind, left, right):
    return {"kind": kind, "left": left, "right": right}


def add(left, right):
    return {"kind": "add", "left": left, "right": right}


def test_linear_entailment_rejects_unrelated_equality():
    symbols = {"x": sp.Symbol("x", real=True), "y": sp.Symbol("y", real=True)}
    assert not linear_entails(rel("eq", v("y"), i(1)), [rel("eq", v("x"), i(0))], symbols)


def test_linear_entailment_preserves_strict_affine_shift():
    symbols = {"x": sp.Symbol("x", real=True), "y": sp.Symbol("y", real=True)}
    premise = rel("lt", v("x"), v("y"))
    goal = rel("lt", add(v("x"), i(1)), add(v("y"), i(1)))
    assert linear_entails(goal, [premise], symbols)


def test_strict_goal_is_not_derived_from_only_nonstrict_premise():
    symbols = {"x": sp.Symbol("x", real=True), "y": sp.Symbol("y", real=True)}
    assert not linear_entails(rel("lt", v("x"), v("y")), [rel("le", v("x"), v("y"))], symbols)


def test_obvious_polynomial_nonnegativity_is_safe_nlinarith_gate():
    symbols = {"x": sp.Symbol("x", real=True)}
    square = {"kind": "pow", "base": v("x"), "exponent": 2}
    assert obvious_polynomial_relation(rel("ge", square, i(0)), symbols)
    assert not obvious_polynomial_relation(rel("ge", v("x"), i(0)), symbols)


def test_strict_goal_can_use_true_positive_constant_slack():
    symbols = {"x": sp.Symbol("x", real=True)}
    premise = rel("le", i(0), v("x"))
    goal = rel("lt", i(0), add(v("x"), i(2)))
    assert linear_entails(goal, [premise], symbols)


def test_positive_constant_slack_does_not_hide_negative_gap():
    symbols = {"x": sp.Symbol("x", real=True)}
    premise = rel("le", i(0), v("x"))
    goal = rel("lt", i(0), add(v("x"), i(-1)))
    assert not linear_entails(goal, [premise], symbols)
