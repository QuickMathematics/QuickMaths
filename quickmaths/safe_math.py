"""Build school-math expressions without evaluating Python source.

SymPy's token transformations supply implicit multiplication and decimal syntax.
Their output is parsed as data and interpreted through a small arithmetic tree;
it is never passed to eval, sympify, or parse_expr.
"""

from __future__ import annotations

import ast
import math
import re

from sympy import Add, Float, Integer, Mul, Pow, Rational, Symbol
from sympy.parsing.sympy_parser import stringify_expr


def parse_school_expression(source: str, names: dict, transformations: tuple, *, evaluate: bool = True):
    if not source or len(source) > 2_000 or not re.fullmatch(r"[A-Za-z0-9_+*/().\s-]+", source):
        raise ValueError("Use a school-math expression of at most 2,000 characters.")
    depth = 0
    for character in source:
        depth += (character == "(") - (character == ")")
        if depth < 0 or depth > 32:
            raise ValueError("Invalid or excessive parenthesis nesting.")
    if depth:
        raise ValueError("Unbalanced parentheses.")
    if any(not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,79}", name) or "__" in name for name in names):
        raise ValueError("Invalid variable name.")
    constructors = {"Symbol": Symbol, "Integer": Integer, "Float": Float, "Rational": Rational}
    code = stringify_expr(source, dict(names), constructors, transformations)
    tree = ast.parse(code, mode="eval")
    if sum(1 for _ in ast.walk(tree)) > 256:
        raise ValueError("The math expression is too complex.")

    def checked(value):
        if value.is_Integer and abs(int(value)).bit_length() > 4_096:
            raise ValueError("The math expression produces an oversized integer.")
        if value.is_Rational and max(abs(int(value.p)).bit_length(), int(value.q).bit_length()) > 4_096:
            raise ValueError("The math expression produces an oversized fraction.")
        return value

    def power(base, exponent):
        if exponent.is_number and (exponent.is_real is not True or abs(exponent) > 100):
            raise ValueError("Numeric exponent magnitude is limited to 100.")
        if base.is_Integer and exponent.is_Integer and abs(int(base)).bit_length() * abs(int(exponent)) > 4_096:
            raise ValueError("The math expression produces an oversized power.")
        return checked(Pow(base, exponent, evaluate=evaluate))

    def build(node, depth=0):
        if depth > 32:
            raise ValueError("The math expression is nested too deeply.")
        child = lambda value: build(value, depth + 1)
        if isinstance(node, ast.Name) and node.id in names and not callable(names[node.id]):
            return names[node.id]
        if isinstance(node, ast.Constant) and type(node.value) in {int, float}:
            if not math.isfinite(node.value) or abs(node.value) > 10 ** 100:
                raise ValueError("Numeric literal is too large.")
            return Integer(node.value) if type(node.value) is int else Float(node.value)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = child(node.operand)
            return value if isinstance(node.op, ast.UAdd) else checked(Mul(-1, value, evaluate=evaluate))
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)):
            left, right = child(node.left), child(node.right)
            if isinstance(node.op, ast.Pow):
                return power(left, right)
            if isinstance(node.op, ast.Div):
                return checked(Mul(left, power(right, Integer(-1)), evaluate=evaluate))
            if isinstance(node.op, ast.Mult):
                return checked(Mul(left, right, evaluate=evaluate))
            if isinstance(node.op, ast.Sub):
                right = Mul(-1, right, evaluate=evaluate)
            return checked(Add(left, right, evaluate=evaluate))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
            name = node.func.id
            if name == "sqrt" and len(node.args) == 1:
                return power(child(node.args[0]), Rational(1, 2))
            if name in constructors and len(node.args) == 1 and isinstance(node.args[0], ast.Constant):
                value = node.args[0].value
                if name == "Symbol" and isinstance(value, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,79}", value) and "__" not in value:
                    return Symbol(value, real=True)
                if name in {"Integer", "Float"} and type(value) in {int, float, str}:
                    text = str(value)
                    if len(text) <= 120 and re.fullmatch(r"(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d{1,3})?", text) and math.isfinite(float(text)) and abs(float(text)) <= 10 ** 100:
                        return checked(constructors[name](value))
            if name == "Rational" and len(node.args) == 2:
                numerator, denominator = map(child, node.args)
                if numerator.is_Integer and denominator.is_Integer:
                    return checked(Rational(numerator, denominator))
        raise ValueError("Unsupported syntax in math expression.")

    return build(tree.body)
