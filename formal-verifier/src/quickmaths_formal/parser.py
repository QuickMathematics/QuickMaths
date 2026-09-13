from __future__ import annotations

import ast
import re
from fractions import Fraction
from typing import Any

from .contract import ContractError

_RELATIONS = (
    ("!=", "ne"),
    ("<=", "le"),
    (">=", "ge"),
    ("==", "eq"),
    ("=", "eq"),
    ("<", "lt"),
    (">", "gt"),
)
_UNICODE_REPLACEMENTS = {
    "−": "-",
    "–": "-",
    "—": "-",
    "×": "*",
    "·": "*",
    "÷": "/",
    "≤": "<=",
    "≥": ">=",
    "≠": "!=",
    "^": "**",
    "∧": " and ",
    "∨": " or ",
    "→": " implies ",
    "↔": " iff ",
    "¬": "not ",
    "∈": " in ",
    "⊆": " subset ",
}
_SUPERSCRIPT_DIGITS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")


def _normalize_superscripts(value: str) -> str:
    # Convert a compact school exponent such as x² or (x+1)³ to explicit
    # exponent syntax before Python AST parsing. Negative exponents remain
    # intentionally unsupported by the formal contract.
    return re.sub(
        r"(?P<base>[A-Za-z0-9_]|\))(?P<exp>[⁰¹²³⁴⁵⁶⁷⁸⁹]+)",
        lambda match: f"{match.group('base')}^{match.group('exp').translate(_SUPERSCRIPT_DIGITS)}",
        value,
    )


def normalize_school_text(text: str) -> str:
    if not isinstance(text, str) or not text.strip():
        raise ContractError("math input must be non-empty text")
    if len(text) > 2_000:
        raise ContractError("math input may contain at most 2,000 characters")
    value = _normalize_superscripts(text.strip())
    for old, new in _UNICODE_REPLACEMENTS.items():
        value = value.replace(old, new)
    return value


def _fraction_from_decimal(value: float) -> Fraction:
    # Python's AST has already converted the source decimal to a binary float,
    # so silently treating it as exact school mathematics would be misleading.
    raise ContractError("decimal literals are ambiguous in formal mode; use an integer or exact fraction such as 3/10")


def _expr_is_explicit_real(expr: dict[str, Any]) -> bool:
    """Recognize exponent syntax that already contains an explicit real operation.

    The parser intentionally keeps a bare variable exponent as ``pow_nat`` because
    it does not receive the variable type environment here.  Root-test syntax such
    as ``abs(a(n))^(1 / real(n))`` contains an explicit cast, so it is safe to route
    that exponent to ``rpow`` without weakening natural-index power parsing.
    """
    kind = expr.get("kind")
    if kind in {"rat", "cast_real", "sqrt", "abs", "exp", "log", "sin", "cos", "rpow"}:
        return True
    if kind == "neg":
        return _expr_is_explicit_real(expr.get("arg", {}))
    if kind in {"add", "sub", "mul", "div"}:
        return _expr_is_explicit_real(expr.get("left", {})) or _expr_is_explicit_real(expr.get("right", {}))
    return False


def _expr_from_ast(node: ast.AST, variables: set[str]) -> dict[str, Any]:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise ContractError("formal expressions only accept numeric literals")
        if isinstance(node.value, float):
            _fraction_from_decimal(node.value)
        return {"kind": "int", "value": int(node.value)}

    if isinstance(node, ast.Name):
        if node.id not in variables:
            raise ContractError(f"unknown identifier {node.id!r}; declare variables explicitly before parsing")
        return {"kind": "var", "id": node.id}

    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return {"kind": "neg", "arg": _expr_from_ast(node.operand, variables)}
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.UAdd):
        return _expr_from_ast(node.operand, variables)

    if isinstance(node, ast.BinOp):
        left = _expr_from_ast(node.left, variables)
        right = _expr_from_ast(node.right, variables)
        if isinstance(node.op, ast.Add):
            return {"kind": "add", "left": left, "right": right}
        if isinstance(node.op, ast.Sub):
            return {"kind": "sub", "left": left, "right": right}
        if isinstance(node.op, ast.Mult):
            return {"kind": "mul", "left": left, "right": right}
        if isinstance(node.op, ast.Div):
            if right.get("kind") == "int" and left.get("kind") == "int":
                denominator = right["value"]
                if denominator == 0:
                    raise ContractError("rational literal denominator must be nonzero")
                numerator = left["value"]
                fraction = Fraction(numerator, denominator)
                return {"kind": "rat", "numerator": fraction.numerator, "denominator": fraction.denominator}
            return {"kind": "div", "left": left, "right": right}
        if isinstance(node.op, ast.Mod):
            return {"kind": "mod_nat", "left": left, "right": right}
        if isinstance(node.op, ast.Pow):
            if right.get("kind") == "int":
                if right["value"] < 0 or right["value"] > 64:
                    raise ContractError("formal literal powers require an integer exponent from 0 to 64")
                return {"kind": "pow", "base": left, "exponent": right["value"]}
            if right.get("kind") == "rat" or _expr_is_explicit_real(right):
                return {"kind": "rpow", "base": left, "exponent": right}
            return {"kind": "pow_nat", "base": left, "exponent": right}
        raise ContractError("unsupported arithmetic operator")

    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        if len(node.args) != 1 or node.keywords:
            raise ContractError(f"{node.func.id} expects exactly one argument")
        if node.func.id == "real":
            return {"kind": "cast_real", "arg": _expr_from_ast(node.args[0], variables)}
        if node.func.id == "factorial":
            return {"kind": "factorial", "arg": _expr_from_ast(node.args[0], variables)}
        if node.func.id in {"sqrt", "abs", "exp", "log", "sin", "cos"}:
            return {"kind": node.func.id, "arg": _expr_from_ast(node.args[0], variables)}
        if node.func.id not in variables:
            raise ContractError(f"unknown function {node.func.id!r}; declare it explicitly before parsing")
        return {
            "kind": "apply",
            "function": {"kind": "var", "id": node.func.id},
            "arg": _expr_from_ast(node.args[0], variables),
        }

    raise ContractError("unsupported formal expression syntax")


def _normalize_absolute_value_text(source: str) -> str:
    if "|" not in source:
        return source
    if source.count("|") % 2:
        raise ContractError("unmatched absolute-value bar in formal expression")
    if "||" in source:
        raise ContractError("nested absolute-value bars are ambiguous; use abs(...) explicitly")
    # Support non-nested school absolute-value bars. Nested bars are ambiguous
    # to a text scanner and should be written explicitly as abs(abs(x)).
    previous = None
    value = source
    while "|" in value and value != previous:
        previous = value
        value, count = re.subn(r"\|([^|]+)\|", r"abs(\1)", value)
        if count == 0:
            break
    if "|" in value:
        raise ContractError("nested absolute-value bars are ambiguous; use abs(...) explicitly")
    return value


def _split_piecewise_expression(source: str) -> tuple[str, str, str] | None:
    folded = source.casefold()
    if not folded.startswith("if "):
        return None
    depth = 0
    then_pos = None
    else_pos = None
    index = 3
    while index < len(source):
        char = source[index]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth < 0:
                raise ContractError("unbalanced parentheses in piecewise expression")
        elif depth == 0 and then_pos is None and source[index:index + 6].casefold() == " then ":
            then_pos = index
            index += 5
        elif depth == 0 and then_pos is not None and source[index:index + 6].casefold() == " else ":
            else_pos = index
            break
        index += 1
    if depth != 0:
        raise ContractError("unbalanced parentheses in piecewise expression")
    if then_pos is None or else_pos is None:
        raise ContractError("piecewise expression must use 'if CONDITION then EXPR else EXPR'")
    condition = source[3:then_pos].strip()
    then_text = source[then_pos + 6:else_pos].strip()
    else_text = source[else_pos + 6:].strip()
    if not condition or not then_text or not else_text:
        raise ContractError("piecewise expression needs a condition and both branches")
    return condition, then_text, else_text


def parse_expression_text(text: str, variables: list[str] | set[str] | tuple[str, ...]) -> dict[str, Any]:
    source = _normalize_absolute_value_text(normalize_school_text(text))
    piecewise = _split_piecewise_expression(source)
    if piecewise is not None:
        condition, then_text, else_text = piecewise
        return {
            "kind": "if",
            "condition": parse_proposition_text(condition, variables),
            "then": parse_expression_text(then_text, variables),
            "else": parse_expression_text(else_text, variables),
        }
    try:
        parsed = ast.parse(source, mode="eval")
    except SyntaxError as exc:
        raise ContractError(f"could not parse expression {text!r}") from exc
    return _expr_from_ast(parsed.body, set(variables))


def _top_level_relation(source: str) -> tuple[str, str, str]:
    depth = 0
    index = 0
    while index < len(source):
        char = source[index]
        if char == "(":
            depth += 1
            index += 1
            continue
        if char == ")":
            depth -= 1
            if depth < 0:
                raise ContractError("unbalanced parentheses in proposition")
            index += 1
            continue
        if depth == 0:
            for token, kind in _RELATIONS:
                if source.startswith(token, index):
                    left = source[:index].strip()
                    right = source[index + len(token):].strip()
                    if not left or not right:
                        raise ContractError("a proposition relation needs an expression on both sides")
                    if any(_find_top_level_token(right, other) for other, _ in _RELATIONS):
                        raise ContractError("chained comparisons are not yet supported in formal input; split them into separate claims")
                    return kind, left, right
        index += 1
    if depth != 0:
        raise ContractError("unbalanced parentheses in proposition")
    raise ContractError("formal proposition input needs exactly one relation such as =, !=, <, <=, > or >=")


def _find_top_level_token(source: str, token: str) -> bool:
    depth = 0
    index = 0
    while index < len(source):
        char = source[index]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif depth == 0 and source.startswith(token, index):
            return True
        index += 1
    return False


def _strip_outer_parens(source: str) -> str:
    source = source.strip()
    while source.startswith("(") and source.endswith(")"):
        depth = 0
        encloses_all = True
        for index, char in enumerate(source):
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0 and index != len(source) - 1:
                    encloses_all = False
                    break
                if depth < 0:
                    raise ContractError("unbalanced parentheses in proposition")
        if depth != 0:
            raise ContractError("unbalanced parentheses in proposition")
        if not encloses_all:
            break
        source = source[1:-1].strip()
    return source


def _split_top_level_word(source: str, word: str, *, from_right: bool = False) -> tuple[str, str] | None:
    token = f" {word} "
    depth = 0
    matches: list[int] = []
    index = 0
    while index < len(source):
        char = source[index]
        if char == "(":
            depth += 1
            index += 1
            continue
        if char == ")":
            depth -= 1
            if depth < 0:
                raise ContractError("unbalanced parentheses in proposition")
            index += 1
            continue
        if depth == 0 and source[index:index + len(token)].casefold() == token:
            matches.append(index)
            index += len(token)
            continue
        index += 1
    if depth != 0:
        raise ContractError("unbalanced parentheses in proposition")
    if not matches:
        return None
    pos = matches[-1] if from_right else matches[0]
    left = source[:pos].strip()
    right = source[pos + len(token):].strip()
    if not left or not right:
        raise ContractError(f"{word} needs a proposition on both sides")
    return left, right


def parse_proposition_text(text: str, variables: list[str] | set[str] | tuple[str, ...]) -> dict[str, Any]:
    source = _strip_outer_parens(normalize_school_text(text))
    names = set(variables)
    folded = source.casefold()
    if folded == "true":
        return {"kind": "true"}
    if folded == "false":
        return {"kind": "false"}

    eventually = re.fullmatch(
        r"(?is)eventually\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*nat\s*,\s*(.+)",
        source,
    )
    if eventually:
        binder, body_text = eventually.groups()
        if binder in names:
            raise ContractError(f"binder {binder!r} shadows an existing variable")
        threshold = "eventuallyN"
        suffix = 0
        while threshold in names or threshold == binder:
            suffix += 1
            threshold = f"eventuallyN{suffix}"
        threshold_var = {"kind": "var", "id": threshold}
        index_var = {"kind": "var", "id": binder}
        return {
            "kind": "exists",
            "binder": {"id": threshold, "type": "nat"},
            "body": {
                "kind": "forall",
                "binder": {"id": binder, "type": "nat"},
                "body": {
                    "kind": "implies",
                    "left": {"kind": "le", "left": threshold_var, "right": index_var},
                    "right": parse_proposition_text(body_text, names | {threshold, binder}),
                },
            },
        }

    interval_quantifier = re.fullmatch(
        r"(?is)(forall|for\s+every)\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(real|int|rat|nat)"
        r"\s+in\s+\[\s*([^,\[\]]+)\s*,\s*([^\[\]]+)\s*\]\s*,\s*(.+)",
        source,
    )
    if interval_quantifier:
        kind, binder, binder_type, lower_text, upper_text, body_text = interval_quantifier.groups()
        if binder in names:
            raise ContractError(f"binder {binder!r} shadows an existing variable")
        binder_type = binder_type.casefold()
        lower = parse_expression_text(lower_text, names)
        upper = parse_expression_text(upper_text, names)
        point = {"kind": "var", "id": binder}
        interval = {
            "kind": "and",
            "left": {"kind": "le", "left": lower, "right": point},
            "right": {"kind": "le", "left": point, "right": upper},
        }
        return {
            "kind": "forall",
            "binder": {"id": binder, "type": binder_type},
            "body": {
                "kind": "implies",
                "left": interval,
                "right": parse_proposition_text(body_text, names | {binder}),
            },
        }

    quantifier = re.fullmatch(r"(?is)(forall|for\s+every|exists|there\s+exists)\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*((?:real|int|rat|nat)(?:->(?:real|int|rat|nat))?|set\[(?:real|int|rat|nat)\])\s*,\s*(.+)", source)
    if quantifier:
        kind, binder, binder_type, body = quantifier.groups()
        if binder in names:
            raise ContractError(f"binder {binder!r} shadows an existing variable")
        normalized_kind = "forall" if kind.casefold().replace(" ", "") in {"forall", "forevery"} else "exists"
        return {
            "kind": normalized_kind,
            "binder": {"id": binder, "type": binder_type.casefold()},
            "body": parse_proposition_text(body, names | {binder}),
        }

    # Lowest precedence first. Implication is right-associative, while iff/or/and
    # are split at the first top-level occurrence for deterministic parsing.
    for word, kind, from_right in [
        ("iff", "iff", False),
        ("implies", "implies", False),
        ("or", "or", False),
        ("and", "and", False),
    ]:
        pair = _split_top_level_word(source, word, from_right=from_right)
        if pair is not None:
            left, right = pair
            return {
                "kind": kind,
                "left": parse_proposition_text(left, names),
                "right": parse_proposition_text(right, names),
            }

    if folded.startswith("not "):
        return {"kind": "not", "arg": parse_proposition_text(source[4:].strip(), names)}

    for word, kind in [("subset", "subset"), ("in", "mem")]:
        pair = _split_top_level_word(source, word, from_right=False)
        if pair is not None:
            left, right = pair
            return {
                "kind": kind,
                "left": parse_expression_text(left, names),
                "right": parse_expression_text(right, names),
            }

    kind, left, right = _top_level_relation(source)
    return {
        "kind": kind,
        "left": parse_expression_text(left, names),
        "right": parse_expression_text(right, names),
    }



def _split_top_level_comma(source: str) -> tuple[str, str] | None:
    depth = 0
    for index, char in enumerate(source):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth < 0:
                raise ContractError("unbalanced parentheses in formal goal")
        elif char == "," and depth == 0:
            left = source[:index].strip()
            right = source[index + 1:].strip()
            if not left or not right:
                raise ContractError("formal limit domain and expression must both be non-empty")
            return left, right
    if depth != 0:
        raise ContractError("unbalanced parentheses in formal goal")
    return None


def _flatten_conjunction(prop: dict[str, Any]) -> list[dict[str, Any]]:
    if prop.get("kind") == "and":
        return [*_flatten_conjunction(prop["left"]), *_flatten_conjunction(prop["right"])]
    return [prop]


def parse_goal_text(text: str, variables: list[str] | set[str] | tuple[str, ...]) -> dict[str, Any]:
    """Parse a proposition or one of the canonical learner-facing calculus sentences.

    Canonical limit syntax is intentionally the same text emitted by
    :func:`render_goal_text`, for example::

        As x approaches 3 from both sides, (x^2 - 9)/(x - 3) approaches 6.
        As x approaches 4 from both sides, with 0 <= x, ... approaches 1/4.

    Keeping the preview round-trippable makes the displayed mathematical
    statement the same contract that is sent to the verifier.
    """
    if not isinstance(text, str) or not text.strip():
        raise ContractError("formal goal must be non-empty text")
    source = text.strip()
    series_summable_match = re.match(
        r"(?is)^The\s+series\s+from\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*0\s+to\s+infinity\s+of\s+(.+?)\s+is\s+summable\.?$",
        source,
    )
    if series_summable_match is not None:
        variable, expression_text = series_summable_match.groups()
        names = set(variables)
        if variable not in names:
            raise ContractError(f"unknown series index variable {variable!r}; declare it explicitly before parsing")
        return {
            "kind": "series_sum",
            "variable": variable,
            "expression": parse_expression_text(expression_text.strip(), names),
            "result": {"kind": "summable"},
        }

    series_not_summable_match = re.match(
        r"(?is)^The\s+series\s+from\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*0\s+to\s+infinity\s+of\s+(.+?)\s+is\s+not\s+summable\.?$",
        source,
    )
    if series_not_summable_match is not None:
        variable, expression_text = series_not_summable_match.groups()
        names = set(variables)
        if variable not in names:
            raise ContractError(f"unknown series index variable {variable!r}; declare it explicitly before parsing")
        return {
            "kind": "series_sum",
            "variable": variable,
            "expression": parse_expression_text(expression_text.strip(), names),
            "result": {"kind": "not_summable"},
        }

    series_sum_match = re.match(
        r"(?is)^The\s+series\s+from\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*0\s+to\s+infinity\s+of\s+(.+?)\s+sums\s+to\s+(.+?)\.?$",
        source,
    )
    if series_sum_match is not None:
        variable, expression_text, result_text = series_sum_match.groups()
        names = set(variables)
        if variable not in names:
            raise ContractError(f"unknown series index variable {variable!r}; declare it explicitly before parsing")
        return {
            "kind": "series_sum",
            "variable": variable,
            "expression": parse_expression_text(expression_text.strip(), names),
            "result": {"kind": "finite", "value": parse_expression_text(result_text.strip(), names)},
        }

    sequence_no_finite_match = re.match(
        r"(?is)^As\s+([A-Za-z][A-Za-z0-9_]*)\s+tends\s+to\s+infinity\s*,\s*"
        r"(.+?)\s+does\s+not\s+converge\s+to\s+a\s+finite(?:\s+real)?\s+limit\.?$",
        source,
    )
    if sequence_no_finite_match is not None:
        variable, expression_text = sequence_no_finite_match.groups()
        names = set(variables)
        if variable not in names:
            raise ContractError(f"unknown sequence index variable {variable!r}; declare it explicitly before parsing")
        return {
            "kind": "sequence_limit",
            "variable": variable,
            "expression": parse_expression_text(expression_text.strip(), names),
            "result": {"kind": "no_finite_limit"},
        }

    sequence_match = re.match(
        r"(?is)^As\s+([A-Za-z][A-Za-z0-9_]*)\s+tends\s+to\s+infinity\s*,\s*"
        r"(.+?)\s+tends\s+to\s+(.+?)\.?$",
        source,
    )
    if sequence_match is not None:
        variable, expression_text, result_text = sequence_match.groups()
        names = set(variables)
        if variable not in names:
            raise ContractError(f"unknown sequence index variable {variable!r}; declare it explicitly before parsing")
        folded_result = result_text.strip().casefold()
        if folded_result in {"+infinity", "positive infinity"}:
            result = {"kind": "positive_infinity"}
        elif folded_result in {"-infinity", "negative infinity"}:
            result = {"kind": "negative_infinity"}
        elif folded_result in {"some finite limit", "a finite limit", "a finite real limit"}:
            result = {"kind": "exists_finite"}
        else:
            result = {"kind": "finite", "value": parse_expression_text(result_text.strip(), names)}
        return {
            "kind": "sequence_limit",
            "variable": variable,
            "expression": parse_expression_text(expression_text.strip(), names),
            "result": result,
        }

    derivative_match = re.match(
        r"(?is)^The\s+derivative\s+of\s+(.+?)\s+with\s+respect\s+to\s+"
        r"([A-Za-z][A-Za-z0-9_]*)\s+at\s+(.+?)\s+is\s+(.+?)\.?$",
        source,
    )
    if derivative_match is not None:
        expression_text, variable, point_text, result_text = derivative_match.groups()
        names = set(variables)
        if variable not in names:
            raise ContractError(f"unknown derivative variable {variable!r}; declare it explicitly before parsing")
        return {
            "kind": "derivative",
            "variable": variable,
            "expression": parse_expression_text(expression_text.strip(), names),
            "point": parse_expression_text(point_text.strip(), names),
            "result": parse_expression_text(result_text.strip(), names),
        }

    match = re.match(
        r"(?is)^As\s+([A-Za-z][A-Za-z0-9_]*)\s+approaches\s+(.+?)\s+"
        r"(from both sides|from the left|from the right)\s*,\s*(.+)$",
        source,
    )
    if match is None:
        return {"kind": "proposition", "proposition": parse_proposition_text(source, variables)}

    variable, point_text, direction_text, remainder = match.groups()
    names = set(variables)
    if variable not in names:
        raise ContractError(f"unknown limit variable {variable!r}; declare it explicitly before parsing")
    remainder = remainder.strip()
    if remainder.endswith("."):
        remainder = remainder[:-1].rstrip()
    marker = " approaches "
    split_at = remainder.casefold().rfind(marker)
    if split_at < 0:
        raise ContractError("formal limit goal must say what the expression approaches")
    before = remainder[:split_at].strip()
    result_text = remainder[split_at + len(marker):].strip()
    if not before or not result_text:
        raise ContractError("formal limit goal needs both an expression and a result")

    domain: list[dict[str, Any]] = []
    expression_text = before
    if before.casefold().startswith("with "):
        pair = _split_top_level_comma(before[5:].strip())
        if pair is None:
            raise ContractError("a formal limit domain must be followed by a comma and the expression")
        domain_text, expression_text = pair
        domain = _flatten_conjunction(parse_proposition_text(domain_text, names))

    folded_result = result_text.casefold()
    if folded_result in {"+infinity", "+infinity", "positive infinity"}:
        result = {"kind": "positive_infinity"}
    elif folded_result in {"-infinity", "negative infinity"}:
        result = {"kind": "negative_infinity"}
    elif folded_result == "no common two-sided limit":
        result = {"kind": "no_common_limit"}
    else:
        result = {"kind": "finite", "value": parse_expression_text(result_text, names)}

    direction = {
        "from both sides": "both",
        "from the left": "left",
        "from the right": "right",
    }[direction_text.casefold()]
    return {
        "kind": "limit",
        "variable": variable,
        "expression": parse_expression_text(expression_text, names),
        "point": parse_expression_text(point_text, names),
        "direction": direction,
        "domain": domain,
        "result": result,
    }

def _expr_precedence(expr: dict[str, Any]) -> int:
    return {"add": 10, "sub": 10, "mul": 20, "div": 20, "mod_nat": 20, "neg": 30, "pow": 40, "rpow": 40}.get(expr["kind"], 50)


def render_expression_text(expr: dict[str, Any], *, parent_precedence: int = 0) -> str:
    kind = expr["kind"]
    if kind == "int":
        return str(expr["value"])
    if kind == "rat":
        return f"{expr['numerator']}/{expr['denominator']}"
    if kind == "var":
        return expr["id"]
    if kind == "apply":
        return f"{render_expression_text(expr['function'])}({render_expression_text(expr['arg'])})"
    if kind == "cast_real":
        return f"real({render_expression_text(expr['arg'])})"
    if kind == "factorial":
        return f"factorial({render_expression_text(expr['arg'])})"
    if kind == "sqrt":
        return f"sqrt({render_expression_text(expr['arg'])})"
    if kind == "abs":
        return f"|{render_expression_text(expr['arg'])}|"
    if kind in {"exp", "log", "sin", "cos"}:
        return f"{kind}({render_expression_text(expr['arg'])})"
    if kind == "neg":
        text = f"-{render_expression_text(expr['arg'], parent_precedence=30)}"
        return f"({text})" if 30 < parent_precedence else text
    if kind == "pow":
        base = render_expression_text(expr['base'], parent_precedence=40)
        if expr['base'].get('kind') == 'rat':
            base = f"({base})"
        text = f"{base}^{expr['exponent']}"
        return f"({text})" if 40 < parent_precedence else text
    if kind == "rpow":
        base = render_expression_text(expr['base'], parent_precedence=40)
        if expr['base'].get('kind') == 'rat':
            base = f"({base})"
        exponent = render_expression_text(expr['exponent'], parent_precedence=40)
        text = f"{base}^({exponent})"
        return f"({text})" if 40 < parent_precedence else text
    if kind == "pow_nat":
        base = render_expression_text(expr['base'], parent_precedence=40)
        if expr['base'].get('kind') == 'rat':
            base = f"({base})"
        text = f"{base}^{render_expression_text(expr['exponent'], parent_precedence=40)}"
        return f"({text})" if 40 < parent_precedence else text
    if kind == "if":
        condition = render_proposition_text(expr["condition"])
        return f"if {condition} then {render_expression_text(expr['then'])} else {render_expression_text(expr['else'])}"
    precedence = _expr_precedence(expr)
    symbol = {"add": "+", "sub": "-", "mul": "*", "div": "/", "mod_nat": "%"}[kind]
    left = render_expression_text(expr["left"], parent_precedence=precedence)
    # Force parentheses for the right operand of non-associative operations.
    right_prec = precedence + (1 if kind in {"sub", "div", "mod_nat"} else 0)
    right = render_expression_text(expr["right"], parent_precedence=right_prec)
    text = f"{left} {symbol} {right}"
    return f"({text})" if precedence < parent_precedence else text


def render_proposition_text(prop: dict[str, Any]) -> str:
    kind = prop["kind"]
    if kind in {"true", "false"}:
        return kind
    if kind in {"eq", "ne", "lt", "le", "gt", "ge", "mem", "subset"}:
        symbol = {"eq": "=", "ne": "≠", "lt": "<", "le": "≤", "gt": ">", "ge": "≥", "mem": "∈", "subset": "⊆"}[kind]
        return f"{render_expression_text(prop['left'])} {symbol} {render_expression_text(prop['right'])}"
    if kind == "not":
        return f"not ({render_proposition_text(prop['arg'])})"
    if kind in {"and", "or", "implies", "iff"}:
        symbol = {"and": "and", "or": "or", "implies": "implies", "iff": "iff"}[kind]
        return f"({render_proposition_text(prop['left'])}) {symbol} ({render_proposition_text(prop['right'])})"
    if kind == "exists" and prop.get("binder", {}).get("type") == "nat":
        outer = prop["binder"]["id"]
        body = prop.get("body", {})
        if body.get("kind") == "forall" and body.get("binder", {}).get("type") == "nat":
            inner = body["binder"]["id"]
            implication = body.get("body", {})
            antecedent = implication.get("left", {}) if implication.get("kind") == "implies" else {}
            if (
                antecedent.get("kind") == "le"
                and antecedent.get("left") == {"kind": "var", "id": outer}
                and antecedent.get("right") == {"kind": "var", "id": inner}
            ):
                return f"eventually {inner} : nat, {render_proposition_text(implication['right'])}"
    if kind in {"forall", "exists"}:
        binder = prop["binder"]
        prefix = "for every" if kind == "forall" else "there exists"
        return f"{prefix} {binder['id']} : {binder['type']}, {render_proposition_text(prop['body'])}"
    raise ContractError(f"unsupported proposition kind {kind!r}")


def render_goal_text(goal: dict[str, Any]) -> str:
    if goal["kind"] == "proposition":
        return render_proposition_text(goal["proposition"])
    if goal["kind"] == "series_sum":
        expression = render_expression_text(goal["expression"])
        if goal["result"]["kind"] == "not_summable":
            return f"The series from {goal['variable']} = 0 to infinity of {expression} is not summable."
        if goal["result"]["kind"] == "summable":
            return f"The series from {goal['variable']} = 0 to infinity of {expression} is summable."
        return (
            f"The series from {goal['variable']} = 0 to infinity of {expression} sums to "
            f"{render_expression_text(goal['result']['value'])}."
        )
    if goal["kind"] == "sequence_limit":
        result = goal["result"]
        if result["kind"] == "finite":
            target = render_expression_text(result["value"])
        elif result["kind"] == "exists_finite":
            target = "some finite limit"
        elif result["kind"] == "no_finite_limit":
            return (
                f"As {goal['variable']} tends to infinity, {render_expression_text(goal['expression'])} "
                "does not converge to a finite real limit."
            )
        else:
            target = "+infinity" if result["kind"] == "positive_infinity" else "-infinity"
        return (
            f"As {goal['variable']} tends to infinity, {render_expression_text(goal['expression'])} "
            f"tends to {target}."
        )

    if goal["kind"] == "derivative":
        return (
            f"The derivative of {render_expression_text(goal['expression'])} with respect to "
            f"{goal['variable']} at {render_expression_text(goal['point'])} is "
            f"{render_expression_text(goal['result'])}."
        )
    expression = render_expression_text(goal["expression"])
    point = render_expression_text(goal["point"])
    direction = {"both": "from both sides", "left": "from the left", "right": "from the right"}[goal["direction"]]
    result = goal["result"]
    if result["kind"] == "finite":
        target = render_expression_text(result["value"])
    else:
        target = {
            "positive_infinity": "+infinity",
            "negative_infinity": "-infinity",
            "no_common_limit": "no common two-sided limit",
        }[result["kind"]]
    domain = ""
    if goal.get("domain"):
        domain = ", with " + " and ".join(render_proposition_text(item) for item in goal["domain"])
    return f"As {goal['variable']} approaches {point} {direction}{domain}, {expression} approaches {target}."
