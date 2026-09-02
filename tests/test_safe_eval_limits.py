from __future__ import annotations

import pytest

from quickmaths.utils import SafeExpressionError, safe_eval


def test_safe_eval_keeps_normal_curriculum_arithmetic() -> None:
    assert safe_eval("abs(a) + max(b, 3) ** 2", {"a": -4, "b": 5}) == 29
    assert safe_eval("0 < x < 10 and x != 7", {"x": 6}) is True


@pytest.mark.parametrize(
    "expression",
    [
        "9 ** 1000",
        "'x' * 1000000",
        "1" + " + 1" * 300,
        "-" * 40 + "1",
    ],
)
def test_safe_eval_rejects_resource_exhaustion_expressions(expression: str) -> None:
    with pytest.raises(SafeExpressionError):
        safe_eval(expression, {})


def test_safe_eval_rejects_non_data_constants_and_keyword_calls() -> None:
    with pytest.raises(SafeExpressionError):
        safe_eval("None", {})
    with pytest.raises(SafeExpressionError):
        safe_eval("round(1.234, ndigits=2)", {})
