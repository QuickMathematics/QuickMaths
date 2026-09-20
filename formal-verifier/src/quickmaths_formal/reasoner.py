from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import sympy as sp

from .contract import canonical_hash
from .derivative_definition import matches_derivative_definition
from .calculus import match_abs_derivative, match_conjugate_limit, match_continuity_limit, match_continuous_ivt_existence, match_elementary_derivative, match_ivt_existence, match_piecewise_jump, match_polynomial_derivative, match_quotient_derivative, match_recursive_derivative, quotient_denominator_is_exact_nonzero, match_sqrt_derivative
from .limits import match_limit_algebra
from .series import match_geometric_series, match_p_series, match_series_comparison, match_series_ratio_test, match_series_ratio_limit_test, match_series_root_test
from .sequences import match_nat_at_top, match_sequence_affine_ratio, match_sequence_algebra, match_sequence_monotone_bounded, match_sequence_polynomial_degree_ratio, match_sequence_quadratic_ratio, match_sequence_rational_shift, match_sequence_squeeze
from .symbolic import expr_to_sympy, is_polynomial_identity, is_rational_identity, variables_for


@dataclass(frozen=True)
class CandidateCheck:
    status: str
    message: str


ESTABLISHED = "candidate_established"
KERNEL_REQUIRED = "kernel_required"
REJECTED = "candidate_rejected"


def _goal_prop(goal: dict[str, Any]) -> dict[str, Any] | None:
    return goal.get("proposition") if goal.get("kind") == "proposition" else None


def _claim_map(request: dict[str, Any]) -> dict[str, dict[str, Any]]:
    claims: dict[str, dict[str, Any]] = {}
    for row in request["assumptions"]:
        claims[row["id"]] = {"kind": "proposition", "proposition": row["claim"]}
    for row in request["steps"]:
        claims[row["id"]] = row["claim"]
    return claims


def _same(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return canonical_hash(left) == canonical_hash(right)


def _equation(goal: dict[str, Any]) -> dict[str, Any] | None:
    prop = _goal_prop(goal)
    return prop if prop and prop.get("kind") == "eq" else None


def _relation(goal: dict[str, Any]) -> dict[str, Any] | None:
    prop = _goal_prop(goal)
    return prop if prop and prop.get("kind") in {"eq", "ne", "lt", "le", "gt", "ge"} else None


def _sympy_equal(left: dict[str, Any], right: dict[str, Any], symbols: dict[str, sp.Symbol]) -> bool:
    try:
        return sp.simplify(expr_to_sympy(left, symbols) - expr_to_sympy(right, symbols)) == 0
    except Exception:
        return False


def _matches_transformed_equation(
    old: dict[str, Any],
    new: dict[str, Any],
    term: dict[str, Any],
    operation: str,
    symbols: dict[str, sp.Symbol],
) -> bool:
    if old.get("kind") != "eq" or new.get("kind") != "eq":
        return False
    op = {
        "add": lambda side: {"kind": "add", "left": side, "right": term},
        "sub": lambda side: {"kind": "sub", "left": side, "right": term},
        "mul": lambda side: {"kind": "mul", "left": side, "right": term},
        "div": lambda side: {"kind": "div", "left": side, "right": term},
    }[operation]
    return _sympy_equal(new["left"], op(old["left"]), symbols) and _sympy_equal(new["right"], op(old["right"]), symbols)


def _flip_relation(kind: str) -> str:
    return {"lt": "gt", "le": "ge", "gt": "lt", "ge": "le"}[kind]


def _matches_transformed_inequality(
    old: dict[str, Any],
    new: dict[str, Any],
    term: dict[str, Any],
    operation: str,
    symbols: dict[str, sp.Symbol],
    *,
    flip: bool = False,
) -> bool:
    if old.get("kind") not in {"lt", "le", "gt", "ge"} or new.get("kind") not in {"lt", "le", "gt", "ge"}:
        return False
    expected_kind = _flip_relation(old["kind"]) if flip else old["kind"]
    if new["kind"] != expected_kind:
        return False
    op = {
        "add": lambda side: {"kind": "add", "left": side, "right": term},
        "mul": lambda side: {"kind": "mul", "left": side, "right": term},
    }[operation]
    return _sympy_equal(new["left"], op(old["left"]), symbols) and _sympy_equal(new["right"], op(old["right"]), symbols)


def _sqrt_square_shape(prop: dict[str, Any], argument: dict[str, Any]) -> bool:
    def side_is_sqrt_square(side: dict[str, Any]) -> bool:
        return (
            side.get("kind") == "sqrt"
            and side.get("arg", {}).get("kind") == "pow"
            and side["arg"].get("exponent") == 2
            and _same(side["arg"]["base"], argument)
        )

    return prop.get("kind") == "eq" and (
        (side_is_sqrt_square(prop["left"]) and _same(prop["right"], argument))
        or (side_is_sqrt_square(prop["right"]) and _same(prop["left"], argument))
    )


def _constant_relation_truth(prop: dict[str, Any], symbols: dict[str, sp.Symbol]) -> bool | None:
    try:
        relation = {
            "eq": lambda a, b: sp.Eq(a, b),
            "ne": lambda a, b: sp.Ne(a, b),
            "lt": lambda a, b: sp.Lt(a, b),
            "le": lambda a, b: sp.Le(a, b),
            "gt": lambda a, b: sp.Gt(a, b),
            "ge": lambda a, b: sp.Ge(a, b),
        }[prop["kind"]](expr_to_sympy(prop["left"], symbols), expr_to_sympy(prop["right"], symbols))
        if relation.free_symbols:
            return None
        simplified = sp.simplify(relation)
        if simplified is sp.true or simplified == True:  # noqa: E712
            return True
        if simplified is sp.false or simplified == False:  # noqa: E712
            return False
    except Exception:
        return None
    return None


def check_step(step: dict[str, Any], request: dict[str, Any]) -> CandidateCheck:
    """Evaluate rule/claim agreement without assigning mathematical authority.

    Positive results are only candidate evidence. Lean still owns the `verified`
    status. Rejections are limited to exact structural/algebraic mismatches so an
    incomplete local reasoner does not turn an unknown proof into a false verdict.
    """

    claims = _claim_map(request)
    premises = [claims[item] for item in step["premises"]]
    symbols = variables_for(request, step["scope"])
    rule = step["rule"]
    claim = step["claim"]
    prop = _goal_prop(claim)

    if rule == "exact":
        if len(premises) != 1:
            return REJECTED_CHECK("Exact must cite exactly one premise.")
        return CandidateCheck(ESTABLISHED, "The claimed statement exactly matches the cited premise.") if _same(claim, premises[0]) else REJECTED_CHECK("The exact premise does not match this claimed statement.")

    if rule == "assumption":
        available = [
            {"kind": "proposition", "proposition": row["claim"]}
            for row in request["assumptions"]
            if row["scope"] == step["scope"] or row["scope"] == "root"
        ]
        available.extend(premises)
        return CandidateCheck(ESTABLISHED, "The claim is available in the current context.") if any(_same(claim, item) for item in available) else REJECTED_CHECK("No cited/in-scope assumption exactly matches this claim.")

    if rule == "ring_identity":
        if prop is None or prop.get("kind") != "eq":
            return REJECTED_CHECK("Ring identity applies only to an equality claim.")
        if is_polynomial_identity(prop, symbols):
            return CandidateCheck(ESTABLISHED, "Exact polynomial normalization confirms this candidate identity.")
        return REJECTED_CHECK("Polynomial normalization does not establish the claimed ring identity.")

    if rule in {"guarded_cancel", "field_identity"}:
        if prop is None or prop.get("kind") != "eq":
            return REJECTED_CHECK("Guarded cancellation must establish an equality.")
        if is_rational_identity(prop, symbols):
            return CandidateCheck(ESTABLISHED, "Rational normalization agrees with the claimed cancellation; domain evidence remains separately required.")
        return REJECTED_CHECK("Rational normalization does not agree with the claimed cancellation.")

    if rule == "sqrt_square_nonnegative":
        argument = step["parameters"].get("argument")
        if not isinstance(argument, dict) or prop is None or not _sqrt_square_shape(prop, argument):
            return REJECTED_CHECK("This step is not the declared sqrt(argument^2) = argument transformation.")
        return CandidateCheck(ESTABLISHED, "The step has the supported square-root shape; nonnegativity is checked as a separate obligation.")

    if rule == "conjugate_identity":
        if prop is None or prop.get("kind") != "eq":
            return REJECTED_CHECK("Conjugate identity must establish an equality.")
        try:
            left = expr_to_sympy(prop["left"], symbols)
            right = expr_to_sympy(prop["right"], symbols)
            if sp.simplify(sp.expand(left - right)) == 0:
                return CandidateCheck(ESTABLISHED, "Symbolic expansion agrees with the conjugate identity candidate.")
        except Exception:
            pass
        return CandidateCheck(KERNEL_REQUIRED, "Square-root identity needs kernel verification after its nonnegativity obligation is satisfied.")

    if rule == "continuity_limit":
        if match_continuity_limit(claim) is not None:
            return CandidateCheck(ESTABLISHED, "The claimed finite limit matches direct substitution through the structural continuity fragment; school-domain guards are checked separately and Lean remains authoritative.")
        return REJECTED_CHECK("The claim does not match a supported continuity-by-substitution finite limit.")

    if rule == "series_geometric":
        if match_geometric_series(claim) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "The exact geometric series matches the supported sum/summability criterion; Lean still owns the proof.")
        return REJECTED_CHECK("The claim is not a supported exact geometric-series sum or non-summability statement.")

    if rule == "series_p_series":
        if match_p_series(claim) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "The shifted exact p-series matches the p > 1 summability criterion for integer or rational real exponents; Lean still owns the proof.")
        return REJECTED_CHECK("The claim is not a supported shifted exact p-series summability classification.")

    if rule == "series_comparison":
        premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
        if match_series_comparison(claim, premise_rows) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "The cited comparison series and global/eventual nonnegative pointwise bound match the conservative comparison-test contract; Lean still owns the proof.")
        return REJECTED_CHECK("The cited series/evidence do not establish a supported comparison-test configuration.")

    if rule == "series_ratio_test":
        premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
        if match_series_ratio_test(claim, premise_rows) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "The cited global/eventual successive-term norm bound has an exact ratio r < 1; Lean still owns the ratio-test proof.")
        return REJECTED_CHECK("The cited evidence does not establish a supported ratio-test bound with exact 0 <= r < 1.")

    if rule == "series_ratio_limit_test":
        premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
        pattern = match_series_ratio_limit_test(claim, premise_rows)
        if pattern is not None:
            if pattern.result_kind == "summable":
                return CandidateCheck(KERNEL_REQUIRED, "The quotient limit has exact 0 <= L < 1 and is cited or reconstructed after exact polynomial/geometric normalization; the series terms are cited or exactly reconstructed as eventually nonzero, and Lean still owns the quotient-limit ratio-test convergence proof.")
            return CandidateCheck(KERNEL_REQUIRED, "The quotient limit has exact L > 1 and is cited or reconstructed after exact polynomial/geometric normalization, so Lean still owns the quotient-limit ratio-test non-summability proof; no separate nonzero premise is required for this direction.")
        return REJECTED_CHECK("The cited quotient-limit evidence does not establish the supported ratio-test convergence/divergence configuration.")

    if rule == "series_root_test":
        premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
        pattern = match_series_root_test(claim, premise_rows)
        if pattern is not None:
            if pattern.result_kind == "summable":
                return CandidateCheck(KERNEL_REQUIRED, "The n-th-root limit has exact 0 <= L < 1; Lean still owns the geometric-domination root-test proof.")
            return CandidateCheck(KERNEL_REQUIRED, "The n-th-root limit has exact L > 1; Lean still owns the proof that the terms fail to tend to zero.")
        return REJECTED_CHECK("The cited or reconstructed root-limit evidence does not establish a supported root-test classification; L = 1 is inconclusive.")

    if rule == "sequence_nat_at_top":
        if match_nat_at_top(claim) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "Natural-index atTop behavior matches the supported exact shift family; Lean still owns the proof.")
        return REJECTED_CHECK("The claimed sequence is not a supported natural-to-real atTop shift.")

    if rule == "sequence_algebra":
        sequence_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "sequence_limit"]
        if match_sequence_algebra(claim, sequence_rows) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "A compositional finite sequence convergence plan matches this claim; Lean still owns the proof.")
        return REJECTED_CHECK("No supported compositional finite sequence plan matches this claim and cited sublimits.")

    if rule == "sequence_squeeze":
        sequence_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "sequence_limit"]
        proposition_rows = [(pid, claims[pid]["proposition"]) for pid in step["premises"] if claims[pid].get("kind") == "proposition"]
        if match_sequence_squeeze(claim, sequence_rows, proposition_rows) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "Two convergent bounds squeeze this sequence to the same finite target; Lean still owns the eventual-order proof.")
        return REJECTED_CHECK("The limit bounds do not form a valid squeeze proof and the missing inequalities are outside the conservative automatic order families.")

    if rule == "sequence_monotone_bounded":
        proposition_rows = [(pid, claims[pid]["proposition"]) for pid in step["premises"] if claims[pid].get("kind") == "proposition"]
        if match_sequence_monotone_bounded(claim, proposition_rows) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "A monotone/antitone bounded real sequence has some finite limit; Lean reconstructs the ciSup/ciInf proof.")
        return REJECTED_CHECK("The supplied facts do not match this sequence and its shape is outside the conservative automatic monotone/bounded families.")

    if rule == "sequence_affine_ratio":
        if match_sequence_affine_ratio(claim) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "The exact affine-over-affine sequence has the ratio of leading coefficients as its finite limit; Lean reconstructs the mathlib asymptotic theorem.")
        return REJECTED_CHECK("The sequence is not in the supported exact affine-ratio asymptotic family.")

    if rule == "sequence_quadratic_ratio":
        if match_sequence_quadratic_ratio(claim) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "The exact quadratic-over-quadratic sequence has the ratio of quadratic coefficients as its finite limit; Lean reconstructs the vanishing 1/n and 1/n^2 tails.")
        return REJECTED_CHECK("The sequence is not in the supported exact quadratic-ratio asymptotic family.")

    if rule == "sequence_polynomial_degree_ratio":
        pattern = match_sequence_polynomial_degree_ratio(claim)
        if pattern is not None:
            if pattern.numerator_degree < pattern.denominator_degree:
                return CandidateCheck(KERNEL_REQUIRED, "The numerator has strictly lower exact degree, so the polynomial ratio tends to zero; Lean delegates the quotient asymptotic to mathlib Polynomial.")
            if pattern.numerator_degree == pattern.denominator_degree:
                return CandidateCheck(KERNEL_REQUIRED, "The exact polynomial degrees agree, so the finite limit is the exact ratio of leading coefficients; Lean delegates the quotient asymptotic to mathlib Polynomial.")
            return CandidateCheck(KERNEL_REQUIRED, "The numerator has strictly higher exact degree, so the sign of the leading-coefficient ratio determines the infinite limit; Lean delegates the quotient asymptotic to mathlib Polynomial.")
        return REJECTED_CHECK("The sequence is not in the supported exact polynomial-ratio asymptotic family.")

    if rule == "sequence_rational_shift":
        if match_sequence_rational_shift(claim) is not None:
            return CandidateCheck(KERNEL_REQUIRED, "The exact shifted rational sequence is reduced to a vanishing reciprocal tail; Lean owns the eventual algebra.")
        return REJECTED_CHECK("The sequence is not in the supported exact rational-shift asymptotic family.")

    if rule == "limit_algebra":
        claim_map = _claim_map(request)
        limit_rows = [(pid, claim_map[pid]) for pid in step["premises"] if claim_map[pid].get("kind") == "limit"]
        if match_limit_algebra(claim, limit_rows) is not None:
            return CandidateCheck(ESTABLISHED, "A compositional finite-limit plan matches the claim over one exact source filter; sublimit and target-domain guards are checked separately and Lean remains authoritative.")
        return REJECTED_CHECK("The claim does not match the supported compositional finite-limit algebra fragment.")

    if rule == "ivt_exists":
        if match_ivt_existence(claim) is not None:
            return CandidateCheck(ESTABLISHED, "The exact polynomial endpoint check establishes the curated IVT existence shape; Lean remains authoritative.")
        return REJECTED_CHECK("The claim does not match the supported polynomial IVT existence family.")

    if rule == "continuous_ivt_exists":
        if match_continuous_ivt_existence(claim) is not None:
            return CandidateCheck(ESTABLISHED, "The target has the supported IVT existence shape and a structural interval-continuity plan; endpoint bracketing is checked separately and Lean remains authoritative.")
        return REJECTED_CHECK("The claim does not match the continuity-powered IVT family.")

    if rule == "derivative_from_limit":
        if len(premises) == 1 and matches_derivative_definition(claim, premises[0]):
            return CandidateCheck(KERNEL_REQUIRED, "The exact difference-quotient limit matches; Lean must establish the cited limit and derivative bridge.")
        return REJECTED_CHECK("The cited limit is not the exact derivative-definition limit.")

    if rule == "polynomial_derivative":
        if match_polynomial_derivative(claim) is not None:
            return CandidateCheck(ESTABLISHED, "Exact symbolic differentiation matches the claimed polynomial derivative; Lean remains authoritative.")
        return REJECTED_CHECK("The claim does not match the supported polynomial derivative-at-a-point family.")

    if rule == "quotient_derivative":
        if match_quotient_derivative(claim) is not None:
            return CandidateCheck(ESTABLISHED, "Exact quotient-rule differentiation matches the candidate; the pointwise nonzero denominator obligation remains separate and Lean is authoritative.")
        return REJECTED_CHECK("The claim does not match the supported polynomial quotient derivative family.")

    if rule == "sqrt_derivative":
        if match_sqrt_derivative(claim) is not None:
            return CandidateCheck(ESTABLISHED, "Exact chain-rule differentiation matches the square-root candidate; strict positivity at the evaluation point remains a separate obligation and Lean is authoritative.")
        return REJECTED_CHECK("The claim does not match the supported square-root-of-polynomial derivative family.")

    if rule in {"exp_derivative", "log_derivative", "sin_derivative", "cos_derivative"}:
        pattern = match_elementary_derivative(claim)
        expected = rule.removesuffix("_derivative")
        if pattern is not None and pattern.function == expected:
            guard_note = " Strict school-real positivity is checked separately." if expected == "log" else ""
            return CandidateCheck(ESTABLISHED, f"Exact chain-rule differentiation matches the {expected} candidate.{guard_note} Lean remains authoritative.")
        return REJECTED_CHECK(f"The claim does not match the supported {expected}-of-polynomial derivative family.")

    if rule == "abs_derivative":
        if match_abs_derivative(claim) is not None:
            return CandidateCheck(ESTABLISHED, "The claimed derivative matches one absolute-value branch; the strict sign selecting that branch is checked separately and Lean remains authoritative.")
        return REJECTED_CHECK("The claim does not match the supported absolute-value-of-polynomial derivative family.")

    if rule == "recursive_derivative":
        if match_recursive_derivative(claim):
            return CandidateCheck(ESTABLISHED, "A structural recursive derivative plan matches the claimed value; all pointwise guards are checked separately and Lean reconstruction remains authoritative.")
        return REJECTED_CHECK("The claim does not match the supported recursive compositional derivative fragment.")

    if rule in {"inverse_one_sided_limit", "rational_hole_limit"}:
        return CandidateCheck(ESTABLISHED, "The claim matches the curated calculus rule shape; the generated formal artifact remains authoritative.")

    if rule == "eq_refl":
        equation = _equation(claim)
        if equation is not None and _same(equation["left"], equation["right"]):
            return CandidateCheck(ESTABLISHED, "Reflexivity exactly matches expression = itself.")
        return REJECTED_CHECK("Reflexivity can only establish an expression equal to itself.")

    if rule in {"eq_symm", "eq_trans", "square_both_sides"}:
        return CandidateCheck(ESTABLISHED, "The exact equality dependency/shape was checked during proof preflight.")

    if rule in {"linarith", "nlinarith", "positivity"}:
        return CandidateCheck(KERNEL_REQUIRED, f"{rule} is delegated to the pinned formal backend; local search does not certify it.")

    if rule == "norm_num":
        if prop is None or prop.get("kind") not in {"eq", "ne", "lt", "le", "gt", "ge"}:
            return REJECTED_CHECK("Numeric normalization currently supports a single numeric relation.")
        truth = _constant_relation_truth(prop, symbols)
        if truth is True:
            return CandidateCheck(ESTABLISHED, "Exact numeric evaluation confirms this candidate claim.")
        if truth is False:
            return REJECTED_CHECK("Exact numeric evaluation contradicts this claim.")
        return CandidateCheck(KERNEL_REQUIRED, "The local numeric checker cannot decide this claim; leave it to the kernel backend.")

    if rule in {"add_both_sides", "subtract_both_sides", "multiply_both_sides", "divide_both_sides"}:
        if len(premises) < 1:
            return REJECTED_CHECK(f"{rule} needs the previous equation as a cited premise.")
        old = _equation(premises[0])
        new = _equation(claim)
        term_key = "term"
        term = step["parameters"].get(term_key)
        operation = {
            "add_both_sides": "add",
            "subtract_both_sides": "sub",
            "multiply_both_sides": "mul",
            "divide_both_sides": "div",
        }[rule]
        if not isinstance(term, dict) or old is None or new is None:
            return REJECTED_CHECK(f"{rule} requires an equation premise, equation claim, and explicit {term_key}.")
        if _matches_transformed_equation(old, new, term, operation, symbols):
            return CandidateCheck(ESTABLISHED, f"The new equation applies the declared {operation} operation to both sides.")
        return REJECTED_CHECK(f"The new equation is not the declared {operation} transformation of the cited equation.")

    if rule in {"add_inequality", "scale_inequality_positive", "scale_inequality_negative"}:
        if len(premises) < 1:
            return REJECTED_CHECK(f"{rule} needs the previous inequality as a cited premise.")
        old = _relation(premises[0])
        new = _relation(claim)
        term_key = "term" if rule == "add_inequality" else "factor"
        term = step["parameters"].get(term_key)
        operation = "add" if rule == "add_inequality" else "mul"
        if not isinstance(term, dict) or old is None or new is None:
            return REJECTED_CHECK(f"{rule} requires an inequality premise, inequality claim, and explicit {term_key}.")
        flip = rule == "scale_inequality_negative"
        if _matches_transformed_inequality(old, new, term, operation, symbols, flip=flip):
            return CandidateCheck(ESTABLISHED, "The inequality direction and both transformed sides match the declared rule.")
        return REJECTED_CHECK("The claimed inequality does not match the declared side transformation/sign rule.")

    if rule == "sub_ne_zero_from_ne":
        if len(premises) != 1 or _goal_prop(premises[0]) is None or prop is None:
            return REJECTED_CHECK("sub_ne_zero_from_ne needs one inequality premise and a nonzero claim.")
        old = _goal_prop(premises[0])
        if old.get("kind") != "ne" or prop.get("kind") != "ne":
            return REJECTED_CHECK("sub_ne_zero_from_ne requires a ≠ b and proves a - b ≠ 0.")
        expected = {
            "kind": "ne",
            "left": {"kind": "sub", "left": old["left"], "right": old["right"]},
            "right": {"kind": "int", "value": 0},
        }
        return CandidateCheck(ESTABLISHED, "The nonzero difference follows from the cited unequal terms.") if _same(prop, expected) else REJECTED_CHECK("The claimed nonzero difference does not correspond to the cited inequality.")

    if rule in {
        "true_intro", "and_intro", "and_elim_left", "and_elim_right",
        "or_intro_left", "or_intro_right", "modus_ponens", "iff_intro",
        "iff_mp", "iff_mpr", "contradiction", "false_elim",
        "exists_intro", "forall_elim", "imp_intro", "not_intro", "or_elim", "forall_intro", "exists_elim", "nat_induction", "function_ext", "set_ext", "subset_intro", "subset_elim", "eq_subst", "congr_arg",
    }:
        return CandidateCheck(ESTABLISHED, "The logical rule shape and cited dependencies are checked exactly during preflight; Lean remains the final authority.")

    return CandidateCheck(KERNEL_REQUIRED, f"Local candidate semantics are not implemented for rule {rule!r}.")


def REJECTED_CHECK(message: str) -> CandidateCheck:
    return CandidateCheck(REJECTED, message)
