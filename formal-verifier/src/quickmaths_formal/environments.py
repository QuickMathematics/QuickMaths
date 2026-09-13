"""Curated import environments for the existing proof language.

Environment versions describe source imports, not additional certificate authority.
Capabilities are derived from normalized mathematical content, never trusted from
lesson metadata or learner-supplied labels.
"""
from __future__ import annotations

from typing import Any
from .contract import canonical_hash

ALGEBRA = (
    "Mathlib.Basic.Real.Basic",
    "Mathlib.Tactic.FieldSimp", "Mathlib.Tactic.Ring",
    "Mathlib.Tactic.Linarith", "Mathlib.Tactic.NormNum",
    "Mathlib.Tactic.Positivity",
)
ANALYSIS_TACTICS = (
    "Mathlib.Tactic.FunProp", "Mathlib.Tactic.Convert",
    "Mathlib.Tactic.GCongr", "Mathlib.Tactic.Continuity",
    "Lean.Elab.Tactic.Omega", "Lean.Elab.Tactic.NormCast",
)
ELEMENTARY_FUNCTIONS = (
    "Mathlib.Analysis.SpecialFunctions.Exp",
    "Mathlib.Analysis.SpecialFunctions.Log.Basic",
    "Mathlib.Analysis.SpecialFunctions.Trigonometric.Basic",
)
CAPABILITY_IMPORTS = {
    "algebra": ALGEBRA,
    "radicals": ("Mathlib.Analysis.Real.Sqrt", "Mathlib.Tactic.NormNum.RealSqrt"),
    "limits": (
        *ANALYSIS_TACTICS, *ELEMENTARY_FUNCTIONS,
        "Mathlib.Topology.Algebra.Order.Field",
        "Mathlib.Topology.Order.IntermediateValue",
    ),
    "derivatives": (
        *ANALYSIS_TACTICS,
        "Mathlib.Analysis.Calculus.Deriv.Pow",
        "Mathlib.Analysis.Calculus.Deriv.Inv",
        "Mathlib.Analysis.Calculus.Deriv.Abs",
        "Mathlib.Analysis.SpecialFunctions.Sqrt",
        "Mathlib.Analysis.SpecialFunctions.ExpDeriv",
        "Mathlib.Analysis.SpecialFunctions.Log.Deriv",
        "Mathlib.Analysis.SpecialFunctions.Trigonometric.Deriv",
    ),
    "sequences-series": (
        *ANALYSIS_TACTICS, *ELEMENTARY_FUNCTIONS,
        "Mathlib.Analysis.SpecificLimits.Normed", "Mathlib.Analysis.PSeries",
        "Mathlib.Analysis.Polynomial.Basic",
        "Mathlib.Analysis.SpecialFunctions.Pow.Real", "Mathlib.Tactic.FinCases",
        "Mathlib.Tactic.ComputeDegree",
    ),
}


def request_capabilities(request: dict[str, Any]) -> tuple[str, ...]:
    kinds: set[str] = set()
    rules: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            kinds.add(value.get("kind", ""))
            rules.add(value.get("rule", ""))
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(request)
    capabilities = {"algebra"}
    if "sqrt" in kinds or any("sqrt" in r or "conjugate" in r for r in rules):
        capabilities.add("radicals")
    if "limit" in kinds or any(r.startswith(("continuity_", "continuous_", "ivt_")) for r in rules):
        capabilities.add("limits")
    if "derivative" in kinds:
        capabilities.add("derivatives")
    if kinds & {"sequence_limit", "series_sum"} or any(r.startswith(("sequence_", "series_")) for r in rules):
        capabilities.add("sequences-series")
    return tuple(sorted(capabilities))


def environment_for(capabilities: tuple[str, ...] | list[str]) -> dict[str, Any]:
    selected_set = set(capabilities) | {"algebra"}
    if selected_set & {"limits", "derivatives", "sequences-series"}:
        selected_set.add("radicals")
    selected = sorted(selected_set)
    unknown = set(selected) - CAPABILITY_IMPORTS.keys()
    if unknown:
        raise ValueError(f"Unknown formal capabilities: {sorted(unknown)}")
    imports = sorted({module for cap in selected for module in CAPABILITY_IMPORTS[cap]})
    descriptor = {"schema_version": 1, "capabilities": selected,
                  "imports": imports, "import_mode": "module-public"}
    digest = canonical_hash(descriptor)
    return {**descriptor, "id": "qm-formal-v1-" + digest[:16], "source_digest": digest}


def request_environment(request: dict[str, Any]) -> dict[str, Any]:
    return environment_for(request_capabilities(request))
