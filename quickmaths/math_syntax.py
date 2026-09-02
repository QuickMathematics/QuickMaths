from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from sympy import E, Eq, FiniteSet, Ge, Gt, Interval, Le, Lt, N, S, Symbol, Union, fraction, gcd, oo, pi, simplify, solve, solveset, sqrt, together
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)
from sympy.solvers.inequalities import solve_univariate_inequality

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
    value = value.replace("\u2264", "<=").replace("\u2265", ">=")
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
    normalized = normalize_math_text(text)
    symbol_names = set(variables or [])
    for token in re.findall(r"[A-Za-z][A-Za-z0-9_]*", normalized):
        if token in LOCAL_DICT:
            continue
        if token in symbol_names or "_" in token or any(character.isdigit() for character in token):
            symbol_names.add(token)
        else:
            symbol_names.update(token)
    for variable in symbol_names:
        local_dict[variable] = Symbol(variable, real=True)
    try:
        return parse_expr(normalized, transformations=TRANSFORMATIONS, local_dict=local_dict)
    except Exception as exc:
        raise MathSyntaxError(f"Could not parse math expression '{text}'") from exc


def parse_equation(text: str, variables: list[str] | None = None):
    normalized = normalize_math_text(text)
    if normalized.count("=") != 1:
        raise MathSyntaxError(f"Expected one equation sign in '{text}'")
    left, right = [part.strip() for part in normalized.split("=", 1)]
    return Eq(parse_expression(left, variables), parse_expression(right, variables), evaluate=False)


def parse_inequality(text: str, variables: list[str] | None = None):
    normalized = normalize_math_text(text)
    matches = list(re.finditer(r"<=|>=|<|>", normalized))
    if len(matches) != 1:
        raise MathSyntaxError(f"Expected one inequality sign in '{text}'")
    match = matches[0]
    left = parse_expression(normalized[: match.start()].strip(), variables)
    right = parse_expression(normalized[match.end() :].strip(), variables)
    relation = match.group(0)
    return {"<": Lt, "<=": Le, ">": Gt, ">=": Ge}[relation](left, right, evaluate=False)


def parse_equation_solution(text: str, variable: str):
    return parse_expression(extract_solution_value(text, variable), [variable])


def expressions_equivalent(a: str, b: str, variables: list[str] | None = None) -> bool | None:
    try:
        return simplify(parse_expression(a, variables) - parse_expression(b, variables)) == 0
    except MathSyntaxError:
        return None


def equations_equivalent_solution_set(a: str, b: str, variable: str) -> bool | None:
    try:
        symbol = Symbol(variable, real=True)
        a_equation = parse_equation(a, [variable])
        b_equation = parse_equation(b, [variable])
        a_solution = _equation_solution_set(a_equation, symbol)
        b_solution = _equation_solution_set(b_equation, symbol)
        return a_solution == b_solution
    except Exception:
        return None


def equation_solution_set(text: str, variable: str = "x"):
    """Return the real solution set for one learner-style equation."""
    symbol = Symbol(variable, real=True)
    return _equation_solution_set(parse_equation(text, [variable]), symbol)


def equation_text_from_prompt(prompt: str) -> str:
    """Extract the final equation after an instructional prompt prefix."""
    source = str(prompt).strip()
    if ":" in source:
        source = source.split(":", 1)[1].strip()
    source = source.rstrip(". ?")
    # Several authored prompts use square brackets as visual grouping. SymPy
    # expects ordinary parentheses for scalar expressions.
    return source.replace("[", "(").replace("]", ")")


def rational_equation_restrictions(text: str, variable: str = "x"):
    """Derive the real zeros of every original equation denominator."""
    symbol = Symbol(variable, real=True)
    equation = parse_equation(equation_text_from_prompt(text), [variable])
    restrictions = S.EmptySet
    for side in (equation.lhs, equation.rhs):
        _numerator, denominator = fraction(together(side))
        if simplify(denominator) != 1:
            restrictions = Union(restrictions, solveset(denominator, symbol, domain=S.Reals))
    return restrictions


def inequalities_equivalent_solution_set(a: str, b: str, variable: str) -> bool | None:
    try:
        symbol = Symbol(variable, real=True)
        a_solution = solve_univariate_inequality(parse_inequality(a, [variable]), symbol, relational=False)
        b_solution = solve_univariate_inequality(parse_inequality(b, [variable]), symbol, relational=False)
        return simplify(a_solution.symmetric_difference(b_solution)) == S.EmptySet
    except Exception:
        return None


def _equation_solution_set(equation, symbol: Symbol):
    residual = simplify(equation.lhs - equation.rhs)
    if residual == 0:
        return S.Reals
    if symbol not in residual.free_symbols:
        return S.EmptySet
    return FiniteSet(*(simplify(solution) for solution in solve(residual, symbol)))


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


def inequality_solution_equal(expected: str, user: str, variable: str) -> bool:
    equivalent = inequalities_equivalent_solution_set(expected, user, variable)
    if equivalent is None:
        raise MathSyntaxError(f"Could not compare inequalities '{expected}' and '{user}'")
    return equivalent


def parse_finite_set(value: str | list[str], variable: str = "x"):
    if isinstance(value, list):
        members = value
    else:
        source = normalize_math_text(str(value)).strip()
        folded = source.casefold()
        if folded in {"", "{}", "∅", "empty", "empty set", "no solution", "no solutions"}:
            return S.EmptySet
        if source.startswith("{") and source.endswith("}"):
            source = source[1:-1].strip()
        source = re.sub(r"\s+or\s+", ",", source, flags=re.IGNORECASE)
        members = _split_top_level(source, ",")
        if len(members) == 1 and ";" in source:
            members = _split_top_level(source, ";")
    parsed = []
    for member in members:
        text = str(member).strip()
        if not text:
            continue
        parsed.append(simplify(parse_expression(extract_solution_value(text, variable), [variable])))
    return FiniteSet(*parsed)


def finite_set_equal(expected_values: list[str], user: str, variable: str = "x") -> bool:
    return parse_finite_set(expected_values, variable) == parse_finite_set(user, variable)


def rational_expression_equal(
    expected_formula: str,
    expected_excluded_values: list[str],
    user_formula: str,
    user_excluded_values: str | list[str],
    *,
    variable: str = "x",
    require_reduced_form: bool = False,
) -> bool:
    expected = parse_expression(expected_formula, [variable])
    user = parse_expression(user_formula, [variable])
    if simplify(expected - user) != 0:
        return False
    if parse_finite_set(expected_excluded_values, variable) != parse_finite_set(user_excluded_values, variable):
        return False
    if require_reduced_form:
        unevaluated = _parse_expression_unevaluated(user_formula, [variable])
        numerator, denominator = fraction(unevaluated)
        if simplify(gcd(numerator, denominator)) not in {S.One, S.NegativeOne}:
            return False
    return True


def parse_interval_set(value: str, variable: str = "x"):
    source = normalize_math_text(str(value)).strip()
    source = source.replace("∞", "inf")
    source = re.sub(r"\+?infinity", "inf", source, flags=re.IGNORECASE)
    source = re.sub(r"-\s*inf", "-inf", source, flags=re.IGNORECASE)
    folded = re.sub(r"\s+", " ", source).strip().casefold()
    if folded in {"", "{}", "∅", "empty", "empty set", "no solution", "no solutions"}:
        return S.EmptySet
    if folded in {"r", "reals", "real numbers", "all reals", "all real numbers"}:
        return S.Reals
    if any(character in source for character in "[]()") and "," in source:
        components = re.split(r"\s*(?:∪|\bU\b)\s*", source, flags=re.IGNORECASE)
        parsed_components = [_parse_interval_component(component.strip()) for component in components if component.strip()]
        if not parsed_components:
            raise MathSyntaxError(f"Could not parse interval set '{value}'")
        return Union(*parsed_components)
    return _parse_inequality_set(source, variable)


def interval_set_equal(expected: str, user: str, variable: str = "x") -> bool:
    expected_set = parse_interval_set(expected, variable)
    user_set = parse_interval_set(user, variable)
    return expected_set.symmetric_difference(user_set) == S.EmptySet


def _parse_interval_component(component: str):
    if len(component) < 5 or component[0] not in "([" or component[-1] not in ")]":
        raise MathSyntaxError(f"Malformed interval '{component}'")
    members = _split_top_level(component[1:-1], ",")
    if len(members) != 2:
        raise MathSyntaxError(f"Malformed interval '{component}'")
    lower = _parse_interval_endpoint(members[0])
    upper = _parse_interval_endpoint(members[1])
    left_open = component[0] == "("
    right_open = component[-1] == ")"
    if lower == -oo and not left_open:
        raise MathSyntaxError("Negative infinity must use an open endpoint")
    if upper == oo and not right_open:
        raise MathSyntaxError("Positive infinity must use an open endpoint")
    try:
        if lower != -oo and upper != oo and float(N(lower)) > float(N(upper)):
            raise MathSyntaxError(f"Interval endpoints are reversed in '{component}'")
    except (TypeError, ValueError):
        raise MathSyntaxError(f"Interval endpoints must be real constants in '{component}'")
    if lower == upper and (left_open or right_open):
        return S.EmptySet
    return Interval(lower, upper, left_open=left_open, right_open=right_open)


def _parse_interval_endpoint(value: str):
    text = value.strip().casefold().replace("+", "")
    if text in {"inf", "oo"}:
        return oo
    if text in {"-inf", "-oo"}:
        return -oo
    expression = simplify(parse_expression(value))
    if expression.free_symbols or expression.is_real is False:
        raise MathSyntaxError(f"Interval endpoint '{value}' must be a real constant")
    return expression


def _parse_inequality_set(source: str, variable: str):
    symbol = Symbol(variable, real=True)
    or_parts = re.split(r"\s+or\s+", source, flags=re.IGNORECASE)
    if len(or_parts) > 1:
        return Union(*(_parse_inequality_set(part, variable) for part in or_parts))
    and_parts = re.split(r"\s+and\s+", source, flags=re.IGNORECASE)
    if len(and_parts) > 1:
        result = S.Reals
        for part in and_parts:
            result = result.intersect(_parse_inequality_set(part, variable))
        return result
    not_equal = re.fullmatch(r"\s*(.*?)\s*!=\s*(.*?)\s*", source)
    if not_equal:
        left, right = not_equal.groups()
        if left.strip() == variable:
            boundary = parse_expression(right, [variable])
        elif right.strip() == variable:
            boundary = parse_expression(left, [variable])
        else:
            raise MathSyntaxError(f"Expected {variable} in '{source}'")
        return S.Reals - FiniteSet(simplify(boundary))
    equal = re.fullmatch(r"\s*(.*?)\s*(?<![<>!])=(?!=)\s*(.*?)\s*", source)
    if equal:
        left, right = equal.groups()
        if left.strip() == variable:
            boundary = parse_expression(right, [variable])
        elif right.strip() == variable:
            boundary = parse_expression(left, [variable])
        else:
            raise MathSyntaxError(f"Expected {variable} in '{source}'")
        return FiniteSet(simplify(boundary))
    matches = list(re.finditer(r"<=|>=|<|>", source))
    if len(matches) == 1:
        relation = parse_inequality(source, [variable])
        return solve_univariate_inequality(relation, symbol, relational=False)
    if len(matches) == 2:
        first, second = matches
        left = source[: first.start()].strip()
        middle = source[first.end() : second.start()].strip()
        right = source[second.end() :].strip()
        if middle != variable:
            raise MathSyntaxError(f"Expected middle variable {variable} in '{source}'")
        left_relation = parse_inequality(f"{left} {first.group(0)} {middle}", [variable])
        right_relation = parse_inequality(f"{middle} {second.group(0)} {right}", [variable])
        return solve_univariate_inequality(left_relation, symbol, relational=False).intersect(
            solve_univariate_inequality(right_relation, symbol, relational=False)
        )
    raise MathSyntaxError(f"Could not parse interval or inequality set '{source}'")


def _split_top_level(source: str, separator: str) -> list[str]:
    parts: list[str] = []
    depth = 0
    start = 0
    for index, character in enumerate(source):
        if character in "([{":
            depth += 1
        elif character in ")]}":
            depth = max(0, depth - 1)
        elif character == separator and depth == 0:
            parts.append(source[start:index].strip())
            start = index + 1
    parts.append(source[start:].strip())
    return parts


def _parse_expression_unevaluated(text: str, variables: list[str] | None = None):
    local_dict = dict(LOCAL_DICT)
    normalized = normalize_math_text(text)
    symbol_names = set(variables or [])
    for token in re.findall(r"[A-Za-z][A-Za-z0-9_]*", normalized):
        if token not in LOCAL_DICT:
            symbol_names.add(token)
    for variable in symbol_names:
        local_dict[variable] = Symbol(variable, real=True)
    try:
        return parse_expr(
            normalized,
            transformations=TRANSFORMATIONS,
            local_dict=local_dict,
            evaluate=False,
        )
    except Exception as exc:
        raise MathSyntaxError(f"Could not parse math expression '{text}'") from exc


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
