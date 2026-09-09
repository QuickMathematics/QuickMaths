from __future__ import annotations

import random

import pytest

from quickmaths.lesson_display import (
    LessonDisplayError,
    cartesian_segments,
    graph_expression,
    normalize_cartesian_diagram,
    normalize_math_blocks,
    resolve_cartesian_diagram,
    resolve_math_blocks,
)


def _graph(seed: int) -> dict:
    rng = random.Random(seed)
    left = rng.randint(-8, -2)
    right = rng.randint(2, 8)
    return {
        "kind": "cartesian",
        "x_range": [left, right],
        "y_range": [-20, 20],
        "alt": "Graph of y = {m}x + {b}",
        "curves": [{"expression": "{m}*x+{b}", "interval": [left, right], "endpoints": ["closed", "closed"], "exclude": []}],
        "points": [{"at": [0, "{b}"], "label": "intercept", "endpoint": "closed"}],
        "segments": [], "asymptotes": [], "labels": [],
    }


def test_graph_variants_are_bounded_and_resolvable():
    for seed in range(100):
        spec = resolve_cartesian_diagram(_graph(seed), {"m": seed % 5 - 2, "b": seed % 9 - 4})
        assert normalize_cartesian_diagram(spec)["kind"] == "cartesian"
        assert cartesian_segments(spec["curves"][0], spec["x_range"], spec["y_range"])


def test_graph_expression_rejects_code_and_unbounded_power():
    with pytest.raises(LessonDisplayError):
        graph_expression("__import__('os')")
    with pytest.raises(LessonDisplayError):
        graph_expression("x**9")


def test_parameter_linked_numeric_coordinate_expressions_resolve():
    spec = {
        "kind": "cartesian", "x_range": ["{a}", "{b}"], "y_range": [0, "{b}**2"], "alt": "Secant",
        "curves": [], "points": [], "segments": [{"from": ["{a}", "{a}**2"], "to": ["{b}", "{b}**2"]}],
        "asymptotes": [], "labels": [],
    }
    resolved = resolve_cartesian_diagram(spec, {"a": 1, "b": 3})
    assert resolved["segments"][0]["to"] == [3, 9]
    with pytest.raises(LessonDisplayError):
        resolve_cartesian_diagram({**spec, "segments": [{"from": ["x", 1], "to": [3, 9]}]}, {"a": 1, "b": 3})


def test_hidden_values_are_not_public_display_inputs():
    candidate = [{"type": "notation", "text": "answer = {derived}", "alt": "A", "linear_text": "B"}]
    with pytest.raises(LessonDisplayError, match="unknown variable"):
        resolve_math_blocks(candidate, {"x": 2})


def test_math_schema_preserves_multiline_derivation_steps():
    blocks = normalize_math_blocks([{"type": "derivation", "steps": ["line one\nline two"], "alt": "Derivation", "linear_text": "Two lines"}])
    assert blocks[0]["steps"] == ["line one\nline two"]
