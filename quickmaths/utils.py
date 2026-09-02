from __future__ import annotations

import ast
import math
import re
from fractions import Fraction
from typing import Any


class SafeExpressionError(ValueError):
    pass


_ALLOWED_FUNCTIONS = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
}

_MAX_EXPRESSION_LENGTH = 1_000
_MAX_AST_NODES = 200
_MAX_AST_DEPTH = 30
_MAX_INTEGER_BITS = 4_096
_MAX_TEXT_LENGTH = 10_000
_MAX_EXPONENT_MAGNITUDE = 100


def safe_eval(expression: str, names: dict[str, Any]) -> Any:
    if not isinstance(expression, str) or len(expression) > _MAX_EXPRESSION_LENGTH:
        raise SafeExpressionError("Expression is too long")
    try:
        tree = ast.parse(expression, mode="eval")
    except (SyntaxError, ValueError) as error:
        raise SafeExpressionError("Expression syntax is invalid") from error
    nodes = list(ast.walk(tree))
    if len(nodes) > _MAX_AST_NODES or _ast_depth(tree) > _MAX_AST_DEPTH:
        raise SafeExpressionError("Expression is too complex")
    for node in nodes:
        if isinstance(node, ast.Constant) and not isinstance(node.value, (str, int, float, bool)):
            raise SafeExpressionError("Only numeric, text, and boolean constants are allowed")
    return _bounded(_eval_node(tree.body, names))


def _ast_depth(node: ast.AST) -> int:
    children = list(ast.iter_child_nodes(node))
    return 1 if not children else 1 + max(_ast_depth(child) for child in children)


def _bounded(value: Any) -> Any:
    if isinstance(value, int) and not isinstance(value, bool) and value.bit_length() > _MAX_INTEGER_BITS:
        raise SafeExpressionError("Integer result is too large")
    if isinstance(value, Fraction) and max(value.numerator.bit_length(), value.denominator.bit_length()) > _MAX_INTEGER_BITS:
        raise SafeExpressionError("Fraction result is too large")
    if isinstance(value, float) and not math.isfinite(value):
        raise SafeExpressionError("Numeric result must be finite")
    if isinstance(value, str) and len(value) > _MAX_TEXT_LENGTH:
        raise SafeExpressionError("Text result is too large")
    return value


def _eval_node(node: ast.AST, names: dict[str, Any]) -> Any:
    if isinstance(node, ast.Constant):
        return _bounded(node.value)
    if isinstance(node, ast.Name):
        if node.id == "true":
            return True
        if node.id == "false":
            return False
        if node.id not in names:
            raise SafeExpressionError(f"Unknown name '{node.id}'")
        return _bounded(names[node.id])
    if isinstance(node, ast.UnaryOp):
        operand = _eval_node(node.operand, names)
        if isinstance(node.op, ast.USub):
            return _bounded(-operand)
        if isinstance(node.op, ast.UAdd):
            return _bounded(+operand)
        if isinstance(node.op, ast.Not):
            return not operand
    if isinstance(node, ast.BinOp):
        left = _eval_node(node.left, names)
        right = _eval_node(node.right, names)
        if isinstance(node.op, ast.Add):
            return _bounded(left + right)
        if isinstance(node.op, ast.Sub):
            return _bounded(left - right)
        if isinstance(node.op, ast.Mult):
            if isinstance(left, str) and isinstance(right, int) and len(left) * max(0, right) > _MAX_TEXT_LENGTH:
                raise SafeExpressionError("Text result is too large")
            if isinstance(right, str) and isinstance(left, int) and len(right) * max(0, left) > _MAX_TEXT_LENGTH:
                raise SafeExpressionError("Text result is too large")
            return _bounded(left * right)
        if isinstance(node.op, ast.Div):
            return _bounded(left / right)
        if isinstance(node.op, ast.FloorDiv):
            return _bounded(left // right)
        if isinstance(node.op, ast.Mod):
            return _bounded(left % right)
        if isinstance(node.op, ast.Pow):
            if not isinstance(right, (int, float)) or abs(right) > _MAX_EXPONENT_MAGNITUDE:
                raise SafeExpressionError("Exponent is too large")
            if isinstance(left, int) and isinstance(right, int) and right > 0 and left not in (-1, 0, 1):
                estimated_bits = left.bit_length() * right
                if estimated_bits > _MAX_INTEGER_BITS:
                    raise SafeExpressionError("Integer result is too large")
            return _bounded(left**right)
    if isinstance(node, ast.Compare):
        left = _eval_node(node.left, names)
        for operator, comparator in zip(node.ops, node.comparators):
            right = _eval_node(comparator, names)
            if isinstance(operator, ast.Eq):
                ok = left == right
            elif isinstance(operator, ast.NotEq):
                ok = left != right
            elif isinstance(operator, ast.Lt):
                ok = left < right
            elif isinstance(operator, ast.LtE):
                ok = left <= right
            elif isinstance(operator, ast.Gt):
                ok = left > right
            elif isinstance(operator, ast.GtE):
                ok = left >= right
            else:
                raise SafeExpressionError("Unsupported comparison operator")
            if not ok:
                return False
            left = right
        return True
    if isinstance(node, ast.BoolOp):
        values = [_eval_node(value, names) for value in node.values]
        if isinstance(node.op, ast.And):
            return all(values)
        if isinstance(node.op, ast.Or):
            return any(values)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        if node.func.id not in _ALLOWED_FUNCTIONS:
            raise SafeExpressionError(f"Function '{node.func.id}' is not allowed")
        if node.keywords:
            raise SafeExpressionError("Keyword arguments are not allowed")
        args = [_eval_node(arg, names) for arg in node.args]
        return _bounded(_ALLOWED_FUNCTIONS[node.func.id](*args))
    raise SafeExpressionError(f"Unsupported expression: {ast.dump(node)}")


_PLACEHOLDER = re.compile(r"{([^{}]+)}")
NORMAL_TO_SUPERSCRIPT = str.maketrans("0123456789-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻")


def display_math(text: str) -> str:
    """Format simple learner-facing math without changing parse/storage semantics."""
    value = str(text)

    def replace(match: re.Match[str]) -> str:
        base = match.group("base")
        exponent = match.group("exponent")
        return f"{base}{exponent.translate(NORMAL_TO_SUPERSCRIPT)}"

    return re.sub(
        r"(?P<base>[A-Za-z][A-Za-z0-9_]*|\b\d+)\s*(?:\*\*|\^)\s*(?P<exponent>-?\d+)",
        replace,
        value,
    )


def render_template(template: str, values: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        expression = match.group(1).strip()
        if expression in values:
            value = values[expression]
        else:
            value = safe_eval(expression, values)
        return stringify_value(value)

    rendered = _PLACEHOLDER.sub(replace, template)
    try:
        from quickmaths.math_syntax import format_school_expression

        return format_school_expression(rendered)
    except Exception:
        return rendered


def stringify_value(value: Any) -> str:
    if isinstance(value, Fraction):
        if value.denominator == 1:
            return str(value.numerator)
        return f"{value.numerator}/{value.denominator}"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def unique_preserving_order(values) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
