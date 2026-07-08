from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from sympy import E, Eq, N, Symbol, pi, simplify, solve, sqrt
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

from quickmaths.utils import normalize_spaces

TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application, convert_xor)
LOCAL_DICT = {
    "sqrt": sqrt,
    "pi": pi,
    "e": E,
}

SUPERSCRIPT_TO_NORMAL = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")
NORMAL_TO_SUPERSCRIPT = str.maketrans("0123456789-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻")


class MathSyntaxError(ValueError):
    pass


def normalize_math_text(text: str) -> str:
    value = normalize_spaces(text)
    value = _normalize_square_roots(value)
    value = _normalize_superscript_exponents(value)
    replacements = {
        "\u2212": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u00d7": "*",
        "\u00b7": "*",
        "\u00f7": "/",
        "\u03c0": "pi",
        "^": "**",
        # Common mojibake forms seen from copied math text.
        "âˆ’": "-",
        "â€“": "-",
        "â€”": "-",
        "Ã—": "*",
        "Â·": "*",
        "Ã·": "/",
        "Ï€": "pi",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def normalize_school_notation(value: str) -> str:
    return normalize_math_text(value)


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


def parse_expression(text: str, variables: list[str] | None = None):
    local_dict = dict(LOCAL_DICT)
    for variable in variables or []:
        local_dict[variable] = Symbol(variable)
    try:
        return parse_expr(normalize_math_text(text), transformations=TRANSFORMATIONS, local_dict=local_dict)
    except Exception as exc:
        raise MathSyntaxError(f"Could not parse math expression '{text}'") from exc


def parse_equation(text: str, variables: list[str] | None = None):
    normalized = normalize_math_text(text)
    if normalized.count("=") != 1:
        raise MathSyntaxError(f"Expected one equation sign in '{text}'")
    left, right = [part.strip() for part in normalized.split("=", 1)]
    return Eq(parse_expression(left, variables), parse_expression(right, variables))


def parse_equation_solution(text: str, variable: str):
    return parse_expression(extract_solution_value(text, variable), [variable])


def expressions_equivalent(a: str, b: str, variables: list[str] | None = None) -> bool | None:
    try:
        return simplify(parse_expression(a, variables) - parse_expression(b, variables)) == 0
    except MathSyntaxError:
        return None


def equations_equivalent_solution_set(a: str, b: str, variable: str) -> bool | None:
    try:
        symbol = Symbol(variable)
        a_solution = solve(parse_equation(a, [variable]), symbol)
        b_solution = solve(parse_equation(b, [variable]), symbol)
        return set(a_solution) == set(b_solution)
    except Exception:
        return None


def symbolic_equal(expected: str, user: str) -> bool:
    equivalent = expressions_equivalent(expected, user)
    if equivalent is None:
        raise MathSyntaxError(f"Could not compare '{expected}' and '{user}'")
    return equivalent


def numeric_equal(expected: str, user: str) -> bool:
    return symbolic_equal(expected, user)


def numeric_with_tolerance(expected: str, user: str, tolerance: Decimal) -> bool:
    expected_value = decimal_value(expected)
    user_value = decimal_value(user)
    return abs(expected_value - user_value) <= tolerance


def decimal_value(value: str) -> Decimal:
    normalized = normalize_math_text(value)
    try:
        return Decimal(normalized)
    except InvalidOperation:
        expression = parse_expression(normalized)
        if expression.free_symbols:
            raise MathSyntaxError(f"Expression '{value}' is not numeric")
        return Decimal(str(N(expression, 18)))


def equation_solution_equal(expected: str, user: str, variable: str) -> bool:
    return symbolic_equal(extract_solution_value(expected, variable), extract_solution_value(user, variable))


def extract_solution_value(value: str, variable: str) -> str:
    normalized = normalize_math_text(value)
    if normalized.count("=") != 1:
        return normalized
    left, right = [part.strip() for part in normalized.split("=", 1)]
    if left == variable:
        return right
    if right == variable:
        return left
    return right


def accepted_text_match(user: str, accepted_forms: list[str]) -> bool:
    normalized_user = normalize_math_text(user).casefold()
    return any(normalize_math_text(form).casefold() == normalized_user for form in accepted_forms)


def format_coefficient(coefficient: int | float, variable: str = "x") -> str:
    if coefficient == 1:
        return variable
    if coefficient == -1:
        return f"-{variable}"
    return f"{_format_number(coefficient)}{variable}"


def format_signed_term(term: str | int | float, first: bool = False) -> str:
    text = str(term).strip()
    if text.startswith("-"):
        return text if first else f"- {text[1:].strip()}"
    return text if first else f"+ {text}"


def format_linear_expression(coefficient: int | float, constant: int | float = 0, variable: str = "x") -> str:
    parts = [format_coefficient(coefficient, variable)]
    if constant:
        parts.append(format_signed_term(_format_number(constant)))
    return " ".join(parts)


def format_sum(terms: list[str | int | float]) -> str:
    formatted: list[str] = []
    for term in terms:
        text = str(term).strip()
        if not text or text == "0":
            continue
        formatted.append(format_signed_term(text, first=not formatted))
    return " ".join(formatted) if formatted else "0"


def format_school_expression(text: str) -> str:
    value = normalize_spaces(text)
    value = re.sub(r"\+\s*-", "- ", value)
    value = re.sub(r"-\s*-", "+ ", value)
    value = re.sub(r"\b1([A-Za-z])", r"\1", value)
    value = re.sub(r"(?<!\d)-1([A-Za-z])", r"-\1", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = value.replace("(+ ", "(")
    return value


def _normalize_superscript_exponents(value: str) -> str:
    superscript_chars = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻"

    def replace(match: re.Match[str]) -> str:
        exponent = match.group("exponent").translate(SUPERSCRIPT_TO_NORMAL)
        return f"{match.group('base')}**{exponent}"

    return re.sub(
        rf"(?P<base>[A-Za-z][A-Za-z0-9_]*|\b\d+)(?P<exponent>[{superscript_chars}]+)",
        replace,
        value,
    )


def _normalize_square_roots(value: str) -> str:
    for marker in ("\u221a", "âˆš"):
        value = _replace_sqrt_marker(value, marker)
    return value


def _replace_sqrt_marker(value: str, marker: str) -> str:
    while marker in value:
        index = value.index(marker)
        start = index + len(marker)
        while start < len(value) and value[start].isspace():
            start += 1
        if start >= len(value):
            value = value[:index] + "sqrt" + value[start:]
            continue
        if value[start] == "(":
            end = _matching_paren(value, start)
            if end is None:
                value = value[:index] + "sqrt" + value[start:]
            else:
                inner = value[start + 1 : end]
                value = value[:index] + f"sqrt({inner})" + value[end + 1 :]
        else:
            match = re.match(r"[A-Za-z0-9_]+", value[start:])
            if not match:
                value = value[:index] + "sqrt" + value[start:]
            else:
                token = match.group(0)
                end = start + len(token)
                value = value[:index] + f"sqrt({token})" + value[end:]
    return value


def _matching_paren(value: str, start: int) -> int | None:
    depth = 0
    for index in range(start, len(value)):
        if value[index] == "(":
            depth += 1
        elif value[index] == ")":
            depth -= 1
            if depth == 0:
                return index
    return None


def _format_number(value: int | float) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)
