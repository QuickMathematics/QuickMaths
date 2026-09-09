"""Validation and resolution for native lesson math displays and graphs.

This module intentionally contains no HTML rendering or arbitrary evaluation.  It
is the Python counterpart of the bounded declarative display schemas used by the
web lesson player.
"""
from __future__ import annotations

import math
import re
from copy import deepcopy
from typing import Any, Callable


class LessonDisplayError(ValueError):
    pass


MATH_DISPLAY_LIMITS = {
    "blocks": 24, "rows": 16, "steps": 16, "text": 4000,
    "short_text": 500, "total_text": 40_000,
}
_PLACEHOLDER = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")


def _keys(value: Any, allowed: set[str]) -> None:
    if not isinstance(value, dict):
        raise LessonDisplayError("value must be an object")
    unknown = set(value) - allowed
    if unknown:
        raise LessonDisplayError(f"unknown key {sorted(unknown)[0]!r}")


def _text(value: Any, name: str, limit: int, *, nonempty: bool = True) -> str:
    if not isinstance(value, str) or len(value) > limit or (nonempty and not value.strip()):
        raise LessonDisplayError(f"{name} must be non-empty text of at most {limit} characters")
    return value.strip() if nonempty else value


def normalize_math_blocks(candidate: Any = []) -> list[dict[str, Any]]:
    if not isinstance(candidate, list) or len(candidate) > MATH_DISPLAY_LIMITS["blocks"]:
        raise LessonDisplayError("supports at most 24 blocks")
    types = {"piecewise", "fraction", "limit", "derivation", "notation"}
    result = []
    for index, block in enumerate(candidate):
        if not isinstance(block, dict):
            raise LessonDisplayError(f"block {index + 1} is invalid")
        _keys(block, {"type", "alt", "linear_text", "rows", "numerator", "denominator", "variable", "to", "direction", "expression", "steps", "text"})
        kind = block.get("type")
        if kind not in types:
            raise LessonDisplayError(f"block {index + 1} has an unsupported type")
        out = {"type": kind, "alt": _text(block.get("alt"), f"block {index + 1} alt", 4000), "linear_text": _text(block.get("linear_text"), f"block {index + 1} linear_text", 4000)}
        common = {"type", "alt", "linear_text"}
        if kind == "piecewise":
            _keys(block, common | {"rows"})
            rows = block.get("rows")
            if not isinstance(rows, list) or not 1 <= len(rows) <= 16:
                raise LessonDisplayError("piecewise rows are out of bounds")
            out["rows"] = []
            for row in rows:
                _keys(row, {"expression", "condition"})
                out["rows"].append({"expression": _text(row.get("expression"), "piecewise expression", 500), "condition": _text(row.get("condition"), "piecewise condition", 500)})
        elif kind == "fraction":
            _keys(block, common | {"numerator", "denominator"})
            out["numerator"] = _text(block.get("numerator"), "fraction numerator", 500)
            out["denominator"] = _text(block.get("denominator"), "fraction denominator", 500)
        elif kind == "limit":
            _keys(block, common | {"variable", "to", "direction", "expression"})
            out["variable"] = _text(block.get("variable"), "limit variable", 500)
            out["to"] = _text(block.get("to"), "limit endpoint", 500)
            if block.get("direction") not in {"left", "right", "both"}:
                raise LessonDisplayError("limit direction must be left, right or both")
            out["direction"] = block["direction"]
            out["expression"] = _text(block.get("expression"), "limit expression", 500)
        elif kind == "derivation":
            _keys(block, common | {"steps"})
            steps = block.get("steps")
            if not isinstance(steps, list) or not 1 <= len(steps) <= 16:
                raise LessonDisplayError("derivation steps are out of bounds")
            out["steps"] = [_text(step, "derivation step", 4000, ) for step in steps]
        else:
            _keys(block, common | {"text"})
            out["text"] = _text(block.get("text"), "notation text", 4000)
        result.append(out)
    if sum(len(str(block)) for block in result) > MATH_DISPLAY_LIMITS["total_text"]:
        raise LessonDisplayError("content exceeds 40000 characters")
    return result


def _substitute_text(value: str, public: dict[str, Any]) -> str:
    # Other braces may be literal set notation; only {identifier} binds a value.
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in public:
            raise LessonDisplayError(f"references unknown variable {name!r}")
        item = public[name]
        if not isinstance(item, (str, int, float)) or isinstance(item, bool) or (isinstance(item, float) and not math.isfinite(item)):
            raise LessonDisplayError(f"variable {name!r} must resolve to finite numeric or text data")
        text = str(item)
        if len(text) > 500 or "{" in text or "}" in text:
            raise LessonDisplayError(f"variable {name!r} resolves to invalid text")
        return text
    return _PLACEHOLDER.sub(replace, value)


def resolve_math_blocks(candidate: Any, public_values: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    public = public_values or {}
    if not isinstance(public, dict):
        raise LessonDisplayError("publicValues must be an object")
    blocks = normalize_math_blocks(candidate)
    def visit(value: Any) -> Any:
        if isinstance(value, str):
            return _substitute_text(value, public)
        if isinstance(value, list):
            return [visit(item) for item in value]
        if isinstance(value, dict):
            return {key: visit(item) for key, item in value.items()}
        return value
    return normalize_math_blocks(visit(blocks))


# Cartesian diagrams -------------------------------------------------------
def _number(value: Any) -> float | int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > 1e6:
        raise LessonDisplayError("number is out of bounds")
    return value


def _pair(value: Any) -> list[float | int]:
    if not isinstance(value, list) or len(value) != 2:
        raise LessonDisplayError("point must contain two numbers")
    return [_number(item) for item in value]


def _range(value: Any) -> list[float | int]:
    pair = _pair(value)
    if pair[1] - pair[0] < 1e-6:
        raise LessonDisplayError("range must increase")
    return pair


def _graph_tokens(source: str) -> list[str]:
    tokens = re.findall(r"(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|\*\*|[()+*/-]|[A-Za-z_]+", source, re.I)
    if not tokens or len(tokens) > 120 or "".join(tokens) != re.sub(r"\s", "", source):
        raise LessonDisplayError("invalid graph expression")
    return tokens


def graph_expression(source: str) -> Callable[[float, float | None], tuple[float, float] | None]:
    source = _text(source, "expression", 300)
    tokens, index = _graph_tokens(source), 0
    def parse(min_prec: int = 0, depth: int = 0):
        nonlocal index
        if depth > 20 or index >= len(tokens):
            raise LessonDisplayError("invalid graph expression")
        token = tokens[index]; index += 1
        if token in {"+", "-"}:
            node = ("neg" if token == "-" else "pos", parse(3, depth + 1))
        elif token == "(":
            node = parse(0, depth + 1)
            if index >= len(tokens) or tokens[index] != ")": raise LessonDisplayError("invalid graph expression")
            index += 1
        elif token == "x": node = ("x",)
        elif token in {"sqrt", "abs"}:
            if index >= len(tokens) or tokens[index] != "(": raise LessonDisplayError("invalid graph expression")
            index += 1; node = (token, parse(0, depth + 1))
            if index >= len(tokens) or tokens[index] != ")": raise LessonDisplayError("invalid graph expression")
            index += 1
        elif re.match(r"^(?:\d|\.)", token): node = ("n", _number(float(token)))
        else: raise LessonDisplayError("invalid graph expression")
        precedence = {"+": 1, "-": 1, "*": 2, "/": 2, "**": 4}
        while index < len(tokens) and tokens[index] in precedence and precedence[tokens[index]] >= min_prec:
            op = tokens[index]; index += 1
            right = parse(precedence[op] + (0 if op == "**" else 1), depth + 1)
            if op == "**" and (right[0] != "n" or not float(right[1]).is_integer() or right[1] > 8): raise LessonDisplayError("power must be an integer at most 8")
            node = (op, node, right)
        return node
    tree = parse()
    if index != len(tokens): raise LessonDisplayError("invalid graph expression")
    def evaluate(node, domain):
        kind = node[0]
        if kind == "n": return (node[1], node[1])
        if kind == "x": return domain
        a = evaluate(node[1], domain)
        if a is None: return None
        if kind == "neg": return (-a[1], -a[0])
        if kind == "pos": return a
        if kind == "sqrt": return None if a[0] < 0 else (math.sqrt(a[0]), math.sqrt(a[1]))
        if kind == "abs": return (0 if a[0] <= 0 <= a[1] else min(abs(a[0]), abs(a[1])), max(abs(a[0]), abs(a[1])))
        b = evaluate(node[2], domain)
        if b is None: return None
        if kind == "+": return (a[0] + b[0], a[1] + b[1])
        if kind == "-": return (a[0] - b[1], a[1] - b[0])
        if kind == "/" and b[0] <= 0 <= b[1]: return None
        if kind == "**":
            exponent = int(b[0]); ends = [a[0] ** exponent, a[1] ** exponent]
            return (0 if exponent % 2 == 0 and a[0] <= 0 <= a[1] else min(ends), max(ends))
        values = [x * y if kind == "*" else x / y for x in a for y in b]
        return (min(values), max(values)) if all(math.isfinite(v) for v in values) else None
    def evaluate_at(lo: float, hi: float | None = None):
        try: return evaluate(tree, (lo, lo if hi is None else hi))
        except (ArithmeticError, ValueError, OverflowError): return None
    return evaluate_at


def normalize_cartesian_diagram(value: Any) -> dict[str, Any]:
    _keys(value, {"kind", "x_range", "y_range", "alt", "curves", "points", "segments", "asymptotes", "labels"})
    if value.get("kind") != "cartesian": raise LessonDisplayError("kind must be cartesian")
    out = {"kind": "cartesian", "x_range": _range(value.get("x_range")), "y_range": _range(value.get("y_range")), "alt": _text(value.get("alt"), "alt", 500)}
    curves = value.get("curves", [])
    if not isinstance(curves, list) or len(curves) > 8: raise LessonDisplayError("curves are out of bounds")
    out["curves"] = []
    for curve in curves:
        _keys(curve, {"expression", "interval", "endpoints", "exclude"})
        expression = _text(curve.get("expression"), "expression", 300); graph_expression(expression)
        endpoints = curve.get("endpoints", ["none", "none"])
        if not isinstance(endpoints, list) or len(endpoints) != 2 or any(item not in {"open", "closed", "none"} for item in endpoints): raise LessonDisplayError("invalid curve endpoints")
        exclude = curve.get("exclude", [])
        if not isinstance(exclude, list) or len(exclude) > 24: raise LessonDisplayError("exclude is out of bounds")
        out["curves"].append({"expression": expression, "interval": _range(curve.get("interval")), "endpoints": list(endpoints), "exclude": [_number(x) for x in exclude]})
    def bounded_list(key, limit, fn):
        items = value.get(key, [])
        if not isinstance(items, list) or len(items) > limit: raise LessonDisplayError(f"{key} is out of bounds")
        return [fn(item) for item in items]
    def point(p):
        _keys(p, {"at", "label", "endpoint"})
        endpoint = p.get("endpoint", "closed")
        if endpoint not in {"open", "closed"}: raise LessonDisplayError("invalid point endpoint")
        return {"at": _pair(p.get("at")), "label": _text(p.get("label", ""), "label", 100, nonempty=False), "endpoint": endpoint}
    def segment(s):
        _keys(s, {"from", "to"})
        return {"from": _pair(s.get("from")), "to": _pair(s.get("to"))}
    def asymptote(a):
        _keys(a, {"axis", "value"})
        if a.get("axis") not in {"x", "y"}: raise LessonDisplayError("invalid asymptote axis")
        return {"axis": a.get("axis"), "value": _number(a.get("value"))}
    def label(item):
        _keys(item, {"at", "text"})
        return {"at": _pair(item.get("at")), "text": _text(item.get("text"), "label", 100, nonempty=False)}
    out["points"] = bounded_list("points", 24, point)
    out["segments"] = bounded_list("segments", 16, segment)
    out["asymptotes"] = bounded_list("asymptotes", 8, asymptote)
    out["labels"] = bounded_list("labels", 16, label)
    return out


def _resolve_graph_value(value: Any, values: dict[str, Any]) -> Any:
    if isinstance(value, str):
        exact = re.fullmatch(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", value)
        if exact:
            item = values.get(exact.group(1))
            if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item): raise LessonDisplayError("numeric placeholder must resolve to a finite number")
            return item
        return _substitute_text(value, values)
    if isinstance(value, list): return [_resolve_graph_value(item, values) for item in value]
    if isinstance(value, dict): return {key: _resolve_graph_value(item, values) for key, item in value.items()}
    return value


def resolve_cartesian_diagram(spec: Any, values: dict[str, Any] | None = None) -> dict[str, Any]:
    resolved = _resolve_graph_value(spec, values or {})
    if isinstance(resolved, dict):
        def numeric(value: Any) -> Any:
            if not isinstance(value, str): return value
            if re.search(r"(?:^|[^A-Za-z_])x(?:$|[^A-Za-z_])", value):
                raise LessonDisplayError("numeric coordinate expression cannot depend on x")
            result = graph_expression(value)(0)
            if result is None or result[0] != result[1]:
                raise LessonDisplayError("numeric coordinate expression is invalid")
            return _number(result[0])
        def numeric_list(values_list: Any) -> Any:
            if not isinstance(values_list, list): return values_list
            return [numeric(item) for item in values_list]
        for key in ("x_range", "y_range"):
            if key in resolved: resolved[key] = numeric_list(resolved[key])
        for curve in resolved.get("curves", []):
            if isinstance(curve, dict):
                curve["interval"] = numeric_list(curve.get("interval"))
                curve["exclude"] = numeric_list(curve.get("exclude", []))
        for point in resolved.get("points", []):
            if isinstance(point, dict): point["at"] = numeric_list(point.get("at"))
        for segment in resolved.get("segments", []):
            if isinstance(segment, dict):
                segment["from"] = numeric_list(segment.get("from")); segment["to"] = numeric_list(segment.get("to"))
        for asymptote in resolved.get("asymptotes", []):
            if isinstance(asymptote, dict): asymptote["value"] = numeric(asymptote.get("value"))
        for label in resolved.get("labels", []):
            if isinstance(label, dict): label["at"] = numeric_list(label.get("at"))
        resolved["alt"] = str(resolved.get("alt", ""))
        for curve in resolved.get("curves", []):
            if isinstance(curve, dict) and "expression" in curve: curve["expression"] = str(curve["expression"])
        for point in resolved.get("points", []):
            if isinstance(point, dict) and "label" in point: point["label"] = str(point["label"])
        for label in resolved.get("labels", []):
            if isinstance(label, dict) and "text" in label: label["text"] = str(label["text"])
    return normalize_cartesian_diagram(resolved)


def cartesian_segments(curve: dict[str, Any], x_range: list[float], y_range: list[float]) -> list[list[list[float]]]:
    fn = graph_expression(curve["expression"]); low, high = max(curve["interval"][0], x_range[0]), min(curve["interval"][1], x_range[1])
    if low >= high: return []
    paths: list[list[list[float]]] = []; path: list[list[float]] = []; previous = None
    def flush():
        nonlocal path
        if len(path) > 1: paths.append(path)
        path = []
    for i in range(321):
        x = low + (high - low) * i / 320; result = fn(x); y = result[0] if result else None
        gap = any(previous is not None and e >= previous and e <= x for e in curve.get("exclude", []))
        valid = y is not None and math.isfinite(y) and y_range[0] <= y <= y_range[1] and x not in curve.get("exclude", [])
        if not valid or gap or (previous is not None and fn(previous, x) is None): flush()
        if valid: path.append([x, y])
        previous = x
    flush(); return paths


normalize_math_display = normalize_math_blocks
resolve_math_display = resolve_math_blocks
