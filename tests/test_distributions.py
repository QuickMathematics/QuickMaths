import math
import json
import random
import shutil
import subprocess
from pathlib import Path

import pytest

from quickmaths.distributions import (
    chi_square_cdf,
    chi_square_sf,
    f_sf,
    inverse_normal_cdf,
    normal_cdf,
    t_cdf,
)
from quickmaths.utils import SafeExpressionError, safe_eval


FIXTURE_DIR = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize(
    ("function", "args", "expected"),
    [
        (normal_cdf, (-8,), 6.22096057427174e-16),
        (normal_cdf, (-1.96,), 0.024997895148220435),
        (normal_cdf, (1.96,), 0.9750021048517795),
        (inverse_normal_cdf, (1e-6,), -4.753424308822899),
        (inverse_normal_cdf, (0.999999,), 4.753424308817087),
        (t_cdf, (-2.228, 10), 0.02500588590855566),
        (t_cdf, (3, 100), 0.9982960423283352),
        (chi_square_cdf, (10, 5), 0.9247647538534878),
        (chi_square_sf, (50, 20), 0.0002214766382487835),
        (f_sf, (4, 3, 20), 0.022076999662362404),
        (f_sf, (12, 6, 50), 2.664857085283752e-8),
    ],
)
def test_distribution_vectors(function, args, expected):
    assert function(*args) == pytest.approx(expected, rel=3e-13, abs=3e-15)


def test_all_archived_distribution_vectors():
    fixture_specs = [
        ("BATCH16_DISTRIBUTION_FUNCTION_TEST_VECTORS.json", "functions"),
        ("BATCH17_CHI_SQUARE_FUNCTION_TEST_VECTORS.json", "functions"),
        ("BATCH18_F_DISTRIBUTION_TEST_VECTORS.json", "vectors"),
    ]
    checked = 0
    for filename, section in fixture_specs:
        payload = json.loads((FIXTURE_DIR / filename).read_text(encoding="utf-8"))
        vectors = payload[section]
        named_vectors = vectors.items() if section == "functions" else [(payload["function"], vectors)]
        for name, entries in named_vectors:
            function = globals()[name]
            for entry in entries:
                assert function(*entry["args"]) == pytest.approx(entry["expected"], rel=3e-13, abs=3e-15), f"{filename}:{name}:{entry['args']}"
                checked += 1
    assert checked == 89


def test_distribution_symmetry_and_complement():
    assert normal_cdf(-2.0) == pytest.approx(1 - normal_cdf(2.0), abs=2e-16)
    assert t_cdf(-1.75, 7.5) == pytest.approx(1 - t_cdf(1.75, 7.5), abs=2e-15)
    assert chi_square_cdf(15, 7.5) + chi_square_sf(15, 7.5) == pytest.approx(1, abs=2e-15)


@pytest.mark.parametrize(
    "expression",
    [
        "normal_cdf(float('nan'))",
        "inverse_normal_cdf(0)",
        "inverse_normal_cdf(1)",
        "t_cdf(1, 0)",
        "chi_square_cdf(-1, 2)",
        "chi_square_sf(1, -2)",
        "f_sf(-1, 1, 1)",
        "f_sf(1, 0, 1)",
    ],
)
def test_safe_eval_rejects_invalid_distribution_domains(expression):
    with pytest.raises((SafeExpressionError, ValueError)):
        safe_eval(expression, {})


def test_safe_eval_allowlist_exposes_native_functions():
    assert safe_eval("normal_cdf(0)", {}) == 0.5
    assert math.isclose(safe_eval("chi_square_sf(2, 2)", {}), math.exp(-1), rel_tol=1e-14)


def test_python_browser_parity_on_same_randomized_inputs():
    """Run both trusted kernels over one deterministic cross-language corpus."""
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is required for the browser parity check")
    rng = random.Random(20260908)
    cases = []
    for _ in range(24):
        cases.extend([
            ["normal_cdf", [rng.uniform(-12, 12)]],
            ["inverse_normal_cdf", [rng.uniform(1e-6, 1 - 1e-6)]],
            ["t_cdf", [rng.uniform(-20, 20), 10 ** rng.uniform(-6, 3)]],
            ["chi_square_cdf", [10 ** rng.uniform(-8, 4), 10 ** rng.uniform(-6, 3)]],
            ["chi_square_sf", [10 ** rng.uniform(-8, 4), 10 ** rng.uniform(-6, 3)]],
            ["f_sf", [10 ** rng.uniform(-8, 4), 10 ** rng.uniform(-6, 3), 10 ** rng.uniform(-6, 3)]],
        ])
    cases.extend([
        ["normal_cdf", [-1e200]], ["normal_cdf", [1e200]],
        ["t_cdf", [-1e200, 1e-12]], ["t_cdf", [1e200, 1e12]],
        ["chi_square_sf", [1e200, 1e-12]], ["f_sf", [1e308, 10, 1]],
    ])
    script = """
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const cases = JSON.parse(Buffer.concat(chunks).toString());
const distributions = await import('./docs/distributions.js');
process.stdout.write(JSON.stringify(cases.map(([name, args]) => distributions[name](...args))));
"""
    completed = subprocess.run(
        [node, "--input-type=module", "-e", script],
        input=json.dumps(cases), text=True, capture_output=True, check=True,
        cwd=".",
    )
    browser_values = json.loads(completed.stdout)
    python_values = [globals()[name](*args) for name, args in cases]
    for python_value, browser_value in zip(python_values, browser_values):
        # Lanczos lgamma and libm log/exp differ by a few ulps across Python
        # and V8; the bounded kernels remain well within this parity budget.
        assert browser_value == pytest.approx(python_value, rel=5e-10, abs=2e-12)


def test_extreme_student_t_matches_independent_mpmath_oracle():
    mp = pytest.importorskip("mpmath")
    mp.mp.dps = 80
    t_value = mp.mpf("1e200")
    degrees = mp.mpf("1e-12")
    x = degrees / (degrees + t_value * t_value)
    expected = mp.mpf("0.5") * mp.betainc(degrees / 2, mp.mpf("0.5"), 0, x, regularized=True)
    assert t_cdf(-1e200, 1e-12) == pytest.approx(float(expected), rel=3e-14, abs=3e-15)
    assert t_cdf(1e200, 1e-12) == pytest.approx(float(1 - expected), rel=3e-14, abs=3e-15)


def test_unsupported_gamma_range_fails_deterministically():
    with pytest.raises(ValueError, match="stable range"):
        chi_square_cdf(1, 1e308)
