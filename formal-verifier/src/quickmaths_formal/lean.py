from __future__ import annotations

from typing import Any
from fractions import Fraction

from .contract import canonical_hash
from .environments import request_environment
from .calculus import (
    abs_argument_exact_sign,
    continuity_guard_auto_tactic,
    continuity_pattern_status,
    continuous_ivt_guard_status,
    derivative_guard_auto_tactic,
    derivative_guard_exact_status,
    elementary_argument_is_exact_positive,
    ivt_bracket_auto_tactic,
    match_abs_derivative,
    match_conjugate_limit,
    match_continuity_limit,
    match_continuous_ivt_existence,
    match_elementary_derivative,
    match_interval_guard_evidence,
    match_ivt_existence,
    match_piecewise_jump,
    match_polynomial_derivative,
    match_quotient_derivative,
    match_recursive_derivative,
    quotient_denominator_is_exact_nonzero,
    match_sqrt_derivative,
    select_continuous_ivt_orientation,
    select_recursive_derivative_pattern,
    sqrt_radicand_is_exact_positive,
)
from .logic import proposition_of, same as same_logic, substitute_expr, substitute_prop
from .symbolic import exact_rational_value
from .limits import (
    LimitAlgebraPattern, LimitPlanNode, limit_algebra_status, limit_guard_auto_tactic,
    match_limit_algebra, match_limit_guard_evidence,
)
from .series import GeometricSeriesPattern, PSeriesPattern, SeriesComparisonPattern, SeriesRatioTestPattern, SeriesRatioLimitPattern, SeriesRootTestPattern, _eventual_nonzero_on_nat_threshold, _factorial_product_terms, _split_factorial_denominator, _pow_ratio, _shift_polynomial_coefficients, _signed_shift_polynomial_certificate, _syntactic_positive_on_nat, match_geometric_series, match_p_series, match_series_comparison, match_series_ratio_test, match_series_ratio_limit_test, match_series_root_test
from .sequences import (
    NatAtTopPattern, SequenceAffineRatioPattern, SequenceAlgebraPattern, SequencePlanNode, SequenceMonotoneBoundedPattern,
    SequenceElementaryDivergencePattern, SequencePolynomialDegreeRatioPattern, SequenceQuadraticRatioPattern, SequenceRationalShiftPattern, SequenceSqueezePattern,
    match_nat_at_top, match_sequence_affine_ratio, match_sequence_algebra, match_sequence_elementary_divergence, match_sequence_guard_evidence,
    match_sequence_monotone_bounded, match_sequence_polynomial_degree_ratio, match_sequence_quadratic_ratio, match_sequence_rational_shift, match_sequence_squeeze,
    sequence_algebra_status, sequence_guard_auto_tactic,
)

_TYPE_TO_LEAN = {"real": "ℝ", "int": "ℤ", "rat": "ℚ", "nat": "ℕ"}


def render_type(type_name: str) -> str:
    if type_name in _TYPE_TO_LEAN:
        return _TYPE_TO_LEAN[type_name]
    if type_name.startswith("set[") and type_name.endswith("]"):
        inner = type_name[4:-1]
        return f"Set {render_type(inner)}"
    if "->" in type_name:
        left, right = type_name.split("->", 1)
        return f"{render_type(left)} → {render_type(right)}"
    raise ValueError(f"unsupported Lean type {type_name!r}")


def render_expr(expr: dict[str, Any]) -> str:
    kind = expr["kind"]
    if kind == "int":
        value = expr["value"]
        return str(value) if value >= 0 else f"({value})"
    if kind == "rat":
        # Do not let standalone rational facts elaborate as truncated Nat division.
        return f"({expr['numerator']} / {expr['denominator']} : ℝ)"
    if kind == "var":
        return expr["id"]
    if kind == "neg":
        return f"(-{render_expr(expr['arg'])})"
    if kind == "cast_real":
        return f"((({render_expr(expr['arg'])} : ℕ) : ℝ))"
    if kind == "factorial":
        return f"(Nat.factorial {render_expr(expr['arg'])})"
    if kind == "apply":
        return f"({render_expr(expr['function'])} {render_expr(expr['arg'])})"
    if kind == "sqrt":
        return f"(Real.sqrt ({render_expr(expr['arg'])}))"
    if kind == "abs":
        return f"|{render_expr(expr['arg'])}|"
    if kind in {"exp", "log", "sin", "cos"}:
        return f"(Real.{kind} ({render_expr(expr['arg'])}))"
    if kind == "if":
        return f"(if {render_prop(expr['condition'])} then {render_expr(expr['then'])} else {render_expr(expr['else'])})"
    if kind == "pow":
        return f"({render_expr(expr['base'])} ^ {expr['exponent']})"
    if kind == "rpow":
        return f"({render_expr(expr['base'])} ^ ({render_expr(expr['exponent'])} : ℝ))"
    if kind == "pow_nat":
        return f"({render_expr(expr['base'])} ^ {render_expr(expr['exponent'])})"
    op = {"add": "+", "sub": "-", "mul": "*", "div": "/", "mod_nat": "%"}[kind]
    return f"({render_expr(expr['left'])} {op} {render_expr(expr['right'])})"


def render_prop(prop: dict[str, Any]) -> str:
    kind = prop["kind"]
    if kind == "true":
        return "True"
    if kind == "false":
        return "False"
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        op = {"eq": "=", "ne": "≠", "lt": "<", "le": "≤", "gt": ">", "ge": "≥", "mem": "∈", "subset": "⊆"}[kind]
        return f"{render_expr(prop['left'])} {op} {render_expr(prop['right'])}"
    if kind == "not":
        return f"¬ ({render_prop(prop['arg'])})"
    if kind in {"and", "or", "implies", "iff"}:
        op = {"and": "∧", "or": "∨", "implies": "→", "iff": "↔"}[kind]
        return f"({render_prop(prop['left'])}) {op} ({render_prop(prop['right'])})"
    if kind in {"forall", "exists"}:
        binder = prop["binder"]
        quantifier = "∀" if kind == "forall" else "∃"
        return f"{quantifier} ({binder['id']} : {render_type(binder['type'])}), {render_prop(prop['body'])}"
    raise ValueError(f"unsupported proposition kind {kind!r}")


def _domain_filter(goal: dict[str, Any]) -> str:
    point = render_expr(goal["point"])
    direction = goal["direction"]
    domain = goal.get("domain", [])

    # Fast path for the school-calculus filters used by the first corpus.
    if not domain:
        return {"both": f"𝓝[≠] {point}", "left": f"𝓝[<] {point}", "right": f"𝓝[>] {point}"}[direction]

    variable = goal["variable"]
    predicates = [render_prop(item) for item in domain]
    if direction == "both":
        predicates.append(f"{variable} ≠ {point}")
    elif direction == "left":
        predicates.append(f"{variable} < {point}")
    else:
        predicates.append(f"{point} < {variable}")
    predicate = " ∧ ".join(f"({item})" for item in predicates)
    return f"nhdsWithin {point} {{ {variable} | {predicate} }}"


def render_goal(goal: dict[str, Any]) -> str:
    if goal["kind"] == "proposition":
        return render_prop(goal["proposition"])
    if goal["kind"] == "series_sum":
        function = f"(fun ({goal['variable']} : ℕ) => ({render_expr(goal['expression'])} : ℝ))"
        if goal["result"]["kind"] == "finite":
            return f"HasSum {function} {render_expr(goal['result']['value'])}"
        if goal["result"]["kind"] == "summable":
            return f"Summable {function}"
        return f"¬ Summable {function}"
    if goal["kind"] == "sequence_limit":
        function = f"(fun ({goal['variable']} : ℕ) => ({render_expr(goal['expression'])} : ℝ))"
        result = goal["result"]
        if result["kind"] == "finite":
            return f"Filter.Tendsto {function} Filter.atTop (𝓝 {render_expr(result['value'])})"
        if result["kind"] == "exists_finite":
            return f"∃ l : ℝ, Filter.Tendsto {function} Filter.atTop (𝓝 l)"
        if result["kind"] == "positive_infinity":
            return f"Filter.Tendsto {function} Filter.atTop Filter.atTop"
        if result["kind"] == "negative_infinity":
            return f"Filter.Tendsto {function} Filter.atTop Filter.atBot"
        return f"¬ ∃ l : ℝ, Filter.Tendsto {function} Filter.atTop (𝓝 l)"

    if goal["kind"] == "derivative":
        function = f"(fun ({goal['variable']} : ℝ) => ({render_expr(goal['expression'])} : ℝ))"
        return f"HasDerivAt {function} ({render_expr(goal['result'])} : ℝ) ({render_expr(goal['point'])} : ℝ)"
    source = _domain_filter(goal)
    function = f"(fun ({goal['variable']} : ℝ) => ({render_expr(goal['expression'])} : ℝ))"
    result = goal["result"]
    if result["kind"] == "finite":
        target = f"𝓝 {render_expr(result['value'])}"
        return f"Filter.Tendsto {function} ({source}) ({target})"
    if result["kind"] == "positive_infinity":
        return f"Filter.Tendsto {function} ({source}) Filter.atTop"
    if result["kind"] == "negative_infinity":
        return f"Filter.Tendsto {function} ({source}) Filter.atBot"
    return f"¬ ∃ l : ℝ, Filter.Tendsto {function} ({source}) (𝓝 l)"


def _is_zero(expr: dict[str, Any]) -> bool:
    return expr == {"kind": "int", "value": 0}


def _expr_mentions(expr: dict[str, Any], variable: str) -> bool:
    kind = expr.get("kind")
    if kind == "var":
        return expr.get("id") == variable
    if kind in {"int", "rat"}:
        return False
    if kind in {"neg", "cast_real", "factorial", "sqrt", "abs", "exp", "log", "sin", "cos"}:
        return _expr_mentions(expr.get("arg", {}), variable)
    if kind == "pow":
        return _expr_mentions(expr.get("base", {}), variable)
    if kind == "pow_nat":
        return _expr_mentions(expr.get("base", {}), variable) or _expr_mentions(expr.get("exponent", {}), variable)
    if kind == "apply":
        return _expr_mentions(expr.get("function", {}), variable) or _expr_mentions(expr.get("arg", {}), variable)
    if kind == "if":
        return _expr_mentions(expr.get("then", {}), variable) or _expr_mentions(expr.get("else", {}), variable)
    if kind in {"add", "sub", "mul", "div", "mod_nat"}:
        return _expr_mentions(expr.get("left", {}), variable) or _expr_mentions(expr.get("right", {}), variable)
    return False


def _polynomial_has_deriv_term(expr: dict[str, Any], variable: str, point: str) -> str:
    """Render a HasDerivAt proof term for the deliberately small polynomial AST."""
    kind = expr.get("kind")
    if not _expr_mentions(expr, variable):
        return f"(hasDerivAt_const ({point}) ({render_expr(expr)} : ℝ))"
    if kind == "var" and expr.get("id") == variable:
        return f"(hasDerivAt_id' ({point}) : HasDerivAt (fun x : ℝ => x) 1 ({point}))"
    if kind == "neg":
        return f"({_polynomial_has_deriv_term(expr['arg'], variable, point)}).fun_neg"
    if kind in {"add", "sub", "mul"}:
        left = _polynomial_has_deriv_term(expr["left"], variable, point)
        right = _polynomial_has_deriv_term(expr["right"], variable, point)
        method = {"add": "fun_add", "sub": "fun_sub", "mul": "fun_mul"}[kind]
        return f"({left}).{method} ({right})"
    if kind == "pow":
        base = _polynomial_has_deriv_term(expr["base"], variable, point)
        return f"({base}).fun_pow {expr['exponent']}"
    raise ValueError("polynomial derivative renderer received a non-polynomial expression")


def _point_guard_claim(relation: str, expr: dict[str, Any]) -> dict[str, Any]:
    zero = {"kind": "int", "value": 0}
    if relation == "nonzero":
        return {"kind": "ne", "left": expr, "right": zero}
    if relation == "positive":
        return {"kind": "lt", "left": zero, "right": expr}
    if relation == "negative":
        return {"kind": "lt", "left": expr, "right": zero}
    raise ValueError(f"unsupported point guard {relation!r}")


def _recursive_sqrt_guard_keys(
    expr: dict[str, Any], variable: str, point_expr: dict[str, Any]
) -> set[str]:
    """Return positive-guard hashes that belong to recursive ``sqrt`` nodes.

    Positive guards are also used by school-domain ``log`` and absolute-value
    branches.  Only square-root derivatives need a ``sqrt(arg) != 0`` helper
    during final field normalization, so keep that evidence local to the node
    that actually introduced it.
    """
    kind = expr.get("kind")
    result: set[str] = set()
    if kind == "sqrt":
        arg = expr.get("arg", {})
        arg_at = substitute_expr(arg, variable, point_expr)
        result.add(canonical_hash(_point_guard_claim("positive", arg_at)))
        result |= _recursive_sqrt_guard_keys(arg, variable, point_expr)
        return result
    if kind in {"neg", "factorial", "abs", "exp", "log", "sin", "cos"}:
        return _recursive_sqrt_guard_keys(expr.get("arg", {}), variable, point_expr)
    if kind == "pow":
        return _recursive_sqrt_guard_keys(expr.get("base", {}), variable, point_expr)
    if kind in {"add", "sub", "mul", "div", "mod_nat"}:
        return (
            _recursive_sqrt_guard_keys(expr.get("left", {}), variable, point_expr)
            | _recursive_sqrt_guard_keys(expr.get("right", {}), variable, point_expr)
        )
    return result


def _recursive_has_deriv_term(
    expr: dict[str, Any], variable: str, point_expr: dict[str, Any], point: str, guard_names: dict[str, str]
) -> str:
    """Structurally reconstruct ``HasDerivAt`` for the recursive fragment."""
    kind = expr.get("kind")
    if kind in {"int", "rat"} or (kind == "var" and expr.get("id") != variable):
        return f"(hasDerivAt_const ({point}) ({render_expr(expr)} : ℝ))"
    if kind == "var" and expr.get("id") == variable:
        return f"(hasDerivAt_id' ({point}) : HasDerivAt (fun x : ℝ => x) 1 ({point}))"
    if kind == "neg":
        return f"({_recursive_has_deriv_term(expr['arg'], variable, point_expr, point, guard_names)}).fun_neg"
    if kind in {"add", "sub", "mul"}:
        left = _recursive_has_deriv_term(expr["left"], variable, point_expr, point, guard_names)
        right = _recursive_has_deriv_term(expr["right"], variable, point_expr, point, guard_names)
        method = {"add": "fun_add", "sub": "fun_sub", "mul": "fun_mul"}[kind]
        return f"({left}).{method} ({right})"
    if kind == "div":
        left = _recursive_has_deriv_term(expr["left"], variable, point_expr, point, guard_names)
        right = _recursive_has_deriv_term(expr["right"], variable, point_expr, point, guard_names)
        right_at = substitute_expr(expr["right"], variable, point_expr)
        key = canonical_hash(_point_guard_claim("nonzero", right_at))
        guard = guard_names.get(key)
        if guard is None:
            raise ValueError("recursive quotient derivative is missing its denominator guard")
        return f"({left}).fun_div ({right}) {guard}"
    if kind == "pow":
        base = _recursive_has_deriv_term(expr["base"], variable, point_expr, point, guard_names)
        return f"({base}).fun_pow {expr['exponent']}"
    if kind in {"sqrt", "abs", "exp", "log", "sin", "cos"}:
        inner = _recursive_has_deriv_term(expr["arg"], variable, point_expr, point, guard_names)
        inner = f"(show HasDerivAt (fun ({variable} : ℝ) => ({render_expr(expr['arg'])} : ℝ)) _ ({point} : ℝ) from {inner})"
        arg_at = substitute_expr(expr["arg"], variable, point_expr)
        if kind == "sqrt":
            key = canonical_hash(_point_guard_claim("positive", arg_at))
            guard = guard_names.get(key)
            if guard is None:
                raise ValueError("recursive sqrt derivative is missing its positive-radicand guard")
            return f"({inner}).sqrt (ne_of_gt {guard})"
        if kind == "log":
            key = canonical_hash(_point_guard_claim("positive", arg_at))
            guard = guard_names.get(key)
            if guard is None:
                raise ValueError("recursive log derivative is missing its positive-argument guard")
            return f"({inner}).log (ne_of_gt {guard})"
        if kind in {"exp", "sin", "cos"}:
            return f"({inner}).{kind}"
        positive_key = canonical_hash(_point_guard_claim("positive", arg_at))
        negative_key = canonical_hash(_point_guard_claim("negative", arg_at))
        if positive_key in guard_names:
            return f"(hasDerivAt_abs_pos {guard_names[positive_key]} : HasDerivAt (fun t : ℝ => |t|) 1 ({render_expr(arg_at)} : ℝ)).comp ({point}) ({inner})"
        if negative_key in guard_names:
            return f"(hasDerivAt_abs_neg {guard_names[negative_key]} : HasDerivAt (fun t : ℝ => |t|) (-1) ({render_expr(arg_at)} : ℝ)).comp ({point}) ({inner})"
        raise ValueError("recursive abs derivative is missing a strict-sign branch guard")
    raise ValueError(f"recursive derivative renderer does not support expression kind {kind!r}")


def _premise_name_map(request: dict[str, Any]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for row in request["assumptions"]:
        mapping[row["id"]] = row["id"]
    for row in request["steps"]:
        mapping[row["id"]] = row["id"]
    return mapping


def _proof_claim_map(request: dict[str, Any]) -> dict[str, dict[str, Any]]:
    mapping: dict[str, dict[str, Any]] = {}
    for row in request["assumptions"]:
        mapping[row["id"]] = {"kind": "proposition", "proposition": row["claim"]}
    for row in request["steps"]:
        mapping[row["id"]] = row["claim"]
    return mapping


def _relation_kind(goal: dict[str, Any]) -> str | None:
    if goal.get("kind") != "proposition":
        return None
    prop = goal.get("proposition", {})
    return prop.get("kind") if prop.get("kind") in {"eq", "ne", "lt", "le", "gt", "ge"} else None


def _relation_premise(step: dict[str, Any], request: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    claims = _proof_claim_map(request)
    target_kind = _relation_kind(step["claim"])
    candidates = [(pid, claims[pid]) for pid in step["premises"] if _relation_kind(claims[pid]) == target_kind]
    if not candidates:
        raise ValueError("relation transformation requires a cited premise with the same relation kind")
    return candidates[0]


def _limit_tendsto_type(goal: dict[str, Any], expression: dict[str, Any], target: dict[str, Any]) -> str:
    var = goal["variable"]
    source = _domain_filter(goal)
    return (
        f"Filter.Tendsto (fun ({var} : ℝ) => ({render_expr(expression)} : ℝ)) "
        f"({source}) (𝓝 ({render_expr(target)} : ℝ))"
    )


def _render_limit_algebra(step: dict[str, Any], request: dict[str, Any], pattern: LimitAlgebraPattern) -> list[str]:
    claims = _proof_claim_map(request)
    premise_props = {
        pid: proposition_of(claims[pid])
        for pid in step["premises"]
        if proposition_of(claims[pid]) is not None
    }
    lines: list[str] = []
    guard_names: dict[str, str] = {}

    for index, guard in enumerate(pattern.guards, start=1):
        tactic = limit_guard_auto_tactic(guard)
        rendered = render_expr(guard.expression)
        guard_type = f"({rendered} : ℝ) ≠ 0" if guard.relation == "nonzero" else f"0 < ({rendered} : ℝ)"
        name = f"{step['id']}_limit_guard_{index}"
        if tactic is not None:
            lines.append(f"have {name} : {guard_type} := by {tactic}")
        else:
            matched: tuple[str, Any] | None = None
            for pid, prop in premise_props.items():
                if prop is None:
                    continue
                evidence = match_limit_guard_evidence(guard, prop)
                if evidence is not None:
                    matched = (pid, evidence)
                    break
            if matched is None:
                raise ValueError("limit_algebra could not bind a required target-domain guard")
            pid, evidence = matched
            if evidence.conversion == "exact":
                lines.append(f"have {name} : {guard_type} := {pid}")
            elif evidence.conversion == "positive_to_nonzero":
                lines.append(f"have {name} : {guard_type} := ne_of_gt {pid}")
            elif evidence.conversion == "negative_to_nonzero":
                lines.append(f"have {name} : {guard_type} := ne_of_lt {pid}")
            else:
                raise ValueError(f"unsupported limit guard conversion {evidence.conversion!r}")
        guard_names[canonical_hash(guard.claim)] = name

    counter = 0

    def walk(node: LimitPlanNode) -> str:
        nonlocal counter
        if node.kind == "premise":
            if node.premise_id is None:
                raise ValueError("limit premise node is missing its premise id")
            return node.premise_id
        child_names = [walk(child) for child in node.children]
        counter += 1
        name = f"{step['id']}_limit_{counter}"
        theorem_type = _limit_tendsto_type(step["claim"], node.expression, node.target)
        lines.append(f"have {name} : {theorem_type} := by")
        if node.kind == "constant":
            lines.append("  exact tendsto_const_nhds")
        elif node.kind == "identity":
            lines.append("  exact tendsto_id.mono_left nhdsWithin_le_nhds")
        elif node.kind == "neg":
            lines.append(f"  convert! {child_names[0]}.neg using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind == "add":
            lines.append(f"  convert! {child_names[0]}.add {child_names[1]} using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind == "sub":
            lines.append(f"  convert! {child_names[0]}.sub {child_names[1]} using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind == "mul":
            lines.append(f"  convert! {child_names[0]}.mul {child_names[1]} using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind == "div":
            denominator_target = node.children[1].target
            guard_claim = {"kind": "ne", "left": denominator_target, "right": {"kind": "int", "value": 0}}
            guard_name = guard_names.get(canonical_hash(guard_claim))
            if guard_name is None:
                raise ValueError("limit division is missing its denominator-target proof")
            lines.append(f"  convert! {child_names[0]}.div {child_names[1]} {guard_name} using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind in {"pow", "abs", "exp", "sin", "cos", "log", "sqrt"}:
            inner_target = node.children[0].target
            if node.kind in {"log", "sqrt"}:
                positive_claim = {"kind": "lt", "left": {"kind": "int", "value": 0}, "right": inner_target}
                positive_name = guard_names.get(canonical_hash(positive_claim))
                if positive_name is None:
                    raise ValueError(f"limit {node.kind} is missing its positive-target proof")
                # Make the school-domain argument explicit in the certificate:
                # convergence to a positive target means the inner expression is
                # eventually positive on the same source filter.
                event_name = f"{name}_eventually_positive"
                inner_expr = render_expr(node.children[0].expression)
                source = _domain_filter(step["claim"])
                var = step["claim"]["variable"]
                lines.append(f"  have {event_name} : ∀ᶠ ({var} : ℝ) in ({source}), 0 < {inner_expr} := by")
                lines.append(f"    exact (tendsto_order.1 {child_names[0]}).1 0 {positive_name}")
            outer_arg = "y"
            if node.kind == "pow":
                outer = f"({outer_arg} ^ {node.expression['exponent']})"
            elif node.kind == "abs":
                outer = f"|{outer_arg}|"
            elif node.kind == "sqrt":
                outer = f"Real.sqrt {outer_arg}"
            else:
                outer = f"Real.{node.kind} {outer_arg}"
            target = render_expr(inner_target)
            lines.append(f"  have houter : ContinuousAt (fun ({outer_arg} : ℝ) => {outer}) {target} := by")
            if node.kind == "log":
                positive_claim = {"kind": "lt", "left": {"kind": "int", "value": 0}, "right": inner_target}
                positive_name = guard_names[canonical_hash(positive_claim)]
                lines.append(f"    have hne : ({target} : ℝ) ≠ 0 := ne_of_gt {positive_name}")
                lines.append("    fun_prop")
            else:
                lines.append("    fun_prop")
            lines.append(f"  convert! houter.tendsto.comp {child_names[0]} using 1 <;> simp [Function.comp_apply, Nat.cast_add, Nat.cast_one] <;> norm_num <;> ring")
        else:
            raise ValueError(f"unsupported limit plan node {node.kind!r}")
        return name

    root_name = walk(pattern.root)
    if canonical_hash(pattern.root.target) == canonical_hash(pattern.target):
        lines.append(f"exact {root_name}")
    else:
        lines.append(f"convert! {root_name} using 1 <;> simp <;> norm_num <;> ring")
    return lines


def _sequence_tendsto_type(goal: dict[str, Any], expression: dict[str, Any], target: dict[str, Any]) -> str:
    var = goal["variable"]
    return (
        f"Filter.Tendsto (fun ({var} : ℕ) => ({render_expr(expression)} : ℝ)) "
        f"Filter.atTop (𝓝 ({render_expr(target)} : ℝ))"
    )


def _render_sequence_guard_type(guard) -> str:
    rendered = render_expr(guard.expression)
    if guard.relation == "nonzero":
        return f"({rendered} : ℝ) ≠ 0"
    if guard.relation == "positive":
        return f"0 < ({rendered} : ℝ)"
    if guard.relation == "abs_lt_one":
        return f"|({rendered} : ℝ)| < 1"
    raise ValueError(f"unsupported sequence guard relation {guard.relation!r}")


def _render_sequence_algebra(step: dict[str, Any], request: dict[str, Any], pattern: SequenceAlgebraPattern) -> list[str]:
    claims = _proof_claim_map(request)
    premise_props = {
        pid: proposition_of(claims[pid])
        for pid in step["premises"]
        if proposition_of(claims[pid]) is not None
    }
    lines: list[str] = []
    guard_names: dict[str, str] = {}

    for index, guard in enumerate(pattern.guards, start=1):
        tactic = sequence_guard_auto_tactic(guard)
        guard_type = _render_sequence_guard_type(guard)
        name = f"{step['id']}_sequence_guard_{index}"
        if tactic is not None:
            lines.append(f"have {name} : {guard_type} := by {tactic}")
        else:
            matched = None
            for pid, prop in premise_props.items():
                if prop is None:
                    continue
                evidence = match_sequence_guard_evidence(guard, prop)
                if evidence is not None:
                    matched = (pid, evidence)
                    break
            if matched is None:
                raise ValueError("sequence_algebra could not bind a required target-domain/ratio guard")
            pid, evidence = matched
            if evidence.conversion == "exact":
                lines.append(f"have {name} : {guard_type} := {pid}")
            elif evidence.conversion == "positive_to_nonzero":
                lines.append(f"have {name} : {guard_type} := ne_of_gt {pid}")
            elif evidence.conversion == "negative_to_nonzero":
                lines.append(f"have {name} : {guard_type} := ne_of_lt {pid}")
            else:
                raise ValueError(f"unsupported sequence guard conversion {evidence.conversion!r}")
        guard_names[canonical_hash(guard.claim)] = name

    counter = 0

    def walk(node: SequencePlanNode) -> str:
        nonlocal counter
        if node.kind == "premise":
            if node.premise_id is None:
                raise ValueError("sequence premise node is missing its premise id")
            return node.premise_id
        child_names = [walk(child) for child in node.children]
        counter += 1
        name = f"{step['id']}_sequence_{counter}"
        theorem_type = _sequence_tendsto_type(step["claim"], node.expression, node.target)
        lines.append(f"have {name} : {theorem_type} := by")
        if node.kind == "constant":
            lines.append("  exact tendsto_const_nhds")
        elif node.kind == "reciprocal_shift":
            if node.shift is None or node.shift < 1:
                raise ValueError("shifted reciprocal sequence node needs shift >= 1")
            numerator = render_expr(node.expression["left"])
            shift = node.shift
            lines.append(
                f"  have hden : Filter.Tendsto (fun n : ℕ => (n : ℝ) + ({shift} : ℝ)) Filter.atTop Filter.atTop := "
                f"tendsto_atTop_add_const_right Filter.atTop ({shift} : ℝ) tendsto_natCast_atTop_atTop"
            )
            lines.append(
                f"  have hnum : Filter.Tendsto (fun _ : ℕ => ({numerator} : ℝ)) Filter.atTop (𝓝 ({numerator} : ℝ)) := tendsto_const_nhds"
            )
            lines.append("  have hraw := hnum.div_atTop hden")
            lines.append("  simpa [Nat.cast_add] using hraw")
        elif node.kind == "geometric":
            base = node.expression["base"]
            guard_claim = {"kind": "lt", "left": {"kind": "abs", "arg": base}, "right": {"kind": "int", "value": 1}}
            guard_name = guard_names.get(canonical_hash(guard_claim))
            if guard_name is None:
                raise ValueError("geometric sequence is missing its |r| < 1 proof")
            lines.append(f"  simpa using (tendsto_pow_atTop_nhds_zero_of_abs_lt_one {guard_name})")
        elif node.kind == "neg":
            lines.append(f"  convert! {child_names[0]}.neg using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind == "add":
            lines.append(f"  convert! {child_names[0]}.add {child_names[1]} using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind == "sub":
            lines.append(f"  convert! {child_names[0]}.sub {child_names[1]} using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind == "mul":
            lines.append(f"  convert! {child_names[0]}.mul {child_names[1]} using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind == "div":
            denominator_target = node.children[1].target
            guard_claim = {"kind": "ne", "left": denominator_target, "right": {"kind": "int", "value": 0}}
            guard_name = guard_names.get(canonical_hash(guard_claim))
            if guard_name is None:
                raise ValueError("sequence division is missing its denominator-target proof")
            lines.append(f"  convert! {child_names[0]}.div {child_names[1]} {guard_name} using 1 <;> simp <;> norm_num <;> ring")
        elif node.kind in {"pow", "abs", "exp", "sin", "cos", "log", "sqrt"}:
            inner_target = node.children[0].target
            if node.kind in {"log", "sqrt"}:
                positive_claim = {"kind": "lt", "left": {"kind": "int", "value": 0}, "right": inner_target}
                positive_name = guard_names.get(canonical_hash(positive_claim))
                if positive_name is None:
                    raise ValueError(f"sequence {node.kind} is missing its positive-target proof")
                event_name = f"{name}_eventually_positive"
                inner_expr = render_expr(node.children[0].expression)
                var = step["claim"]["variable"]
                lines.append(f"  have {event_name} : ∀ᶠ {var} in Filter.atTop, 0 < {inner_expr} := by")
                lines.append(f"    exact (tendsto_order.1 {child_names[0]}).1 0 {positive_name}")
            y = "y"
            if node.kind == "pow":
                outer = f"({y} ^ {node.expression['exponent']})"
            elif node.kind == "abs":
                outer = f"|{y}|"
            elif node.kind == "sqrt":
                outer = f"Real.sqrt {y}"
            else:
                outer = f"Real.{node.kind} {y}"
            target = render_expr(inner_target)
            lines.append(f"  have houter : ContinuousAt (fun ({y} : ℝ) => {outer}) {target} := by")
            if node.kind == "log":
                positive_name = guard_names[canonical_hash({"kind": "lt", "left": {"kind": "int", "value": 0}, "right": inner_target})]
                lines.append(f"    have hne : ({target} : ℝ) ≠ 0 := ne_of_gt {positive_name}")
                lines.append("    fun_prop")
            else:
                lines.append("    fun_prop")
            lines.append(f"  convert! houter.tendsto.comp {child_names[0]} using 1 <;> simp [Function.comp_apply, Nat.cast_add, Nat.cast_one] <;> norm_num <;> ring")
        else:
            raise ValueError(f"unsupported sequence plan node {node.kind!r}")
        return name

    root_name = walk(pattern.root)
    if canonical_hash(pattern.root.target) == canonical_hash(pattern.target):
        lines.append(f"exact {root_name}")
    else:
        lines.append(f"convert! {root_name} using 1 <;> simp <;> norm_num <;> ring")
    return lines


def _render_sequence_nat_at_top(pattern: NatAtTopPattern) -> list[str]:
    if pattern.shift == 0:
        return [
            "simpa using (tendsto_natCast_atTop_atTop : Filter.Tendsto (fun n : ℕ => (n : ℝ)) Filter.atTop Filter.atTop)"
        ]
    return [
        f"have h := tendsto_atTop_add_const_right Filter.atTop ({pattern.shift} : ℝ) tendsto_natCast_atTop_atTop",
        "simpa [Nat.cast_add] using h",
    ]


def _render_sequence_eventually_bound(
    name: str,
    premise_id: str | None,
    conversion: str,
    variable: str,
    left: dict[str, Any],
    right: dict[str, Any],
) -> list[str]:
    bound_type = f"∀ᶠ {variable} in Filter.atTop, ({render_expr(left)} : ℝ) ≤ ({render_expr(right)} : ℝ)"
    lines = [f"have {name} : {bound_type} := by"]
    if conversion == "forall":
        if premise_id is None:
            raise ValueError("forall sequence bound is missing its premise")
        lines.append(f"  exact Eventually.of_forall {premise_id}")
        return lines
    if conversion == "eventually":
        if premise_id is None:
            raise ValueError("eventual sequence bound is missing its premise")
        lines.extend([
            f"  rcases {premise_id} with ⟨N, hN⟩",
            "  filter_upwards [eventually_ge_atTop N] with k hk",
            "  exact hN k hk",
        ])
        return lines
    if conversion.startswith("auto_"):
        trig = "sin" if "_sin_" in conversion else "cos" if "_cos_" in conversion else None
        if trig is None:
            raise ValueError(f"unsupported automatic sequence bound {conversion!r}")
        lower = conversion.endswith("_lower")
        left_den = left.get("right", {})
        right_den = right.get("right", {})
        if canonical_hash(left_den) != canonical_hash(right_den):
            raise ValueError("automatic trigonometric squeeze bound lost its shared denominator")
        trig_expr = right.get("left", {}) if lower else left.get("left", {})
        arg = render_expr(trig_expr.get("arg", {}))
        denominator = render_expr(left_den)
        theorem = f"Real.neg_one_le_{trig}" if lower else f"Real.{trig}_le_one"
        lines.extend([
            f"  exact Eventually.of_forall (fun {variable} => by",
            f"    have hden : (0 : ℝ) < ({denominator} : ℝ) := by positivity",
            f"    exact (div_le_div_iff_of_pos_right hden).2 ({theorem} ({arg})))",
        ])
        return lines
    raise ValueError(f"unsupported sequence bound conversion {conversion!r}")


def _render_sequence_squeeze(pattern: SequenceSqueezePattern) -> list[str]:
    var = pattern.variable
    target = render_expr(pattern.target)
    lower = render_expr(pattern.lower_expression)
    middle = render_expr(pattern.expression)
    upper = render_expr(pattern.upper_expression)
    lines = [
        f"have hLowerLimit : Filter.Tendsto (fun ({var} : ℕ) => ({lower} : ℝ)) Filter.atTop (𝓝 ({target})) := by",
        f"  convert! {pattern.lower_limit_premise} using 1 <;> simp <;> norm_num <;> ring",
        f"have hUpperLimit : Filter.Tendsto (fun ({var} : ℕ) => ({upper} : ℝ)) Filter.atTop (𝓝 ({target})) := by",
        f"  convert! {pattern.upper_limit_premise} using 1 <;> simp <;> norm_num <;> ring",
    ]
    lines.extend(_render_sequence_eventually_bound(
        "hLowerBound", pattern.lower_bound.premise_id, pattern.lower_bound.conversion,
        var, pattern.lower_expression, pattern.expression,
    ))
    lines.extend(_render_sequence_eventually_bound(
        "hUpperBound", pattern.upper_bound.premise_id, pattern.upper_bound.conversion,
        var, pattern.expression, pattern.upper_expression,
    ))
    lines.append("exact tendsto_of_tendsto_of_tendsto_of_le_of_le' hLowerLimit hUpperLimit hLowerBound hUpperBound")
    return lines


def _render_sequence_monotone_bounded(pattern: SequenceMonotoneBoundedPattern) -> list[str]:
    var = pattern.variable
    expr = render_expr(pattern.expression)
    mono = pattern.monotonicity_premise
    bounded = pattern.boundedness_premise
    lines = [
        f"let f : ℕ → ℝ := fun ({var} : ℕ) => ({expr} : ℝ)",
    ]
    auto = pattern.auto_geometric
    if auto is not None:
        ratio = _render_real_fraction(auto.ratio)
        offset = _render_real_fraction(auto.offset)
        if pattern.mode == "monotone":
            lines.extend([
                "have hmono : Monotone f := by",
                "  intro m n hmn",
                f"  have hpow : {ratio} ^ n ≤ {ratio} ^ m := pow_le_pow_of_le_one (by norm_num) (by norm_num) hmn",
                "  dsimp [f]",
                "  nlinarith",
                "have hbdd : BddAbove (Set.range f) := by",
                f"  refine ⟨{offset}, ?_⟩",
                "  rintro y ⟨n, rfl⟩",
                "  dsimp [f]",
                f"  have hpow : 0 ≤ {ratio} ^ n := pow_nonneg (by norm_num) n",
                "  nlinarith",
                "refine ⟨⨆ n, f n, ?_⟩",
                "simpa [f] using (tendsto_atTop_ciSup hmono hbdd)",
            ])
        elif pattern.mode == "antitone":
            lines.extend([
                "have hanti : Antitone f := by",
                "  intro m n hmn",
                f"  have hpow : {ratio} ^ n ≤ {ratio} ^ m := pow_le_pow_of_le_one (by norm_num) (by norm_num) hmn",
                "  dsimp [f]",
                "  nlinarith",
                "have hbdd : BddBelow (Set.range f) := by",
                f"  refine ⟨{offset}, ?_⟩",
                "  rintro y ⟨n, rfl⟩",
                "  dsimp [f]",
                f"  have hpow : 0 ≤ {ratio} ^ n := pow_nonneg (by norm_num) n",
                "  nlinarith",
                "refine ⟨⨅ n, f n, ?_⟩",
                "simpa [f] using (tendsto_atTop_ciInf hanti hbdd)",
            ])
        else:
            raise ValueError(f"unsupported automatic monotone sequence mode {pattern.mode!r}")
        return lines
    if mono is None or bounded is None:
        raise ValueError("cited monotone convergence evidence is incomplete")
    if pattern.mode == "monotone":
        lines.extend([
            "have hmono : Monotone f := by",
            "  intro m n hmn",
            f"  simpa [f] using {mono} m n hmn",
            "have hbdd : BddAbove (Set.range f) := by",
            f"  rcases {bounded} with ⟨B, hB⟩",
            "  refine ⟨B, ?_⟩",
            "  rintro y ⟨n, rfl⟩",
            "  simpa [f] using hB n",
            "refine ⟨⨆ n, f n, ?_⟩",
            "simpa [f] using (tendsto_atTop_ciSup hmono hbdd)",
        ])
    elif pattern.mode == "antitone":
        lines.extend([
            "have hanti : Antitone f := by",
            "  intro m n hmn",
            f"  simpa [f] using {mono} m n hmn",
            "have hbdd : BddBelow (Set.range f) := by",
            f"  rcases {bounded} with ⟨B, hB⟩",
            "  refine ⟨B, ?_⟩",
            "  rintro y ⟨n, rfl⟩",
            "  simpa [f] using hB n",
            "refine ⟨⨅ n, f n, ?_⟩",
            "simpa [f] using (tendsto_atTop_ciInf hanti hbdd)",
        ])
    else:
        raise ValueError(f"unsupported monotone sequence mode {pattern.mode!r}")
    return lines


def _render_real_fraction(value) -> str:
    numerator = value.numerator
    denominator = value.denominator
    if denominator == 1:
        return f"({numerator} : ℝ)"
    return f"(({numerator} : ℝ) / ({denominator} : ℝ))"


def _render_sequence_elementary_divergence(
    step: dict[str, Any], request: dict[str, Any], pattern: SequenceElementaryDivergencePattern
) -> list[str]:
    var = pattern.variable
    if pattern.mode == "alternating_affine":
        if pattern.offset is None or pattern.scale is None:
            raise ValueError("alternating divergence pattern is missing exact coefficients")
        offset = _render_real_fraction(pattern.offset)
        scale = _render_real_fraction(pattern.scale)
        even_value = _render_real_fraction(pattern.offset + pattern.scale)
        odd_value = _render_real_fraction(pattern.offset - pattern.scale)
        canonical = f"({offset} + {scale} * ((-1 : ℝ) ^ {var}))"
        return [
            "rintro ⟨l, hlim⟩",
            f"have hcanon : Filter.Tendsto (fun ({var} : ℕ) => {canonical}) Filter.atTop (𝓝 l) := by",
            "  refine hlim.congr' (Eventually.of_forall ?_)",
            f"  intro {var}",
            "  ring",
            "have hevenIndex : Filter.Tendsto (fun k : ℕ => 2 * k) Filter.atTop Filter.atTop := by",
            "  refine tendsto_atTop.2 ?_",
            "  intro b",
            "  refine eventually_atTop.2 ⟨b, ?_⟩",
            "  intro k hk",
            "  omega",
            "have hoddIndex : Filter.Tendsto (fun k : ℕ => 2 * k + 1) Filter.atTop Filter.atTop := by",
            "  refine tendsto_atTop.2 ?_",
            "  intro b",
            "  refine eventually_atTop.2 ⟨b, ?_⟩",
            "  intro k hk",
            "  omega",
            "have heven := hcanon.comp hevenIndex",
            "have hodd := hcanon.comp hoddIndex",
            f"have hevenConst : Filter.Tendsto (fun _ : ℕ => {even_value}) Filter.atTop (𝓝 l) := by",
            "  convert! heven using 1 <;> norm_num [Function.comp_def, pow_mul]",
            f"have hoddConst : Filter.Tendsto (fun _ : ℕ => {odd_value}) Filter.atTop (𝓝 l) := by",
            "  convert! hodd using 1 <;> norm_num [Function.comp_def, pow_add, pow_mul]",
            f"have hEven : l = {even_value} := tendsto_nhds_unique hevenConst tendsto_const_nhds",
            f"have hOdd : l = {odd_value} := tendsto_nhds_unique hoddConst tendsto_const_nhds",
            f"have hdistinct : {even_value} ≠ {odd_value} := by norm_num",
            "exact hdistinct (hEven.symm.trans hOdd)",
        ]

    if pattern.mode == "periodic_finite_tail":
        if (
            pattern.period is None
            or pattern.residue_a is None
            or pattern.residue_b is None
            or pattern.value_a is None
            or pattern.value_b is None
            or pattern.periodic_core is None
            or pattern.finite_tail is None
        ):
            raise ValueError("periodic-plus-finite-tail pattern is missing residue or tail data")
        period = int(pattern.period)
        residue_a = int(pattern.residue_a)
        residue_b = int(pattern.residue_b)
        value_a = _render_real_fraction(pattern.value_a)
        value_b = _render_real_fraction(pattern.value_b)
        tail_pattern = pattern.finite_tail
        tail_expr = tail_pattern.expression
        tail_target_expr = tail_pattern.target
        tail_target = render_expr(tail_target_expr)
        canonical_expr = {"kind": "add", "left": pattern.periodic_core, "right": tail_expr}
        canonical = render_expr(canonical_expr)

        tail_goal = {
            "kind": "sequence_limit",
            "variable": var,
            "expression": tail_expr,
            "result": {"kind": "finite", "value": tail_target_expr},
        }
        tail_step = {
            "id": "finite_tail",
            "premises": list(tail_pattern.used_sequence_premises),
            "claim": tail_goal,
        }
        tail_proof = _render_sequence_algebra(tail_step, request, tail_pattern)
        tail_type = _sequence_tendsto_type(tail_goal, tail_expr, tail_target_expr)

        def index_expr(residue: int) -> dict[str, Any]:
            return {
                "kind": "add",
                "left": {
                    "kind": "mul",
                    "left": {"kind": "int", "value": period},
                    "right": {"kind": "var", "id": "k"},
                },
                "right": {"kind": "int", "value": residue},
            }

        tail_a = render_expr(substitute_expr(tail_expr, var, index_expr(residue_a)))
        tail_b = render_expr(substitute_expr(tail_expr, var, index_expr(residue_b)))
        shifted_a = f"({value_a} + ({tail_target} : ℝ))"
        shifted_b = f"({value_b} + ({tail_target} : ℝ))"
        lines = [
            "rintro ⟨l, hlim⟩",
            f"have hcanon : Filter.Tendsto (fun ({var} : ℕ) => ({canonical} : ℝ)) Filter.atTop (𝓝 l) := by",
            "  refine hlim.congr' (Eventually.of_forall ?_)",
            f"  intro {var}",
            "  ring",
            f"have htail : {tail_type} := by",
        ]
        lines.extend(f"  {line}" for line in tail_proof)
        lines.extend([
            f"have hAIndex : Filter.Tendsto (fun k : ℕ => {period} * k + {residue_a}) Filter.atTop Filter.atTop := by",
            "  refine tendsto_atTop.2 ?_",
            "  intro b",
            "  refine eventually_atTop.2 ⟨b, ?_⟩",
            "  intro k hk",
            "  omega",
            f"have hBIndex : Filter.Tendsto (fun k : ℕ => {period} * k + {residue_b}) Filter.atTop Filter.atTop := by",
            "  refine tendsto_atTop.2 ?_",
            "  intro b",
            "  refine eventually_atTop.2 ⟨b, ?_⟩",
            "  intro k hk",
            "  omega",
            f"have hATail : Filter.Tendsto (fun k : ℕ => ({tail_a} : ℝ)) Filter.atTop (𝓝 ({tail_target} : ℝ)) := by",
            "  simpa [Function.comp_def] using htail.comp hAIndex",
            f"have hBTail : Filter.Tendsto (fun k : ℕ => ({tail_b} : ℝ)) Filter.atTop (𝓝 ({tail_target} : ℝ)) := by",
            "  simpa [Function.comp_def] using htail.comp hBIndex",
            f"have hAFull : Filter.Tendsto (fun k : ℕ => {value_a} + ({tail_a} : ℝ)) Filter.atTop (𝓝 l) := by",
            "  convert! hcanon.comp hAIndex using 1 <;> simp [Function.comp_def, pow_mul, pow_add, Nat.add_mod, Nat.mul_mod_right] <;> ring",
            f"have hBFull : Filter.Tendsto (fun k : ℕ => {value_b} + ({tail_b} : ℝ)) Filter.atTop (𝓝 l) := by",
            "  convert! hcanon.comp hBIndex using 1 <;> simp [Function.comp_def, pow_mul, pow_add, Nat.add_mod, Nat.mul_mod_right] <;> ring",
            f"have hAExpected : Filter.Tendsto (fun k : ℕ => {value_a} + ({tail_a} : ℝ)) Filter.atTop (𝓝 ({shifted_a} : ℝ)) := by",
            f"  exact (tendsto_const_nhds : Filter.Tendsto (fun _ : ℕ => ({value_a} : ℝ)) Filter.atTop (𝓝 ({value_a} : ℝ))).add hATail",
            f"have hBExpected : Filter.Tendsto (fun k : ℕ => {value_b} + ({tail_b} : ℝ)) Filter.atTop (𝓝 ({shifted_b} : ℝ)) := by",
            f"  exact (tendsto_const_nhds : Filter.Tendsto (fun _ : ℕ => ({value_b} : ℝ)) Filter.atTop (𝓝 ({value_b} : ℝ))).add hBTail",
            f"have hValueA : l = {shifted_a} := tendsto_nhds_unique hAFull hAExpected",
            f"have hValueB : l = {shifted_b} := tendsto_nhds_unique hBFull hBExpected",
            f"have hbaseDistinct : {value_a} ≠ {value_b} := by norm_num",
            f"have hshiftDistinct : {shifted_a} ≠ {shifted_b} := by",
            "  intro h",
            "  exact hbaseDistinct (add_right_cancel h)",
            "exact hshiftDistinct (hValueA.symm.trans hValueB)",
        ])
        return lines

    if pattern.mode == "eventually_periodic_residue":
        if (
            pattern.periodic_core is None
            or pattern.eventual_cutoff is None
            or None in {pattern.period, pattern.residue_a, pattern.residue_b, pattern.value_a, pattern.value_b}
        ):
            raise ValueError("eventually periodic divergence pattern is missing cutoff or residue-class data")
        period = int(pattern.period)
        residue_a = int(pattern.residue_a)
        residue_b = int(pattern.residue_b)
        cutoff = int(pattern.eventual_cutoff)
        value_a = _render_real_fraction(pattern.value_a)
        value_b = _render_real_fraction(pattern.value_b)
        core = render_expr(pattern.periodic_core)
        return [
            "rintro ⟨l, hlim⟩",
            f"have hcore : Filter.Tendsto (fun ({var} : ℕ) => ({core} : ℝ)) Filter.atTop (𝓝 l) := by",
            "  refine hlim.congr' ?_",
            f"  filter_upwards [eventually_ge_atTop {cutoff}] with {var} hcut",
            f"  simp [show ¬ {var} < {cutoff} by omega]",
            f"have hAIndex : Filter.Tendsto (fun k : ℕ => {period} * k + {residue_a}) Filter.atTop Filter.atTop := by",
            "  refine tendsto_atTop.2 ?_",
            "  intro b",
            "  refine eventually_atTop.2 ⟨b, ?_⟩",
            "  intro k hk",
            "  omega",
            f"have hBIndex : Filter.Tendsto (fun k : ℕ => {period} * k + {residue_b}) Filter.atTop Filter.atTop := by",
            "  refine tendsto_atTop.2 ?_",
            "  intro b",
            "  refine eventually_atTop.2 ⟨b, ?_⟩",
            "  intro k hk",
            "  omega",
            "have hA := hcore.comp hAIndex",
            "have hB := hcore.comp hBIndex",
            f"have hAConst : Filter.Tendsto (fun _ : ℕ => {value_a}) Filter.atTop (𝓝 l) := by",
            "  simpa [Function.comp_def, pow_mul, pow_add, Nat.add_mod, Nat.mul_mod_right, mul_comm, ← pow_mul] using hA",
            f"have hBConst : Filter.Tendsto (fun _ : ℕ => {value_b}) Filter.atTop (𝓝 l) := by",
            "  simpa [Function.comp_def, pow_mul, pow_add, Nat.add_mod, Nat.mul_mod_right, mul_comm, ← pow_mul] using hB",
            f"have hValueA : l = {value_a} := tendsto_nhds_unique hAConst tendsto_const_nhds",
            f"have hValueB : l = {value_b} := tendsto_nhds_unique hBConst tendsto_const_nhds",
            f"have hdistinct : {value_a} ≠ {value_b} := by norm_num",
            "exact hdistinct (hValueA.symm.trans hValueB)",
        ]

    if pattern.mode == "periodic_residue":
        if None in {pattern.period, pattern.residue_a, pattern.residue_b, pattern.value_a, pattern.value_b}:
            raise ValueError("periodic divergence pattern is missing residue-class data")
        period = int(pattern.period)
        residue_a = int(pattern.residue_a)
        residue_b = int(pattern.residue_b)
        value_a = _render_real_fraction(pattern.value_a)
        value_b = _render_real_fraction(pattern.value_b)
        return [
            "rintro ⟨l, hlim⟩",
            f"have hAIndex : Filter.Tendsto (fun k : ℕ => {period} * k + {residue_a}) Filter.atTop Filter.atTop := by",
            "  refine tendsto_atTop.2 ?_",
            "  intro b",
            "  refine eventually_atTop.2 ⟨b, ?_⟩",
            "  intro k hk",
            "  omega",
            f"have hBIndex : Filter.Tendsto (fun k : ℕ => {period} * k + {residue_b}) Filter.atTop Filter.atTop := by",
            "  refine tendsto_atTop.2 ?_",
            "  intro b",
            "  refine eventually_atTop.2 ⟨b, ?_⟩",
            "  intro k hk",
            "  omega",
            "have hA := hlim.comp hAIndex",
            "have hB := hlim.comp hBIndex",
            f"have hAConst : Filter.Tendsto (fun _ : ℕ => {value_a}) Filter.atTop (𝓝 l) := by",
            "  simpa [Function.comp_def, Nat.add_mod, Nat.mul_mod_right] using hA",
            f"have hBConst : Filter.Tendsto (fun _ : ℕ => {value_b}) Filter.atTop (𝓝 l) := by",
            "  simpa [Function.comp_def, Nat.add_mod, Nat.mul_mod_right] using hB",
            f"have hValueA : l = {value_a} := tendsto_nhds_unique hAConst tendsto_const_nhds",
            f"have hValueB : l = {value_b} := tendsto_nhds_unique hBConst tendsto_const_nhds",
            f"have hdistinct : {value_a} ≠ {value_b} := by norm_num",
            "exact hdistinct (hValueA.symm.trans hValueB)",
        ]

    if pattern.base is None:
        raise ValueError("geometric divergence pattern is missing an exact base")
    base = _render_real_fraction(pattern.base)
    if pattern.mode == "geometric_pos_inf":
        return [
            f"simpa using (tendsto_pow_atTop_atTop_of_one_lt (r := {base}) (by norm_num) : ",
            f"  Filter.Tendsto (fun ({var} : ℕ) => {base} ^ {var}) Filter.atTop Filter.atTop)",
        ]
    if pattern.mode == "geometric_no_finite_pos":
        return [
            "rintro ⟨l, hlim⟩",
            f"have hgrow : Filter.Tendsto (fun ({var} : ℕ) => {base} ^ {var}) Filter.atTop Filter.atTop := by",
            f"  simpa using (tendsto_pow_atTop_atTop_of_one_lt (r := {base}) (by norm_num) : ",
            f"    Filter.Tendsto (fun ({var} : ℕ) => {base} ^ {var}) Filter.atTop Filter.atTop)",
            "exact not_tendsto_nhds_of_tendsto_atTop hgrow l hlim",
        ]
    if pattern.mode == "geometric_no_finite_abs":
        return [
            "rintro ⟨l, hlim⟩",
            f"have habs : Filter.Tendsto (fun ({var} : ℕ) => |{base} ^ {var}|) Filter.atTop (𝓝 |l|) := (continuous_abs.tendsto l).comp hlim",
            f"have hgrow : Filter.Tendsto (fun ({var} : ℕ) => |{base}| ^ {var}) Filter.atTop Filter.atTop := by",
            f"  simpa using (tendsto_pow_atTop_atTop_of_one_lt (r := |{base}|) (by norm_num) : ",
            f"    Filter.Tendsto (fun ({var} : ℕ) => |{base}| ^ {var}) Filter.atTop Filter.atTop)",
            f"have habsGrow : Filter.Tendsto (fun ({var} : ℕ) => |{base} ^ {var}|) Filter.atTop Filter.atTop := by",
            "  simpa only [abs_pow] using hgrow",
            "exact not_tendsto_nhds_of_tendsto_atTop habsGrow |l| habs",
        ]
    raise ValueError(f"unsupported elementary sequence divergence mode {pattern.mode!r}")


def _render_sequence_affine_ratio(pattern: SequenceAffineRatioPattern) -> list[str]:
    var = pattern.variable
    a = _render_real_fraction(pattern.numerator_intercept)
    c = _render_real_fraction(pattern.numerator_slope)
    b = _render_real_fraction(pattern.denominator_intercept)
    d = _render_real_fraction(pattern.denominator_slope)
    target = _render_real_fraction(pattern.target)
    canonical = f"({a} + {c} * ({var} : ℝ)) / ({b} + {d} * ({var} : ℝ))"
    original = render_expr(pattern.expression)
    return [
        f"have hraw := (tendsto_add_mul_div_add_mul_atTop_nhds {a} {b} {c} (by norm_num : {d} ≠ 0))",
        f"have hmain : Filter.Tendsto (fun ({var} : ℕ) => {canonical}) Filter.atTop (𝓝 ({target} : ℝ)) := by",
        "  convert! hraw using 1 <;> norm_num",
        "refine hmain.congr' ?_",
        f"filter_upwards [] with {var}",
        f"change ({canonical}) = ({original} : ℝ)",
        "congr 1 <;> ring",
    ]


def _render_polynomial_literal(coefficients: tuple) -> str:
    terms: list[str] = []
    for degree, coefficient in enumerate(coefficients):
        if coefficient == 0:
            continue
        scalar = _render_real_fraction(coefficient)
        if degree == 0:
            term = f"Polynomial.C {scalar}"
        elif degree == 1:
            term = f"Polynomial.C {scalar} * Polynomial.X"
        else:
            term = f"Polynomial.C {scalar} * Polynomial.X ^ {degree}"
        terms.append(term)
    return "(0 : Polynomial ℝ)" if not terms else "(" + " + ".join(terms) + " : Polynomial ℝ)"


def _render_explicit_polynomial_facts(
    name: str, coefficients: tuple, degree: int, *, need_leading: bool
) -> list[str]:
    literal = _render_polynomial_literal(coefficients)
    lines = [f"let {name} : Polynomial ℝ := {literal}"]
    if degree < 0:
        lines.append(f"have h{name}Deg : {name}.degree = ⊥ := by simp [{name}]")
        return lines

    lines.extend([
        f"have h{name}Deg : {name}.degree = ({degree} : WithBot ℕ) := by",
        f"  dsimp [{name}]",
        "  compute_degree! <;> norm_num",
    ])
    if need_leading:
        leading = _render_real_fraction(coefficients[degree])
        lines.extend([
            f"have h{name}Nat : {name}.natDegree = {degree} := Polynomial.natDegree_eq_of_degree_eq_some h{name}Deg",
            f"have h{name}Lead : {name}.leadingCoeff = {leading} := by",
            f"  rw [Polynomial.leadingCoeff, h{name}Nat]",
            f"  dsimp [{name}]",
            "  compute_degree! <;> norm_num",
        ])
    return lines


def _render_sequence_polynomial_degree_ratio(pattern: SequencePolynomialDegreeRatioPattern) -> list[str]:
    """Render the general polynomial quotient through mathlib ``Polynomial``.

    The generated artifact explicitly rebuilds the two exact polynomials, has
    Lean compute their degrees/leading coefficients, applies mathlib's general
    polynomial quotient limit theorem over ``ℝ``, and only then composes with
    ``Nat.cast``.  The final congruence reconnects those polynomial evaluations
    to the learner's original syntax.
    """
    var = pattern.variable
    original = render_expr(pattern.expression)
    lower_degree = pattern.numerator_degree < pattern.denominator_degree
    equal_degree = pattern.numerator_degree == pattern.denominator_degree
    need_numerator_lead = not lower_degree

    lines: list[str] = []
    lines.extend(_render_explicit_polynomial_facts(
        "pPoly", pattern.numerator_coefficients, pattern.numerator_degree, need_leading=need_numerator_lead
    ))
    lines.extend(_render_explicit_polynomial_facts(
        "qPoly", pattern.denominator_coefficients, pattern.denominator_degree, need_leading=not lower_degree or equal_degree
    ))

    if lower_degree:
        lines.extend([
            "have hdeg : pPoly.degree < qPoly.degree := by",
            "  rw [hpPolyDeg, hqPolyDeg]",
            "  norm_num",
            "have hreal : Filter.Tendsto (fun x : ℝ => Polynomial.eval x pPoly / Polynomial.eval x qPoly) Filter.atTop (𝓝 0) :=",
            "  Polynomial.div_tendsto_atTop_zero_of_degree_lt pPoly qPoly hdeg",
        ])
    elif equal_degree:
        ratio = _render_real_fraction(pattern.leading_ratio)
        lines.extend([
            "have hdeg : pPoly.degree = qPoly.degree := by rw [hpPolyDeg, hqPolyDeg]",
            "have hreal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq pPoly qPoly hdeg",
            "rw [hpPolyLead, hqPolyLead] at hreal",
            f"have hreal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x pPoly / Polynomial.eval x qPoly) Filter.atTop (𝓝 ({ratio} : ℝ)) := by",
            "  simpa using hreal",
        ])
    else:
        ratio = _render_real_fraction(pattern.leading_ratio)
        target_filter = "Filter.atTop" if pattern.result_kind == "positive_infinity" else "Filter.atBot"
        theorem = (
            "Polynomial.div_tendsto_atTop_of_degree_gt'"
            if pattern.result_kind == "positive_infinity"
            else "Polynomial.div_tendsto_atBot_of_degree_gt'"
        )
        sign = f"0 < {ratio}" if pattern.result_kind == "positive_infinity" else f"{ratio} < 0"
        lines.extend([
            "have hdeg : qPoly.degree < pPoly.degree := by",
            "  rw [hpPolyDeg, hqPolyDeg]",
            "  norm_num",
            f"have hsign : {sign} := by norm_num",
            f"have hreal : Filter.Tendsto (fun x : ℝ => Polynomial.eval x pPoly / Polynomial.eval x qPoly) Filter.atTop {target_filter} := by",
            f"  apply {theorem} pPoly qPoly hdeg",
            "  norm_num [hpPolyLead, hqPolyLead]",
        ])

    source_name = "hreal" if lower_degree else ("hreal'" if equal_degree else "hreal")
    lines.extend([
        f"have hseq := {source_name}.comp tendsto_natCast_atTop_atTop",
        "refine hseq.congr' ?_",
        f"filter_upwards [] with {var}",
        f"change (Polynomial.eval ({var} : ℝ) pPoly / Polynomial.eval ({var} : ℝ) qPoly) = ({original} : ℝ)",
        "congr 1",
        "· simp [pPoly] <;> ring",
        "· simp [qPoly] <;> ring",
    ])
    return lines


def _render_sequence_quadratic_ratio(pattern: SequenceQuadraticRatioPattern) -> list[str]:
    var = pattern.variable
    a = _render_real_fraction(pattern.numerator_constant)
    b = _render_real_fraction(pattern.numerator_linear)
    c = _render_real_fraction(pattern.numerator_quadratic)
    d = _render_real_fraction(pattern.denominator_constant)
    e = _render_real_fraction(pattern.denominator_linear)
    f = _render_real_fraction(pattern.denominator_quadratic)
    target = _render_real_fraction(pattern.target)
    inv = f"((1 : ℝ) / ({var} : ℝ))"
    inv_sq = f"({inv} ^ 2)"
    normalized_num = f"({c} + {b} * {inv} + {a} * {inv_sq})"
    normalized_den = f"({f} + {e} * {inv} + {d} * {inv_sq})"
    normalized = f"({normalized_num}) / ({normalized_den})"
    original = render_expr(pattern.expression)
    return [
        f"have hinv : Filter.Tendsto (fun ({var} : ℕ) => (1 : ℝ) / ({var} : ℝ)) Filter.atTop (𝓝 0) :=",
        "  tendsto_one_div_atTop_nhds_zero_nat",
        f"have hinv2 : Filter.Tendsto (fun ({var} : ℕ) => (((1 : ℝ) / ({var} : ℝ)) ^ 2)) Filter.atTop (𝓝 0) := by",
        "  simpa [pow_two] using hinv.mul hinv",
        f"have hc : Filter.Tendsto (fun _ : ℕ => {c}) Filter.atTop (𝓝 ({c} : ℝ)) := tendsto_const_nhds",
        f"have hb : Filter.Tendsto (fun _ : ℕ => {b}) Filter.atTop (𝓝 ({b} : ℝ)) := tendsto_const_nhds",
        f"have ha : Filter.Tendsto (fun _ : ℕ => {a}) Filter.atTop (𝓝 ({a} : ℝ)) := tendsto_const_nhds",
        f"have hf : Filter.Tendsto (fun _ : ℕ => {f}) Filter.atTop (𝓝 ({f} : ℝ)) := tendsto_const_nhds",
        f"have he : Filter.Tendsto (fun _ : ℕ => {e}) Filter.atTop (𝓝 ({e} : ℝ)) := tendsto_const_nhds",
        f"have hd : Filter.Tendsto (fun _ : ℕ => {d}) Filter.atTop (𝓝 ({d} : ℝ)) := tendsto_const_nhds",
        f"have hnum : Filter.Tendsto (fun ({var} : ℕ) => {normalized_num}) Filter.atTop (𝓝 ({c} : ℝ)) := by",
        "  simpa using (hc.add (hb.mul hinv)).add (ha.mul hinv2)",
        f"have hden : Filter.Tendsto (fun ({var} : ℕ) => {normalized_den}) Filter.atTop (𝓝 ({f} : ℝ)) := by",
        "  simpa using (hf.add (he.mul hinv)).add (hd.mul hinv2)",
        f"have hmain : Filter.Tendsto (fun ({var} : ℕ) => {normalized}) Filter.atTop (𝓝 ({target} : ℝ)) := by",
        f"  convert! hnum.div hden (by norm_num : {f} ≠ 0) using 1 <;> norm_num",
        "refine hmain.congr' ?_",
        f"filter_upwards [eventually_gt_atTop (0 : ℕ)] with {var} h{var}",
        f"have h{var}0 : ({var} : ℝ) ≠ 0 := by exact_mod_cast (Nat.ne_of_gt h{var})",
        f"change ({normalized}) = ({original} : ℝ)",
        f"field_simp [h{var}0] <;> ring",
    ]


def _render_sequence_rational_shift(pattern: SequenceRationalShiftPattern) -> list[str]:
    var = pattern.variable
    a = pattern.numerator_shift
    b = pattern.denominator_shift
    delta = a - b
    original = render_expr(pattern.expression)
    return [
        f"have hden : Filter.Tendsto (fun ({var} : ℕ) => ({var} : ℝ) + ({b} : ℝ)) Filter.atTop Filter.atTop :=",
        f"  tendsto_atTop_add_const_right Filter.atTop ({b} : ℝ) tendsto_natCast_atTop_atTop",
        f"have htail : Filter.Tendsto (fun ({var} : ℕ) => ({delta} : ℝ) / (({var} : ℝ) + ({b} : ℝ))) Filter.atTop (𝓝 0) :=",
        "  tendsto_const_nhds.div_atTop hden",
        f"have hmain : Filter.Tendsto (fun ({var} : ℕ) => (1 : ℝ) + ({delta} : ℝ) / (({var} : ℝ) + ({b} : ℝ))) Filter.atTop (𝓝 1) := by",
        "  simpa using tendsto_const_nhds.add htail",
        "refine hmain.congr' ?_",
        "filter_upwards [] with n",
        f"have hden0 : (n : ℝ) + ({b} : ℝ) ≠ 0 := by positivity",
        f"change (1 : ℝ) + ({delta} : ℝ) / ((n : ℝ) + ({b} : ℝ)) = ({original} : ℝ)",
        "simp only [Nat.cast_add, Nat.cast_ofNat]",
        "field_simp [hden0]",
        "ring",
    ]


def _fraction_lean(value) -> str:
    if value.denominator == 1:
        return str(value.numerator) if value.numerator >= 0 else f"({value.numerator})"
    return f"({value.numerator} / {value.denominator} : ℝ)"


def _render_geometric_series(pattern: GeometricSeriesPattern) -> list[str]:
    a = _fraction_lean(pattern.coefficient)
    r = _fraction_lean(pattern.ratio)
    original = render_expr(pattern.expression)
    if pattern.result_kind == "finite":
        target = _fraction_lean(pattern.target)
        return [
            f"have hr : |({r} : ℝ)| < 1 := by norm_num",
            f"have hgeom : HasSum (fun n : ℕ => ({r} : ℝ) ^ n) (1 - ({r} : ℝ))⁻¹ := hasSum_geometric_of_abs_lt_one hr",
            f"have hscaled := hgeom.mul_left ({a} : ℝ)",
            f"convert! hscaled using 1 <;> (solve | (norm_num <;> ring) | (ext x <;> norm_num <;> ring))",
        ]
    return [
        "intro hsum",
        f"have ha : ({a} : ℝ) ≠ 0 := by norm_num",
        f"have hscaled : Summable (fun n : ℕ => ({a} : ℝ) * ({r} : ℝ) ^ n) := by",
        "  convert! hsum using 1 <;> (solve | (norm_num <;> ring) | (ext x <;> norm_num <;> ring))",
        f"have hgeom : Summable (fun n : ℕ => ({r} : ℝ) ^ n) :=",
        f"  (summable_mul_left_iff ha).mp hscaled",
        f"have hr : ‖({r} : ℝ)‖ < 1 := summable_geometric_iff_norm_lt_one.mp hgeom",
        "norm_num at hr",
    ]



def _render_p_series(pattern: PSeriesPattern) -> list[str]:
    a = _fraction_lean(pattern.coefficient)
    k = pattern.shift
    p = pattern.exponent
    if pattern.real_exponent:
        p_term = _fraction_lean(p)
        base = f"(fun m : ℕ => 1 / ((m : ℝ) ^ {p_term}))"
        shifted = f"(fun n : ℕ => 1 / ((((n + {k} : ℕ) : ℝ)) ^ {p_term}))"
        criterion = "Real.summable_one_div_nat_rpow"
    else:
        p_term = str(p.numerator)
        base = f"(fun m : ℕ => 1 / ((m : ℝ) ^ {p_term}))"
        shifted = f"(fun n : ℕ => 1 / ((((n + {k} : ℕ) : ℝ)) ^ {p_term}))"
        criterion = "Real.summable_one_div_nat_pow"
    if pattern.result_kind == "summable":
        return [
            f"have hp : (1 : ℝ) < {p_term} := by norm_num" if pattern.real_exponent else f"have hp : 1 < {p_term} := by norm_num",
            f"have hbase : Summable {base} := {criterion}.mpr hp",
            f"have hshift : Summable {shifted} := by",
            f"  simpa [Nat.cast_add] using (summable_nat_add_iff {k}).mpr hbase",
            f"have hscaled := hshift.mul_left ({a} : ℝ)",
            "simpa [div_eq_mul_inv] using hscaled",
        ]
    return [
        "intro hsum",
        f"have ha : ({a} : ℝ) ≠ 0 := by norm_num",
        f"have hscaled : Summable (fun n : ℕ => ({a} : ℝ) * (1 / ((((n + {k} : ℕ) : ℝ)) ^ {p_term}))) := by",
        "  simpa [div_eq_mul_inv] using hsum",
        f"have hshift : Summable {shifted} := (summable_mul_left_iff ha).mp hscaled",
        f"have hbase : Summable {base} := by",
        f"  apply (summable_nat_add_iff {k}).mp",
        "  simpa [Nat.cast_add] using hshift",
        f"have hp : (1 : ℝ) < {p_term} := {criterion}.mp hbase" if pattern.real_exponent else f"have hp : 1 < {p_term} := {criterion}.mp hbase",
        "norm_num at hp",
    ]

def _render_series_ratio_test(pattern: SeriesRatioTestPattern, request: dict[str, Any]) -> list[str]:
    evidence = pattern.evidence_premise_id
    ratio = _render_real_fraction(pattern.ratio_bound)
    lines = [f"apply summable_of_ratio_norm_eventually_le (r := {ratio}) (by norm_num)"]
    if pattern.evidence_mode == "global":
        lines.extend([
            f"exact Filter.Eventually.of_forall (fun n => by",
            f"  have hbound := {evidence} n",
            "  simpa [Real.norm_eq_abs, Nat.cast_add, add_assoc] using hbound)",
        ])
        return lines
    lines.extend([
        f"rcases {evidence} with ⟨N, hN⟩",
        "filter_upwards [Filter.eventually_ge_atTop N] with n hn",
        "have hbound := hN n hn",
        "simpa [Real.norm_eq_abs, Nat.cast_add, add_assoc] using hbound",
    ])
    return lines


def _mul_expr(parts: list[str]) -> str:
    if not parts:
        return "(1 : ℝ)"
    result = parts[0]
    for part in parts[1:]:
        result = f"({result} * {part})"
    return result


def _render_multiple_factorial_ratio_limit(
    pattern: SeriesRatioLimitPattern,
    current: str,
    nxt: str,
    var: str,
    index: dict[str, Any],
    next_index: dict[str, Any],
    base: str,
    abs_base: str,
    polynomial: dict[str, Any] | None,
    coefficients: tuple[Fraction, ...] | None,
    degree: int | None,
    leading: Fraction | None,
    polynomial_nonzero_from: int | None,
    geometric_expression: dict[str, Any] | None,
) -> list[str]:
    """Render the ratio-limit proof for normalized shifted-factorial factors.

    This branch handles multiple factors and noncanonical one-factor denominator
    orderings. Every denominator leaf is reconstructed from the original AST, every
    factorial recurrence is checked with ``Nat.factorial_succ``, and the model
    limit is the product of the corresponding reciprocal-linear powers.
    """
    split = _split_factorial_denominator(pattern.expression, var)
    if split is None:
        raise ValueError("normalized factorial ratio reconstruction requires exact denominator factorial factors")
    _, terms = split
    if not terms:
        raise ValueError("normalized factorial ratio reconstruction requires at least one exact factorial factor")
    factors = tuple((shift, power) for shift, power, _ in terms)
    if pattern.automatic_ratio_factorial_factors and factors != pattern.automatic_ratio_factorial_factors:
        raise ValueError("multiple-factorial ratio metadata no longer matches the submitted denominator")

    lines: list[str] = []
    reciprocal_terms: list[str] = []
    decay_denominators: list[str] = []
    factor_data: list[dict[str, Any]] = []

    for j, (shift, power, factorial) in enumerate(terms):
        shift_plus_one = shift + 1
        linear = f"(({var} : ℝ) + {shift_plus_one})"
        decay = linear if power == 1 else f"({linear} ^ {power})"
        reciprocal = f"(1 / {linear})" if power == 1 else f"((1 / {linear}) ^ {power})"
        reciprocal_terms.append(reciprocal)
        decay_denominators.append(decay)

        factorial_arg = factorial.get("arg", {})
        current_arg = render_expr(substitute_expr(factorial_arg, var, index))
        next_arg = render_expr(substitute_expr(factorial_arg, var, next_index))
        canonical_arg = var if shift == 0 else f"({var} + {shift})"
        canonical_real = f"((Nat.factorial {canonical_arg} : ℕ) : ℝ)"
        factor_data.append({
            "index": j,
            "shift": shift,
            "power": power,
            "linear": linear,
            "decay": decay,
            "current_arg": current_arg,
            "next_arg": next_arg,
            "canonical_arg": canonical_arg,
            "canonical_real": canonical_real,
        })

        lines.extend([
            f"  have hfactorDen{j} : Filter.Tendsto (fun {var} : ℕ => {linear}) Filter.atTop Filter.atTop :=",
            f"    tendsto_atTop_add_const_right Filter.atTop ({shift_plus_one} : ℝ) tendsto_natCast_atTop_atTop",
            f"  have hfactorRecip{j} : Filter.Tendsto (fun {var} : ℕ => 1 / {linear}) Filter.atTop (𝓝 0) :=",
            f"    tendsto_const_nhds.div_atTop hfactorDen{j}",
            f"  have hfactorTerm{j} : Filter.Tendsto (fun {var} : ℕ => {reciprocal}) Filter.atTop (𝓝 0) := by",
            f"    simpa using hfactorRecip{j}.pow {power}",
        ])

    reciprocal_product = _mul_expr(reciprocal_terms)
    decay_product = _mul_expr(decay_denominators)
    if len(factor_data) == 1:
        lines.extend([
            f"  have hfactorProduct : Filter.Tendsto (fun {var} : ℕ => {reciprocal_product}) Filter.atTop (𝓝 0) := by",
            "    simpa using hfactorTerm0",
        ])
    elif len(factor_data) == 2:
        lines.extend([
            f"  have hfactorProduct : Filter.Tendsto (fun {var} : ℕ => {reciprocal_product}) Filter.atTop (𝓝 0) := by",
            "    simpa using hfactorTerm0.mul hfactorTerm1",
        ])
    else:
        lines.append(
            f"  have hfactorProduct : Filter.Tendsto (fun {var} : ℕ => {reciprocal_product}) Filter.atTop (𝓝 0) := by"
        )
        lines.append("    have hprod1 := hfactorTerm0.mul hfactorTerm1")
        prev = "hprod1"
        for j in range(2, len(factor_data)):
            name = f"hprod{j}"
            lines.append(f"    have {name} := {prev}.mul hfactorTerm{j}")
            prev = name
        lines.append(f"    simpa using {prev}")

    lines.extend([
        f"  have hfactor : Filter.Tendsto (fun {var} : ℕ => ({abs_base} : ℝ) / {decay_product}) Filter.atTop (𝓝 0) := by",
        "    have h := tendsto_const_nhds.mul hfactorProduct",
        "    simpa [div_eq_mul_inv, mul_inv, inv_pow, mul_assoc, mul_left_comm, mul_comm] using h",
    ])

    ratio_denominator = pattern.automatic_ratio_denominator_polynomial
    denominator_coefficients = pattern.automatic_ratio_denominator_polynomial_coefficients
    denominator_degree = pattern.automatic_ratio_denominator_polynomial_degree
    denominator_leading = pattern.automatic_ratio_denominator_polynomial_leading_coefficient
    denominator_nonzero_from = pattern.automatic_ratio_denominator_polynomial_nonzero_from

    if polynomial is not None:
        if (
            coefficients is None or degree is None or leading is None
            or polynomial_nonzero_from is None or geometric_expression is None
        ):
            raise ValueError("automatic multi-factorial ratio limit is missing normalized polynomial data")
        shifted_coefficients = _shift_polynomial_coefficients(coefficients, 1)
        polynomial_expr = render_expr(polynomial)
        polynomial_next_ast = substitute_expr(polynomial, var, next_index)
        polynomial_next_expr = render_expr(polynomial_next_ast)
        geometric_expr = render_expr(geometric_expression)
        geometric_next_expr = render_expr(substitute_expr(geometric_expression, var, next_index))
        geometric_k_expr = render_expr(
            substitute_expr(geometric_expression, var, {"kind": "var", "id": "k"})
        )
        poly_lines: list[str] = []
        poly_lines.extend(_render_explicit_polynomial_facts(
            "ratioMultiFactPoly", coefficients, degree, need_leading=True
        ))
        poly_lines.extend(_render_explicit_polynomial_facts(
            "ratioMultiFactNextPoly", shifted_coefficients, degree, need_leading=True
        ))
        lines.extend(f"  {line}" for line in poly_lines)
        lines.extend([
            "  have hratioMultiFactDegreesEq : ratioMultiFactNextPoly.degree = ratioMultiFactPoly.degree := by rw [hratioMultiFactNextPolyDeg, hratioMultiFactPolyDeg]",
            "  have hpolyReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioMultiFactNextPoly ratioMultiFactPoly hratioMultiFactDegreesEq",
            "  rw [hratioMultiFactNextPolyLead, hratioMultiFactPolyLead] at hpolyReal",
            "  have hpolyReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioMultiFactNextPoly / Polynomial.eval x ratioMultiFactPoly) Filter.atTop (𝓝 1) := by",
            "    simpa using hpolyReal",
            "  have hpolySeq := hpolyReal'.comp tendsto_natCast_atTop_atTop",
            f"  have hpolyRaw : Filter.Tendsto (fun {var} : ℕ => ({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
            "    refine hpolySeq.congr' ?_",
            f"    filter_upwards [] with {var}",
            f"    change (Polynomial.eval ({var} : ℝ) ratioMultiFactNextPoly / Polynomial.eval ({var} : ℝ) ratioMultiFactPoly) = (({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ))",
            "    congr 1",
            "    · simp [ratioMultiFactNextPoly, Nat.cast_add] <;> ring",
            "    · simp [ratioMultiFactPoly] <;> ring",
            f"  have hpolyAbs : Filter.Tendsto (fun {var} : ℕ => |({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
            "    simpa [abs_div] using hpolyRaw.abs",
            f"  have hgeomAbs : ∀ k : ℕ, |({geometric_k_expr} : ℝ)| = (({abs_base} : ℝ) ^ k) := by",
            "    intro k",
            "    norm_num [abs_mul, abs_div, abs_pow, ← mul_pow, ← div_pow]",
        ])
    else:
        polynomial_expr = polynomial_next_expr = geometric_expr = geometric_next_expr = ""

    if polynomial is not None and ratio_denominator is not None:
        if (
            denominator_coefficients is None or denominator_degree is None
            or denominator_leading is None or denominator_nonzero_from is None
        ):
            raise ValueError("automatic multi-factorial ratio limit is missing denominator polynomial data")
        denominator_shifted_coefficients = _shift_polynomial_coefficients(denominator_coefficients, 1)
        denominator_expr = render_expr(ratio_denominator)
        denominator_next_ast = substitute_expr(ratio_denominator, var, next_index)
        denominator_next_expr = render_expr(denominator_next_ast)
        den_lines: list[str] = []
        den_lines.extend(_render_explicit_polynomial_facts(
            "ratioMultiFactDenPoly", denominator_coefficients, denominator_degree, need_leading=True
        ))
        den_lines.extend(_render_explicit_polynomial_facts(
            "ratioMultiFactDenNextPoly", denominator_shifted_coefficients, denominator_degree, need_leading=True
        ))
        lines.extend(f"  {line}" for line in den_lines)
        lines.extend([
            "  have hratioMultiFactDenDegreesEq : ratioMultiFactDenPoly.degree = ratioMultiFactDenNextPoly.degree := by rw [hratioMultiFactDenPolyDeg, hratioMultiFactDenNextPolyDeg]",
            "  have hdenReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioMultiFactDenPoly ratioMultiFactDenNextPoly hratioMultiFactDenDegreesEq",
            "  rw [hratioMultiFactDenPolyLead, hratioMultiFactDenNextPolyLead] at hdenReal",
            "  have hdenReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioMultiFactDenPoly / Polynomial.eval x ratioMultiFactDenNextPoly) Filter.atTop (𝓝 1) := by",
            "    simpa using hdenReal",
            "  have hdenSeq := hdenReal'.comp tendsto_natCast_atTop_atTop",
            f"  have hdenRaw : Filter.Tendsto (fun {var} : ℕ => ({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
            "    refine hdenSeq.congr' ?_",
            f"    filter_upwards [] with {var}",
            f"    change (Polynomial.eval ({var} : ℝ) ratioMultiFactDenPoly / Polynomial.eval ({var} : ℝ) ratioMultiFactDenNextPoly) = (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))",
            "    congr 1",
            "    · simp [ratioMultiFactDenPoly] <;> ring",
            "    · simp [ratioMultiFactDenNextPoly, Nat.cast_add] <;> ring",
            f"  have hdenAbs : Filter.Tendsto (fun {var} : ℕ => |({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
            "    simpa [abs_div] using hdenRaw.abs",
            f"  have hpolyQuotientModel : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) Filter.atTop (𝓝 1) := by",
            "    simpa using hpolyAbs.mul hdenAbs",
            f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => ((|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) * (({abs_base} : ℝ) / {decay_product})) Filter.atTop (𝓝 0) := by",
            "    simpa using hpolyQuotientModel.mul hfactor",
        ])
        threshold = max(polynomial_nonzero_from, denominator_nonzero_from)
    elif polynomial is not None:
        denominator_expr = denominator_next_expr = ""
        lines.extend([
            f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (({abs_base} : ℝ) / {decay_product})) Filter.atTop (𝓝 0) := by",
            "    simpa using hpolyAbs.mul hfactor",
        ])
        threshold = polynomial_nonzero_from
    else:
        denominator_expr = denominator_next_expr = ""
        lines.extend([
            f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => ({abs_base} : ℝ) / {decay_product}) Filter.atTop (𝓝 0) := hfactor",
        ])
        threshold = 0

    lines.extend([
        "  refine hmodel.congr' ?_",
        f"  filter_upwards [Filter.eventually_ge_atTop {threshold}] with {var} hn",
    ])

    field_facts: list[str] = []
    rewrite_names: list[str] = []
    for data in factor_data:
        j = data["index"]
        power = data["power"]
        canonical_arg = data["canonical_arg"]
        canonical_real = data["canonical_real"]
        lines.extend([
            f"  have harg{j} : {data['current_arg']} = {canonical_arg} := by omega",
            f"  have hargNext{j} : {data['next_arg']} = ({canonical_arg}) + 1 := by omega",
            f"  have hfact{j} : {canonical_real} ≠ 0 := by",
            f"    exact_mod_cast (Nat.factorial_ne_zero {canonical_arg})",
            f"  have hlinear{j} : {data['linear']} ≠ 0 := by positivity",
        ])
        field_facts.extend([f"hfact{j}", f"hlinear{j}"])
        if power > 1:
            lines.extend([
                f"  have hfactPow{j} : ({canonical_real} ^ {power}) ≠ 0 := pow_ne_zero _ hfact{j}",
                f"  have hlinearPow{j} : {data['decay']} ≠ 0 := pow_ne_zero _ hlinear{j}",
            ])
            field_facts.extend([f"hfactPow{j}", f"hlinearPow{j}"])
        rewrite_names.extend([f"harg{j}", f"hargNext{j}"])
    lines.append(f"  have hdecayNonneg : (0 : ℝ) ≤ {decay_product} := by positivity")

    if polynomial is None:
        lines.extend([
            f"  have hr0 : ({base} : ℝ) ≠ 0 := by norm_num",
            f"  have hpow0 : (({base} : ℝ) ^ {var}) ≠ 0 := pow_ne_zero _ hr0",
            f"  have hpowNext : (({base} : ℝ) ^ ({var} + 1)) = (({base} : ℝ) ^ {var}) * ({base} : ℝ) := by",
            "    rw [pow_succ']",
            f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = ({base} : ℝ) / {decay_product} := by",
            f"    rw [{', '.join(rewrite_names)}, Nat.factorial_succ, hpowNext]",
            "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one, Nat.cast_pow, mul_pow]",
            f"    field_simp [{', '.join(field_facts + ['hpow0', 'hr0'])}]",
            "    ring",
            "  rw [← norm_div, hquot, norm_div, Real.norm_eq_abs, Real.norm_eq_abs, abs_of_nonneg hdecayNonneg]",
            "  norm_num",
        ])
        return lines

    hpoly_nonzero = _render_nat_eventual_nonzero_term(
        polynomial, var, polynomial_nonzero_from
    )
    if hpoly_nonzero is None:
        raise ValueError("automatic multi-factorial ratio limit is missing a numerator tail certificate")
    hpoly_lines = hpoly_nonzero.splitlines()
    lines.extend([
        f"  have hpoly0 : ({polynomial_expr} : ℝ) ≠ 0 := by",
        f"    exact {hpoly_lines[0]}",
    ])
    lines.extend(f"      {line}" for line in hpoly_lines[1:])

    if ratio_denominator is not None:
        hden_nonzero = _render_nat_eventual_nonzero_term(
            ratio_denominator, var, denominator_nonzero_from, bound_name="hnDen"
        )
        denominator_m_ast = substitute_expr(
            ratio_denominator, var, {"kind": "var", "id": "m"}
        )
        denominator_m_expr = render_expr(denominator_m_ast)
        hden_at_m = _render_nat_eventual_nonzero_term(
            denominator_m_ast, "m", denominator_nonzero_from, bound_name="hm"
        )
        if hden_nonzero is None or hden_at_m is None:
            raise ValueError("automatic multi-factorial ratio limit is missing a denominator tail certificate")
        hden_lines = hden_nonzero.splitlines()
        hden_m_lines = hden_at_m.splitlines()
        lines.extend([
            f"  have hnDen : {denominator_nonzero_from} ≤ {var} := by omega",
            f"  have hnDenNext : {denominator_nonzero_from} ≤ {var} + 1 := by omega",
            f"  have hden0 : ({denominator_expr} : ℝ) ≠ 0 := by",
            f"    exact {hden_lines[0]}",
        ])
        lines.extend(f"      {line}" for line in hden_lines[1:])
        lines.extend([
            f"  have hdenAt : ∀ m : ℕ, {denominator_nonzero_from} ≤ m → ({denominator_m_expr} : ℝ) ≠ 0 := by",
            "    intro m hm",
            f"    exact {hden_m_lines[0]}",
        ])
        lines.extend(f"      {line}" for line in hden_m_lines[1:])
        lines.extend([
            f"  have hdenNext0 : ({denominator_next_expr} : ℝ) ≠ 0 := hdenAt ({var} + 1) hnDenNext",
        ])

    lines.extend([
        f"  let geomCurrent : ℝ := ({geometric_expr} : ℝ)",
        f"  let geomNext : ℝ := ({geometric_next_expr} : ℝ)",
        f"  have hgeomCurrentAbs : |geomCurrent| = (({abs_base} : ℝ) ^ {var}) := by",
        "    dsimp [geomCurrent]",
        f"    exact hgeomAbs {var}",
        f"  have hgeomNextAbs : |geomNext| = (({abs_base} : ℝ) ^ ({var} + 1)) := by",
        "    dsimp [geomNext]",
        f"    exact hgeomAbs ({var} + 1)",
        f"  have htarget0 : ({abs_base} : ℝ) ≠ 0 := by norm_num",
        "  have hgeomCurrentAbs0 : |geomCurrent| ≠ 0 := by",
        "    rw [hgeomCurrentAbs]",
        f"    exact pow_ne_zero {var} htarget0",
        "  have hgeomCurrent0 : geomCurrent ≠ 0 := abs_ne_zero.mp hgeomCurrentAbs0",
    ])

    if ratio_denominator is None:
        rhs = f"((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (geomNext / geomCurrent)) * (1 / {decay_product})"
        extra_facts = ["hpoly0", "hgeomCurrent0"]
    else:
        rhs = f"(((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))) * (geomNext / geomCurrent)) * (1 / {decay_product})"
        extra_facts = ["hpoly0", "hden0", "hdenNext0", "hgeomCurrent0"]
    lines.extend([
        f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = {rhs} := by",
        "    dsimp [geomCurrent, geomNext]",
        f"    rw [{', '.join(rewrite_names)}, Nat.factorial_succ]",
        "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one, Nat.cast_pow, mul_pow]",
        f"    field_simp [{', '.join(field_facts + extra_facts)}]",
        "    ring",
        f"  have hgeomRatio : |geomNext| / |geomCurrent| = ({abs_base} : ℝ) := by",
        "    rw [hgeomNextAbs, hgeomCurrentAbs, pow_succ']",
        f"    field_simp [pow_ne_zero {var} htarget0]",
        "    ring",
        "  rw [← norm_div, hquot]",
        "  simp only [norm_mul, norm_div, Real.norm_eq_abs, norm_one]",
        "  rw [hgeomRatio, abs_of_nonneg hdecayNonneg]",
        "  ring",
    ])
    return lines


def _render_multiple_powered_shifted_factorial_quotient_ratio_limit(
    pattern: SeriesRatioLimitPattern,
    current: str,
    nxt: str,
    var: str,
    base: str,
) -> list[str]:
    """Render a bounded product of powered shifted-factorial quotients.

    Each exact factor ``((n+k)!/(n+m)!)^d`` contributes the checked linear
    successor ratio ``((n+k+1)/(n+m+1))^d -> 1``.  Lean verifies every
    ``Nat.factorial_succ`` recurrence and multiplies those limits before
    combining them with the established polynomial-quotient and exact
    geometric normalization.  No Stirling approximation is used.
    """
    factors = pattern.automatic_ratio_factorial_quotient_factors
    unmatched_numerator_shift = pattern.automatic_ratio_factorial_unmatched_numerator_shift
    unmatched_denominator_shift = pattern.automatic_ratio_factorial_unmatched_denominator_shift
    if unmatched_numerator_shift is not None and unmatched_denominator_shift is not None:
        raise ValueError("automatic factorial ratio cannot have unmatched powers on both sides")
    polynomial = pattern.automatic_ratio_polynomial
    coefficients = pattern.automatic_ratio_polynomial_coefficients
    degree = pattern.automatic_ratio_polynomial_degree
    leading = pattern.automatic_ratio_polynomial_leading_coefficient
    numerator_threshold = pattern.automatic_ratio_polynomial_nonzero_from
    denominator = pattern.automatic_ratio_denominator_polynomial
    denominator_coefficients = pattern.automatic_ratio_denominator_polynomial_coefficients
    denominator_degree = pattern.automatic_ratio_denominator_polynomial_degree
    denominator_leading = pattern.automatic_ratio_denominator_polynomial_leading_coefficient
    denominator_threshold = pattern.automatic_ratio_denominator_polynomial_nonzero_from
    geometric_expression = pattern.automatic_ratio_geometric_expression
    if (
        len(factors) < (1 if (unmatched_numerator_shift is not None or unmatched_denominator_shift is not None) else 2)
        or len(factors) > 8
        or sum(power for _, _, power in factors) > 64
        or pattern.automatic_ratio_base is None
        or polynomial is None
        or coefficients is None
        or degree is None
        or leading is None
        or numerator_threshold is None
        or geometric_expression is None
        or any(not 1 <= power <= 64 for _, _, power in factors)
    ):
        raise ValueError("automatic multiple shifted-factorial quotients are missing exact metadata")
    if denominator is not None and (
        denominator_coefficients is None
        or denominator_degree is None
        or denominator_leading is None
        or denominator_threshold is None
    ):
        raise ValueError("automatic multiple shifted-factorial quotients are missing denominator metadata")

    abs_base = _render_real_fraction(abs(pattern.automatic_ratio_base))
    index = {"kind": "var", "id": var}
    next_index = {"kind": "add", "left": index, "right": {"kind": "int", "value": 1}}
    shifted_coefficients = _shift_polynomial_coefficients(coefficients, 1)
    polynomial_expr = render_expr(polynomial)
    polynomial_next_expr = render_expr(substitute_expr(polynomial, var, next_index))
    geometric_expr = render_expr(geometric_expression)
    geometric_next_expr = render_expr(substitute_expr(geometric_expression, var, next_index))
    geometric_k_expr = render_expr(
        substitute_expr(geometric_expression, var, {"kind": "var", "id": "k"})
    )

    lines: list[str] = []
    poly_lines: list[str] = []
    poly_lines.extend(_render_explicit_polynomial_facts(
        "ratioMultiFactQuotPoly", coefficients, degree, need_leading=True
    ))
    poly_lines.extend(_render_explicit_polynomial_facts(
        "ratioMultiFactQuotNextPoly", shifted_coefficients, degree, need_leading=True
    ))
    lines.extend(f"  {line}" for line in poly_lines)
    lines.extend([
        "  have hpolyDegreesEq : ratioMultiFactQuotNextPoly.degree = ratioMultiFactQuotPoly.degree := by simpa only [hratioMultiFactQuotNextPolyDeg, hratioMultiFactQuotPolyDeg]",
        "  have hpolyReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioMultiFactQuotNextPoly ratioMultiFactQuotPoly hpolyDegreesEq",
        "  simp only [hratioMultiFactQuotNextPolyLead, hratioMultiFactQuotPolyLead] at hpolyReal",
        "  have hpolyReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioMultiFactQuotNextPoly / Polynomial.eval x ratioMultiFactQuotPoly) Filter.atTop (𝓝 1) := by",
        "    simpa using hpolyReal",
        "  have hpolySeq := hpolyReal'.comp tendsto_natCast_atTop_atTop",
        f"  have hpolyRaw : Filter.Tendsto (fun {var} : ℕ => ({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
        "    refine hpolySeq.congr' ?_",
        f"    filter_upwards [] with {var}",
        f"    change (Polynomial.eval ({var} : ℝ) ratioMultiFactQuotNextPoly / Polynomial.eval ({var} : ℝ) ratioMultiFactQuotPoly) = (({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ))",
        "    congr 1",
        "    · simp [ratioMultiFactQuotNextPoly, Nat.cast_add] <;> ring",
        "    · simp [ratioMultiFactQuotPoly] <;> ring",
        f"  have hpolyAbs : Filter.Tendsto (fun {var} : ℕ => |({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
        "    simpa [abs_div] using hpolyRaw.abs",
        f"  have hgeomAbs : ∀ k : ℕ, |({geometric_k_expr} : ℝ)| = (({abs_base} : ℝ) ^ k) := by",
        "    intro k",
        "    norm_num [abs_mul, abs_div, abs_pow, ← mul_pow, ← div_pow]",
    ])

    denominator_expr: str | None = None
    denominator_next_expr: str | None = None
    if denominator is not None:
        assert denominator_coefficients is not None
        assert denominator_degree is not None
        denominator_shifted_coefficients = _shift_polynomial_coefficients(denominator_coefficients, 1)
        denominator_expr = render_expr(denominator)
        denominator_next_expr = render_expr(substitute_expr(denominator, var, next_index))
        den_lines: list[str] = []
        den_lines.extend(_render_explicit_polynomial_facts(
            "ratioMultiFactQuotDenPoly", denominator_coefficients, denominator_degree, need_leading=True
        ))
        den_lines.extend(_render_explicit_polynomial_facts(
            "ratioMultiFactQuotDenNextPoly", denominator_shifted_coefficients, denominator_degree, need_leading=True
        ))
        lines.extend(f"  {line}" for line in den_lines)
        lines.extend([
            "  have hdenDegreesEq : ratioMultiFactQuotDenPoly.degree = ratioMultiFactQuotDenNextPoly.degree := by rw [hratioMultiFactQuotDenPolyDeg, hratioMultiFactQuotDenNextPolyDeg]",
            "  have hdenReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioMultiFactQuotDenPoly ratioMultiFactQuotDenNextPoly hdenDegreesEq",
            "  rw [hratioMultiFactQuotDenPolyLead, hratioMultiFactQuotDenNextPolyLead] at hdenReal",
            "  have hdenReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioMultiFactQuotDenPoly / Polynomial.eval x ratioMultiFactQuotDenNextPoly) Filter.atTop (𝓝 1) := by",
            "    simpa using hdenReal",
            "  have hdenSeq := hdenReal'.comp tendsto_natCast_atTop_atTop",
            f"  have hdenRaw : Filter.Tendsto (fun {var} : ℕ => ({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
            "    refine hdenSeq.congr' ?_",
            f"    filter_upwards [] with {var}",
            f"    change (Polynomial.eval ({var} : ℝ) ratioMultiFactQuotDenPoly / Polynomial.eval ({var} : ℝ) ratioMultiFactQuotDenNextPoly) = (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))",
            "    congr 1",
            "    · simp [ratioMultiFactQuotDenPoly] <;> ring",
            "    · simp [ratioMultiFactQuotDenNextPoly, Nat.cast_add] <;> ring",
            f"  have hdenAbs : Filter.Tendsto (fun {var} : ℕ => |({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
            "    simpa [abs_div] using hdenRaw.abs",
            f"  have hpolyQuotient : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) Filter.atTop (𝓝 1) := by",
            "    simpa using hpolyAbs.mul hdenAbs",
        ])

    factor_rows: list[dict[str, Any]] = []
    factor_ratios: list[str] = []
    factor_limit_names: list[str] = []
    for j, (numerator_shift, denominator_shift, power) in enumerate(factors):
        numerator_plus_one = numerator_shift + 1
        denominator_plus_one = denominator_shift + 1
        delta = _render_real_fraction(Fraction(numerator_shift - denominator_shift))
        linear_ratio = (
            f"((({var} : ℝ) + {numerator_plus_one}) / "
            f"(({var} : ℝ) + {denominator_plus_one}))"
        )
        factor_ratio = linear_ratio if power == 1 else f"({linear_ratio} ^ {power})"
        factor_ratios.append(factor_ratio)
        lines.extend([
            f"  have hdenTopQ{j} : Filter.Tendsto (fun {var} : ℕ => ({var} : ℝ) + {denominator_plus_one}) Filter.atTop Filter.atTop :=",
            f"    tendsto_atTop_add_const_right Filter.atTop ({denominator_plus_one} : ℝ) tendsto_natCast_atTop_atTop",
            f"  have hcorrQ{j} : Filter.Tendsto (fun {var} : ℕ => ({delta} : ℝ) / (({var} : ℝ) + {denominator_plus_one})) Filter.atTop (𝓝 0) := by",
            f"    simpa [one_div] using ((tendsto_const_nhds : Filter.Tendsto (fun _ : ℕ => ({delta} : ℝ)) Filter.atTop (𝓝 ({delta} : ℝ))).div_atTop hdenTopQ{j})",
            f"  have hlinModelQ{j} : Filter.Tendsto (fun {var} : ℕ => (1 : ℝ) + ({delta} : ℝ) / (({var} : ℝ) + {denominator_plus_one})) Filter.atTop (𝓝 1) := by",
            f"    simpa using tendsto_const_nhds.add hcorrQ{j}",
            f"  have hlinQ{j} : Filter.Tendsto (fun {var} : ℕ => {linear_ratio}) Filter.atTop (𝓝 1) := by",
            f"    refine hlinModelQ{j}.congr' ?_",
            f"    filter_upwards [] with {var}",
            f"    have hdenLinearQ{j} : (({var} : ℝ) + {denominator_plus_one}) ≠ 0 := by positivity",
            f"    field_simp [hdenLinearQ{j}]",
            "    ring",
        ])
        limit_name = f"hlinQ{j}"
        if power > 1:
            lines.extend([
                f"  have hlinPowQ{j} : Filter.Tendsto (fun {var} : ℕ => {factor_ratio}) Filter.atTop (𝓝 1) := by",
                f"    simpa using hlinQ{j}.pow {power}",
            ])
            limit_name = f"hlinPowQ{j}"
        factor_limit_names.append(limit_name)
        numerator_arg = var if numerator_shift == 0 else f"({var} + {numerator_shift})"
        denominator_arg = var if denominator_shift == 0 else f"({var} + {denominator_shift})"
        numerator_fact = f"((Nat.factorial {numerator_arg} : ℕ) : ℝ)"
        denominator_fact = f"((Nat.factorial {denominator_arg} : ℕ) : ℝ)"
        numerator_fact_next = f"((Nat.factorial (({numerator_arg}) + 1) : ℕ) : ℝ)"
        denominator_fact_next = f"((Nat.factorial (({denominator_arg}) + 1) : ℕ) : ℝ)"
        numerator_fact_term = numerator_fact if power == 1 else f"({numerator_fact} ^ {power})"
        denominator_fact_term = denominator_fact if power == 1 else f"({denominator_fact} ^ {power})"
        numerator_fact_next_term = numerator_fact_next if power == 1 else f"({numerator_fact_next} ^ {power})"
        denominator_fact_next_term = denominator_fact_next if power == 1 else f"({denominator_fact_next} ^ {power})"
        factor_rows.append({
            "index": j,
            "power": power,
            "numerator_plus_one": numerator_plus_one,
            "denominator_plus_one": denominator_plus_one,
            "numerator_arg": numerator_arg,
            "denominator_arg": denominator_arg,
            "numerator_fact": numerator_fact,
            "denominator_fact": denominator_fact,
            "numerator_fact_next": numerator_fact_next,
            "denominator_fact_next": denominator_fact_next,
            "numerator_fact_term": numerator_fact_term,
            "denominator_fact_term": denominator_fact_term,
            "numerator_fact_next_term": numerator_fact_next_term,
            "denominator_fact_next_term": denominator_fact_next_term,
            "factor_ratio": factor_ratio,
        })

    balanced_factorial_ratio_product = _mul_expr(factor_ratios)
    if len(factor_limit_names) == 1:
        lines.extend([
            f"  have hfactorialBalanced : Filter.Tendsto (fun {var} : ℕ => {balanced_factorial_ratio_product}) Filter.atTop (𝓝 1) := by",
            f"    simpa using {factor_limit_names[0]}",
        ])
    elif len(factor_limit_names) == 2:
        lines.extend([
            f"  have hfactorialBalanced : Filter.Tendsto (fun {var} : ℕ => {balanced_factorial_ratio_product}) Filter.atTop (𝓝 1) := by",
            f"    simpa using {factor_limit_names[0]}.mul {factor_limit_names[1]}",
        ])
    else:
        lines.append(
            f"  have hfactorialBalanced : Filter.Tendsto (fun {var} : ℕ => {balanced_factorial_ratio_product}) Filter.atTop (𝓝 1) := by"
        )
        lines.append(f"    have hprod1 := {factor_limit_names[0]}.mul {factor_limit_names[1]}")
        previous = "hprod1"
        for j in range(2, len(factor_limit_names)):
            name = f"hprodQ{j}"
            lines.append(f"    have {name} := {previous}.mul {factor_limit_names[j]}")
            previous = name
        lines.append(f"    simpa using {previous}")

    residual_ratio: str | None = None
    if unmatched_numerator_shift is not None:
        residual_plus_one = unmatched_numerator_shift + 1
        residual_ratio = f"(({var} : ℝ) + {residual_plus_one})"
        lines.extend([
            f"  have hresidualTop : Filter.Tendsto (fun {var} : ℕ => ({var} : ℝ) + {residual_plus_one}) Filter.atTop Filter.atTop :=",
            f"    tendsto_atTop_add_const_right Filter.atTop ({residual_plus_one} : ℝ) tendsto_natCast_atTop_atTop",
        ])
    elif unmatched_denominator_shift is not None:
        residual_plus_one = unmatched_denominator_shift + 1
        residual_ratio = f"(1 / (({var} : ℝ) + {residual_plus_one}))"
        lines.extend([
            f"  have hresidualTop : Filter.Tendsto (fun {var} : ℕ => ({var} : ℝ) + {residual_plus_one}) Filter.atTop Filter.atTop :=",
            f"    tendsto_atTop_add_const_right Filter.atTop ({residual_plus_one} : ℝ) tendsto_natCast_atTop_atTop",
            f"  have hresidualRecip : Filter.Tendsto (fun {var} : ℕ => {residual_ratio}) Filter.atTop (𝓝 0) := by",
            "    convert hresidualTop.inv_tendsto_atTop using 1",
            f"    funext {var}",
            "    simp [one_div, Pi.inv_apply]",
        ])

    all_factor_ratios = list(factor_ratios)
    if residual_ratio is not None:
        all_factor_ratios.append(residual_ratio)
    factorial_ratio_product = _mul_expr(all_factor_ratios)
    if unmatched_numerator_shift is not None:
        lines.extend([
            f"  have hfactorialProduct : Filter.Tendsto (fun {var} : ℕ => {factorial_ratio_product}) Filter.atTop Filter.atTop := by",
            "    exact hfactorialBalanced.pos_mul_atTop (by norm_num) hresidualTop",
        ])
    elif unmatched_denominator_shift is not None:
        lines.extend([
            f"  have hfactorialProduct : Filter.Tendsto (fun {var} : ℕ => {factorial_ratio_product}) Filter.atTop (𝓝 0) := by",
            "    simpa using hfactorialBalanced.mul hresidualRecip",
        ])
    else:
        lines.extend([
            f"  have hfactorialProduct : Filter.Tendsto (fun {var} : ℕ => {factorial_ratio_product}) Filter.atTop (𝓝 1) := by",
            "    simpa using hfactorialBalanced",
        ])

    lines.extend([
        f"  have hbaseConst : Filter.Tendsto (fun _ : ℕ => ({abs_base} : ℝ)) Filter.atTop (𝓝 ({abs_base} : ℝ)) := tendsto_const_nhds",
    ])
    if denominator is None:
        lines.extend([
            f"  have hpolyGeom : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * ({abs_base} : ℝ)) Filter.atTop (𝓝 ({abs_base} : ℝ)) := by",
            "    simpa using hpolyAbs.mul hbaseConst",
        ])
        model_expr = f"((|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * ({abs_base} : ℝ)) * {factorial_ratio_product}"
    else:
        lines.extend([
            f"  have hpolyGeom : Filter.Tendsto (fun {var} : ℕ => (((|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) * ({abs_base} : ℝ))) Filter.atTop (𝓝 ({abs_base} : ℝ)) := by",
            "    simpa using hpolyQuotient.mul hbaseConst",
        ])
        model_expr = f"((((|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) * ({abs_base} : ℝ)) * {factorial_ratio_product})"

    if unmatched_numerator_shift is not None:
        lines.extend([
            f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => {model_expr}) Filter.atTop Filter.atTop := by",
            "    exact hpolyGeom.pos_mul_atTop (by norm_num) hfactorialProduct",
        ])
    elif unmatched_denominator_shift is not None:
        lines.extend([
            f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => {model_expr}) Filter.atTop (𝓝 0) := by",
            "    simpa using hpolyGeom.mul hfactorialProduct",
        ])
    else:
        lines.extend([
            f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => {model_expr}) Filter.atTop (𝓝 ({abs_base} : ℝ)) := by",
            "    simpa using hpolyGeom.mul hfactorialProduct",
        ])

    combined_threshold = max(
        numerator_threshold,
        denominator_threshold if denominator_threshold is not None else 0,
    )
    hnum_nonzero = _render_nat_eventual_nonzero_term(
        polynomial, var, numerator_threshold, bound_name="hnNum"
    )
    if hnum_nonzero is None:
        raise ValueError("automatic multiple shifted-factorial quotients are missing a numerator tail certificate")
    hnum_lines = hnum_nonzero.splitlines()
    lines.extend([
        "  refine hmodel.congr' ?_",
        f"  filter_upwards [Filter.eventually_ge_atTop {combined_threshold}] with {var} hn",
        f"  have hnNum : {numerator_threshold} ≤ {var} := by omega",
        f"  have hpoly0 : ({polynomial_expr} : ℝ) ≠ 0 := by",
        f"    exact {hnum_lines[0]}",
    ])
    lines.extend(f"      {line}" for line in hnum_lines[1:])

    if denominator is not None:
        assert denominator_threshold is not None
        assert denominator_expr is not None
        assert denominator_next_expr is not None
        hden_nonzero = _render_nat_eventual_nonzero_term(
            denominator, var, denominator_threshold, bound_name="hnDen"
        )
        denominator_m_ast = substitute_expr(denominator, var, {"kind": "var", "id": "m"})
        denominator_m_expr = render_expr(denominator_m_ast)
        hden_at_m = _render_nat_eventual_nonzero_term(
            denominator_m_ast, "m", denominator_threshold, bound_name="hm"
        )
        if hden_nonzero is None or hden_at_m is None:
            raise ValueError("automatic multiple shifted-factorial quotients are missing a denominator tail certificate")
        hden_lines = hden_nonzero.splitlines()
        hden_m_lines = hden_at_m.splitlines()
        lines.extend([
            f"  have hnDen : {denominator_threshold} ≤ {var} := by omega",
            f"  have hnDenNext : {denominator_threshold} ≤ {var} + 1 := by omega",
            f"  have hpolyDen0 : ({denominator_expr} : ℝ) ≠ 0 := by",
            f"    exact {hden_lines[0]}",
        ])
        lines.extend(f"      {line}" for line in hden_lines[1:])
        lines.extend([
            f"  have hpolyDenAt : ∀ m : ℕ, {denominator_threshold} ≤ m → ({denominator_m_expr} : ℝ) ≠ 0 := by",
            "    intro m hm",
            f"    exact {hden_m_lines[0]}",
        ])
        lines.extend(f"      {line}" for line in hden_m_lines[1:])
        lines.extend([
            f"  have hpolyDenNext0 : ({denominator_next_expr} : ℝ) ≠ 0 := by",
            f"    exact hpolyDenAt ({var} + 1) hnDenNext",
        ])

    lines.extend([
        f"  let geomCurrent : ℝ := ({geometric_expr} : ℝ)",
        f"  let geomNext : ℝ := ({geometric_next_expr} : ℝ)",
        f"  have hgeomCurrentAbs : |geomCurrent| = (({abs_base} : ℝ) ^ {var}) := by",
        "    dsimp [geomCurrent]",
        f"    exact hgeomAbs {var}",
        f"  have hgeomNextAbs : |geomNext| = (({abs_base} : ℝ) ^ ({var} + 1)) := by",
        "    dsimp [geomNext]",
        f"    exact hgeomAbs ({var} + 1)",
        f"  have htarget0 : ({abs_base} : ℝ) ≠ 0 := by norm_num",
        "  have hgeomCurrentAbs0 : |geomCurrent| ≠ 0 := by",
        "    rw [hgeomCurrentAbs]",
        f"    exact pow_ne_zero {var} htarget0",
        "  have hgeomCurrent0 : geomCurrent ≠ 0 := abs_ne_zero.mp hgeomCurrentAbs0",
    ])

    current_factor_terms: list[str] = []
    next_factor_terms: list[str] = []
    recurrence_names: list[str] = []
    field_facts: list[str] = ["hgeomCurrent0"]
    factor_nonneg_names: list[str] = []
    for row in factor_rows:
        j = row["index"]
        power = row["power"]
        current_factor_terms.append(f"({row['numerator_fact_term']} / {row['denominator_fact_term']})")
        next_factor_terms.append(f"({row['numerator_fact_next_term']} / {row['denominator_fact_next_term']})")
        lines.extend([
            f"  have hnumFactQ{j} : {row['numerator_fact']} ≠ 0 := by",
            f"    exact_mod_cast (Nat.factorial_ne_zero {row['numerator_arg']})",
            f"  have hdenFactQ{j} : {row['denominator_fact']} ≠ 0 := by",
            f"    exact_mod_cast (Nat.factorial_ne_zero {row['denominator_arg']})",
            f"  have hnumLinearQ{j} : (({var} : ℝ) + {row['numerator_plus_one']}) ≠ 0 := by positivity",
            f"  have hdenLinearQ{j} : (({var} : ℝ) + {row['denominator_plus_one']}) ≠ 0 := by positivity",
            f"  have hnumRecQ{j} : {row['numerator_fact_next']} = (({var} : ℝ) + {row['numerator_plus_one']}) * {row['numerator_fact']} := by",
            "    rw [Nat.factorial_succ]",
            "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one] <;> ring",
            f"  have hdenRecQ{j} : {row['denominator_fact_next']} = (({var} : ℝ) + {row['denominator_plus_one']}) * {row['denominator_fact']} := by",
            "    rw [Nat.factorial_succ]",
            "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one] <;> ring",
        ])
        recurrence_names.extend([f"hnumRecQ{j}", f"hdenRecQ{j}"])
        field_facts.extend([f"hnumFactQ{j}", f"hdenFactQ{j}", f"hnumLinearQ{j}", f"hdenLinearQ{j}"])
        if power > 1:
            lines.extend([
                f"  have hnumFactPowQ{j} : ({row['numerator_fact']} ^ {power}) ≠ 0 := pow_ne_zero _ hnumFactQ{j}",
                f"  have hdenFactPowQ{j} : ({row['denominator_fact']} ^ {power}) ≠ 0 := pow_ne_zero _ hdenFactQ{j}",
            ])
            field_facts.extend([f"hnumFactPowQ{j}", f"hdenFactPowQ{j}"])
        nonneg_name = f"hfactorRatioNonnegQ{j}"
        lines.append(f"  have {nonneg_name} : (0 : ℝ) ≤ {row['factor_ratio']} := by positivity")
        factor_nonneg_names.append(nonneg_name)

    if unmatched_numerator_shift is not None or unmatched_denominator_shift is not None:
        residual_shift = (
            unmatched_numerator_shift
            if unmatched_numerator_shift is not None
            else unmatched_denominator_shift
        )
        assert residual_shift is not None
        residual_plus_one = residual_shift + 1
        residual_arg = var if residual_shift == 0 else f"({var} + {residual_shift})"
        residual_fact = f"((Nat.factorial {residual_arg} : ℕ) : ℝ)"
        residual_fact_next = f"((Nat.factorial (({residual_arg}) + 1) : ℕ) : ℝ)"
        lines.extend([
            f"  have hresidualFact0 : {residual_fact} ≠ 0 := by",
            f"    exact_mod_cast (Nat.factorial_ne_zero {residual_arg})",
            f"  have hresidualLinear0 : (({var} : ℝ) + {residual_plus_one}) ≠ 0 := by positivity",
            f"  have hresidualRec : {residual_fact_next} = (({var} : ℝ) + {residual_plus_one}) * {residual_fact} := by",
            "    rw [Nat.factorial_succ]",
            "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one] <;> ring",
        ])
        recurrence_names.append("hresidualRec")
        field_facts.extend(["hresidualFact0", "hresidualLinear0"])
        if unmatched_numerator_shift is not None:
            current_factor_terms.append(residual_fact)
            next_factor_terms.append(residual_fact_next)
            residual_nonneg = f"((({var} : ℝ) + {residual_plus_one}))"
        else:
            current_factor_terms.append(f"(1 / {residual_fact})")
            next_factor_terms.append(f"(1 / {residual_fact_next})")
            residual_nonneg = f"(1 / (({var} : ℝ) + {residual_plus_one}))"
        lines.append(f"  have hresidualRatioNonneg : (0 : ℝ) ≤ {residual_nonneg} := by positivity")
        factor_nonneg_names.append("hresidualRatioNonneg")
        if unmatched_denominator_shift is not None:
            lines.append(f"  have hresidualLinearNonneg : (0 : ℝ) ≤ (({var} : ℝ) + {residual_plus_one}) := by positivity")

    current_factor_product = _mul_expr(current_factor_terms)
    next_factor_product = _mul_expr(next_factor_terms)
    if denominator is None:
        lines.extend([
            f"  have hcurrentFactor : ({current} : ℝ) = (({polynomial_expr} : ℝ) * geomCurrent) * {current_factor_product} := by",
            "    dsimp [geomCurrent]",
            "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, div_eq_mul_inv, mul_inv, div_pow, mul_pow] <;> ring",
            f"  have hnextFactor : ({nxt} : ℝ) = (({polynomial_next_expr} : ℝ) * geomNext) * {next_factor_product} := by",
            "    dsimp [geomNext]",
            "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, Nat.cast_add, div_eq_mul_inv, mul_inv, div_pow, mul_pow] <;> ring",
        ])
        extra_facts = ["hpoly0", *field_facts]
        rhs = f"((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (geomNext / geomCurrent)) * {factorial_ratio_product}"
    else:
        lines.extend([
            f"  have hcurrentFactor : ({current} : ℝ) = ((({polynomial_expr} : ℝ) / ({denominator_expr} : ℝ)) * geomCurrent) * {current_factor_product} := by",
            "    dsimp [geomCurrent]",
            "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, div_eq_mul_inv, mul_inv, div_pow, mul_pow] <;> ring",
            f"  have hnextFactor : ({nxt} : ℝ) = ((({polynomial_next_expr} : ℝ) / ({denominator_next_expr} : ℝ)) * geomNext) * {next_factor_product} := by",
            "    dsimp [geomNext]",
            "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, Nat.cast_add, div_eq_mul_inv, mul_inv, div_pow, mul_pow] <;> ring",
        ])
        extra_facts = ["hpoly0", "hpolyDen0", "hpolyDenNext0", *field_facts]
        rhs = f"((((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))) * (geomNext / geomCurrent)) * {factorial_ratio_product})"

    final_factor_nonneg_names = factor_nonneg_names
    if unmatched_denominator_shift is not None:
        final_factor_nonneg_names = [name for name in factor_nonneg_names if name != "hresidualRatioNonneg"] + ["hresidualLinearNonneg"]
    lines.extend([
        f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = {rhs} := by",
        f"    simp only [hcurrentFactor, hnextFactor, {', '.join(recurrence_names)}, Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, mul_pow]",
        f"    field_simp [{', '.join(extra_facts)}] <;> ring",
        f"  have hgeomRatio : |geomNext| / |geomCurrent| = ({abs_base} : ℝ) := by",
        "    rw [hgeomNextAbs, hgeomCurrentAbs, pow_succ']",
        f"    field_simp [pow_ne_zero {var} htarget0] <;> ring",
        "  rw [← norm_div, hquot]",
        "  simp only [norm_mul, norm_div, Real.norm_eq_abs, norm_one]",
        f"  rw [hgeomRatio, {', '.join(f'abs_of_nonneg {name}' for name in final_factor_nonneg_names)}]",
        "  ring",
    ])
    return lines


def _render_polynomial_shifted_factorial_quotient_ratio_limit(
    pattern: SeriesRatioLimitPattern,
    current: str,
    nxt: str,
    var: str,
    base: str,
) -> list[str]:
    """Render ``(p(n)/q(n)) * r^n * (n+k)! / (n+m)!`` reconstruction.

    The numerator successor norm ratio tends to one. When ``q`` is present,
    the reverse denominator successor norm ratio ``|q(n)|/|q(n+1)|`` also
    tends to one. The exact factorial quotient contributes
    ``(n+k+1)/(n+m+1) -> 1`` via ``Nat.factorial_succ``. Multiplying those
    checked limits by the kernel-checked norm ratio of the original exact
    geometric product/quotient yields the combined ``|r|``.  A fixed equal
    positive power ``d`` on the numerator/denominator factorial quotient is
    checked by raising the linear factorial contribution to ``d``; no
    Stirling approximation is involved.
    """
    shifts = pattern.automatic_ratio_factorial_quotient_shifts
    factorial_quotient_power = pattern.automatic_ratio_factorial_quotient_power
    polynomial = pattern.automatic_ratio_polynomial
    coefficients = pattern.automatic_ratio_polynomial_coefficients
    degree = pattern.automatic_ratio_polynomial_degree
    leading = pattern.automatic_ratio_polynomial_leading_coefficient
    numerator_threshold = pattern.automatic_ratio_polynomial_nonzero_from
    denominator = pattern.automatic_ratio_denominator_polynomial
    denominator_coefficients = pattern.automatic_ratio_denominator_polynomial_coefficients
    denominator_degree = pattern.automatic_ratio_denominator_polynomial_degree
    denominator_leading = pattern.automatic_ratio_denominator_polynomial_leading_coefficient
    denominator_threshold = pattern.automatic_ratio_denominator_polynomial_nonzero_from
    geometric_expression = pattern.automatic_ratio_geometric_expression
    if (
        shifts is None
        or pattern.automatic_ratio_base is None
        or polynomial is None
        or coefficients is None
        or degree is None
        or leading is None
        or numerator_threshold is None
        or geometric_expression is None
        or not 1 <= factorial_quotient_power <= 64
    ):
        raise ValueError("automatic polynomial shifted-factorial quotient is missing exact metadata")
    if denominator is not None and (
        denominator_coefficients is None
        or denominator_degree is None
        or denominator_leading is None
        or denominator_threshold is None
    ):
        raise ValueError("automatic polynomial-quotient shifted-factorial quotient is missing denominator metadata")

    numerator_shift, denominator_shift = shifts
    numerator_plus_one = numerator_shift + 1
    denominator_plus_one = denominator_shift + 1
    abs_base = _render_real_fraction(abs(pattern.automatic_ratio_base))
    delta = _render_real_fraction(Fraction(numerator_shift - denominator_shift))

    index = {"kind": "var", "id": var}
    next_index = {"kind": "add", "left": index, "right": {"kind": "int", "value": 1}}
    shifted_coefficients = _shift_polynomial_coefficients(coefficients, 1)
    polynomial_expr = render_expr(polynomial)
    polynomial_next_expr = render_expr(substitute_expr(polynomial, var, next_index))
    geometric_expr = render_expr(geometric_expression)
    geometric_next_expr = render_expr(substitute_expr(geometric_expression, var, next_index))
    geometric_k_expr = render_expr(
        substitute_expr(geometric_expression, var, {"kind": "var", "id": "k"})
    )

    numerator_arg = var if numerator_shift == 0 else f"({var} + {numerator_shift})"
    denominator_arg = var if denominator_shift == 0 else f"({var} + {denominator_shift})"
    numerator_fact = f"((Nat.factorial {numerator_arg} : ℕ) : ℝ)"
    denominator_fact = f"((Nat.factorial {denominator_arg} : ℕ) : ℝ)"
    numerator_fact_next = f"((Nat.factorial (({numerator_arg}) + 1) : ℕ) : ℝ)"
    denominator_fact_next = f"((Nat.factorial (({denominator_arg}) + 1) : ℕ) : ℝ)"
    linear_ratio = (
        f"((({var} : ℝ) + {numerator_plus_one}) / "
        f"(({var} : ℝ) + {denominator_plus_one}))"
    )
    factorial_ratio = (
        linear_ratio if factorial_quotient_power == 1
        else f"({linear_ratio} ^ {factorial_quotient_power})"
    )
    numerator_fact_term = (
        numerator_fact if factorial_quotient_power == 1
        else f"({numerator_fact} ^ {factorial_quotient_power})"
    )
    denominator_fact_term = (
        denominator_fact if factorial_quotient_power == 1
        else f"({denominator_fact} ^ {factorial_quotient_power})"
    )
    numerator_fact_next_term = (
        numerator_fact_next if factorial_quotient_power == 1
        else f"({numerator_fact_next} ^ {factorial_quotient_power})"
    )
    denominator_fact_next_term = (
        denominator_fact_next if factorial_quotient_power == 1
        else f"({denominator_fact_next} ^ {factorial_quotient_power})"
    )

    lines: list[str] = []
    poly_lines: list[str] = []
    poly_lines.extend(_render_explicit_polynomial_facts(
        "ratioFactQuotPoly", coefficients, degree, need_leading=True
    ))
    poly_lines.extend(_render_explicit_polynomial_facts(
        "ratioFactQuotNextPoly", shifted_coefficients, degree, need_leading=True
    ))
    lines.extend(f"  {line}" for line in poly_lines)
    lines.extend([
        "  have hpolyDegreesEq : ratioFactQuotNextPoly.degree = ratioFactQuotPoly.degree := by rw [hratioFactQuotNextPolyDeg, hratioFactQuotPolyDeg]",
        "  have hpolyReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioFactQuotNextPoly ratioFactQuotPoly hpolyDegreesEq",
        "  rw [hratioFactQuotNextPolyLead, hratioFactQuotPolyLead] at hpolyReal",
        "  have hpolyReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioFactQuotNextPoly / Polynomial.eval x ratioFactQuotPoly) Filter.atTop (𝓝 1) := by",
        "    simpa using hpolyReal",
        "  have hpolySeq := hpolyReal'.comp tendsto_natCast_atTop_atTop",
        f"  have hpolyRaw : Filter.Tendsto (fun {var} : ℕ => ({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
        "    refine hpolySeq.congr' ?_",
        f"    filter_upwards [] with {var}",
        f"    change (Polynomial.eval ({var} : ℝ) ratioFactQuotNextPoly / Polynomial.eval ({var} : ℝ) ratioFactQuotPoly) = (({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ))",
        "    congr 1",
        "    · simp [ratioFactQuotNextPoly, Nat.cast_add] <;> ring",
        "    · simp [ratioFactQuotPoly] <;> ring",
        f"  have hpolyAbs : Filter.Tendsto (fun {var} : ℕ => |({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
        "    simpa [abs_div] using hpolyRaw.abs",
        f"  have hgeomAbs : ∀ k : ℕ, |({geometric_k_expr} : ℝ)| = (({abs_base} : ℝ) ^ k) := by",
        "    intro k",
        "    norm_num [abs_mul, abs_div, abs_pow, ← mul_pow, ← div_pow]",
    ])

    denominator_expr: str | None = None
    denominator_next_expr: str | None = None
    if denominator is not None:
        assert denominator_coefficients is not None
        assert denominator_degree is not None
        denominator_shifted_coefficients = _shift_polynomial_coefficients(denominator_coefficients, 1)
        denominator_expr = render_expr(denominator)
        denominator_next_expr = render_expr(substitute_expr(denominator, var, next_index))
        den_lines: list[str] = []
        den_lines.extend(_render_explicit_polynomial_facts(
            "ratioFactQuotDenPoly", denominator_coefficients, denominator_degree, need_leading=True
        ))
        den_lines.extend(_render_explicit_polynomial_facts(
            "ratioFactQuotDenNextPoly", denominator_shifted_coefficients, denominator_degree, need_leading=True
        ))
        lines.extend(f"  {line}" for line in den_lines)
        lines.extend([
            "  have hdenDegreesEq : ratioFactQuotDenPoly.degree = ratioFactQuotDenNextPoly.degree := by rw [hratioFactQuotDenPolyDeg, hratioFactQuotDenNextPolyDeg]",
            "  have hdenReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioFactQuotDenPoly ratioFactQuotDenNextPoly hdenDegreesEq",
            "  rw [hratioFactQuotDenPolyLead, hratioFactQuotDenNextPolyLead] at hdenReal",
            "  have hdenReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioFactQuotDenPoly / Polynomial.eval x ratioFactQuotDenNextPoly) Filter.atTop (𝓝 1) := by",
            "    simpa using hdenReal",
            "  have hdenSeq := hdenReal'.comp tendsto_natCast_atTop_atTop",
            f"  have hdenRaw : Filter.Tendsto (fun {var} : ℕ => ({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
            "    refine hdenSeq.congr' ?_",
            f"    filter_upwards [] with {var}",
            f"    change (Polynomial.eval ({var} : ℝ) ratioFactQuotDenPoly / Polynomial.eval ({var} : ℝ) ratioFactQuotDenNextPoly) = (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))",
            "    congr 1",
            "    · simp [ratioFactQuotDenPoly] <;> ring",
            "    · simp [ratioFactQuotDenNextPoly, Nat.cast_add] <;> ring",
            f"  have hdenAbs : Filter.Tendsto (fun {var} : ℕ => |({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
            "    simpa [abs_div] using hdenRaw.abs",
            f"  have hpolyQuotient : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) Filter.atTop (𝓝 1) := by",
            "    simpa using hpolyAbs.mul hdenAbs",
        ])

    lines.extend([
        f"  have hdenTop : Filter.Tendsto (fun {var} : ℕ => ({var} : ℝ) + {denominator_plus_one}) Filter.atTop Filter.atTop :=",
        f"    tendsto_atTop_add_const_right Filter.atTop ({denominator_plus_one} : ℝ) tendsto_natCast_atTop_atTop",
        f"  have hcorr : Filter.Tendsto (fun {var} : ℕ => ({delta} : ℝ) / (({var} : ℝ) + {denominator_plus_one})) Filter.atTop (𝓝 0) :=",
        "    tendsto_const_nhds.div_atTop hdenTop",
        f"  have hlinModel : Filter.Tendsto (fun {var} : ℕ => (1 : ℝ) + ({delta} : ℝ) / (({var} : ℝ) + {denominator_plus_one})) Filter.atTop (𝓝 1) := by",
        "    simpa using tendsto_const_nhds.add hcorr",
        f"  have hlin : Filter.Tendsto (fun {var} : ℕ => {linear_ratio}) Filter.atTop (𝓝 1) := by",
        "    refine hlinModel.congr' ?_",
        f"    filter_upwards [] with {var}",
        f"    have hden0 : (({var} : ℝ) + {denominator_plus_one}) ≠ 0 := by positivity",
        "    field_simp [hden0]",
        "    ring",
    ])
    factorial_limit_name = "hlin"
    if factorial_quotient_power > 1:
        lines.extend([
            f"  have hlinPow : Filter.Tendsto (fun {var} : ℕ => {factorial_ratio}) Filter.atTop (𝓝 1) := by",
            f"    simpa using hlin.pow {factorial_quotient_power}",
        ])
        factorial_limit_name = "hlinPow"
    lines.extend([
        f"  have hbaseConst : Filter.Tendsto (fun _ : ℕ => ({abs_base} : ℝ)) Filter.atTop (𝓝 ({abs_base} : ℝ)) := tendsto_const_nhds",
    ])
    if denominator is None:
        lines.extend([
            f"  have hpolyGeom : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * ({abs_base} : ℝ)) Filter.atTop (𝓝 ({abs_base} : ℝ)) := by",
            "    simpa using hpolyAbs.mul hbaseConst",
            f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => ((|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * ({abs_base} : ℝ)) * {factorial_ratio}) Filter.atTop (𝓝 ({abs_base} : ℝ)) := by",
            f"    simpa using hpolyGeom.mul {factorial_limit_name}",
        ])
    else:
        lines.extend([
            f"  have hpolyGeom : Filter.Tendsto (fun {var} : ℕ => (((|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) * ({abs_base} : ℝ))) Filter.atTop (𝓝 ({abs_base} : ℝ)) := by",
            "    simpa using hpolyQuotient.mul hbaseConst",
            f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => ((((|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) * ({abs_base} : ℝ)) * {factorial_ratio})) Filter.atTop (𝓝 ({abs_base} : ℝ)) := by",
            f"    simpa using hpolyGeom.mul {factorial_limit_name}",
        ])

    combined_threshold = max(
        numerator_threshold,
        denominator_threshold if denominator_threshold is not None else 0,
    )
    hnum_nonzero = _render_nat_eventual_nonzero_term(
        polynomial, var, numerator_threshold, bound_name="hnNum"
    )
    if hnum_nonzero is None:
        raise ValueError("automatic polynomial shifted-factorial quotient is missing a numerator tail certificate")
    hnum_lines = hnum_nonzero.splitlines()
    lines.extend([
        "  refine hmodel.congr' ?_",
        f"  filter_upwards [Filter.eventually_ge_atTop {combined_threshold}] with {var} hn",
        f"  have hnNum : {numerator_threshold} ≤ {var} := by omega",
        f"  have hpoly0 : ({polynomial_expr} : ℝ) ≠ 0 := by",
        f"    exact {hnum_lines[0]}",
    ])
    lines.extend(f"      {line}" for line in hnum_lines[1:])

    if denominator is not None:
        assert denominator_threshold is not None
        assert denominator_expr is not None
        assert denominator_next_expr is not None
        hden_nonzero = _render_nat_eventual_nonzero_term(
            denominator, var, denominator_threshold, bound_name="hnDen"
        )
        denominator_m_ast = substitute_expr(denominator, var, {"kind": "var", "id": "m"})
        denominator_m_expr = render_expr(denominator_m_ast)
        hden_at_m = _render_nat_eventual_nonzero_term(
            denominator_m_ast, "m", denominator_threshold, bound_name="hm"
        )
        if hden_nonzero is None or hden_at_m is None:
            raise ValueError("automatic polynomial-quotient shifted-factorial quotient is missing a denominator tail certificate")
        hden_lines = hden_nonzero.splitlines()
        hden_m_lines = hden_at_m.splitlines()
        lines.extend([
            f"  have hnDen : {denominator_threshold} ≤ {var} := by omega",
            f"  have hnDenNext : {denominator_threshold} ≤ {var} + 1 := by omega",
            f"  have hpolyDen0 : ({denominator_expr} : ℝ) ≠ 0 := by",
            f"    exact {hden_lines[0]}",
        ])
        lines.extend(f"      {line}" for line in hden_lines[1:])
        lines.extend([
            f"  have hpolyDenAt : ∀ m : ℕ, {denominator_threshold} ≤ m → ({denominator_m_expr} : ℝ) ≠ 0 := by",
            "    intro m hm",
            f"    exact {hden_m_lines[0]}",
        ])
        lines.extend(f"      {line}" for line in hden_m_lines[1:])
        lines.extend([
            f"  have hpolyDenNext0 : ({denominator_next_expr} : ℝ) ≠ 0 := by",
            f"    exact hpolyDenAt ({var} + 1) hnDenNext",
        ])

    lines.extend([
        f"  let geomCurrent : ℝ := ({geometric_expr} : ℝ)",
        f"  let geomNext : ℝ := ({geometric_next_expr} : ℝ)",
        f"  have hgeomCurrentAbs : |geomCurrent| = (({abs_base} : ℝ) ^ {var}) := by",
        "    dsimp [geomCurrent]",
        f"    exact hgeomAbs {var}",
        f"  have hgeomNextAbs : |geomNext| = (({abs_base} : ℝ) ^ ({var} + 1)) := by",
        "    dsimp [geomNext]",
        f"    exact hgeomAbs ({var} + 1)",
        f"  have htarget0 : ({abs_base} : ℝ) ≠ 0 := by norm_num",
        "  have hgeomCurrentAbs0 : |geomCurrent| ≠ 0 := by",
        "    rw [hgeomCurrentAbs]",
        f"    exact pow_ne_zero {var} htarget0",
        "  have hgeomCurrent0 : geomCurrent ≠ 0 := abs_ne_zero.mp hgeomCurrentAbs0",
        f"  have hnumFact0 : {numerator_fact} ≠ 0 := by",
        f"    exact_mod_cast (Nat.factorial_ne_zero {numerator_arg})",
        f"  have hdenFact0 : {denominator_fact} ≠ 0 := by",
        f"    exact_mod_cast (Nat.factorial_ne_zero {denominator_arg})",
        f"  have hnumLinear0 : (({var} : ℝ) + {numerator_plus_one}) ≠ 0 := by positivity",
        f"  have hdenLinear0 : (({var} : ℝ) + {denominator_plus_one}) ≠ 0 := by positivity",
    ])
    if denominator is None:
        lines.extend([
            f"  have hcurrentFactor : ({current} : ℝ) = (({polynomial_expr} : ℝ) * geomCurrent * {numerator_fact_term}) / {denominator_fact_term} := by",
            "    dsimp [geomCurrent]",
            "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, div_eq_mul_inv, mul_inv] <;> ring",
            f"  have hnextFactor : ({nxt} : ℝ) = (({polynomial_next_expr} : ℝ) * geomNext * {numerator_fact_next_term}) / {denominator_fact_next_term} := by",
            "    dsimp [geomNext]",
            "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, Nat.cast_add, div_eq_mul_inv, mul_inv] <;> ring",
        ])
    else:
        lines.extend([
            f"  have hcurrentFactor : ({current} : ℝ) = ((({polynomial_expr} : ℝ) / ({denominator_expr} : ℝ)) * geomCurrent * {numerator_fact_term}) / {denominator_fact_term} := by",
            "    dsimp [geomCurrent]",
            "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, div_eq_mul_inv, mul_inv] <;> ring",
            f"  have hnextFactor : ({nxt} : ℝ) = ((({polynomial_next_expr} : ℝ) / ({denominator_next_expr} : ℝ)) * geomNext * {numerator_fact_next_term}) / {denominator_fact_next_term} := by",
            "    dsimp [geomNext]",
            "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, Nat.cast_add, div_eq_mul_inv, mul_inv] <;> ring",
        ])
    lines.extend([
        f"  have hnumRec : {numerator_fact_next} = (({var} : ℝ) + {numerator_plus_one}) * {numerator_fact} := by",
        "    rw [Nat.factorial_succ]",
        "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one]",
        "    ring",
        f"  have hdenRec : {denominator_fact_next} = (({var} : ℝ) + {denominator_plus_one}) * {denominator_fact} := by",
        "    rw [Nat.factorial_succ]",
        "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one]",
        "    ring",
    ])
    factorial_rewrite_lines = []
    if factorial_quotient_power > 1:
        factorial_rewrite_lines.append("    simp only [mul_pow]")
    if denominator is None:
        lines.extend([
            f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = ((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (geomNext / geomCurrent)) * {factorial_ratio} := by",
            "    rw [hcurrentFactor, hnextFactor, hnumRec, hdenRec]",
            *factorial_rewrite_lines,
            "    field_simp [hpoly0, hgeomCurrent0, hnumFact0, hdenFact0, hnumLinear0, hdenLinear0]",
            "    ring",
        ])
    else:
        lines.extend([
            f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = ((((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))) * (geomNext / geomCurrent)) * {factorial_ratio}) := by",
            "    rw [hcurrentFactor, hnextFactor, hnumRec, hdenRec]",
            *factorial_rewrite_lines,
            "    field_simp [hpoly0, hpolyDen0, hpolyDenNext0, hgeomCurrent0, hnumFact0, hdenFact0, hnumLinear0, hdenLinear0]",
            "    ring",
        ])
    lines.extend([
        f"  have hgeomRatio : |geomNext| / |geomCurrent| = ({abs_base} : ℝ) := by",
        "    rw [hgeomNextAbs, hgeomCurrentAbs, pow_succ']",
        f"    field_simp [pow_ne_zero {var} htarget0]",
        "    ring",
    ])
    factorial_nonneg_name = "hlinNonneg"
    if factorial_quotient_power == 1:
        lines.append(f"  have hlinNonneg : (0 : ℝ) ≤ {linear_ratio} := by positivity")
    else:
        factorial_nonneg_name = "hlinPowNonneg"
        lines.append(f"  have hlinPowNonneg : (0 : ℝ) ≤ {factorial_ratio} := by positivity")
    lines.extend([
        "  rw [← norm_div, hquot]",
        "  simp only [norm_mul, norm_div, Real.norm_eq_abs, norm_one]",
        f"  rw [hgeomRatio, abs_of_nonneg {factorial_nonneg_name}]",
        "  ring",
    ])
    return lines

def _render_shifted_factorial_quotient_ratio_limit(
    pattern: SeriesRatioLimitPattern,
    current: str,
    nxt: str,
    var: str,
    base: str,
) -> list[str]:
    """Render the exact ratio limit for ``c*r^n*(n+k)!/(n+m)!``.

    This deliberately avoids Stirling. Two ``Nat.factorial_succ`` rewrites
    show that the factorial contribution to the successive quotient is
    ``(n+k+1)/(n+m+1)``, which tends to one. The geometric contribution is
    the constant ``|r|``.
    """
    shifts = pattern.automatic_ratio_factorial_quotient_shifts
    coefficient = pattern.automatic_ratio_factorial_quotient_coefficient
    if shifts is None or coefficient is None or pattern.automatic_ratio_base is None:
        raise ValueError("automatic shifted-factorial quotient is missing exact metadata")
    numerator_shift, denominator_shift = shifts
    numerator_plus_one = numerator_shift + 1
    denominator_plus_one = denominator_shift + 1
    coefficient_real = _render_real_fraction(coefficient)
    abs_base = _render_real_fraction(abs(pattern.automatic_ratio_base))
    delta = _render_real_fraction(Fraction(numerator_shift - denominator_shift))

    numerator_arg = var if numerator_shift == 0 else f"({var} + {numerator_shift})"
    denominator_arg = var if denominator_shift == 0 else f"({var} + {denominator_shift})"
    numerator_fact = f"((Nat.factorial {numerator_arg} : ℕ) : ℝ)"
    denominator_fact = f"((Nat.factorial {denominator_arg} : ℕ) : ℝ)"
    numerator_fact_next = f"((Nat.factorial (({numerator_arg}) + 1) : ℕ) : ℝ)"
    denominator_fact_next = f"((Nat.factorial (({denominator_arg}) + 1) : ℕ) : ℝ)"
    linear_ratio = (
        f"((({var} : ℝ) + {numerator_plus_one}) / "
        f"(({var} : ℝ) + {denominator_plus_one}))"
    )

    return [
        f"  have hdenTop : Filter.Tendsto (fun {var} : ℕ => ({var} : ℝ) + {denominator_plus_one}) Filter.atTop Filter.atTop :=",
        f"    tendsto_atTop_add_const_right Filter.atTop ({denominator_plus_one} : ℝ) tendsto_natCast_atTop_atTop",
        f"  have hcorr : Filter.Tendsto (fun {var} : ℕ => ({delta} : ℝ) / (({var} : ℝ) + {denominator_plus_one})) Filter.atTop (𝓝 0) :=",
        "    tendsto_const_nhds.div_atTop hdenTop",
        f"  have hlinModel : Filter.Tendsto (fun {var} : ℕ => (1 : ℝ) + ({delta} : ℝ) / (({var} : ℝ) + {denominator_plus_one})) Filter.atTop (𝓝 1) := by",
        "    simpa using tendsto_const_nhds.add hcorr",
        f"  have hlin : Filter.Tendsto (fun {var} : ℕ => {linear_ratio}) Filter.atTop (𝓝 1) := by",
        "    refine hlinModel.congr' ?_",
        f"    filter_upwards [] with {var}",
        f"    have hden0 : (({var} : ℝ) + {denominator_plus_one}) ≠ 0 := by positivity",
        "    field_simp [hden0]",
        "    ring",
        f"  have hbaseConst : Filter.Tendsto (fun _ : ℕ => ({abs_base} : ℝ)) Filter.atTop (𝓝 ({abs_base} : ℝ)) := tendsto_const_nhds",
        f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => ({abs_base} : ℝ) * {linear_ratio}) Filter.atTop (𝓝 ({abs_base} : ℝ)) := by",
        "    simpa using hbaseConst.mul hlin",
        "  refine hmodel.congr' ?_",
        f"  filter_upwards [] with {var}",
        f"  have hcoeff0 : ({coefficient_real} : ℝ) ≠ 0 := by norm_num",
        f"  have hr0 : ({base} : ℝ) ≠ 0 := by norm_num",
        f"  have hpow0 : (({base} : ℝ) ^ {var}) ≠ 0 := pow_ne_zero _ hr0",
        f"  have hnumFact0 : {numerator_fact} ≠ 0 := by",
        f"    exact_mod_cast (Nat.factorial_ne_zero {numerator_arg})",
        f"  have hdenFact0 : {denominator_fact} ≠ 0 := by",
        f"    exact_mod_cast (Nat.factorial_ne_zero {denominator_arg})",
        f"  have hnumLinear0 : (({var} : ℝ) + {numerator_plus_one}) ≠ 0 := by positivity",
        f"  have hdenLinear0 : (({var} : ℝ) + {denominator_plus_one}) ≠ 0 := by positivity",
        f"  have hcurrentFactor : ({current} : ℝ) = (({coefficient_real} : ℝ) * (({base} : ℝ) ^ {var}) * {numerator_fact}) / {denominator_fact} := by",
        "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, div_eq_mul_inv, mul_inv] <;> ring",
        f"  have hnextFactor : ({nxt} : ℝ) = (({coefficient_real} : ℝ) * (({base} : ℝ) ^ ({var} + 1)) * {numerator_fact_next}) / {denominator_fact_next} := by",
        "    simp [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm, Nat.cast_add, div_eq_mul_inv, mul_inv] <;> ring",
        f"  have hpowNext : (({base} : ℝ) ^ ({var} + 1)) = (({base} : ℝ) ^ {var}) * ({base} : ℝ) := by",
        "    rw [pow_succ']",
        f"  have hnumRec : {numerator_fact_next} = (({var} : ℝ) + {numerator_plus_one}) * {numerator_fact} := by",
        "    rw [Nat.factorial_succ]",
        "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one]",
        "    ring",
        f"  have hdenRec : {denominator_fact_next} = (({var} : ℝ) + {denominator_plus_one}) * {denominator_fact} := by",
        "    rw [Nat.factorial_succ]",
        "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one]",
        "    ring",
        f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = ({base} : ℝ) * {linear_ratio} := by",
        "    rw [hcurrentFactor, hnextFactor, hnumRec, hdenRec, hpowNext]",
        "    field_simp [hcoeff0, hr0, hpow0, hnumFact0, hdenFact0, hnumLinear0, hdenLinear0]",
        "    ring",
        f"  have hlinNonneg : (0 : ℝ) ≤ {linear_ratio} := by positivity",
        "  rw [← norm_div, hquot, norm_mul, Real.norm_eq_abs, abs_of_nonneg hlinNonneg]",
        "  norm_num",
    ]


def _render_series_ratio_limit_test(pattern: SeriesRatioLimitPattern, request: dict[str, Any]) -> list[str]:
    names = _premise_name_map(request)
    var = pattern.variable
    index = {"kind": "var", "id": var}
    next_index = {"kind": "add", "left": index, "right": {"kind": "int", "value": 1}}
    current = render_expr(substitute_expr(pattern.expression, var, index))
    nxt = render_expr(substitute_expr(pattern.expression, var, next_index))
    unbounded_ratio = pattern.automatic_ratio_factorial_ratio_unbounded
    if unbounded_ratio:
        if pattern.limit is not None or pattern.result_kind != "not_summable":
            raise ValueError("unbounded automatic ratio metadata is inconsistent")
        target = None
        lines = [
            f"have hratioTop : Filter.Tendsto (fun {var} : ℕ => ‖({nxt} : ℝ)‖ / ‖({current} : ℝ)‖) Filter.atTop Filter.atTop := by",
        ]
    else:
        if pattern.limit is None:
            raise ValueError("finite quotient-limit ratio test is missing its limit")
        target = _render_real_fraction(pattern.limit)
        lines = [
            f"have hratio : Filter.Tendsto (fun {var} : ℕ => ‖({nxt} : ℝ)‖ / ‖({current} : ℝ)‖) Filter.atTop (𝓝 ({target} : ℝ)) := by",
        ]
    if pattern.limit_premise_id is not None:
        limit_name = names[pattern.limit_premise_id]
        lines.append(f"  simpa [Real.norm_eq_abs] using {limit_name}")
    else:
        base = _render_real_fraction(pattern.automatic_ratio_base)
        geometric_expression = pattern.automatic_ratio_geometric_expression
        polynomial = pattern.automatic_ratio_polynomial
        coefficients = pattern.automatic_ratio_polynomial_coefficients
        degree = pattern.automatic_ratio_polynomial_degree
        leading = pattern.automatic_ratio_polynomial_leading_coefficient
        polynomial_nonzero_from = pattern.automatic_ratio_polynomial_nonzero_from
        factorial_factors = pattern.automatic_ratio_factorial_factors or ((
            pattern.automatic_ratio_factorial_shift, pattern.automatic_ratio_factorial_power
        ),)
        direct_factorial_terms = _factorial_product_terms(pattern.expression.get("right", {}), var)
        direct_factorial_factors = (
            tuple((shift, power) for shift, power, _ in direct_factorial_terms)
            if direct_factorial_terms is not None else None
        )
        use_normalized_factorial_renderer = (
            len(factorial_factors) > 1
            or direct_factorial_factors != factorial_factors
        )
        if pattern.automatic_ratio_factorial_quotient_factors:
            lines.extend(_render_multiple_powered_shifted_factorial_quotient_ratio_limit(
                pattern, current, nxt, var, base
            ))
        elif pattern.automatic_ratio_factorial_quotient_shifts is not None:
            if pattern.automatic_ratio_polynomial is not None:
                lines.extend(_render_polynomial_shifted_factorial_quotient_ratio_limit(
                    pattern, current, nxt, var, base
                ))
            else:
                lines.extend(_render_shifted_factorial_quotient_ratio_limit(
                    pattern, current, nxt, var, base
                ))
        elif pattern.automatic_ratio_factorial and use_normalized_factorial_renderer:
            abs_base = _render_real_fraction(abs(pattern.automatic_ratio_base))
            lines.extend(_render_multiple_factorial_ratio_limit(
                pattern, current, nxt, var, index, next_index, base, abs_base,
                polynomial, coefficients, degree, leading, polynomial_nonzero_from,
                geometric_expression,
            ))
        elif pattern.automatic_ratio_factorial:
            abs_base = _render_real_fraction(abs(pattern.automatic_ratio_base))
            shift = pattern.automatic_ratio_factorial_shift
            factorial_power = pattern.automatic_ratio_factorial_power
            shift_plus_one = shift + 1
            factorial_denominator = pattern.expression.get("right", {})
            factorial_denominator_was_power = factorial_denominator.get("kind") == "pow"
            if factorial_denominator.get("kind") == "factorial":
                factorial = factorial_denominator
            elif (
                factorial_denominator.get("kind") == "pow"
                and factorial_denominator.get("exponent") == factorial_power
                and factorial_denominator.get("base", {}).get("kind") == "factorial"
            ):
                factorial = factorial_denominator.get("base", {})
            else:
                raise ValueError("automatic factorial ratio limit is missing its factorial denominator")
            factorial_arg = factorial.get("arg", {})
            current_factorial_arg = render_expr(substitute_expr(factorial_arg, var, index))
            next_factorial_arg = render_expr(substitute_expr(factorial_arg, var, next_index))
            canonical_factorial_arg = var if shift == 0 else f"({var} + {shift})"
            factorial_current_real = f"((Nat.factorial {current_factorial_arg} : ℕ) : ℝ)"
            factorial_next_real = f"((Nat.factorial {next_factorial_arg} : ℕ) : ℝ)"
            factorial_canonical_real = f"((Nat.factorial {canonical_factorial_arg} : ℕ) : ℝ)"
            if factorial_power > 1:
                factorial_current_real = f"({factorial_current_real} ^ {factorial_power})"
                factorial_next_real = f"({factorial_next_real} ^ {factorial_power})"
            factorial_decay_denominator = f"(({var} : ℝ) + {shift_plus_one})"
            if factorial_power > 1:
                factorial_decay_denominator = f"({factorial_decay_denominator} ^ {factorial_power})"

            if polynomial is None:
                if factorial_power == 1 and not factorial_denominator_was_power:
                    lines.extend([
                        f"  have hden : Filter.Tendsto (fun {var} : ℕ => ({var} : ℝ) + {shift_plus_one}) Filter.atTop Filter.atTop :=",
                        f"    tendsto_atTop_add_const_right Filter.atTop ({shift_plus_one} : ℝ) tendsto_natCast_atTop_atTop",
                        f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => ({abs_base} : ℝ) / (({var} : ℝ) + {shift_plus_one})) Filter.atTop (𝓝 0) :=",
                        "    tendsto_const_nhds.div_atTop hden",
                        "  refine hmodel.congr' ?_",
                        f"  filter_upwards [] with {var}",
                        f"  have hr0 : ({base} : ℝ) ≠ 0 := by norm_num",
                        f"  have harg : {current_factorial_arg} = {canonical_factorial_arg} := by omega",
                        f"  have hargNext : {next_factorial_arg} = ({canonical_factorial_arg}) + 1 := by omega",
                        f"  have hfact0 : ((Nat.factorial {canonical_factorial_arg} : ℕ) : ℝ) ≠ 0 := by",
                        f"    exact_mod_cast (Nat.factorial_ne_zero {canonical_factorial_arg})",
                        f"  have hpow0 : (({base} : ℝ) ^ {var}) ≠ 0 := pow_ne_zero _ hr0",
                        f"  have hnShift : (({var} : ℝ) + {shift_plus_one}) ≠ 0 := by positivity",
                        f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = ({base} : ℝ) / (({var} : ℝ) + {shift_plus_one}) := by",
                        "    rw [harg, hargNext, Nat.factorial_succ, pow_succ']",
                        "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one]",
                        "    field_simp [hfact0, hpow0, hr0, hnShift]",
                        "    ring",
                        f"  have hnShiftNonneg : (0 : ℝ) ≤ ({var} : ℝ) + {shift_plus_one} := by positivity",
                        "  rw [← norm_div, hquot, norm_div, Real.norm_eq_abs, Real.norm_eq_abs, abs_of_nonneg hnShiftNonneg]",
                        "  norm_num",
                    ])
                else:
                    lines.extend([
                        f"  have hden : Filter.Tendsto (fun {var} : ℕ => ({var} : ℝ) + {shift_plus_one}) Filter.atTop Filter.atTop :=",
                        f"    tendsto_atTop_add_const_right Filter.atTop ({shift_plus_one} : ℝ) tendsto_natCast_atTop_atTop",
                        f"  have hrecip : Filter.Tendsto (fun {var} : ℕ => 1 / (({var} : ℝ) + {shift_plus_one})) Filter.atTop (𝓝 0) :=",
                        "    tendsto_const_nhds.div_atTop hden",
                        f"  have hrecipPow : Filter.Tendsto (fun {var} : ℕ => (1 / (({var} : ℝ) + {shift_plus_one})) ^ {factorial_power}) Filter.atTop (𝓝 0) := by",
                        f"    simpa using hrecip.pow {factorial_power}",
                        f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => ({abs_base} : ℝ) / {factorial_decay_denominator}) Filter.atTop (𝓝 0) := by",
                        "    have h := tendsto_const_nhds.mul hrecipPow",
                        "    simpa [div_eq_mul_inv, inv_pow] using h",
                        "  refine hmodel.congr' ?_",
                        f"  filter_upwards [] with {var}",
                        f"  have hr0 : ({base} : ℝ) ≠ 0 := by norm_num",
                        f"  have harg : {current_factorial_arg} = {canonical_factorial_arg} := by omega",
                        f"  have hargNext : {next_factorial_arg} = ({canonical_factorial_arg}) + 1 := by omega",
                        f"  have hfact0 : {factorial_canonical_real} ≠ 0 := by",
                        f"    exact_mod_cast (Nat.factorial_ne_zero {canonical_factorial_arg})",
                        f"  have hfactPow0 : ({factorial_canonical_real} ^ {factorial_power}) ≠ 0 := pow_ne_zero _ hfact0",
                        f"  have hpow0 : (({base} : ℝ) ^ {var}) ≠ 0 := pow_ne_zero _ hr0",
                        f"  have hnShift : (({var} : ℝ) + {shift_plus_one}) ≠ 0 := by positivity",
                        f"  have hnShiftPow : {factorial_decay_denominator} ≠ 0 := pow_ne_zero _ hnShift",
                        f"  have hcurrentFactor : ({current} : ℝ) = (({base} : ℝ) ^ {var}) / {factorial_current_real} := by",
                        "    simp [Nat.cast_pow]",
                        f"  have hnextFactor : ({nxt} : ℝ) = (({base} : ℝ) ^ ({var} + 1)) / {factorial_next_real} := by",
                        "    simp [Nat.cast_add, Nat.cast_pow]",
                        f"  have hpowNext : (({base} : ℝ) ^ ({var} + 1)) = (({base} : ℝ) ^ {var}) * ({base} : ℝ) := by",
                        "    rw [pow_succ']",
                        f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = ({base} : ℝ) / {factorial_decay_denominator} := by",
                        "    rw [hcurrentFactor, hnextFactor, harg, hargNext, Nat.factorial_succ, hpowNext]",
                        "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one, mul_pow]",
                        "    field_simp [hfact0, hfactPow0, hpow0, hr0, hnShift, hnShiftPow]",
                        "    ring",
                        f"  have hnShiftNonneg : (0 : ℝ) ≤ ({var} : ℝ) + {shift_plus_one} := by positivity",
                        f"  have hnShiftPowNonneg : (0 : ℝ) ≤ {factorial_decay_denominator} := by positivity",
                        "  rw [← norm_div, hquot, norm_div, Real.norm_eq_abs, Real.norm_eq_abs, abs_of_nonneg hnShiftPowNonneg]",
                        "  norm_num",
                    ])
            else:
                if (
                    coefficients is None
                    or degree is None
                    or leading is None
                    or polynomial_nonzero_from is None
                    or geometric_expression is None
                ):
                    raise ValueError("automatic polynomial-factorial ratio limit is missing exact normalized data")

                ratio_denominator = pattern.automatic_ratio_denominator_polynomial
                denominator_coefficients = pattern.automatic_ratio_denominator_polynomial_coefficients
                denominator_degree = pattern.automatic_ratio_denominator_polynomial_degree
                denominator_leading = pattern.automatic_ratio_denominator_polynomial_leading_coefficient
                denominator_nonzero_from = pattern.automatic_ratio_denominator_polynomial_nonzero_from

                shifted_coefficients = _shift_polynomial_coefficients(coefficients, 1)
                polynomial_expr = render_expr(polynomial)
                polynomial_next_ast = substitute_expr(polynomial, var, next_index)
                polynomial_next_expr = render_expr(polynomial_next_ast)
                geometric_expr = render_expr(geometric_expression)
                geometric_next_expr = render_expr(substitute_expr(geometric_expression, var, next_index))
                geometric_k_expr = render_expr(
                    substitute_expr(geometric_expression, var, {"kind": "var", "id": "k"})
                )

                poly_lines: list[str] = []
                poly_lines.extend(_render_explicit_polynomial_facts(
                    "ratioFactPoly", coefficients, degree, need_leading=True
                ))
                poly_lines.extend(_render_explicit_polynomial_facts(
                    "ratioFactNextPoly", shifted_coefficients, degree, need_leading=True
                ))
                lines.extend(f"  {line}" for line in poly_lines)
                lines.extend([
                    "  have hratioFactDegreesEq : ratioFactNextPoly.degree = ratioFactPoly.degree := by rw [hratioFactNextPolyDeg, hratioFactPolyDeg]",
                    "  have hpolyReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioFactNextPoly ratioFactPoly hratioFactDegreesEq",
                    "  rw [hratioFactNextPolyLead, hratioFactPolyLead] at hpolyReal",
                    "  have hpolyReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioFactNextPoly / Polynomial.eval x ratioFactPoly) Filter.atTop (𝓝 1) := by",
                    "    simpa using hpolyReal",
                    "  have hpolySeq := hpolyReal'.comp tendsto_natCast_atTop_atTop",
                    f"  have hpolyRaw : Filter.Tendsto (fun {var} : ℕ => ({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
                    "    refine hpolySeq.congr' ?_",
                    f"    filter_upwards [] with {var}",
                    f"    change (Polynomial.eval ({var} : ℝ) ratioFactNextPoly / Polynomial.eval ({var} : ℝ) ratioFactPoly) = (({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ))",
                    "    congr 1",
                    "    · simp [ratioFactNextPoly, Nat.cast_add] <;> ring",
                    "    · simp [ratioFactPoly] <;> ring",
                    f"  have hpolyAbs : Filter.Tendsto (fun {var} : ℕ => |({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
                    "    simpa [abs_div] using hpolyRaw.abs",
                    f"  have hfactorDen : Filter.Tendsto (fun {var} : ℕ => ({var} : ℝ) + {shift_plus_one}) Filter.atTop Filter.atTop :=",
                    f"    tendsto_atTop_add_const_right Filter.atTop ({shift_plus_one} : ℝ) tendsto_natCast_atTop_atTop",
                ])
                if factorial_power == 1 and not factorial_denominator_was_power:
                    lines.extend([
                        f"  have hfactor : Filter.Tendsto (fun {var} : ℕ => ({abs_base} : ℝ) / (({var} : ℝ) + {shift_plus_one})) Filter.atTop (𝓝 0) :=",
                        "    tendsto_const_nhds.div_atTop hfactorDen",
                    ])
                else:
                    lines.extend([
                        f"  have hfactorRecip : Filter.Tendsto (fun {var} : ℕ => 1 / (({var} : ℝ) + {shift_plus_one})) Filter.atTop (𝓝 0) :=",
                        "    tendsto_const_nhds.div_atTop hfactorDen",
                        f"  have hfactorRecipPow : Filter.Tendsto (fun {var} : ℕ => (1 / (({var} : ℝ) + {shift_plus_one})) ^ {factorial_power}) Filter.atTop (𝓝 0) := by",
                        f"    simpa using hfactorRecip.pow {factorial_power}",
                        f"  have hfactor : Filter.Tendsto (fun {var} : ℕ => ({abs_base} : ℝ) / {factorial_decay_denominator}) Filter.atTop (𝓝 0) := by",
                        "    have h := tendsto_const_nhds.mul hfactorRecipPow",
                        "    simpa [div_eq_mul_inv, inv_pow] using h",
                    ])
                lines.extend([
                    f"  have hgeomAbs : ∀ k : ℕ, |({geometric_k_expr} : ℝ)| = (({abs_base} : ℝ) ^ k) := by",
                    "    intro k",
                    "    norm_num [abs_mul, abs_div, abs_pow, ← mul_pow, ← div_pow]",
                ])

                if ratio_denominator is None:
                    hpoly_nonzero = _render_nat_eventual_nonzero_term(
                        polynomial, var, polynomial_nonzero_from
                    )
                    if hpoly_nonzero is None:
                        raise ValueError("automatic polynomial-factorial ratio limit is missing a tail nonzero reconstruction")
                    lines.extend([
                        f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (({abs_base} : ℝ) / {factorial_decay_denominator})) Filter.atTop (𝓝 0) := by",
                        "    simpa using hpolyAbs.mul hfactor",
                        "  refine hmodel.congr' ?_",
                        f"  filter_upwards [Filter.eventually_ge_atTop {polynomial_nonzero_from}] with {var} hn",
                    ])
                    proof_lines = hpoly_nonzero.splitlines()
                    lines.extend([
                        f"  have hpoly0 : ({polynomial_expr} : ℝ) ≠ 0 := by",
                        f"    exact {proof_lines[0]}",
                    ])
                    lines.extend(f"      {line}" for line in proof_lines[1:])
                    lines.extend([
                        f"  let geomCurrent : ℝ := ({geometric_expr} : ℝ)",
                        f"  let geomNext : ℝ := ({geometric_next_expr} : ℝ)",
                        f"  have hgeomCurrentAbs : |geomCurrent| = (({abs_base} : ℝ) ^ {var}) := by",
                        "    dsimp [geomCurrent]",
                        f"    exact hgeomAbs {var}",
                        f"  have hgeomNextAbs : |geomNext| = (({abs_base} : ℝ) ^ ({var} + 1)) := by",
                        "    dsimp [geomNext]",
                        f"    exact hgeomAbs ({var} + 1)",
                        f"  have htarget0 : ({abs_base} : ℝ) ≠ 0 := by norm_num",
                        "  have hgeomCurrentAbs0 : |geomCurrent| ≠ 0 := by",
                        "    rw [hgeomCurrentAbs]",
                        f"    exact pow_ne_zero {var} htarget0",
                        "  have hgeomCurrent0 : geomCurrent ≠ 0 := abs_ne_zero.mp hgeomCurrentAbs0",
                        f"  have harg : {current_factorial_arg} = {canonical_factorial_arg} := by omega",
                        f"  have hargNext : {next_factorial_arg} = ({canonical_factorial_arg}) + 1 := by omega",
                        f"  have hfact0 : {factorial_canonical_real} ≠ 0 := by",
                        f"    exact_mod_cast (Nat.factorial_ne_zero {canonical_factorial_arg})",
                        f"  have hnShift : (({var} : ℝ) + {shift_plus_one}) ≠ 0 := by positivity",
                    ])
                    if factorial_power == 1 and not factorial_denominator_was_power:
                        lines.extend([
                            f"  have hcurrentFactor : ({current} : ℝ) = (({polynomial_expr} : ℝ) * geomCurrent) / {factorial_current_real} := by",
                            "    dsimp [geomCurrent]",
                            "    simp [div_eq_mul_inv, mul_inv] <;> ring",
                            f"  have hnextFactor : ({nxt} : ℝ) = (({polynomial_next_expr} : ℝ) * geomNext) / {factorial_next_real} := by",
                            "    dsimp [geomNext]",
                            "    simp [Nat.cast_add, div_eq_mul_inv, mul_inv] <;> ring",
                            f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = ((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (geomNext / geomCurrent)) * (1 / (({var} : ℝ) + {shift_plus_one})) := by",
                            "    rw [hcurrentFactor, hnextFactor, harg, hargNext, Nat.factorial_succ]",
                            "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one]",
                            "    field_simp [hfact0, hpoly0, hgeomCurrent0, hnShift]",
                            "    ring",
                        ])
                    else:
                        lines.extend([
                            f"  have hfactPow0 : ({factorial_canonical_real} ^ {factorial_power}) ≠ 0 := pow_ne_zero _ hfact0",
                            f"  have hnShiftPow : {factorial_decay_denominator} ≠ 0 := pow_ne_zero _ hnShift",
                            f"  have hcurrentFactor : ({current} : ℝ) = (({polynomial_expr} : ℝ) * geomCurrent) / {factorial_current_real} := by",
                            "    dsimp [geomCurrent]",
                            "    simp [Nat.cast_pow, div_eq_mul_inv, mul_inv] <;> ring",
                            f"  have hnextFactor : ({nxt} : ℝ) = (({polynomial_next_expr} : ℝ) * geomNext) / {factorial_next_real} := by",
                            "    dsimp [geomNext]",
                            "    simp [Nat.cast_add, Nat.cast_pow, div_eq_mul_inv, mul_inv] <;> ring",
                            f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = ((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (geomNext / geomCurrent)) * (1 / {factorial_decay_denominator}) := by",
                            "    rw [hcurrentFactor, hnextFactor, harg, hargNext, Nat.factorial_succ]",
                            "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one, mul_pow]",
                            "    field_simp [hfact0, hfactPow0, hpoly0, hgeomCurrent0, hnShift, hnShiftPow]",
                            "    ring",
                        ])
                    lines.extend([
                        f"  have hgeomRatio : |geomNext| / |geomCurrent| = ({abs_base} : ℝ) := by",
                        "    rw [hgeomNextAbs, hgeomCurrentAbs, pow_succ']",
                        f"    field_simp [pow_ne_zero {var} htarget0]",
                        "    ring",
                        f"  have hnShiftNonneg : (0 : ℝ) ≤ ({var} : ℝ) + {shift_plus_one} := by positivity",
                        f"  have hnShiftPowNonneg : (0 : ℝ) ≤ {factorial_decay_denominator} := by positivity",
                        "  rw [← norm_div, hquot]",
                        "  simp only [norm_mul, norm_div, Real.norm_eq_abs, norm_one]",
                        "  rw [hgeomRatio, abs_of_nonneg hnShiftPowNonneg]",
                        "  ring",
                    ])
                else:
                    if (
                        denominator_coefficients is None
                        or denominator_degree is None
                        or denominator_leading is None
                        or denominator_nonzero_from is None
                    ):
                        raise ValueError("automatic polynomial-quotient factorial ratio limit is missing denominator data")

                    denominator_shifted_coefficients = _shift_polynomial_coefficients(denominator_coefficients, 1)
                    denominator_expr = render_expr(ratio_denominator)
                    denominator_next_ast = substitute_expr(ratio_denominator, var, next_index)
                    denominator_next_expr = render_expr(denominator_next_ast)
                    den_lines: list[str] = []
                    den_lines.extend(_render_explicit_polynomial_facts(
                        "ratioFactDenPoly", denominator_coefficients, denominator_degree, need_leading=True
                    ))
                    den_lines.extend(_render_explicit_polynomial_facts(
                        "ratioFactDenNextPoly", denominator_shifted_coefficients, denominator_degree, need_leading=True
                    ))
                    lines.extend(f"  {line}" for line in den_lines)
                    lines.extend([
                        "  have hratioFactDenDegreesEq : ratioFactDenPoly.degree = ratioFactDenNextPoly.degree := by rw [hratioFactDenPolyDeg, hratioFactDenNextPolyDeg]",
                        "  have hdenReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioFactDenPoly ratioFactDenNextPoly hratioFactDenDegreesEq",
                        "  rw [hratioFactDenPolyLead, hratioFactDenNextPolyLead] at hdenReal",
                        "  have hdenReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioFactDenPoly / Polynomial.eval x ratioFactDenNextPoly) Filter.atTop (𝓝 1) := by",
                        "    simpa using hdenReal",
                        "  have hdenSeq := hdenReal'.comp tendsto_natCast_atTop_atTop",
                        f"  have hdenRaw : Filter.Tendsto (fun {var} : ℕ => ({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
                        "    refine hdenSeq.congr' ?_",
                        f"    filter_upwards [] with {var}",
                        f"    change (Polynomial.eval ({var} : ℝ) ratioFactDenPoly / Polynomial.eval ({var} : ℝ) ratioFactDenNextPoly) = (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))",
                        "    congr 1",
                        "    · simp [ratioFactDenPoly] <;> ring",
                        "    · simp [ratioFactDenNextPoly, Nat.cast_add] <;> ring",
                        f"  have hdenAbs : Filter.Tendsto (fun {var} : ℕ => |({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
                        "    simpa [abs_div] using hdenRaw.abs",
                        f"  have hpolyQuotientModel : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) Filter.atTop (𝓝 1) := by",
                        "    simpa using hpolyAbs.mul hdenAbs",
                        f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => ((|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) * (({abs_base} : ℝ) / {factorial_decay_denominator})) Filter.atTop (𝓝 0) := by",
                        "    simpa using hpolyQuotientModel.mul hfactor",
                    ])

                    threshold = max(polynomial_nonzero_from, denominator_nonzero_from)
                    hnum_nonzero = _render_nat_eventual_nonzero_term(
                        polynomial, var, polynomial_nonzero_from, bound_name="hnNum"
                    )
                    hden_nonzero = _render_nat_eventual_nonzero_term(
                        ratio_denominator, var, denominator_nonzero_from, bound_name="hnDen"
                    )
                    denominator_m_ast = substitute_expr(
                        ratio_denominator, var, {"kind": "var", "id": "m"}
                    )
                    denominator_m_expr = render_expr(denominator_m_ast)
                    hden_at_m = _render_nat_eventual_nonzero_term(
                        denominator_m_ast, "m", denominator_nonzero_from, bound_name="hm"
                    )
                    if hnum_nonzero is None or hden_nonzero is None or hden_at_m is None:
                        raise ValueError("automatic polynomial-quotient factorial ratio limit is missing a tail nonzero reconstruction")
                    hnum_lines = hnum_nonzero.splitlines()
                    hden_lines = hden_nonzero.splitlines()
                    hden_m_lines = hden_at_m.splitlines()
                    lines.extend([
                        "  refine hmodel.congr' ?_",
                        f"  filter_upwards [Filter.eventually_ge_atTop {threshold}] with {var} hn",
                        f"  have hnNum : {polynomial_nonzero_from} ≤ {var} := by omega",
                        f"  have hnDen : {denominator_nonzero_from} ≤ {var} := by omega",
                        f"  have hnDenNext : {denominator_nonzero_from} ≤ {var} + 1 := by omega",
                        f"  have hpoly0 : ({polynomial_expr} : ℝ) ≠ 0 := by",
                        f"    exact {hnum_lines[0]}",
                    ])
                    lines.extend(f"      {line}" for line in hnum_lines[1:])
                    lines.extend([
                        f"  have hden0 : ({denominator_expr} : ℝ) ≠ 0 := by",
                        f"    exact {hden_lines[0]}",
                    ])
                    lines.extend(f"      {line}" for line in hden_lines[1:])
                    lines.extend([
                        f"  have hdenAt : ∀ m : ℕ, {denominator_nonzero_from} ≤ m → ({denominator_m_expr} : ℝ) ≠ 0 := by",
                        "    intro m hm",
                        f"    exact {hden_m_lines[0]}",
                    ])
                    lines.extend(f"      {line}" for line in hden_m_lines[1:])
                    lines.extend([
                        f"  have hdenNext0 : ({denominator_next_expr} : ℝ) ≠ 0 := by",
                        f"    exact hdenAt ({var} + 1) hnDenNext",
                        f"  let geomCurrent : ℝ := ({geometric_expr} : ℝ)",
                        f"  let geomNext : ℝ := ({geometric_next_expr} : ℝ)",
                        f"  have hgeomCurrentAbs : |geomCurrent| = (({abs_base} : ℝ) ^ {var}) := by",
                        "    dsimp [geomCurrent]",
                        f"    exact hgeomAbs {var}",
                        f"  have hgeomNextAbs : |geomNext| = (({abs_base} : ℝ) ^ ({var} + 1)) := by",
                        "    dsimp [geomNext]",
                        f"    exact hgeomAbs ({var} + 1)",
                        f"  have htarget0 : ({abs_base} : ℝ) ≠ 0 := by norm_num",
                        "  have hgeomCurrentAbs0 : |geomCurrent| ≠ 0 := by",
                        "    rw [hgeomCurrentAbs]",
                        f"    exact pow_ne_zero {var} htarget0",
                        "  have hgeomCurrent0 : geomCurrent ≠ 0 := abs_ne_zero.mp hgeomCurrentAbs0",
                        f"  have harg : {current_factorial_arg} = {canonical_factorial_arg} := by omega",
                        f"  have hargNext : {next_factorial_arg} = ({canonical_factorial_arg}) + 1 := by omega",
                        f"  have hfact0 : {factorial_canonical_real} ≠ 0 := by",
                        f"    exact_mod_cast (Nat.factorial_ne_zero {canonical_factorial_arg})",
                        f"  have hnShift : (({var} : ℝ) + {shift_plus_one}) ≠ 0 := by positivity",
                    ])
                    if factorial_power == 1 and not factorial_denominator_was_power:
                        lines.extend([
                            f"  have hcurrentFactor : ({current} : ℝ) = ((({polynomial_expr} : ℝ) / ({denominator_expr} : ℝ)) * geomCurrent) / {factorial_current_real} := by",
                            "    dsimp [geomCurrent]",
                            "    simp [div_eq_mul_inv, mul_inv] <;> ring",
                            f"  have hnextFactor : ({nxt} : ℝ) = ((({polynomial_next_expr} : ℝ) / ({denominator_next_expr} : ℝ)) * geomNext) / {factorial_next_real} := by",
                            "    dsimp [geomNext]",
                            "    simp [Nat.cast_add, div_eq_mul_inv, mul_inv] <;> ring",
                            f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = (((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))) * (geomNext / geomCurrent)) * (1 / (({var} : ℝ) + {shift_plus_one})) := by",
                            "    rw [hcurrentFactor, hnextFactor, harg, hargNext, Nat.factorial_succ]",
                            "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one]",
                            "    field_simp [hfact0, hpoly0, hden0, hdenNext0, hgeomCurrent0, hnShift]",
                            "    ring",
                        ])
                    else:
                        lines.extend([
                            f"  have hfactPow0 : ({factorial_canonical_real} ^ {factorial_power}) ≠ 0 := pow_ne_zero _ hfact0",
                            f"  have hnShiftPow : {factorial_decay_denominator} ≠ 0 := pow_ne_zero _ hnShift",
                            f"  have hcurrentFactor : ({current} : ℝ) = ((({polynomial_expr} : ℝ) / ({denominator_expr} : ℝ)) * geomCurrent) / {factorial_current_real} := by",
                            "    dsimp [geomCurrent]",
                            "    simp [Nat.cast_pow, div_eq_mul_inv, mul_inv] <;> ring",
                            f"  have hnextFactor : ({nxt} : ℝ) = ((({polynomial_next_expr} : ℝ) / ({denominator_next_expr} : ℝ)) * geomNext) / {factorial_next_real} := by",
                            "    dsimp [geomNext]",
                            "    simp [Nat.cast_add, Nat.cast_pow, div_eq_mul_inv, mul_inv] <;> ring",
                            f"  have hquot : (({nxt} : ℝ) / ({current} : ℝ)) = (((({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) * (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))) * (geomNext / geomCurrent)) * (1 / {factorial_decay_denominator}) := by",
                            "    rw [hcurrentFactor, hnextFactor, harg, hargNext, Nat.factorial_succ]",
                            "    simp only [Nat.cast_mul, Nat.cast_add, Nat.cast_one, mul_pow]",
                            "    field_simp [hfact0, hfactPow0, hpoly0, hden0, hdenNext0, hgeomCurrent0, hnShift, hnShiftPow]",
                            "    ring",
                        ])
                    lines.extend([
                        f"  have hgeomRatio : |geomNext| / |geomCurrent| = ({abs_base} : ℝ) := by",
                        "    rw [hgeomNextAbs, hgeomCurrentAbs, pow_succ']",
                        f"    field_simp [pow_ne_zero {var} htarget0]",
                        "    ring",
                        f"  have hnShiftNonneg : (0 : ℝ) ≤ ({var} : ℝ) + {shift_plus_one} := by positivity",
                        f"  have hnShiftPowNonneg : (0 : ℝ) ≤ {factorial_decay_denominator} := by positivity",
                        "  rw [← norm_div, hquot]",
                        "  simp only [norm_mul, norm_div, Real.norm_eq_abs, norm_one]",
                        "  rw [hgeomRatio, abs_of_nonneg hnShiftPowNonneg]",
                        "  ring",
                    ])
        elif polynomial is None:
            lines.extend([
                f"  have hEq : (fun {var} : ℕ => ‖(({base} : ℝ) ^ ({var} + 1))‖ / ‖(({base} : ℝ) ^ {var})‖) = (fun _ : ℕ => ({target} : ℝ)) := by",
                f"    funext {var}",
                "    rw [norm_pow, norm_pow, pow_succ']",
                f"    have hr : ‖({base} : ℝ)‖ ≠ 0 := by norm_num [Real.norm_eq_abs]",
                f"    field_simp [pow_ne_zero {var} hr]",
                "    norm_num [Real.norm_eq_abs]",
                "  rw [hEq]",
                "  exact tendsto_const_nhds",
            ])
        else:
            if (
                coefficients is None
                or degree is None
                or leading is None
                or polynomial_nonzero_from is None
                or geometric_expression is None
            ):
                raise ValueError("automatic polynomial-geometric ratio limit is missing exact normalized data")

            denominator = pattern.automatic_ratio_denominator_polynomial
            denominator_coefficients = pattern.automatic_ratio_denominator_polynomial_coefficients
            denominator_degree = pattern.automatic_ratio_denominator_polynomial_degree
            denominator_leading = pattern.automatic_ratio_denominator_polynomial_leading_coefficient
            denominator_nonzero_from = pattern.automatic_ratio_denominator_polynomial_nonzero_from

            shifted_coefficients = _shift_polynomial_coefficients(coefficients, 1)
            polynomial_expr = render_expr(polynomial)
            polynomial_next_ast = substitute_expr(polynomial, var, next_index)
            polynomial_next_expr = render_expr(polynomial_next_ast)
            geometric_expr = render_expr(geometric_expression)
            geometric_next_expr = render_expr(substitute_expr(geometric_expression, var, next_index))
            geometric_k_expr = render_expr(
                substitute_expr(geometric_expression, var, {"kind": "var", "id": "k"})
            )
            hpoly_nonzero = _render_nat_eventual_nonzero_term(
                polynomial, var, polynomial_nonzero_from
            )
            if hpoly_nonzero is None:
                raise ValueError("automatic polynomial-geometric ratio limit is missing a tail nonzero reconstruction")

            poly_lines: list[str] = []
            poly_lines.extend(_render_explicit_polynomial_facts(
                "ratioPoly", coefficients, degree, need_leading=True
            ))
            poly_lines.extend(_render_explicit_polynomial_facts(
                "ratioNextPoly", shifted_coefficients, degree, need_leading=True
            ))
            lines.extend(f"  {line}" for line in poly_lines)
            lines.extend([
                "  have hratioDegreesEq : ratioNextPoly.degree = ratioPoly.degree := by rw [hratioNextPolyDeg, hratioPolyDeg]",
                "  have hpolyReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioNextPoly ratioPoly hratioDegreesEq",
                "  rw [hratioNextPolyLead, hratioPolyLead] at hpolyReal",
                "  have hpolyReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioNextPoly / Polynomial.eval x ratioPoly) Filter.atTop (𝓝 1) := by",
                "    simpa using hpolyReal",
                "  have hpolySeq := hpolyReal'.comp tendsto_natCast_atTop_atTop",
                f"  have hpolyRaw : Filter.Tendsto (fun {var} : ℕ => ({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
                "    refine hpolySeq.congr' ?_",
                f"    filter_upwards [] with {var}",
                f"    change (Polynomial.eval ({var} : ℝ) ratioNextPoly / Polynomial.eval ({var} : ℝ) ratioPoly) = (({polynomial_next_expr} : ℝ) / ({polynomial_expr} : ℝ))",
                "    congr 1",
                "    · simp [ratioNextPoly, Nat.cast_add] <;> ring",
                "    · simp [ratioPoly] <;> ring",
                f"  have hpolyAbs : Filter.Tendsto (fun {var} : ℕ => |({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
                "    simpa [abs_div] using hpolyRaw.abs",
            ])

            if denominator is None:
                proof_lines = hpoly_nonzero.splitlines()
                lines.extend([
                    f"  have hratioConst : Filter.Tendsto (fun _ : ℕ => ({target} : ℝ)) Filter.atTop (𝓝 ({target} : ℝ)) := tendsto_const_nhds",
                    f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * ({target} : ℝ)) Filter.atTop (𝓝 ({target} : ℝ)) := by",
                    "    simpa using hpolyAbs.mul hratioConst",
                    "  refine hmodel.congr' ?_",
                    f"  filter_upwards [Filter.eventually_ge_atTop {polynomial_nonzero_from}] with {var} hn",
                    f"  have hpoly0 : ({polynomial_expr} : ℝ) ≠ 0 := by",
                    f"    exact {proof_lines[0]}",
                ])
                lines.extend(f"      {line}" for line in proof_lines[1:])
                lines.extend([
                    f"  have hgeomAbs : ∀ k : ℕ, |({geometric_k_expr} : ℝ)| = (({target} : ℝ) ^ k) := by",
                    "    intro k",
                    "    norm_num [abs_mul, abs_div, abs_pow, ← mul_pow, ← div_pow]",
                    f"  have hcurrentFactor : ({current} : ℝ) = ({polynomial_expr} : ℝ) * ({geometric_expr} : ℝ) := by",
                    "    simp [div_eq_mul_inv, mul_inv] <;> ring",
                    f"  have hnextFactor : ({nxt} : ℝ) = ({polynomial_next_expr} : ℝ) * ({geometric_next_expr} : ℝ) := by",
                    "    simp [Nat.cast_add, div_eq_mul_inv, mul_inv] <;> ring",
                    f"  have htarget0 : ({target} : ℝ) ≠ 0 := by norm_num",
                    "  rw [hcurrentFactor, hnextFactor]",
                    "  simp only [Real.norm_eq_abs, abs_mul]",
                    f"  rw [hgeomAbs {var}, hgeomAbs ({var} + 1), pow_succ']",
                    f"  have hpolyAbs0 : |({polynomial_expr} : ℝ)| ≠ 0 := abs_ne_zero.mpr hpoly0",
                    f"  field_simp [hpolyAbs0, pow_ne_zero {var} htarget0]",
                    "  ring",
                ])
            else:
                if (
                    denominator_coefficients is None
                    or denominator_degree is None
                    or denominator_leading is None
                    or denominator_nonzero_from is None
                ):
                    raise ValueError("automatic polynomial-quotient ratio limit is missing denominator data")

                denominator_shifted_coefficients = _shift_polynomial_coefficients(denominator_coefficients, 1)
                denominator_expr = render_expr(denominator)
                denominator_next_ast = substitute_expr(denominator, var, next_index)
                denominator_next_expr = render_expr(denominator_next_ast)
                den_lines: list[str] = []
                den_lines.extend(_render_explicit_polynomial_facts(
                    "ratioDenPoly", denominator_coefficients, denominator_degree, need_leading=True
                ))
                den_lines.extend(_render_explicit_polynomial_facts(
                    "ratioDenNextPoly", denominator_shifted_coefficients, denominator_degree, need_leading=True
                ))
                lines.extend(f"  {line}" for line in den_lines)
                lines.extend([
                    "  have hdenDegreesEq : ratioDenPoly.degree = ratioDenNextPoly.degree := by rw [hratioDenPolyDeg, hratioDenNextPolyDeg]",
                    "  have hdenReal := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq ratioDenPoly ratioDenNextPoly hdenDegreesEq",
                    "  rw [hratioDenPolyLead, hratioDenNextPolyLead] at hdenReal",
                    "  have hdenReal' : Filter.Tendsto (fun x : ℝ => Polynomial.eval x ratioDenPoly / Polynomial.eval x ratioDenNextPoly) Filter.atTop (𝓝 1) := by",
                    "    simpa using hdenReal",
                    "  have hdenSeq := hdenReal'.comp tendsto_natCast_atTop_atTop",
                    f"  have hdenRaw : Filter.Tendsto (fun {var} : ℕ => ({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ)) Filter.atTop (𝓝 1) := by",
                    "    refine hdenSeq.congr' ?_",
                    f"    filter_upwards [] with {var}",
                    f"    change (Polynomial.eval ({var} : ℝ) ratioDenPoly / Polynomial.eval ({var} : ℝ) ratioDenNextPoly) = (({denominator_expr} : ℝ) / ({denominator_next_expr} : ℝ))",
                    "    congr 1",
                    "    · simp [ratioDenPoly] <;> ring",
                    "    · simp [ratioDenNextPoly, Nat.cast_add] <;> ring",
                    f"  have hdenAbs : Filter.Tendsto (fun {var} : ℕ => |({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|) Filter.atTop (𝓝 1) := by",
                    "    simpa [abs_div] using hdenRaw.abs",
                    f"  have hpolyQuotientModel : Filter.Tendsto (fun {var} : ℕ => (|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) Filter.atTop (𝓝 1) := by",
                    "    simpa using hpolyAbs.mul hdenAbs",
                    f"  have hratioConst : Filter.Tendsto (fun _ : ℕ => ({target} : ℝ)) Filter.atTop (𝓝 ({target} : ℝ)) := tendsto_const_nhds",
                    f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => ((|({polynomial_next_expr} : ℝ)| / |({polynomial_expr} : ℝ)|) * (|({denominator_expr} : ℝ)| / |({denominator_next_expr} : ℝ)|)) * ({target} : ℝ)) Filter.atTop (𝓝 ({target} : ℝ)) := by",
                    "    simpa using hpolyQuotientModel.mul hratioConst",
                ])

                threshold = max(polynomial_nonzero_from, denominator_nonzero_from)
                hnum_nonzero = _render_nat_eventual_nonzero_term(
                    polynomial, var, polynomial_nonzero_from, bound_name="hnNum"
                )
                hden_nonzero = _render_nat_eventual_nonzero_term(
                    denominator, var, denominator_nonzero_from, bound_name="hnDen"
                )
                denominator_m_ast = substitute_expr(
                    denominator, var, {"kind": "var", "id": "m"}
                )
                denominator_m_expr = render_expr(denominator_m_ast)
                hden_at_m = _render_nat_eventual_nonzero_term(
                    denominator_m_ast, "m", denominator_nonzero_from, bound_name="hm"
                )
                if hnum_nonzero is None or hden_nonzero is None or hden_at_m is None:
                    raise ValueError("automatic polynomial-quotient ratio limit is missing a tail nonzero reconstruction")
                hnum_lines = hnum_nonzero.splitlines()
                hden_lines = hden_nonzero.splitlines()
                hden_m_lines = hden_at_m.splitlines()
                lines.extend([
                    "  refine hmodel.congr' ?_",
                    f"  filter_upwards [Filter.eventually_ge_atTop {threshold}] with {var} hn",
                    f"  have hnNum : {polynomial_nonzero_from} ≤ {var} := by omega",
                    f"  have hnDen : {denominator_nonzero_from} ≤ {var} := by omega",
                    f"  have hnDenNext : {denominator_nonzero_from} ≤ {var} + 1 := by omega",
                    f"  have hpoly0 : ({polynomial_expr} : ℝ) ≠ 0 := by",
                    f"    exact {hnum_lines[0]}",
                ])
                lines.extend(f"      {line}" for line in hnum_lines[1:])
                lines.extend([
                    f"  have hden0 : ({denominator_expr} : ℝ) ≠ 0 := by",
                    f"    exact {hden_lines[0]}",
                ])
                lines.extend(f"      {line}" for line in hden_lines[1:])
                lines.extend([
                    f"  have hdenAt : ∀ m : ℕ, {denominator_nonzero_from} ≤ m → ({denominator_m_expr} : ℝ) ≠ 0 := by",
                    "    intro m hm",
                    f"    exact {hden_m_lines[0]}",
                ])
                lines.extend(f"      {line}" for line in hden_m_lines[1:])
                lines.extend([
                    f"  have hdenNext0 : ({denominator_next_expr} : ℝ) ≠ 0 := by",
                    f"    exact hdenAt ({var} + 1) hnDenNext",
                ])
                lines.extend([
                    f"  have hgeomAbs : ∀ k : ℕ, |({geometric_k_expr} : ℝ)| = (({target} : ℝ) ^ k) := by",
                    "    intro k",
                    "    norm_num [abs_mul, abs_div, abs_pow, ← mul_pow, ← div_pow]",
                    f"  have hcurrentFactor : ({current} : ℝ) = (({polynomial_expr} : ℝ) / ({denominator_expr} : ℝ)) * ({geometric_expr} : ℝ) := by",
                    "    simp [div_eq_mul_inv, mul_inv] <;> ring",
                    f"  have hnextFactor : ({nxt} : ℝ) = (({polynomial_next_expr} : ℝ) / ({denominator_next_expr} : ℝ)) * ({geometric_next_expr} : ℝ) := by",
                    "    simp [Nat.cast_add, div_eq_mul_inv, mul_inv] <;> ring",
                    f"  have htarget0 : ({target} : ℝ) ≠ 0 := by norm_num",
                    "  rw [hcurrentFactor, hnextFactor]",
                    "  simp only [Real.norm_eq_abs, abs_mul, abs_div]",
                    f"  rw [hgeomAbs {var}, hgeomAbs ({var} + 1), pow_succ']",
                    f"  have hpolyAbs0 : |({polynomial_expr} : ℝ)| ≠ 0 := abs_ne_zero.mpr hpoly0",
                    f"  have hdenAbs0 : |({denominator_expr} : ℝ)| ≠ 0 := abs_ne_zero.mpr hden0",
                    f"  have hdenNextAbs0 : |({denominator_next_expr} : ℝ)| ≠ 0 := abs_ne_zero.mpr hdenNext0",
                    f"  field_simp [hpolyAbs0, hdenAbs0, hdenNextAbs0, pow_ne_zero {var} htarget0]",
                    "  ring",
                ])


    if unbounded_ratio:
        if pattern.automatic_nonzero_from is None:
            raise ValueError("unbounded factorial ratio requires an automatic eventual nonzero tail")
        proof = _render_nat_eventual_nonzero_term(
            pattern.expression, var, pattern.automatic_nonzero_from
        )
        if proof is None:
            raise ValueError("unbounded factorial ratio eventual nonzero guard is missing a Lean reconstruction")
        proof_lines = proof.splitlines()
        lines.extend([
            f"have hnonzero : ∀ᶠ {var} : ℕ in Filter.atTop, ({current} : ℝ) ≠ 0 := by",
            f"  filter_upwards [Filter.eventually_ge_atTop {pattern.automatic_nonzero_from}] with {var} hn",
            f"  exact {proof_lines[0]}",
        ])
        lines.extend(f"    {line}" for line in proof_lines[1:])
        lines.extend([
            f"have hfreq : ∃ᶠ {var} : ℕ in Filter.atTop, ‖({current} : ℝ)‖ ≠ 0 := by",
            "  exact Filter.Eventually.frequently (hnonzero.mono (fun _ h => norm_ne_zero_iff.mpr h))",
            f"have hratioEventually : ∀ᶠ {var} : ℕ in Filter.atTop, (2 : ℝ) ≤ ‖({nxt} : ℝ)‖ / ‖({current} : ℝ)‖ :=",
            "  hratioTop.eventually_ge_atTop 2",
            f"have hge : ∀ᶠ {var} : ℕ in Filter.atTop, (2 : ℝ) * ‖({current} : ℝ)‖ ≤ ‖({nxt} : ℝ)‖ := by",
            f"  filter_upwards [hratioEventually, hnonzero] with {var} hratio hzero",
            f"  exact (le_div_iff₀ (norm_pos_iff.mpr hzero)).mp hratio",
            f"exact not_summable_of_ratio_norm_eventually_ge (r := 2) (by norm_num) hfreq hge",
        ])
        return lines

    if pattern.result_kind == "not_summable":
        assert target is not None
        lines.append(f"exact not_summable_of_ratio_test_tendsto_gt_one (l := {target}) (by norm_num) hratio")
        return lines

    lines.append(f"have hnonzero : ∀ᶠ {var} : ℕ in Filter.atTop, ({current} : ℝ) ≠ 0 := by")
    if pattern.nonzero_premise_id is not None and pattern.nonzero_mode is not None:
        nonzero_name = names[pattern.nonzero_premise_id]
        if pattern.nonzero_mode == "global":
            lines.append(f"  exact Filter.Eventually.of_forall (fun {var} => {nonzero_name} {var})")
        else:
            lines.extend([
                f"  rcases {nonzero_name} with ⟨N, hN⟩",
                f"  filter_upwards [Filter.eventually_ge_atTop N] with {var} hn",
                f"  exact hN {var} hn",
            ])
    elif pattern.automatic_nonzero_from is not None:
        proof = _render_nat_eventual_nonzero_term(
            pattern.expression, var, pattern.automatic_nonzero_from
        )
        if proof is None:
            raise ValueError("automatic ratio-test eventual nonzero guard is missing a Lean reconstruction")
        proof_lines = proof.splitlines()
        lines.extend([
            f"  filter_upwards [Filter.eventually_ge_atTop {pattern.automatic_nonzero_from}] with {var} hn",
            f"  exact {proof_lines[0]}",
        ])
        lines.extend(f"    {line}" for line in proof_lines[1:])
    else:
        raise ValueError("summable quotient-limit ratio test requires cited or reconstructible eventual nonzero evidence")
    lines.append(f"exact summable_of_ratio_test_tendsto_lt_one (l := {target}) (by norm_num) hnonzero hratio")
    return lines


def _render_polynomial_nth_root_limit(
    *,
    var: str,
    polynomial: dict[str, Any],
    coefficients: tuple[Fraction, ...],
    degree: int,
    leading_coefficient: Fraction,
    tag: str = "",
) -> list[str]:
    """Prove ``abs(p(n))^(1/n) -> 1`` for one exact nonzero polynomial.

    The coefficient vector came from the Python normalizer, but the generated
    artifact proves the original-expression identity in Lean. Monomials use
    direct coefficient/power limits; general polynomials rebuild an explicit
    ``Polynomial ℝ`` for the leading-term asymptotic. ``tag`` only namespaces local names so
    numerator and denominator proofs can coexist in one root reconstruction.
    """
    polynomial_expr = render_expr(polynomial)
    leading = _render_real_fraction(leading_coefficient)
    abs_leading = _render_real_fraction(abs(leading_coefficient))
    proof_name = f"hpolyRoot{tag}"
    hexp = f"hexp{tag}"

    # Constant nonzero polynomials need no polynomial asymptotic machinery.
    # Their n-th root tends to one directly because 1/n -> 0.
    if degree == 0:
        return [
            f"have {hexp} : Filter.Tendsto (fun n : ℕ => (1 : ℝ) / (n : ℝ)) Filter.atTop (𝓝 0) := by",
            "  simpa [one_div] using (tendsto_inv_atTop_nhds_zero_nat (𝕜 := ℝ))",
            f"have {proof_name} : Filter.Tendsto (fun {var} : ℕ => |({polynomial_expr} : ℝ)| ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 1) := by",
            f"  have hconst{tag} : Filter.Tendsto (fun _ : ℕ => ({abs_leading} : ℝ)) Filter.atTop (𝓝 ({abs_leading} : ℝ)) := tendsto_const_nhds",
            f"  simpa using (hconst{tag}.rpow {hexp} (Or.inl (by norm_num : ({abs_leading} : ℝ) ≠ 0)))",
        ]

    poly_name = f"rootPoly{tag}"
    lead_name = f"rootLead{tag}"
    hdeg = f"hdeg{tag}"
    hratio_real = f"hratioReal{tag}"
    hratio_real_prime = f"hratioReal{tag}'"
    hratio_seq = f"hratioSeq{tag}"
    hratio = f"hratio{tag}"
    hrelative_base = f"hrelativeBase{tag}"
    hrelative_root = f"hrelativeRoot{tag}"
    hcoeff = f"hcoeff{tag}"
    hdegree_core = f"hdegreeCore{tag}"
    hmonomial_root = f"hmonomialRoot{tag}"
    hlead_root_model = f"hleadRootModel{tag}"
    hlead_root = f"hleadRoot{tag}"
    hpoly_model = f"hpolyModel{tag}"
    leading_coefficients = tuple(
        Fraction(0) if index < degree else leading_coefficient
        for index in range(degree + 1)
    )

    if coefficients == leading_coefficients:
        # A monomial already is its leading term. Prove the coefficient and
        # power limits directly instead of reconstructing two identical
        # Polynomials and a relative-limit/cancellation argument. Lean still
        # checks the identity with the original expression and all side goals.
        return [
            f"have {hexp} : Filter.Tendsto (fun n : ℕ => (1 : ℝ) / (n : ℝ)) Filter.atTop (𝓝 0) := by",
            "  simpa [one_div] using (tendsto_inv_atTop_nhds_zero_nat (𝕜 := ℝ))",
            f"have {hcoeff} : Filter.Tendsto (fun n : ℕ => ({abs_leading} : ℝ) ^ ((1 : ℝ) / (n : ℝ))) Filter.atTop (𝓝 1) := by",
            f"  simpa using (tendsto_const_nhds.rpow {hexp} (Or.inl (by norm_num : ({abs_leading} : ℝ) ≠ 0)))",
            f"have {hdegree_core} : Filter.Tendsto (fun n : ℕ => (n : ℝ) ^ (({degree} : ℝ) / (n : ℝ))) Filter.atTop (𝓝 1) := by",
            f"  simpa [Function.comp_def] using ((tendsto_rpow_div_mul_add ({degree} : ℝ) 1 0 (by norm_num)).comp tendsto_natCast_atTop_atTop)",
            f"have {hmonomial_root} : Filter.Tendsto (fun n : ℕ => (((n : ℝ) ^ {degree}) ^ ((1 : ℝ) / (n : ℝ)))) Filter.atTop (𝓝 1) := by",
            f"  refine {hdegree_core}.congr' ?_",
            f"  filter_upwards [Filter.eventually_ge_atTop 1] with {var} hn",
            f"  rw [← Real.rpow_natCast_mul (Nat.cast_nonneg {var}) {degree} ((1 : ℝ) / ({var} : ℝ))]",
            "  congr 1",
            "  ring",
            f"have {hlead_root_model} : Filter.Tendsto (fun {var} : ℕ => ({abs_leading} : ℝ) ^ ((1 : ℝ) / ({var} : ℝ)) * ((({var} : ℝ) ^ {degree}) ^ ((1 : ℝ) / ({var} : ℝ)))) Filter.atTop (𝓝 1) := by",
            f"  simpa using {hcoeff}.mul {hmonomial_root}",
            f"have hcanonical{tag} : ∀ {var} : ℕ, |({polynomial_expr} : ℝ)| = ({abs_leading} : ℝ) * (({var} : ℝ) ^ {degree}) := by",
            f"  intro {var}",
            f"  have hid : ({polynomial_expr} : ℝ) = ({leading} : ℝ) * (({var} : ℝ) ^ {degree}) := by ring",
            f"  rw [hid, abs_mul, abs_pow]",
            f"  simp only [abs_of_nonneg (Nat.cast_nonneg {var} : (0 : ℝ) ≤ ({var} : ℝ))]",
            "  norm_num",
            f"have {proof_name} : Filter.Tendsto (fun {var} : ℕ => |({polynomial_expr} : ℝ)| ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 1) := by",
            f"  refine {hlead_root_model}.congr' ?_",
            f"  filter_upwards [] with {var}",
            f"  rw [hcanonical{tag}, Real.mul_rpow (by norm_num : (0 : ℝ) ≤ {abs_leading}) (pow_nonneg (Nat.cast_nonneg {var}) {degree})]",
        ]

    lines: list[str] = []
    lines.extend(_render_explicit_polynomial_facts(poly_name, coefficients, degree, need_leading=True))
    lines.extend(_render_explicit_polynomial_facts(lead_name, leading_coefficients, degree, need_leading=True))
    lines.extend([
        f"have {hdeg} : {poly_name}.degree = {lead_name}.degree := by simpa only [h{poly_name}Deg, h{lead_name}Deg]",
        f"have {hratio_real} := Polynomial.div_tendsto_atTop_leadingCoeff_div_of_degree_eq {poly_name} {lead_name} {hdeg}",
        f"simp only [h{poly_name}Lead, h{lead_name}Lead] at {hratio_real}",
        f"have {hratio_real_prime} : Filter.Tendsto (fun x : ℝ => Polynomial.eval x {poly_name} / Polynomial.eval x {lead_name}) Filter.atTop (𝓝 1) := by",
        f"  simpa using {hratio_real}",
        f"have {hratio_seq} := {hratio_real_prime}.comp tendsto_natCast_atTop_atTop",
        f"have {hratio} : Filter.Tendsto (fun {var} : ℕ => ({polynomial_expr} : ℝ) / (({leading} : ℝ) * (({var} : ℝ) ^ {degree}))) Filter.atTop (𝓝 1) := by",
        f"  refine {hratio_seq}.congr' ?_",
        f"  filter_upwards [] with {var}",
        f"  change (Polynomial.eval ({var} : ℝ) {poly_name} / Polynomial.eval ({var} : ℝ) {lead_name}) = (({polynomial_expr} : ℝ) / (({leading} : ℝ) * (({var} : ℝ) ^ {degree})))",
        "  congr 1",
        f"  · simp [{poly_name}] <;> ring",
        f"  · simp [{lead_name}] <;> ring",
        f"have {hexp} : Filter.Tendsto (fun n : ℕ => (1 : ℝ) / (n : ℝ)) Filter.atTop (𝓝 0) := by",
        "  simpa [one_div] using (tendsto_inv_atTop_nhds_zero_nat (𝕜 := ℝ))",
        f"have {hrelative_base} : Filter.Tendsto (fun {var} : ℕ => |(({polynomial_expr} : ℝ) / (({leading} : ℝ) * (({var} : ℝ) ^ {degree})))|) Filter.atTop (𝓝 1) := by",
        f"  simpa using {hratio}.abs",
        f"have {hrelative_root} : Filter.Tendsto (fun {var} : ℕ => |(({polynomial_expr} : ℝ) / (({leading} : ℝ) * (({var} : ℝ) ^ {degree})))| ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 1) := by",
        f"  simpa using ({hrelative_base}.rpow {hexp} (Or.inl (by norm_num : (1 : ℝ) ≠ 0)))",
        f"have {hcoeff} : Filter.Tendsto (fun n : ℕ => ({abs_leading} : ℝ) ^ ((1 : ℝ) / (n : ℝ))) Filter.atTop (𝓝 1) := by",
        f"  simpa using (tendsto_const_nhds.rpow {hexp} (Or.inl (by norm_num : ({abs_leading} : ℝ) ≠ 0)))",
        f"have {hdegree_core} : Filter.Tendsto (fun n : ℕ => (n : ℝ) ^ (({degree} : ℝ) / (n : ℝ))) Filter.atTop (𝓝 1) := by",
        f"  simpa [Function.comp_def] using ((tendsto_rpow_div_mul_add ({degree} : ℝ) 1 0 (by norm_num)).comp tendsto_natCast_atTop_atTop)",
        f"have {hmonomial_root} : Filter.Tendsto (fun n : ℕ => (((n : ℝ) ^ {degree}) ^ ((1 : ℝ) / (n : ℝ)))) Filter.atTop (𝓝 1) := by",
        f"  refine {hdegree_core}.congr' ?_",
        f"  filter_upwards [Filter.eventually_ge_atTop 1] with {var} hn",
        f"  have hnn{tag} : (0 : ℝ) ≤ ({var} : ℝ) := by positivity",
        f"  rw [← Real.rpow_natCast_mul hnn{tag} {degree} ((1 : ℝ) / ({var} : ℝ))]",
        "  congr 1",
        "  ring",
        f"have {hlead_root_model} : Filter.Tendsto (fun {var} : ℕ => ({abs_leading} : ℝ) ^ ((1 : ℝ) / ({var} : ℝ)) * ((({var} : ℝ) ^ {degree}) ^ ((1 : ℝ) / ({var} : ℝ)))) Filter.atTop (𝓝 1) := by",
        f"  simpa using {hcoeff}.mul {hmonomial_root}",
        f"have {hlead_root} : Filter.Tendsto (fun {var} : ℕ => (({abs_leading} : ℝ) * (({var} : ℝ) ^ {degree})) ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 1) := by",
        f"  refine {hlead_root_model}.congr' ?_",
        f"  filter_upwards [] with {var}",
        f"  have hnn{tag} : (0 : ℝ) ≤ ({var} : ℝ) := by positivity",
        f"  rw [Real.mul_rpow (by norm_num : (0 : ℝ) ≤ {abs_leading}) (pow_nonneg hnn{tag} {degree})]",
        f"have {hpoly_model} : Filter.Tendsto (fun {var} : ℕ => |(({polynomial_expr} : ℝ) / (({leading} : ℝ) * (({var} : ℝ) ^ {degree})))| ^ ((1 : ℝ) / ({var} : ℝ)) * (({abs_leading} : ℝ) * (({var} : ℝ) ^ {degree})) ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 1) := by",
        f"  simpa using {hrelative_root}.mul {hlead_root}",
        f"have {proof_name} : Filter.Tendsto (fun {var} : ℕ => |({polynomial_expr} : ℝ)| ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 1) := by",
        f"  refine {hpoly_model}.congr' ?_",
        f"  filter_upwards [Filter.eventually_ge_atTop 1] with {var} hn",
        f"  have hn0{tag} : {var} ≠ 0 := by omega",
        f"  have hnreal0{tag} : ({var} : ℝ) ≠ 0 := by exact_mod_cast hn0{tag}",
        f"  have hnn{tag} : (0 : ℝ) ≤ ({var} : ℝ) := by positivity",
        f"  have hden0{tag} : ({leading} : ℝ) * (({var} : ℝ) ^ {degree}) ≠ 0 := by",
        f"    exact mul_ne_zero (by norm_num) (pow_ne_zero {degree} hnreal0{tag})",
        f"  have habsLead{tag} : |(({leading} : ℝ) * (({var} : ℝ) ^ {degree}))| = ({abs_leading} : ℝ) * (({var} : ℝ) ^ {degree}) := by",
        "    rw [abs_mul, abs_pow, abs_of_nonneg hnn" + tag + "]",
        "    norm_num",
        f"  have hsplit{tag} : |({polynomial_expr} : ℝ)| = |(({polynomial_expr} : ℝ) / (({leading} : ℝ) * (({var} : ℝ) ^ {degree})))| * (({abs_leading} : ℝ) * (({var} : ℝ) ^ {degree})) := by",
        f"    rw [← habsLead{tag}, ← abs_mul]",
        "    congr 1",
        f"    field_simp [hden0{tag}] <;> simp [abs_of_nonneg hnn{tag}] <;> ring",
        f"  rw [hsplit{tag}]",
        f"  rw [Real.mul_rpow (abs_nonneg ((({polynomial_expr} : ℝ) / (({leading} : ℝ) * (({var} : ℝ) ^ {degree})))) ) (mul_nonneg (by norm_num : (0 : ℝ) ≤ {abs_leading}) (pow_nonneg hnn{tag} {degree}))]",
    ])
    return lines


def _render_nat_nonzero_term(expr: dict[str, Any], variable: str) -> str | None:
    """Return a small Lean proof term for the supported global nonzero fragment."""
    if _syntactic_positive_on_nat(expr, variable):
        return "(by positivity)"
    value = exact_rational_value(expr)
    if value is not None:
        return "(by norm_num)" if value != 0 else None
    kind = expr.get("kind")
    if kind == "factorial":
        argument = render_expr(expr.get("arg", {}))
        return f"(by exact_mod_cast (Nat.factorial_ne_zero ({argument})))"
    if kind == "neg":
        inner = _render_nat_nonzero_term(expr.get("arg", {}), variable)
        return f"(neg_ne_zero.mpr {inner})" if inner is not None else None
    if kind in {"mul", "div"}:
        left = _render_nat_nonzero_term(expr.get("left", {}), variable)
        right = _render_nat_nonzero_term(expr.get("right", {}), variable)
        if left is None or right is None:
            return None
        theorem = "mul_ne_zero" if kind == "mul" else "div_ne_zero"
        return f"({theorem} {left} {right})"
    if kind == "pow":
        exponent = expr.get("exponent")
        if not isinstance(exponent, int) or isinstance(exponent, bool) or exponent < 0:
            return None
        if exponent == 0:
            return "(by simp)"
        base = _render_nat_nonzero_term(expr.get("base", {}), variable)
        return f"(pow_ne_zero {exponent} {base})" if base is not None else None
    if kind == "pow_nat":
        exponent = expr.get("exponent")
        base = exact_rational_value(expr.get("base", {}))
        if exponent == {"kind": "var", "id": variable} and base is not None and base != 0:
            return f"(pow_ne_zero {variable} (by norm_num))"
    return None


def _render_nat_eventual_nonzero_term(
    expr: dict[str, Any], variable: str, threshold: int, *, bound_name: str = "hn"
) -> str | None:
    """Return a Lean proof term from ``threshold <= n`` for the supported tail fragment."""
    global_term = _render_nat_nonzero_term(expr, variable)
    if global_term is not None:
        return global_term

    kind = expr.get("kind")
    if kind == "neg":
        inner = _render_nat_eventual_nonzero_term(
            expr.get("arg", {}), variable, threshold, bound_name=bound_name
        )
        return f"(neg_ne_zero.mpr {inner})" if inner is not None else None
    if kind in {"mul", "div"}:
        left = _render_nat_eventual_nonzero_term(
            expr.get("left", {}), variable, threshold, bound_name=bound_name
        )
        right = _render_nat_eventual_nonzero_term(
            expr.get("right", {}), variable, threshold, bound_name=bound_name
        )
        if left is None or right is None:
            return None
        theorem = "mul_ne_zero" if kind == "mul" else "div_ne_zero"
        return f"({theorem} {left} {right})"
    if kind == "pow":
        exponent = expr.get("exponent")
        if not isinstance(exponent, int) or isinstance(exponent, bool) or exponent < 0:
            return None
        if exponent == 0:
            return "(by simp)"
        base = _render_nat_eventual_nonzero_term(
            expr.get("base", {}), variable, threshold, bound_name=bound_name
        )
        return f"(pow_ne_zero {exponent} {base})" if base is not None else None

    needed = _eventual_nonzero_on_nat_threshold(expr, variable)
    if needed is None or threshold < needed:
        return None

    certificate = _signed_shift_polynomial_certificate(expr, variable, threshold)
    if certificate is None:
        return None
    sign, shifted_coefficients = certificate
    shift_base = f"(({variable} : ℝ) - ({threshold} : ℝ))"
    terms: list[str] = []
    for power, coefficient in enumerate(shifted_coefficients):
        if coefficient == 0:
            continue
        rendered = _render_real_fraction(coefficient)
        if power == 0:
            terms.append(rendered)
        elif power == 1:
            terms.append(f"({rendered} * {shift_base})")
        else:
            terms.append(f"({rendered} * ({shift_base} ^ {power}))")
    if not terms:
        return None
    shifted_expr = terms[0]
    for term in terms[1:]:
        shifted_expr = f"({shifted_expr} + {term})"
    original = render_expr(expr)
    typed_original = f"(({original}) : ℝ)"
    signed_original = typed_original if sign > 0 else f"(-{typed_original})"
    return (
        "(by\n"
        f"  have hnreal : ({threshold} : ℝ) ≤ ({variable} : ℝ) := by exact_mod_cast {bound_name}\n"
        f"  have hshiftNonneg : (0 : ℝ) ≤ {shift_base} := by linarith\n"
        f"  have hshiftPositive : (0 : ℝ) < {shifted_expr} := by positivity\n"
        f"  have hshiftIdentity : {signed_original} = {shifted_expr} := by ring\n"
        "  intro hzero\n"
        "  rw [hzero] at hshiftIdentity\n"
        "  nlinarith)"
    )


def _render_series_root_test(pattern: SeriesRootTestPattern, request: dict[str, Any]) -> list[str]:
    names = _premise_name_map(request)
    var = pattern.variable
    term = render_expr(pattern.expression)
    root_ast = {
        "kind": "rpow",
        "base": {"kind": "abs", "arg": pattern.expression},
        "exponent": {
            "kind": "div",
            "left": {"kind": "int", "value": 1},
            "right": {"kind": "cast_real", "arg": {"kind": "var", "id": var}},
        },
    }
    root_expr = render_expr(root_ast)
    target = _render_real_fraction(pattern.limit)
    lines = [
        f"have hroot : Filter.Tendsto (fun {var} : ℕ => ({root_expr} : ℝ)) Filter.atTop (𝓝 ({target} : ℝ)) := by",
    ]
    if pattern.limit_premise_id is not None:
        lines.append(f"  simpa using {names[pattern.limit_premise_id]}")
    else:
        base = _render_real_fraction(pattern.automatic_root_base)
        coefficient = pattern.automatic_root_coefficient
        degree = pattern.automatic_root_degree
        polynomial = pattern.automatic_root_polynomial
        coefficients = pattern.automatic_root_polynomial_coefficients
        denominator_coefficient = pattern.automatic_root_denominator_coefficient
        denominator_degree = pattern.automatic_root_denominator_degree
        denominator = pattern.automatic_root_denominator_polynomial
        denominator_coefficients = pattern.automatic_root_denominator_polynomial_coefficients
        geometric_expression = pattern.automatic_root_geometric_expression
        school_denominator = pattern.automatic_root_school_denominator
        if (
            coefficient is None
            or degree is None
            or polynomial is None
            or coefficients is None
            or denominator_coefficient is None
            or denominator_degree is None
            or denominator is None
            or denominator_coefficients is None
            or geometric_expression is None
            or school_denominator is None
        ):
            raise ValueError("automatic root reconstruction requires an exact polynomial-quotient-geometric pattern")

        # Keep the pure geometric path small: it does not need polynomial
        # asymptotics and is useful as a regression anchor for the broader case.
        if (
            coefficients == (Fraction(1),)
            and denominator_coefficients == (Fraction(1),)
            and _pow_ratio(pattern.expression, var) is not None
        ):
            lines.extend([
                f"  have hbaseabs : |({base} : ℝ)| = {target} := by norm_num",
                "  rw [← hbaseabs]",
                "  refine tendsto_const_nhds.congr' ?_",
                f"  filter_upwards [Filter.eventually_ge_atTop 1] with {var} hn",
                f"  have hn0 : {var} ≠ 0 := by omega",
                "  rw [abs_pow]",
                f"  simpa [one_div] using (Real.pow_rpow_inv_natCast (abs_nonneg ({base} : ℝ)) hn0).symm",
            ])
        else:
            if denominator_coefficients != (Fraction(1),) and pattern.automatic_root_denominator_positive_on_nat:
                denominator_guard_expr = render_expr(denominator)
                lines.extend([
                    f"  have hdenDefined : ∀ {var} : ℕ, (0 : ℝ) < ({denominator_guard_expr} : ℝ) := by",
                    f"    intro {var}",
                    "    positivity",
                ])
            school_denominator_expr = render_expr(school_denominator)
            if pattern.automatic_root_school_denominator_nonzero_on_nat:
                school_nonzero = _render_nat_nonzero_term(school_denominator, var)
                if school_nonzero is None:
                    raise ValueError("automatic school-denominator guard is missing a Lean reconstruction")
                lines.extend([
                    f"  have hschoolDenDefined : ∀ {var} : ℕ, ({school_denominator_expr} : ℝ) ≠ 0 := by",
                    f"    intro {var}",
                    f"    exact {school_nonzero}",
                ])
            else:
                eventual_threshold = pattern.automatic_root_school_denominator_eventual_nonzero_from
                if eventual_threshold is not None:
                    school_nonzero = _render_nat_eventual_nonzero_term(
                        school_denominator, var, eventual_threshold
                    )
                    if school_nonzero is None:
                        raise ValueError("automatic eventual school-denominator guard is missing a Lean reconstruction")
                    proof_lines = school_nonzero.splitlines()
                    lines.extend([
                        f"  have hschoolDenEventuallyDefined : ∀ᶠ {var} : ℕ in Filter.atTop, ({school_denominator_expr} : ℝ) ≠ 0 := by",
                        f"    filter_upwards [Filter.eventually_ge_atTop {eventual_threshold}] with {var} hn",
                        f"    exact {proof_lines[0]}",
                    ])
                    lines.extend(f"      {line}" for line in proof_lines[1:])

            lines.extend(f"  {line}" for line in _render_polynomial_nth_root_limit(
                var=var,
                polynomial=polynomial,
                coefficients=coefficients,
                degree=degree,
                leading_coefficient=coefficient,
            ))

            prefactor = polynomial
            prefactor_root_proof = "hpolyRoot"
            if denominator_coefficients != (Fraction(1),):
                lines.extend(f"  {line}" for line in _render_polynomial_nth_root_limit(
                    var=var,
                    polynomial=denominator,
                    coefficients=denominator_coefficients,
                    degree=denominator_degree,
                    leading_coefficient=denominator_coefficient,
                    tag="Den",
                ))
                numerator_expr = render_expr(polynomial)
                denominator_expr = render_expr(denominator)
                prefactor = {"kind": "div", "left": polynomial, "right": denominator}
                lines.extend([
                    f"  have hquotRootModel : Filter.Tendsto (fun {var} : ℕ => |({numerator_expr} : ℝ)| ^ ((1 : ℝ) / ({var} : ℝ)) / |({denominator_expr} : ℝ)| ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 1) := by",
                    "    convert! hpolyRoot.div hpolyRootDen (by norm_num : (1 : ℝ) ≠ 0) using 1 <;> norm_num",
                    f"  have hquotRoot : Filter.Tendsto (fun {var} : ℕ => |(({numerator_expr} : ℝ) / ({denominator_expr} : ℝ))| ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 1) := by",
                    "    refine hquotRootModel.congr' ?_",
                    f"    filter_upwards [] with {var}",
                    "    rw [abs_div]",
                    f"    rw [Real.div_rpow (abs_nonneg ({numerator_expr} : ℝ)) (abs_nonneg ({denominator_expr} : ℝ))]",
                ])
                prefactor_root_proof = "hquotRoot"

            prefactor_expr = render_expr(prefactor)
            geometric_expr = render_expr(geometric_expression)
            lines.extend([
                f"  have hgeomAbs : ∀ {var} : ℕ, |({geometric_expr} : ℝ)| = (({target} : ℝ) ^ {var}) := by",
                f"    intro {var}",
                "    norm_num [abs_mul, abs_div, abs_pow, ← mul_pow, ← div_pow] <;> simp [one_div, inv_pow]",
                f"  have htermFactor : ∀ {var} : ℕ, ({term} : ℝ) = ({prefactor_expr} : ℝ) * ({geometric_expr} : ℝ) := by",
                f"    intro {var}",
                "    simp [div_eq_mul_inv, mul_inv] <;> ring",
                f"  have hbaseRoot : Filter.Tendsto (fun {var} : ℕ => (({target} : ℝ) ^ {var}) ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 ({target} : ℝ)) := by",
                "    refine tendsto_const_nhds.congr' ?_",
                f"    filter_upwards [Filter.eventually_ge_atTop 1] with {var} hn",
                f"    have hn0 : {var} ≠ 0 := by omega",
                    f"    simpa [one_div] using (Real.pow_rpow_inv_natCast (by norm_num : (0 : ℝ) ≤ {target}) hn0).symm",
                f"  have hmodel : Filter.Tendsto (fun {var} : ℕ => |({prefactor_expr} : ℝ)| ^ ((1 : ℝ) / ({var} : ℝ)) * (({target} : ℝ) ^ {var}) ^ ((1 : ℝ) / ({var} : ℝ))) Filter.atTop (𝓝 ({target} : ℝ)) := by",
                f"    simpa using {prefactor_root_proof}.mul hbaseRoot",
                "  refine hmodel.congr' ?_",
                f"  filter_upwards [Filter.eventually_ge_atTop 1] with {var} hn",
                f"  have hnn : (0 : ℝ) ≤ ({var} : ℝ) := by positivity",
                f"  have habsTerm : |({term} : ℝ)| = |({prefactor_expr} : ℝ)| * (({target} : ℝ) ^ {var}) := by",
                f"    rw [htermFactor {var}, abs_mul, hgeomAbs {var}]",
                "  rw [habsTerm]",
                f"  rw [Real.mul_rpow (abs_nonneg ({prefactor_expr} : ℝ)) (pow_nonneg (by norm_num : (0 : ℝ) ≤ {target}) {var})]",
            ])


    midpoint = (pattern.limit + 1) / 2
    bound = _render_real_fraction(midpoint)
    if pattern.result_kind == "summable":
        lines.extend([
            f"have hrootBound : ∀ᶠ {var} : ℕ in Filter.atTop, ({root_expr} : ℝ) ≤ {bound} :=",
            f"  hroot.eventually_le_const (by norm_num : {target} < {bound})",
            f"refine Summable.of_norm_bounded_eventually_nat (summable_geometric_of_lt_one (by norm_num : (0 : ℝ) ≤ {bound}) (by norm_num : {bound} < 1)) ?_",
            f"filter_upwards [hrootBound, Filter.eventually_ge_atTop 1] with {var} hrootBound hn",
            f"have hn0 : {var} ≠ 0 := by omega",
            f"have hpow : ({root_expr} : ℝ) ^ {var} ≤ ({bound} : ℝ) ^ {var} :=",
            f"  pow_le_pow_left₀ (Real.rpow_nonneg (abs_nonneg ({term} : ℝ)) _) hrootBound {var}",
            f"have hrecover : ({root_expr} : ℝ) ^ {var} = |({term} : ℝ)| := by",
            f"  simpa only [one_div] using (Real.rpow_inv_natCast_pow (abs_nonneg ({term} : ℝ)) hn0)",
            "calc",
            f"  ‖({term} : ℝ)‖ = |({term} : ℝ)| := Real.norm_eq_abs _",
            f"  _ = ({root_expr} : ℝ) ^ {var} := hrecover.symm",
            f"  _ ≤ ({bound} : ℝ) ^ {var} := hpow",
        ])
        return lines

    lines.extend([
        "rintro hs",
        f"have hzero : Filter.Tendsto (fun {var} : ℕ => ‖({term} : ℝ)‖) Filter.atTop (𝓝 0) := by",
        "  simpa using hs.tendsto_atTop_zero.norm",
        f"have hsmall : ∀ᶠ {var} : ℕ in Filter.atTop, ‖({term} : ℝ)‖ < 1 :=",
        "  hzero.eventually_lt_const (by norm_num)",
        f"have hrootLower : ∀ᶠ {var} : ℕ in Filter.atTop, ({bound} : ℝ) ≤ ({root_expr} : ℝ) :=",
        f"  hroot.eventually_const_le (by norm_num : {bound} < {target})",
        f"have hfalse : ∀ᶠ {var} : ℕ in Filter.atTop, False := by",
        f"  filter_upwards [hsmall, hrootLower, Filter.eventually_ge_atTop 1] with {var} hsmall hrootLower hn",
        f"  have hn0 : {var} ≠ 0 := by omega",
        f"  have hpow : ({bound} : ℝ) ^ {var} ≤ ({root_expr} : ℝ) ^ {var} :=",
        f"    pow_le_pow_left₀ (by norm_num : (0 : ℝ) ≤ {bound}) hrootLower {var}",
        f"  have hrecover : ({root_expr} : ℝ) ^ {var} = |({term} : ℝ)| := by",
        f"    simpa only [one_div] using (Real.rpow_inv_natCast_pow (abs_nonneg ({term} : ℝ)) hn0)",
        f"  have hlarge : 1 < ‖({term} : ℝ)‖ := by",
        f"    rw [Real.norm_eq_abs, ← hrecover]",
        f"    exact lt_of_lt_of_le (one_lt_pow₀ (by norm_num : (1 : ℝ) < {bound}) hn0) hpow",
        "  linarith",
        f"rcases hfalse.exists with ⟨{var}, hfalse⟩",
        f"exact hfalse",
    ])
    return lines

def _render_series_comparison(
    pattern: SeriesComparisonPattern,
    request: dict[str, Any],
) -> list[str]:
    names = _premise_name_map(request)
    comparison_name = names[pattern.comparison_premise_id]
    evidence_name = names[pattern.evidence_premise_id]
    comparison_fn = f"(fun ({pattern.variable} : ℕ) => ({render_expr(pattern.comparison_expression)} : ℝ))"

    if pattern.result_kind == "summable":
        if pattern.comparison_result_kind == "finite":
            comparison_proof = f"{comparison_name}.summable"
        else:
            comparison_proof = comparison_name
        if pattern.evidence_mode == "global":
            return [
                f"have hcomparison : Summable {comparison_fn} := by exact {comparison_proof}",
                f"exact hcomparison.of_nonneg_of_le (fun k => ({evidence_name} k).1) (fun k => ({evidence_name} k).2)",
            ]
        return [
            f"have hcomparison : Summable {comparison_fn} := by exact {comparison_proof}",
            f"rcases {evidence_name} with ⟨N, hN⟩",
            f"apply hcomparison.of_norm_bounded_eventually_nat",
            f"filter_upwards [Filter.eventually_ge_atTop N] with k hk",
            f"have hbound := hN k hk",
            f"simpa [Real.norm_eq_abs, abs_of_nonneg hbound.1] using hbound.2",
        ]

    if pattern.evidence_mode == "global":
        return [
            "intro htarget",
            f"have hcomparison : Summable {comparison_fn} :=",
            f"  htarget.of_nonneg_of_le (fun k => ({evidence_name} k).1) (fun k => ({evidence_name} k).2)",
            f"exact {comparison_name} hcomparison",
        ]
    return [
        "intro htarget",
        f"rcases {evidence_name} with ⟨N, hN⟩",
        f"have hcomparison : Summable {comparison_fn} := by",
        f"  apply htarget.of_norm_bounded_eventually_nat",
        f"  filter_upwards [Filter.eventually_ge_atTop N] with k hk",
        f"  have hbound := hN k hk",
        f"  simpa [Real.norm_eq_abs, abs_of_nonneg hbound.1] using hbound.2",
        f"exact {comparison_name} hcomparison",
    ]


def render_rule(step: dict[str, Any], request: dict[str, Any]) -> list[str]:
    rule = step["rule"]
    premises = _premise_name_map(request)
    premise_names = [premises[p] for p in step["premises"]]
    if rule == "ring_identity":
        return ["ring"]
    if rule in {"guarded_cancel", "field_identity"}:
        joined = ", ".join(premise_names)
        guards = f" [{joined}]" if joined else ""
        return [f"field_simp{guards} <;> ring"]
    if rule == "sqrt_square_nonnegative":
        if not premise_names:
            raise ValueError("sqrt_square_nonnegative requires a nonnegative premise")
        return [f"rw [Real.sqrt_sq_eq_abs, abs_of_nonneg {premise_names[0]}]"]
    if rule == "conjugate_identity":
        if not premise_names:
            raise ValueError("conjugate_identity requires a nonnegative radicand premise")
        return [f"nlinarith [Real.sq_sqrt {premise_names[0]}]"]
    if rule == "inverse_one_sided_limit":
        goal = step["claim"]
        direction = goal.get("direction")
        if direction == "right":
            return ["simpa [one_div] using (tendsto_inv_nhdsGT_zero : Filter.Tendsto (fun x : ℝ => x⁻¹) (𝓝[>] (0 : ℝ)) Filter.atTop)"]
        if direction == "left":
            return ["simpa [one_div] using (tendsto_inv_nhdsLT_zero : Filter.Tendsto (fun x : ℝ => x⁻¹) (𝓝[<] (0 : ℝ)) Filter.atBot)"]
        raise ValueError("inverse_one_sided_limit supports only left/right goals")
    if rule == "rational_hole_limit":
        goal = step["claim"]
        if goal.get("kind") != "limit" or goal.get("direction") != "both" or goal.get("result", {}).get("kind") != "finite":
            raise ValueError("rational_hole_limit needs a finite two-sided limit goal")
        var = goal["variable"]
        point = render_expr(goal["point"])
        target = render_expr(goal["result"]["value"] )
        simplified = step["parameters"].get("simplified")
        if not isinstance(simplified, dict):
            raise ValueError("rational_hole_limit requires a simplified expression")
        simple = render_expr(simplified)
        return [
            f"have hs : Filter.Tendsto (fun ({var} : ℝ) => {simple}) (𝓝[≠] {point}) (𝓝 ({target} : ℝ)) := by",
            f"  have hc : ContinuousAt (fun ({var} : ℝ) => {simple}) {point} := by fun_prop",
            "  exact tendsto_nhdsWithin_of_tendsto_nhds (by convert! hc.tendsto using 1 <;> norm_num)",
            "refine hs.congr' ?_",
            f"filter_upwards [self_mem_nhdsWithin] with {var} hx",
            "simp only [Set.mem_compl_iff, Set.mem_singleton_iff] at hx",
            f"have hden : {var} - {point} ≠ 0 := sub_ne_zero.mpr hx",
            "field_simp [hden] <;> ring",
        ]
    if rule == "conjugate_limit":
        pattern = match_conjugate_limit(step["claim"])
        if pattern is None:
            raise ValueError("conjugate_limit claim does not match the supported family")
        goal = step["claim"]
        var = pattern.variable
        point = render_expr(pattern.point)
        root = render_expr(pattern.root)
        target = render_expr(pattern.target)
        source = _domain_filter(goal)
        simple = f"(1 / (Real.sqrt {var} + {root}))"
        original = render_expr(goal["expression"])
        return [
            f"have hroot : Real.sqrt ({point} : ℝ) = {root} := by norm_num",
            f"have hc : ContinuousAt (fun ({var} : ℝ) => {simple}) {point} := by fun_prop (disch := positivity)",
            f"have hs : Filter.Tendsto (fun ({var} : ℝ) => {simple}) ({source}) (𝓝 ({target} : ℝ)) := by",
            "  apply tendsto_nhdsWithin_of_tendsto_nhds",
            "  convert! hc.tendsto using 1 <;> norm_num [hroot]",
            "refine hs.congr' ?_",
            f"filter_upwards [self_mem_nhdsWithin] with {var} hx",
            f"have hx' : 0 ≤ {var} ∧ {var} ≠ {point} := by simpa only [Set.mem_setOf_eq] using hx",
            "rcases hx' with ⟨hx0, hxp⟩",
            f"have hsq : (Real.sqrt {var}) ^ 2 = {var} := Real.sq_sqrt hx0",
            f"have hden : {var} - {point} ≠ 0 := sub_ne_zero.mpr hxp",
            f"have hplus : Real.sqrt {var} + {root} ≠ 0 := by positivity",
            f"change {simple} = {original}",
            "field_simp [hden, hplus]",
            "nlinarith [hsq]",
        ]
    if rule == "series_geometric":
        pattern = match_geometric_series(step["claim"])
        if pattern is None:
            raise ValueError("series_geometric claim is outside the supported exact geometric-series family")
        return _render_geometric_series(pattern)
    if rule == "series_p_series":
        pattern = match_p_series(step["claim"])
        if pattern is None:
            raise ValueError("series_p_series claim is outside the supported shifted exact p-series family")
        return _render_p_series(pattern)
    if rule == "series_comparison":
        claims = _proof_claim_map(request)
        premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
        pattern = match_series_comparison(step["claim"], premise_rows)
        if pattern is None:
            raise ValueError("series_comparison requires a cited comparison series and exact universal bound evidence")
        return _render_series_comparison(pattern, request)
    if rule == "series_ratio_test":
        claims = _proof_claim_map(request)
        premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
        pattern = match_series_ratio_test(step["claim"], premise_rows)
        if pattern is None:
            raise ValueError("series_ratio_test requires a cited global/eventual successive-term bound with exact 0 <= r < 1")
        return _render_series_ratio_test(pattern, request)
    if rule == "series_ratio_limit_test":
        claims = _proof_claim_map(request)
        premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
        pattern = match_series_ratio_limit_test(step["claim"], premise_rows)
        if pattern is None:
            raise ValueError("series_ratio_limit_test requires an exact quotient limit with L < 1 for convergence or L > 1 for divergence; convergence also requires cited global/eventual nonzero terms")
        return _render_series_ratio_limit_test(pattern, request)
    if rule == "series_root_test":
        claims = _proof_claim_map(request)
        premise_rows = [(pid, claims[pid]) for pid in step["premises"]]
        pattern = match_series_root_test(step["claim"], premise_rows)
        if pattern is None:
            raise ValueError("series_root_test requires an exact root limit with 0 <= L < 1 for convergence or L > 1 for divergence; L = 1 is inconclusive")
        return _render_series_root_test(pattern, request)
    if rule == "sequence_nat_at_top":
        pattern = match_nat_at_top(step["claim"])
        if pattern is None:
            raise ValueError("sequence_nat_at_top claim does not match the supported natural shift family")
        return _render_sequence_nat_at_top(pattern)
    if rule == "sequence_algebra":
        claims = _proof_claim_map(request)
        sequence_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "sequence_limit"]
        pattern = match_sequence_algebra(step["claim"], sequence_rows)
        if pattern is None:
            raise ValueError("sequence_algebra claim does not match the supported compositional family")
        premise_props = [proposition_of(claims[pid]) for pid in step["premises"]]
        premise_props = [prop for prop in premise_props if prop is not None]
        missing, violated = sequence_algebra_status(pattern, premise_props)
        if violated:
            raise ValueError("sequence_algebra has a target-domain/ratio violation")
        if missing:
            raise ValueError("sequence_algebra requires cited target-domain/ratio evidence")
        return _render_sequence_algebra(step, request, pattern)
    if rule == "sequence_squeeze":
        claims = _proof_claim_map(request)
        sequence_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "sequence_limit"]
        proposition_rows = [(pid, claims[pid]["proposition"]) for pid in step["premises"] if claims[pid].get("kind") == "proposition"]
        pattern = match_sequence_squeeze(step["claim"], sequence_rows, proposition_rows)
        if pattern is None:
            raise ValueError("sequence_squeeze is missing matching limit/bound evidence")
        return _render_sequence_squeeze(pattern)
    if rule == "sequence_monotone_bounded":
        claims = _proof_claim_map(request)
        proposition_rows = [(pid, claims[pid]["proposition"]) for pid in step["premises"] if claims[pid].get("kind") == "proposition"]
        pattern = match_sequence_monotone_bounded(step["claim"], proposition_rows)
        if pattern is None:
            raise ValueError("sequence_monotone_bounded is missing matching monotonicity/boundedness evidence")
        return _render_sequence_monotone_bounded(pattern)
    if rule == "sequence_elementary_divergence":
        claims = _proof_claim_map(request)
        sequence_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "sequence_limit"]
        pattern = match_sequence_elementary_divergence(step["claim"], sequence_rows)
        if pattern is None:
            raise ValueError("sequence_elementary_divergence claim is outside the supported elementary oscillation/growth family or lacks the required cited finite-tail limit")
        return _render_sequence_elementary_divergence(step, request, pattern)
    if rule == "sequence_affine_ratio":
        pattern = match_sequence_affine_ratio(step["claim"])
        if pattern is None:
            raise ValueError("sequence_affine_ratio claim is outside the supported affine-over-affine family")
        return _render_sequence_affine_ratio(pattern)
    if rule == "sequence_quadratic_ratio":
        pattern = match_sequence_quadratic_ratio(step["claim"])
        if pattern is None:
            raise ValueError("sequence_quadratic_ratio claim is outside the supported quadratic-over-quadratic family")
        return _render_sequence_quadratic_ratio(pattern)
    if rule == "sequence_polynomial_degree_ratio":
        pattern = match_sequence_polynomial_degree_ratio(step["claim"])
        if pattern is None:
            raise ValueError("sequence_polynomial_degree_ratio claim is outside the supported exact polynomial-ratio asymptotic family")
        return _render_sequence_polynomial_degree_ratio(pattern)
    if rule == "sequence_rational_shift":
        pattern = match_sequence_rational_shift(step["claim"])
        if pattern is None:
            raise ValueError("sequence_rational_shift claim is outside the supported exact shift family")
        return _render_sequence_rational_shift(pattern)
    if rule == "limit_algebra":
        claims = _proof_claim_map(request)
        limit_rows = [(pid, claims[pid]) for pid in step["premises"] if claims[pid].get("kind") == "limit"]
        pattern = match_limit_algebra(step["claim"], limit_rows)
        if pattern is None:
            raise ValueError("limit_algebra claim does not match the supported compositional family")
        premise_props = [proposition_of(claims[pid]) for pid in step["premises"]]
        premise_props = [prop for prop in premise_props if prop is not None]
        missing, violated = limit_algebra_status(pattern, premise_props)
        if violated:
            raise ValueError("limit_algebra has a target-domain violation")
        if missing:
            raise ValueError("limit_algebra requires cited target-domain evidence")
        return _render_limit_algebra(step, request, pattern)

    if rule == "continuity_limit":
        pattern = match_continuity_limit(step["claim"])
        if pattern is None:
            raise ValueError("continuity_limit claim does not match the supported family")
        claims = _proof_claim_map(request)
        premise_props = [proposition_of(claims[pid]) for pid in step["premises"]]
        premise_props = [prop for prop in premise_props if prop is not None]
        missing, violated = continuity_pattern_status(pattern, premise_props)
        if violated:
            raise ValueError("continuity_limit has a pointwise school-domain violation")
        if missing:
            raise ValueError("continuity_limit requires cited pointwise domain evidence")

        lines: list[str] = []
        for index, guard in enumerate(pattern.guards, start=1):
            tactic = continuity_guard_auto_tactic(guard)
            name: str | None = None
            if tactic is not None:
                name = f"{step['id']}_continuity_guard_{index}"
                rendered = render_expr(guard.expression)
                if guard.relation == "nonzero":
                    guard_type = f"({rendered} : ℝ) ≠ 0"
                elif guard.relation == "positive":
                    guard_type = f"0 < ({rendered} : ℝ)"
                else:
                    guard_type = f"0 ≤ ({rendered} : ℝ)"
                lines.append(f"have {name} : {guard_type} := by {tactic}")
            else:
                name = next(
                    (
                        pid for pid in step["premises"]
                        if proposition_of(claims[pid]) is not None
                        and same_logic(proposition_of(claims[pid]), guard.claim)
                    ),
                    None,
                )
            if name is None:
                raise ValueError("continuity_limit could not bind a required domain guard")
            if guard.relation == "positive":
                rendered = render_expr(guard.expression)
                lines.append(
                    f"have {step['id']}_continuity_guard_{index}_nonzero : ({rendered} : ℝ) ≠ 0 := ne_of_gt {name}"
                )

        var = pattern.variable
        point = render_expr(pattern.point)
        expression = render_expr(pattern.expression)
        lines.append(
            f"have {step['id']}_continuous : ContinuousAt (fun ({var} : ℝ) => {expression}) {point} := by"
        )
        lines.append("  fun_prop")
        lines.append(
            f"convert! tendsto_nhdsWithin_of_tendsto_nhds {step['id']}_continuous.tendsto using 1 <;> simp <;> norm_num <;> ring"
        )
        return lines

    if rule == "ivt_exists":
        pattern = match_ivt_existence(step["claim"])
        if pattern is None:
            raise ValueError("ivt_exists claim does not match the supported polynomial family")
        var = pattern.variable
        lower = render_expr(pattern.lower)
        upper = render_expr(pattern.upper)
        expression = render_expr(pattern.expression)
        target = render_expr(pattern.target)
        theorem = "intermediate_value_Icc'" if pattern.reverse_values else "intermediate_value_Icc"
        lower_image = f"((fun ({var} : ℝ) => {expression}) {lower})"
        upper_image = f"((fun ({var} : ℝ) => {expression}) {upper})"
        image_lo, image_hi = (upper_image, lower_image) if pattern.reverse_values else (lower_image, upper_image)
        return [
            f"have hcont : ContinuousOn (fun ({var} : ℝ) => {expression}) (Set.Icc {lower} {upper}) := by fun_prop",
            f"have htarget : ({target} : ℝ) ∈ Set.Icc {image_lo} {image_hi} := by norm_num",
            f"obtain ⟨{var}, hmem, hvalue⟩ := {theorem} (by norm_num : ({lower} : ℝ) ≤ {upper}) hcont htarget",
            f"refine ⟨{var}, hmem.1, hmem.2, ?_⟩",
            "simpa using hvalue",
        ]
    if rule == "continuous_ivt_exists":
        pattern = match_continuous_ivt_existence(step["claim"])
        if pattern is None:
            raise ValueError("continuous_ivt_exists claim does not match the supported family")
        claims = _proof_claim_map(request)
        premise_props = [proposition_of(claims[pid]) for pid in step["premises"]]
        premise_props = [prop for prop in premise_props if prop is not None]
        missing_guards, violated_guards = continuous_ivt_guard_status(pattern, premise_props)
        if violated_guards:
            raise ValueError("continuous_ivt_exists has an interval school-domain violation")
        if missing_guards:
            raise ValueError("continuous_ivt_exists requires cited interval-wide domain evidence")
        orientation, missing = select_continuous_ivt_orientation(pattern, premise_props)
        if orientation is None or missing:
            raise ValueError("continuous_ivt_exists requires endpoint bracketing evidence")

        var = pattern.variable
        lower = render_expr(pattern.lower)
        upper = render_expr(pattern.upper)
        expression = render_expr(pattern.expression)
        target = render_expr(pattern.target)
        lines: list[str] = [
            f"have {step['id']}_continuous : ContinuousOn (fun ({var} : ℝ) => {expression}) (Set.Icc {lower} {upper}) := by",
            f"  intro {var} hmem",
        ]
        for index, guard in enumerate(pattern.guards, start=1):
            tactic = continuity_guard_auto_tactic(guard)
            rendered = render_expr(guard.expression)
            if guard.relation == "nonzero":
                guard_type = f"({rendered} : ℝ) ≠ 0"
            elif guard.relation == "positive":
                guard_type = f"0 < ({rendered} : ℝ)"
            else:
                guard_type = f"0 ≤ ({rendered} : ℝ)"
            guard_name = f"{step['id']}_interval_guard_{index}"
            if tactic is not None:
                lines.append(f"  have {guard_name} : {guard_type} := by {tactic}")
            else:
                evidence_match = None
                for pid in step["premises"]:
                    prop = proposition_of(claims[pid])
                    if prop is None:
                        continue
                    evidence = match_interval_guard_evidence(pattern, guard, prop)
                    if evidence is not None:
                        evidence_match = (pid, evidence)
                        break
                if evidence_match is None:
                    raise ValueError("continuous_ivt_exists could not bind a required interval guard")
                pid, evidence = evidence_match
                lines.append(f"  have {guard_name} : {guard_type} := by")
                if evidence.conversion == "exact":
                    lines.append(f"    exact {pid} {var} hmem")
                elif evidence.conversion == "positive_to_nonzero":
                    lines.append(f"    exact ne_of_gt ({pid} {var} hmem)")
                elif evidence.conversion == "negative_to_nonzero":
                    lines.append(f"    exact ne_of_lt ({pid} {var} hmem)")
                elif evidence.conversion == "positive_to_nonnegative":
                    lines.append(f"    exact le_of_lt ({pid} {var} hmem)")
                else:
                    raise ValueError(f"unsupported interval guard evidence conversion {evidence.conversion!r}")
            if guard.relation == "positive":
                lines.append(
                    f"  have {guard_name}_nonzero : ({rendered} : ℝ) ≠ 0 := ne_of_gt {guard_name}"
                )
        lines.append("  fun_prop")

        brackets = pattern.forward_brackets if orientation == "forward" else pattern.reverse_brackets
        bracket_names: list[str] = []
        for index, bracket in enumerate(brackets, start=1):
            tactic = ivt_bracket_auto_tactic(bracket)
            if tactic is not None:
                name = f"{step['id']}_bracket_{index}"
                lines.append(f"have {name} : ({render_expr(bracket['left'])} : ℝ) ≤ ({render_expr(bracket['right'])} : ℝ) := by {tactic}")
            else:
                name = next(
                    (
                        pid for pid in step["premises"]
                        if proposition_of(claims[pid]) is not None
                        and same_logic(proposition_of(claims[pid]), bracket)
                    ),
                    None,
                )
                if name is None:
                    raise ValueError("continuous_ivt_exists could not bind an endpoint bracket")
            bracket_names.append(name)

        theorem = "intermediate_value_Icc" if orientation == "forward" else "intermediate_value_Icc'"
        lower_image = f"((fun ({var} : ℝ) => {expression}) {lower})"
        upper_image = f"((fun ({var} : ℝ) => {expression}) {upper})"
        image_lo, image_hi = (lower_image, upper_image) if orientation == "forward" else (upper_image, lower_image)
        lines.extend([
            f"have {step['id']}_target : ({target} : ℝ) ∈ Set.Icc {image_lo} {image_hi} := ⟨{bracket_names[0]}, {bracket_names[1]}⟩",
            f"obtain ⟨{var}, hmem, hvalue⟩ := {theorem} (by norm_num : ({lower} : ℝ) ≤ {upper}) {step['id']}_continuous {step['id']}_target",
            f"refine ⟨{var}, hmem.1, hmem.2, ?_⟩",
            "simpa using hvalue" if pattern.target_on_right else "simpa using hvalue.symm",
        ])
        return lines

    if rule == "recursive_derivative":
        patterns = match_recursive_derivative(step["claim"])
        claims = _proof_claim_map(request)
        premise_props = [proposition_of(claims[pid]) for pid in step["premises"]]
        premise_props = [prop for prop in premise_props if prop is not None]
        pattern, missing, violated = select_recursive_derivative_pattern(patterns, premise_props)
        if pattern is None:
            raise ValueError("recursive_derivative claim does not match the supported recursive fragment")
        if violated:
            raise ValueError("recursive_derivative has a pointwise domain/sign violation")
        if missing:
            raise ValueError("recursive_derivative requires cited pointwise guard evidence")

        lines: list[str] = []
        guard_names: dict[str, str] = {}
        helper_nonzero: list[str] = []
        sqrt_guard_keys = _recursive_sqrt_guard_keys(pattern.expression, pattern.variable, pattern.point)
        for index, guard in enumerate(pattern.guards, start=1):
            key = canonical_hash(guard.claim)
            exact = derivative_guard_exact_status(guard)
            tactic = derivative_guard_auto_tactic(guard)
            name: str | None = None
            if tactic is not None:
                name = f"{step['id']}_guard_{index}"
                rendered_guard_expr = render_expr(guard.expression)
                if guard.relation == "nonzero":
                    typed_guard = f"({rendered_guard_expr} : ℝ) ≠ 0"
                elif guard.relation == "positive":
                    typed_guard = f"0 < ({rendered_guard_expr} : ℝ)"
                else:
                    typed_guard = f"({rendered_guard_expr} : ℝ) < 0"
                lines.append(f"have {name} : {typed_guard} := by {tactic}")
            elif exact is None:
                name = next(
                    (pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), guard.claim)),
                    None,
                )
            if name is None:
                raise ValueError("recursive_derivative could not bind a required pointwise guard")
            guard_names[key] = name
            rendered = render_expr(guard.expression)
            if guard.relation == "positive":
                nz = f"{step['id']}_guard_{index}_nonzero"
                lines.append(f"have {nz} : ({rendered} : ℝ) ≠ 0 := ne_of_gt {name}")
                helper_nonzero.append(nz)
                if key in sqrt_guard_keys:
                    sqrt_nz = f"{step['id']}_guard_{index}_sqrt_nonzero"
                    lines.append(
                        f"have {sqrt_nz} : Real.sqrt ({rendered} : ℝ) ≠ 0 := "
                        f"ne_of_gt (Real.sqrt_pos.2 {name})"
                    )
                    helper_nonzero.append(sqrt_nz)
            elif guard.relation == "negative":
                nz = f"{step['id']}_guard_{index}_nonzero"
                lines.append(f"have {nz} : ({rendered} : ℝ) ≠ 0 := ne_of_lt {name}")
                helper_nonzero.append(nz)
            else:
                helper_nonzero.append(name)

        point = render_expr(pattern.point)
        proof_term = _recursive_has_deriv_term(pattern.expression, pattern.variable, pattern.point, point, guard_names)
        simp_guards = list(dict.fromkeys(helper_nonzero))
        guard_list = ", ".join(simp_guards)
        if guard_list:
            lines.append(f"convert! {proof_term} using 1 <;> (solve | (norm_num <;> field_simp [{guard_list}] <;> ring) | (ext x <;> norm_num <;> field_simp [{guard_list}] <;> ring))")
        else:
            lines.append(f"convert! {proof_term} using 1 <;> (solve | (norm_num <;> ring) | (ext x <;> norm_num <;> ring))")
        return lines
    if rule == "polynomial_derivative":
        pattern = match_polynomial_derivative(step["claim"])
        if pattern is None:
            raise ValueError("polynomial_derivative claim does not match the supported family")
        point = render_expr(pattern.point)
        proof_term = _polynomial_has_deriv_term(pattern.expression, pattern.variable, point)
        return [f"convert! {proof_term} using 1 <;> (solve | (norm_num <;> ring) | (ext x <;> norm_num <;> ring))"]
    if rule == "quotient_derivative":
        pattern = match_quotient_derivative(step["claim"])
        if pattern is None:
            raise ValueError("quotient_derivative claim does not match the supported family")
        point = render_expr(pattern.point)
        numerator_proof = _polynomial_has_deriv_term(pattern.numerator, pattern.variable, point)
        denominator_proof = _polynomial_has_deriv_term(pattern.denominator, pattern.variable, point)
        denominator_at = render_expr(pattern.denominator_at_point)
        lines: list[str] = []
        if quotient_denominator_is_exact_nonzero(pattern):
            guard_name = f"{step['id']}_denominator_nonzero"
            lines.append(f"have {guard_name} : ({denominator_at} : ℝ) ≠ 0 := by norm_num")
        else:
            expected = nonzero_claim(pattern.denominator_at_point)
            claims = _proof_claim_map(request)
            guard_name = next(
                (pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), expected)),
                None,
            )
            if guard_name is None:
                raise ValueError("quotient_derivative requires cited denominator-nonzero evidence at the evaluation point")
        proof_term = f"({numerator_proof}).fun_div ({denominator_proof}) {guard_name}"
        lines.append(f"convert! {proof_term} using 1 <;> (solve | (norm_num <;> field_simp [{guard_name}] <;> ring) | (ext x <;> norm_num <;> field_simp [{guard_name}] <;> ring))")
        return lines
    if rule == "sqrt_derivative":
        pattern = match_sqrt_derivative(step["claim"])
        if pattern is None:
            raise ValueError("sqrt_derivative claim does not match the supported family")
        point = render_expr(pattern.point)
        radicand_at = render_expr(pattern.radicand_at_point)
        inner_proof = _polynomial_has_deriv_term(pattern.radicand, pattern.variable, point)
        expected_positive = {"kind": "lt", "left": {"kind": "int", "value": 0}, "right": pattern.radicand_at_point}
        claims = _proof_claim_map(request)
        positive_name = next(
            (pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), expected_positive)),
            None,
        )
        lines: list[str] = []
        if positive_name is None and sqrt_radicand_is_exact_positive(pattern):
            positive_name = f"{step['id']}_radicand_positive"
            lines.append(f"have {positive_name} : 0 < ({radicand_at} : ℝ) := by norm_num")
        if positive_name is None:
            raise ValueError("sqrt_derivative requires cited strict-positivity evidence at the evaluation point")
        radicand_nonzero = f"{step['id']}_radicand_nonzero"
        sqrt_nonzero = f"{step['id']}_sqrt_nonzero"
        proof_term = f"({inner_proof}).sqrt {radicand_nonzero}"
        lines.extend([
            f"have {radicand_nonzero} : ({radicand_at} : ℝ) ≠ 0 := ne_of_gt {positive_name}",
            f"have {sqrt_nonzero} : Real.sqrt ({radicand_at} : ℝ) ≠ 0 := ne_of_gt (Real.sqrt_pos.2 {positive_name})",
            f"convert! {proof_term} using 1 <;> (solve | (norm_num <;> field_simp [{sqrt_nonzero}] <;> ring) | (ext x <;> norm_num <;> field_simp [{sqrt_nonzero}] <;> ring))",
        ])
        return lines
    if rule in {"exp_derivative", "log_derivative", "sin_derivative", "cos_derivative"}:
        pattern = match_elementary_derivative(step["claim"])
        expected_function = rule.removesuffix("_derivative")
        if pattern is None or pattern.function != expected_function:
            raise ValueError(f"{rule} claim does not match the supported family")
        point = render_expr(pattern.point)
        argument_at = render_expr(pattern.argument_at_point)
        inner_proof = _polynomial_has_deriv_term(pattern.argument, pattern.variable, point)
        if pattern.function == "log":
            expected_positive = {"kind": "lt", "left": {"kind": "int", "value": 0}, "right": pattern.argument_at_point}
            claims = _proof_claim_map(request)
            positive_name = next(
                (pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), expected_positive)),
                None,
            )
            lines: list[str] = []
            if positive_name is None and elementary_argument_is_exact_positive(pattern):
                positive_name = f"{step['id']}_argument_positive"
                lines.append(f"have {positive_name} : 0 < ({argument_at} : ℝ) := by norm_num")
            if positive_name is None:
                raise ValueError("log_derivative requires cited strict-positivity evidence at the evaluation point")
            nonzero_name = f"{step['id']}_argument_nonzero"
            lines.append(f"have {nonzero_name} : ({argument_at} : ℝ) ≠ 0 := ne_of_gt {positive_name}")
            proof_term = f"({inner_proof}).log {nonzero_name}"
            lines.append(f"convert! {proof_term} using 1 <;> (solve | (norm_num <;> field_simp [{nonzero_name}] <;> ring) | (ext x <;> norm_num <;> field_simp [{nonzero_name}] <;> ring))")
            return lines
        method = {"exp": "exp", "sin": "sin", "cos": "cos"}[pattern.function]
        proof_term = f"({inner_proof}).{method}"
        return [f"convert! {proof_term} using 1 <;> (solve | (norm_num <;> ring) | (ext x <;> norm_num <;> ring))"]
    if rule == "abs_derivative":
        pattern = match_abs_derivative(step["claim"])
        if pattern is None:
            raise ValueError("abs_derivative claim does not match the supported family")
        point = render_expr(pattern.point)
        argument_at = render_expr(pattern.argument_at_point)
        inner_proof = _polynomial_has_deriv_term(pattern.argument, pattern.variable, point)
        claims = _proof_claim_map(request)
        sign = abs_argument_exact_sign(pattern)
        guard_name: str | None = None
        lines: list[str] = []
        if sign == "positive" and pattern.matches_positive:
            guard_name = f"{step['id']}_argument_positive"
            lines.append(f"have {guard_name} : 0 < ({argument_at} : ℝ) := by norm_num")
        elif sign == "negative" and pattern.matches_negative:
            guard_name = f"{step['id']}_argument_negative"
            lines.append(f"have {guard_name} : ({argument_at} : ℝ) < 0 := by norm_num")
        elif sign is None:
            expected_positive = {"kind": "lt", "left": {"kind": "int", "value": 0}, "right": pattern.argument_at_point}
            expected_negative = {"kind": "lt", "left": pattern.argument_at_point, "right": {"kind": "int", "value": 0}}
            if pattern.matches_positive:
                guard_name = next(
                    (pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), expected_positive)),
                    None,
                )
                if guard_name is not None:
                    sign = "positive"
            if guard_name is None and pattern.matches_negative:
                guard_name = next(
                    (pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), expected_negative)),
                    None,
                )
                if guard_name is not None:
                    sign = "negative"
        if guard_name is None or sign not in {"positive", "negative"}:
            raise ValueError("abs_derivative requires a strict sign matching the claimed branch")
        outer = "hasDerivAt_abs_pos" if sign == "positive" else "hasDerivAt_abs_neg"
        proof_term = f"({outer} {guard_name}).comp ({point}) ({inner_proof})"
        lines.append(f"convert! {proof_term} using 1 <;> (solve | (norm_num <;> ring) | (ext x <;> norm_num <;> ring))")
        return lines
    if rule == "piecewise_jump":
        pattern = match_piecewise_jump(step["claim"])
        if pattern is None:
            raise ValueError("piecewise_jump claim does not match the supported family")
        goal = step["claim"]
        var = pattern.variable
        point = render_expr(pattern.point)
        left = f"({render_expr(pattern.left_value)} : ℝ)"
        right = f"({render_expr(pattern.right_value)} : ℝ)"
        function = f"(fun ({var} : ℝ) => {render_expr(goal['expression'])})"
        return [
            "rintro ⟨l, hl⟩",
            f"have hl_left : Filter.Tendsto {function} (𝓝[<] {point}) (𝓝 l) := hl.mono_left (nhdsLT_le_nhdsNE {point})",
            f"have hl_right : Filter.Tendsto {function} (𝓝[>] {point}) (𝓝 l) := hl.mono_left (nhdsGT_le_nhdsNE {point})",
            f"have hleft : Filter.Tendsto {function} (𝓝[<] {point}) (𝓝 ({left} : ℝ)) := by",
            f"  have hc : Filter.Tendsto (fun _ : ℝ => {left}) (𝓝[<] {point}) (𝓝 ({left} : ℝ)) := tendsto_const_nhds",
            "  refine hc.congr' ?_",
            f"  filter_upwards [self_mem_nhdsWithin] with {var} hx",
            "  simp only [Set.mem_Iio] at hx",
            "  simp [hx]",
            f"have hright : Filter.Tendsto {function} (𝓝[>] {point}) (𝓝 ({right} : ℝ)) := by",
            f"  have hc : Filter.Tendsto (fun _ : ℝ => {right}) (𝓝[>] {point}) (𝓝 ({right} : ℝ)) := tendsto_const_nhds",
            "  refine hc.congr' ?_",
            f"  filter_upwards [self_mem_nhdsWithin] with {var} hx",
            "  simp only [Set.mem_Ioi] at hx",
            "  have hnot : ¬ " + var + " < " + point + " := not_lt.mpr (le_of_lt hx)",
            "  simp [hnot]",
            "have heq_left : l = " + left + " := tendsto_nhds_unique hl_left hleft",
            "have heq_right : l = " + right + " := tendsto_nhds_unique hl_right hright",
            "have hbranch : " + left + " = " + right + " := heq_left.symm.trans heq_right",
            "norm_num at hbranch",
        ]
    if rule == "eq_subst":
        claims = _proof_claim_map(request)
        target = proposition_of(step["claim"])
        if target is None or len(step["premises"]) != 2:
            raise ValueError("eq_subst requires two proposition premises")
        for eq_id in step["premises"]:
            equality = proposition_of(claims[eq_id])
            if equality is None or equality.get("kind") != "eq":
                continue
            source_id = next((pid for pid in step["premises"] if pid != eq_id), None)
            source = proposition_of(claims[source_id]) if source_id else None
            if source is None:
                continue
            if equality["left"].get("kind") == "var":
                expected = substitute_prop(source, equality["left"]["id"], equality["right"])
                if same_logic(target, expected):
                    return [f"simpa only [{eq_id}] using {source_id}"]
            if equality["right"].get("kind") == "var":
                expected = substitute_prop(source, equality["right"]["id"], equality["left"])
                if same_logic(target, expected):
                    return [f"simpa only [← {eq_id}] using {source_id}"]
        raise ValueError("eq_subst premises do not produce the target")
    if rule == "congr_arg":
        if len(premise_names) != 1:
            raise ValueError("congr_arg requires one equality premise")
        target = proposition_of(step["claim"])
        if target is None or target.get("kind") != "eq" or target["left"].get("kind") != "apply":
            raise ValueError("congr_arg requires an application equality target")
        function = render_expr(target["left"]["function"] )
        return [f"exact congrArg {function} {premise_names[0]}"]
    if rule in {"function_ext", "set_ext", "subset_intro"}:
        if len(premise_names) != 1:
            raise ValueError(f"{rule} requires exactly one universal premise")
        universal_id = premise_names[0]
        claims = _proof_claim_map(request)
        universal = proposition_of(claims[universal_id])
        if universal is None or universal.get("kind") != "forall":
            raise ValueError(f"{rule} requires a universally quantified premise")
        binder_id = universal["binder"]["id"]
        if rule == "function_ext":
            return [f"exact funext fun {binder_id} => {universal_id} {binder_id}"]
        if rule == "set_ext":
            return [f"exact Set.ext fun {binder_id} => {universal_id} {binder_id}"]
        hyp = f"hmem_{step['id']}"
        return [f"exact fun {binder_id} {hyp} => {universal_id} {binder_id} {hyp}"]
    if rule == "subset_elim":
        claims = _proof_claim_map(request)
        subset_id = next((pid for pid in step["premises"] if (proposition_of(claims[pid]) or {}).get("kind") == "subset"), None)
        if subset_id is None:
            raise ValueError("subset_elim requires a subset premise")
        member_id = next((pid for pid in step["premises"] if pid != subset_id and (proposition_of(claims[pid]) or {}).get("kind") == "mem"), None)
        if member_id is None:
            raise ValueError("subset_elim requires a membership premise")
        return [f"exact {subset_id} {member_id}"]
    if rule == "sub_ne_zero_from_ne":
        if len(premise_names) != 1:
            raise ValueError("sub_ne_zero_from_ne requires exactly one premise")
        return [f"exact sub_ne_zero.mpr {premise_names[0]}"]
    if rule == "true_intro":
        return ["trivial"]
    if rule == "and_intro":
        target = proposition_of(step["claim"])
        claims = _proof_claim_map(request)
        if target is None or target.get("kind") != "and":
            raise ValueError("and_intro requires a conjunction target")
        left = next((pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), target["left"])), None)
        right = next((pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), target["right"])), None)
        if left is None or right is None:
            raise ValueError("and_intro premises do not establish both conjuncts")
        return [f"exact ⟨{left}, {right}⟩"]
    if rule in {"and_elim_left", "and_elim_right"}:
        if len(premise_names) != 1:
            raise ValueError("and elimination requires one premise")
        projection = "1" if rule.endswith("left") else "2"
        return [f"exact {premise_names[0]}.{projection}"]
    if rule in {"or_intro_left", "or_intro_right"}:
        if len(premise_names) != 1:
            raise ValueError("or introduction requires one premise")
        constructor = "Or.inl" if rule.endswith("left") else "Or.inr"
        return [f"exact {constructor} {premise_names[0]}"]
    if rule == "modus_ponens":
        claims = _proof_claim_map(request)
        implication = next((pid for pid in step["premises"] if (proposition_of(claims[pid]) or {}).get("kind") == "implies"), None)
        if implication is None:
            raise ValueError("modus ponens requires an implication")
        antecedent = proposition_of(claims[implication])["left"]
        source = next((pid for pid in step["premises"] if pid != implication and proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), antecedent)), None)
        if source is None:
            raise ValueError("modus ponens requires the antecedent")
        return [f"exact {implication} {source}"]
    if rule == "iff_intro":
        target = proposition_of(step["claim"])
        claims = _proof_claim_map(request)
        if target is None or target.get("kind") != "iff":
            raise ValueError("iff_intro requires iff target")
        forward = {"kind": "implies", "left": target["left"], "right": target["right"]}
        backward = {"kind": "implies", "left": target["right"], "right": target["left"]}
        fwd = next((pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), forward)), None)
        bwd = next((pid for pid in step["premises"] if proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), backward)), None)
        if fwd is None or bwd is None:
            raise ValueError("iff_intro requires both implications")
        return [f"exact ⟨{fwd}, {bwd}⟩"]
    if rule in {"iff_mp", "iff_mpr"}:
        claims = _proof_claim_map(request)
        equivalence = next((pid for pid in step["premises"] if (proposition_of(claims[pid]) or {}).get("kind") == "iff"), None)
        if equivalence is None:
            raise ValueError("iff elimination requires equivalence")
        eq_prop = proposition_of(claims[equivalence])
        source_prop = eq_prop["left"] if rule == "iff_mp" else eq_prop["right"]
        source = next((pid for pid in step["premises"] if pid != equivalence and proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), source_prop)), None)
        if source is None:
            raise ValueError("iff elimination requires the matching side")
        projection = "mp" if rule == "iff_mp" else "mpr"
        return [f"exact {equivalence}.{projection} {source}"]
    if rule == "contradiction":
        claims = _proof_claim_map(request)
        for pid in step["premises"]:
            prop = proposition_of(claims[pid])
            if prop is not None and prop.get("kind") == "not":
                positive = next((other for other in step["premises"] if other != pid and proposition_of(claims[other]) is not None and same_logic(proposition_of(claims[other]), prop["arg"])), None)
                if positive is not None:
                    return [f"exact {pid} {positive}"]
        raise ValueError("contradiction requires P and not P")
    if rule == "false_elim":
        if len(premise_names) != 1:
            raise ValueError("false elimination requires one premise")
        return [f"exact False.elim {premise_names[0]}"]
    if rule == "exists_intro":
        if len(premise_names) != 1:
            raise ValueError("exists introduction requires one instantiated body proof")
        witness = step["parameters"].get("witness")
        if not isinstance(witness, dict):
            raise ValueError("exists introduction requires witness")
        return [f"exact ⟨{render_expr(witness)}, {premise_names[0]}⟩"]
    if rule == "forall_elim":
        claims = _proof_claim_map(request)
        universal = next((pid for pid in step["premises"] if (proposition_of(claims[pid]) or {}).get("kind") == "forall"), None)
        witness = step["parameters"].get("witness")
        if universal is None or not isinstance(witness, dict):
            raise ValueError("forall elimination requires universal premise and witness")
        return [f"exact {universal} {render_expr(witness)}"]
    if rule == "eq_refl":
        return ["rfl"]
    if rule == "eq_symm":
        if len(premise_names) != 1:
            raise ValueError("eq_symm requires exactly one premise")
        return [f"exact {premise_names[0]}.symm"]
    if rule == "eq_trans":
        if len(premise_names) != 2:
            raise ValueError("eq_trans requires exactly two premises")
        return [f"exact {premise_names[0]}.trans {premise_names[1]}"]
    if rule in {"add_both_sides", "subtract_both_sides"}:
        premise_id, _source = _relation_premise(step, request)
        return [f"linarith [{premise_id}]"]
    if rule == "multiply_both_sides":
        premise_id, _source = _relation_premise(step, request)
        term = step["parameters"].get("term")
        if not isinstance(term, dict):
            raise ValueError("multiply_both_sides requires term")
        rendered = render_expr(term)
        return [f"have hmul := congrArg (fun t => t * {rendered}) {premise_id}", "nlinarith [hmul]"]
    if rule == "divide_both_sides":
        premise_id, source_goal = _relation_premise(step, request)
        divisor = step["parameters"].get("term")
        if not isinstance(divisor, dict):
            raise ValueError("divide_both_sides requires term")
        claims = _proof_claim_map(request)
        expected = nonzero_claim(divisor)
        nonzero_name = None
        for pid in step["premises"]:
            claim = claims[pid]
            if claim.get("kind") == "proposition" and claim.get("proposition") == expected:
                nonzero_name = pid
                break
        if nonzero_name is None:
            raise ValueError("divide_both_sides requires cited nonzero evidence")
        source = source_goal["proposition"]
        target = step["claim"]["proposition"]
        rendered = render_expr(divisor)
        return [
            "calc",
            f"  {render_expr(target['left'])} = ({render_expr(source['left'])} / {rendered}) := by field_simp [{nonzero_name}] <;> ring",
            f"  _ = ({render_expr(source['right'])} / {rendered}) := by exact congrArg (fun z => z / {rendered}) {premise_id}",
            f"  _ = {render_expr(target['right'])} := by field_simp [{nonzero_name}] <;> ring",
        ]
    if rule == "square_both_sides":
        premise_id, _source = _relation_premise(step, request)
        return [f"nlinarith [{premise_id}]"]
    if rule in {"scale_inequality_positive", "scale_inequality_negative"}:
        factor = step["parameters"].get("factor")
        if not isinstance(factor, dict):
            raise ValueError("inequality scaling requires factor")
        claims = _proof_claim_map(request)
        zero = {"kind": "int", "value": 0}
        sign_prop = (
            {"kind": "lt", "left": zero, "right": factor}
            if rule == "scale_inequality_positive"
            else {"kind": "lt", "left": factor, "right": zero}
        )
        sign_name = None
        source_name = None
        source_kind = None
        for pid in step["premises"]:
            claim = claims[pid]
            if claim.get("kind") != "proposition":
                continue
            prop = claim.get("proposition", {})
            if prop == sign_prop:
                sign_name = pid
            elif prop.get("kind") in {"lt", "le", "gt", "ge"} and source_name is None:
                source_name = pid
                source_kind = prop["kind"]
        if sign_name is None or source_name is None or source_kind is None:
            raise ValueError("inequality scaling requires source inequality and sign evidence")
        if rule == "scale_inequality_positive":
            theorem = "mul_lt_mul_of_pos_right" if source_kind in {"lt", "gt"} else "mul_le_mul_of_nonneg_right"
            sign_arg = sign_name if source_kind in {"lt", "gt"} else f"(le_of_lt {sign_name})"
        else:
            theorem = "mul_lt_mul_of_neg_right" if source_kind in {"lt", "gt"} else "mul_le_mul_of_nonpos_right"
            sign_arg = sign_name if source_kind in {"lt", "gt"} else f"(le_of_lt {sign_name})"
        return [f"have hscale := {theorem} {source_name} {sign_arg}", "nlinarith [hscale]"]
    if rule == "norm_num":
        return ["norm_num"]
    if rule == "linarith":
        return ["linarith"]
    if rule == "nlinarith":
        return ["nlinarith"]
    if rule == "positivity":
        return ["positivity"]
    if rule in {"assumption", "exact"}:
        if len(premise_names) != 1:
            raise ValueError(f"{rule} requires exactly one premise")
        return [f"exact {premise_names[0]}"]
    if rule == "add_inequality":
        term = step["parameters"].get("term")
        if not isinstance(term, dict):
            raise ValueError("add_inequality requires a term")
        claims = _proof_claim_map(request)
        source_name = None
        source_kind = None
        for pid in step["premises"]:
            claim = claims[pid]
            if claim.get("kind") == "proposition" and claim.get("proposition", {}).get("kind") in {"lt", "le", "gt", "ge"}:
                source_name = pid
                source_kind = claim["proposition"]["kind"]
                break
        if source_name is None or source_kind is None:
            raise ValueError("add_inequality requires an inequality premise")
        theorem = "add_lt_add_right" if source_kind in {"lt", "gt"} else "add_le_add_right"
        return [f"simpa using {theorem} {source_name} {render_expr(term)}"]
    raise ValueError(f"unsupported proof rule {rule!r}")



def _scope_parent_map(request: dict[str, Any]) -> dict[str, str | None]:
    return {row["id"]: row["parent"] for row in request["scopes"]}


def _node_scope_map(request: dict[str, Any]) -> dict[str, str]:
    result = {row["id"]: row["scope"] for row in request["assumptions"]}
    result.update({row["id"]: row["scope"] for row in request["steps"]})
    return result


def _discharge_info(step: dict[str, Any], request: dict[str, Any]) -> tuple[str, str, str]:
    if step["rule"] not in {"imp_intro", "not_intro"}:
        raise ValueError("not a discharge rule")
    parents = _scope_parent_map(request)
    node_scopes = _node_scope_map(request)
    direct_children = {
        node_scopes[pid]
        for pid in step["premises"]
        if node_scopes.get(pid) != step["scope"] and parents.get(node_scopes.get(pid)) == step["scope"]
    }
    if len(direct_children) != 1:
        raise ValueError("discharge rule requires one direct child scope")
    child_scope = next(iter(direct_children))
    locals_ = [row for row in request["assumptions"] if row["scope"] == child_scope]
    if len(locals_) != 1:
        raise ValueError("discharge child scope must introduce one local assumption")
    local = locals_[0]
    target = proposition_of(step["claim"] )
    if target is None:
        raise ValueError("discharge target must be a proposition")
    expected = target["right"] if step["rule"] == "imp_intro" else {"kind": "false"}
    claims = _proof_claim_map(request)
    conclusion = next(
        (pid for pid in step["premises"] if node_scopes.get(pid) == child_scope and proposition_of(claims[pid]) is not None and same_logic(proposition_of(claims[pid]), expected)),
        None,
    )
    if conclusion is None:
        raise ValueError("discharge subproof has no matching conclusion")
    return child_scope, local["id"], conclusion



def _scope_ancestors_for_render(request: dict[str, Any], scope: str) -> set[str]:
    parents = _scope_parent_map(request)
    result: set[str] = set()
    current: str | None = scope
    while current is not None:
        result.add(current)
        current = parents[current]
    return result


def _or_elim_info(step: dict[str, Any], request: dict[str, Any]) -> tuple[str, list[tuple[str, str, str]]]:
    parents = _scope_parent_map(request)
    node_scopes = _node_scope_map(request)
    claims = _proof_claim_map(request)
    ancestors = _scope_ancestors_for_render(request, step["scope"] )
    disjunction_ids = [
        pid for pid in step["premises"]
        if node_scopes.get(pid) in ancestors and (proposition_of(claims[pid]) or {}).get("kind") == "or"
    ]
    if len(disjunction_ids) != 1:
        raise ValueError("or_elim requires one ancestor disjunction premise")
    hor = disjunction_ids[0]
    disjunction = proposition_of(claims[hor])
    target = proposition_of(step["claim"] )
    if target is None:
        raise ValueError("or_elim target must be proposition")
    branches: list[tuple[str, str, str]] = []
    used_scopes: set[str] = set()
    for side in ("left", "right"):
        expected_assumption = disjunction[side]
        local = next(
            (row for row in request["assumptions"]
             if parents.get(row["scope"]) == step["scope"]
             and row["scope"] not in used_scopes
             and same_logic(row["claim"], expected_assumption)
             and row["id"] in step["premises"]),
            None,
        )
        if local is None:
            raise ValueError("or_elim branch assumption missing")
        child_scope = local["scope"]
        used_scopes.add(child_scope)
        conclusion = next(
            (pid for pid in step["premises"]
             if node_scopes.get(pid) == child_scope
             and proposition_of(claims[pid]) is not None
             and same_logic(proposition_of(claims[pid]), target)),
            None,
        )
        if conclusion is None:
            raise ValueError("or_elim branch conclusion missing")
        branches.append((child_scope, local["id"], conclusion))
    return hor, branches


def _append_or_elim_body(
    lines: list[str],
    step: dict[str, Any],
    request: dict[str, Any],
    *,
    indent: int,
    outer_available: list[str],
) -> None:
    hor, branches = _or_elim_info(step, request)
    prefix = " " * indent
    copy_name = f"{step['id']}_cases"
    lines.append(f"{prefix}have {copy_name} := {hor}")
    lines.append(f"{prefix}rcases {copy_name} with {branches[0][1]} | {branches[1][1]}")
    for child_scope, local_id, conclusion_id in branches:
        lines.append(f"{prefix}·")
        branch_indent = indent + 2
        available = [*outer_available, local_id]
        for child_step in request["steps"]:
            if child_step["scope"] != child_scope:
                continue
            _append_regular_step(lines, child_step, request, indent=branch_indent, available_nodes=available)
            available.append(child_step["id"] )
            if child_step["id"] == conclusion_id:
                break
        lines.append(f"{' ' * branch_indent}exact {conclusion_id}")

def _append_regular_step(
    lines: list[str],
    step: dict[str, Any],
    request: dict[str, Any],
    *,
    indent: int,
    available_nodes: list[str],
) -> None:
    prefix = " " * indent
    claim = render_goal(step["claim"] )
    lines.append(f"{prefix}have {step['id']} : {claim} := by")
    body_prefix = " " * (indent + 2)
    unused = [name for name in available_nodes if name not in step["premises"]]
    if unused:
        lines.append(f"{body_prefix}clear {' '.join(unused)}")
    if step["rule"] in {"imp_intro", "not_intro"}:
        _append_discharge_body(lines, step, request, indent=indent + 2, outer_available=available_nodes)
    elif step["rule"] == "or_elim":
        _append_or_elim_body(lines, step, request, indent=indent + 2, outer_available=available_nodes)
    else:
        for tactic in render_rule(step, request):
            lines.append(f"{body_prefix}{tactic}")


def _append_discharge_body(
    lines: list[str],
    step: dict[str, Any],
    request: dict[str, Any],
    *,
    indent: int,
    outer_available: list[str],
) -> None:
    child_scope, local_id, conclusion_id = _discharge_info(step, request)
    prefix = " " * indent
    lines.append(f"{prefix}intro {local_id}")
    available = [*outer_available, local_id]
    for child_step in request["steps"]:
        if child_step["scope"] != child_scope:
            continue
        _append_regular_step(lines, child_step, request, indent=indent, available_nodes=available)
        available.append(child_step["id"] )
        if child_step["id"] == conclusion_id:
            break
    lines.append(f"{prefix}exact {conclusion_id}")


def _node_scope_map(request: dict[str, Any]) -> dict[str, str]:
    result = {row["id"]: row["scope"] for row in request["assumptions"]}
    result.update({row["id"]: row["scope"] for row in request["steps"]})
    return result


def _step_map(request: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {row["id"]: row for row in request["steps"]}


def _assumption_map(request: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {row["id"]: row for row in request["assumptions"]}


def _scope_parent_map(request: dict[str, Any]) -> dict[str, str | None]:
    return {row["id"]: row["parent"] for row in request["scopes"]}


def _same_scope_dependency_steps(request: dict[str, Any], terminal_id: str, scope: str) -> list[dict[str, Any]]:
    """Return same-scope proof steps needed for ``terminal_id`` in source order.

    Direct-child premises of nested discharge steps are deliberately not traversed
    here; the recursive discharge renderer owns those child scopes.
    """
    steps = _step_map(request)
    needed: set[str] = set()

    def visit(identifier: str) -> None:
        row = steps.get(identifier)
        if row is None or row["scope"] != scope or identifier in needed:
            return
        for premise in row["premises"]:
            parent = steps.get(premise)
            if parent is not None and parent["scope"] == scope:
                visit(premise)
        needed.add(identifier)

    visit(terminal_id)
    return [row for row in request["steps"] if row["scope"] == scope and row["id"] in needed]


def _discharge_details(step: dict[str, Any], request: dict[str, Any]) -> tuple[str, str, str]:
    """Resolve (child_scope, local_assumption_id, child_conclusion_id).

    Preflight performs the educational validation. This helper repeats the shape
    checks defensively so malformed requests cannot be translated into broader Lean
    proofs if the renderer is called directly.
    """
    if step["rule"] not in {"imp_intro", "not_intro"}:
        raise ValueError("discharge details requested for a non-discharge rule")

    node_scope = _node_scope_map(request)
    scope_parent = _scope_parent_map(request)
    assumptions = _assumption_map(request)
    claims = _proof_claim_map(request)
    target = proposition_of(step["claim"] )
    if target is None:
        raise ValueError("discharge rules require proposition targets")

    child_scopes = {
        node_scope[premise]
        for premise in step["premises"]
        if node_scope.get(premise) != step["scope"]
        and scope_parent.get(node_scope.get(premise)) == step["scope"]
    }
    if len(child_scopes) != 1:
        raise ValueError("discharge rule must cite exactly one direct child scope")
    child_scope = next(iter(child_scopes))
    local_rows = [row for row in request["assumptions"] if row["scope"] == child_scope]
    if len(local_rows) != 1:
        raise ValueError("discharged child scope must contain exactly one local assumption")
    local = local_rows[0]
    if local["id"] not in step["premises"]:
        raise ValueError("discharge rule must cite its local assumption")

    if step["rule"] == "imp_intro":
        if target.get("kind") != "implies" or not same_logic(local["claim"], target["left"]):
            raise ValueError("implication introduction antecedent does not match local assumption")
        expected = target["right"]
    else:
        if target.get("kind") != "not" or not same_logic(local["claim"], target["arg"]):
            raise ValueError("negation introduction target does not match local assumption")
        expected = {"kind": "false"}

    conclusions = []
    for premise in step["premises"]:
        if node_scope.get(premise) != child_scope:
            continue
        claim = claims[premise]
        prop = proposition_of(claim)
        if prop is not None and same_logic(prop, expected):
            conclusions.append(premise)
    if not conclusions:
        raise ValueError("discharged child scope does not establish the required conclusion")
    return child_scope, local["id"], conclusions[-1]


def _render_discharge_body(
    step: dict[str, Any],
    request: dict[str, Any],
    available_nodes: list[str],
    *,
    indent: str,
) -> list[str]:
    child_scope, local_id, conclusion_id = _discharge_details(step, request)
    assumptions = _assumption_map(request)
    local = assumptions[local_id]
    lines: list[str] = []

    if step["rule"] == "imp_intro":
        lines.append(f"{indent}intro {local_id}")
    else:
        # A Lean goal `¬ P` elaborates to `P → False`, so the same introduction
        # primitive correctly models a proof by contradiction under P.
        lines.append(f"{indent}intro {local_id}")

    child_available = [*available_nodes, local_id]
    for child_step in _same_scope_dependency_steps(request, conclusion_id, child_scope):
        lines.extend(_render_have(child_step, request, child_available, indent=indent))
        child_available.append(child_step["id"] )

    lines.append(f"{indent}exact {conclusion_id}")
    return lines



def _forall_intro_details(step: dict[str, Any], request: dict[str, Any]) -> tuple[str, str, str]:
    if step["rule"] != "forall_intro":
        raise ValueError("forall introduction details requested for another rule")
    target = proposition_of(step["claim"])
    if target is None or target.get("kind") != "forall":
        raise ValueError("forall introduction requires a universal target")

    node_scope = _node_scope_map(request)
    scope_parent = _scope_parent_map(request)
    claims = _proof_claim_map(request)
    child_scopes = {
        node_scope[premise]
        for premise in step["premises"]
        if node_scope.get(premise) != step["scope"]
        and scope_parent.get(node_scope.get(premise)) == step["scope"]
    }
    if len(child_scopes) != 1:
        raise ValueError("forall introduction must cite exactly one direct child scope")
    child_scope = next(iter(child_scopes))
    scope_row = next((row for row in request["scopes"] if row["id"] == child_scope), None)
    if scope_row is None or scope_row.get("binders", []) != [target["binder"]]:
        raise ValueError("forall introduction child scope must bind the quantified variable")
    if any(row["scope"] == child_scope for row in request["assumptions"]):
        raise ValueError("forall introduction child scope may not add assumptions")

    conclusions: list[str] = []
    for premise in step["premises"]:
        if node_scope.get(premise) != child_scope:
            continue
        prop = proposition_of(claims[premise])
        if prop is not None and same_logic(prop, target["body"]):
            conclusions.append(premise)
    if not conclusions:
        raise ValueError("forall introduction child scope does not establish the quantified body")
    return child_scope, target["binder"]["id"], conclusions[-1]


def _render_forall_intro_body(
    step: dict[str, Any],
    request: dict[str, Any],
    available_nodes: list[str],
    *,
    indent: str,
) -> list[str]:
    child_scope, binder_id, conclusion_id = _forall_intro_details(step, request)
    lines = [f"{indent}intro {binder_id}"]
    child_available = list(available_nodes)
    for child_step in _same_scope_dependency_steps(request, conclusion_id, child_scope):
        lines.extend(_render_have(child_step, request, child_available, indent=indent))
        child_available.append(child_step["id"])
    lines.append(f"{indent}exact {conclusion_id}")
    return lines


def _exists_elim_details(
    step: dict[str, Any], request: dict[str, Any]
) -> tuple[str, str, str, str, str]:
    if step["rule"] != "exists_elim":
        raise ValueError("existential elimination details requested for another rule")
    target = proposition_of(step["claim"])
    if target is None:
        raise ValueError("existential elimination requires a proposition target")
    node_scope = _node_scope_map(request)
    scope_parent = _scope_parent_map(request)
    claims = _proof_claim_map(request)

    ancestors: set[str] = set()
    current: str | None = step["scope"]
    while current is not None:
        ancestors.add(current)
        current = scope_parent[current]
    existential_rows: list[tuple[str, dict[str, Any]]] = []
    for premise in step["premises"]:
        if node_scope.get(premise) not in ancestors:
            continue
        prop = proposition_of(claims[premise])
        if prop is not None and prop.get("kind") == "exists":
            existential_rows.append((premise, prop))
    if len(existential_rows) != 1:
        raise ValueError("existential elimination must cite exactly one visible existential premise")
    existential_id, existential = existential_rows[0]

    child_scopes = {
        node_scope[premise]
        for premise in step["premises"]
        if node_scope.get(premise) != step["scope"]
        and scope_parent.get(node_scope.get(premise)) == step["scope"]
    }
    if len(child_scopes) != 1:
        raise ValueError("existential elimination must cite exactly one direct child scope")
    child_scope = next(iter(child_scopes))
    scope_row = next((row for row in request["scopes"] if row["id"] == child_scope), None)
    binders = [] if scope_row is None else scope_row.get("binders", [])
    locals_ = [row for row in request["assumptions"] if row["scope"] == child_scope]
    if len(binders) != 1 or len(locals_) != 1 or binders[0]["type"] != existential["binder"]["type"]:
        raise ValueError("existential elimination child scope has invalid witness/hypothesis shape")
    binder = binders[0]
    local = locals_[0]
    replacement = {"kind": "var", "id": binder["id"]}
    expected_local = substitute_prop(existential["body"], existential["binder"]["id"], replacement)
    if not same_logic(local["claim"], expected_local) or local["id"] not in step["premises"]:
        raise ValueError("existential elimination local hypothesis does not match the instantiated body")

    conclusions: list[str] = []
    for premise in step["premises"]:
        if node_scope.get(premise) != child_scope:
            continue
        prop = proposition_of(claims[premise])
        if prop is not None and same_logic(prop, target):
            conclusions.append(premise)
    if not conclusions:
        raise ValueError("existential elimination child scope does not establish the parent target")
    return existential_id, child_scope, binder["id"], local["id"], conclusions[-1]


def _render_exists_elim_body(
    step: dict[str, Any],
    request: dict[str, Any],
    available_nodes: list[str],
    *,
    indent: str,
) -> list[str]:
    existential_id, child_scope, binder_id, local_id, conclusion_id = _exists_elim_details(step, request)
    copy_name = f"{step['id']}_exists"
    lines = [
        f"{indent}have {copy_name} := {existential_id}",
        f"{indent}rcases {copy_name} with ⟨{binder_id}, {local_id}⟩",
    ]
    child_available = [*available_nodes, local_id]
    for child_step in _same_scope_dependency_steps(request, conclusion_id, child_scope):
        lines.extend(_render_have(child_step, request, child_available, indent=indent))
        child_available.append(child_step["id"])
    lines.append(f"{indent}exact {conclusion_id}")
    return lines


def _nat_induction_details(
    step: dict[str, Any], request: dict[str, Any]
) -> tuple[str, str, str, str]:
    if step["rule"] != "nat_induction":
        raise ValueError("induction details requested for another rule")
    target = proposition_of(step["claim"])
    if target is None or target.get("kind") != "forall" or target["binder"]["type"] != "nat":
        raise ValueError("natural induction needs a universal natural-number target")
    node_scope = _node_scope_map(request)
    scope_parent = _scope_parent_map(request)
    claims = _proof_claim_map(request)
    ancestors: set[str] = set()
    current: str | None = step["scope"]
    while current is not None:
        ancestors.add(current)
        current = scope_parent[current]

    zero_body = substitute_prop(target["body"], target["binder"]["id"], {"kind": "int", "value": 0})
    base_ids = [
        pid for pid in step["premises"]
        if node_scope.get(pid) in ancestors
        and proposition_of(claims[pid]) is not None
        and same_logic(proposition_of(claims[pid]), zero_body)
    ]
    if not base_ids:
        raise ValueError("natural induction is missing its base proof")

    child_scopes = {
        node_scope[pid]
        for pid in step["premises"]
        if node_scope.get(pid) != step["scope"]
        and scope_parent.get(node_scope.get(pid)) == step["scope"]
    }
    if len(child_scopes) != 1:
        raise ValueError("natural induction must cite one direct child step scope")
    child_scope = next(iter(child_scopes))
    scope_row = next(row for row in request["scopes"] if row["id"] == child_scope)
    binders = scope_row.get("binders", [])
    locals_ = [row for row in request["assumptions"] if row["scope"] == child_scope]
    if len(binders) != 1 or binders[0]["type"] != "nat" or len(locals_) != 1:
        raise ValueError("natural induction step scope has invalid binder/hypothesis shape")
    binder = binders[0]
    ih = locals_[0]
    k_expr = {"kind": "var", "id": binder["id"]}
    expected_ih = substitute_prop(target["body"], target["binder"]["id"], k_expr)
    if ih["id"] not in step["premises"] or not same_logic(ih["claim"], expected_ih):
        raise ValueError("natural induction hypothesis does not match P(k)")
    successor = {"kind": "add", "left": k_expr, "right": {"kind": "int", "value": 1}}
    expected_step = substitute_prop(target["body"], target["binder"]["id"], successor)
    conclusions = [
        pid for pid in step["premises"]
        if node_scope.get(pid) == child_scope
        and proposition_of(claims[pid]) is not None
        and same_logic(proposition_of(claims[pid]), expected_step)
    ]
    if not conclusions:
        raise ValueError("natural induction successor proof does not establish P(k + 1)")
    return base_ids[-1], child_scope, binder["id"], ih["id"], conclusions[-1]


def _render_nat_induction_body(
    step: dict[str, Any],
    request: dict[str, Any],
    available_nodes: list[str],
    *,
    indent: str,
) -> list[str]:
    base_id, child_scope, binder_id, ih_id, conclusion_id = _nat_induction_details(step, request)
    target = proposition_of(step["claim"])
    quantified_id = target["binder"]["id"]
    lines = [
        f"{indent}intro {quantified_id}",
        f"{indent}induction {quantified_id} with",
        f"{indent}| zero =>",
        f"{indent}  exact {base_id}",
        f"{indent}| succ {binder_id} {ih_id} =>",
    ]
    branch_indent = indent + "  "
    child_available = [*available_nodes, ih_id]
    for child_step in _same_scope_dependency_steps(request, conclusion_id, child_scope):
        lines.extend(_render_have(child_step, request, child_available, indent=branch_indent))
        child_available.append(child_step["id"])
    lines.append(f"{branch_indent}exact {conclusion_id}")
    return lines


def _render_or_elim_body(
    step: dict[str, Any],
    request: dict[str, Any],
    available_nodes: list[str],
    *,
    indent: str,
) -> list[str]:
    hor, branches = _or_elim_info(step, request)
    copy_name = f"{step['id']}_cases"
    lines = [f"{indent}have {copy_name} := {hor}", f"{indent}rcases {copy_name} with {branches[0][1]} | {branches[1][1]}"]
    for child_scope, local_id, conclusion_id in branches:
        lines.append(f"{indent}·")
        branch_indent = indent + "  "
        child_available = [*available_nodes, local_id]
        for child_step in _same_scope_dependency_steps(request, conclusion_id, child_scope):
            lines.extend(_render_have(child_step, request, child_available, indent=branch_indent))
            child_available.append(child_step["id"] )
        lines.append(f"{branch_indent}exact {conclusion_id}")
    return lines

def _render_have(
    step: dict[str, Any],
    request: dict[str, Any],
    available_nodes: list[str],
    *,
    indent: str,
) -> list[str]:
    lines = [f"{indent}have {step['id']} : {render_goal(step['claim'])} := by"]
    body_indent = indent + "  "
    if step["rule"] in {"imp_intro", "not_intro"}:
        lines.extend(_render_discharge_body(step, request, available_nodes, indent=body_indent))
        return lines
    if step["rule"] == "or_elim":
        lines.extend(_render_or_elim_body(step, request, available_nodes, indent=body_indent))
        return lines
    if step["rule"] == "forall_intro":
        lines.extend(_render_forall_intro_body(step, request, available_nodes, indent=body_indent))
        return lines
    if step["rule"] == "exists_elim":
        lines.extend(_render_exists_elim_body(step, request, available_nodes, indent=body_indent))
        return lines
    if step["rule"] == "nat_induction":
        lines.extend(_render_nat_induction_body(step, request, available_nodes, indent=body_indent))
        return lines

    unused = [name for name in available_nodes if name not in step["premises"]]
    if unused:
        lines.append(f"{body_indent}clear {' '.join(unused)}")
    for tactic in render_rule(step, request):
        lines.append(f"{body_indent}{tactic}")
    return lines

def _request_imports(request: dict[str, Any]) -> list[str]:
    """Use a stable, capability-scoped header shared by its curated environment."""
    return [f"public import {module}" for module in request_environment(request)["imports"]]


def render_request(request: dict[str, Any]) -> str:
    lines = [
        "module",
        *_request_imports(request),
        "",
        "open Filter Topology Set" if set(request_environment(request)["capabilities"]) & {"limits", "derivatives", "sequences-series"} else "open Set",
        "",
        "namespace QuickMathsGenerated",
        "",
    ]
    bound_goal_variable = request["goal"].get("variable") if request["goal"].get("kind") in {"limit", "derivative", "sequence_limit", "series_sum"} else None
    variables = " ".join(
        f"({row['id']} : {render_type(row['type'])})"
        for row in request["variables"]
        if row["id"] != bound_goal_variable
    )
    assumptions = " ".join(
        f"({row['id']} : {render_prop(row['claim'])})"
        for row in request["assumptions"]
        if row["scope"] == "root"
    )
    binders = " ".join(part for part in [variables, assumptions] if part)
    prefix = f"public theorem result {binders}" if binders else "public theorem result"
    lines.append(f"{prefix} : {render_goal(request['goal'])} := by")

    available_nodes = [row["id"] for row in request["assumptions"] if row["scope"] == "root"]
    for step in request["steps"]:
        # Child steps are kernel-checked inside the discharge rule that owns their
        # scope. Rendering them at theorem scope would leak temporary assumptions.
        if step["scope"] != "root":
            continue
        lines.extend(_render_have(step, request, available_nodes, indent="  "))
        available_nodes.append(step["id"] )

    goal_hash = canonical_hash(request["goal"] )
    matching = [
        step for step in request["steps"]
        if step["scope"] == "root" and canonical_hash(step["claim"]) == goal_hash
    ]
    if not matching:
        raise ValueError("no root proof step establishes the final goal")
    lines.append(f"  exact {matching[-1]['id']}")

    lines.extend(["", "#print axioms QuickMathsGenerated.result", "", "end QuickMathsGenerated", ""])
    return "\n".join(lines)


def nonzero_claim(expr: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "ne", "left": expr, "right": {"kind": "int", "value": 0}}


def nonnegative_claim(expr: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "le", "left": {"kind": "int", "value": 0}, "right": expr}
