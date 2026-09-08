"""Dependency-free, bounded probability distribution helpers.

These functions are used only by trusted native lesson generation.  The
continued fractions and series below are deliberately bounded so malformed or
pathological authored values cannot turn evaluation into an unbounded loop.
"""

from __future__ import annotations

import math
from numbers import Real


_MAX_ITERATIONS = 300
_RELATIVE_TOLERANCE = 1e-14
_FPMIN = 1e-300
_SQRT_2 = math.sqrt(2.0)


def _finite_real(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError(f"{name} must be a finite real number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be a finite real number")
    return result


def _positive(value: object, name: str) -> float:
    result = _finite_real(value, name)
    if result <= 0.0:
        raise ValueError(f"{name} must be greater than zero")
    return result


def _probability(value: float) -> float:
    # Round only tiny floating point excursions at the closed probability
    # boundaries.  The algorithms otherwise return a value in [0, 1].
    if not math.isfinite(value):
        raise ValueError("probability computation did not converge")
    if value <= 0.0:
        return 0.0
    if value >= 1.0:
        return 1.0
    return value


def normal_cdf(z: object) -> float:
    """Return the lower-tail standard normal probability at finite ``z``."""
    value = _finite_real(z, "z")
    return _probability(0.5 * math.erfc(-value / _SQRT_2))


def inverse_normal_cdf(p: object) -> float:
    """Return the standard normal quantile for a probability strictly in (0, 1)."""
    probability = _finite_real(p, "p")
    if not 0.0 < probability < 1.0:
        raise ValueError("p must be strictly between zero and one")

    # Peter J. Acklam's rational approximation, followed by one Halley step.
    # The approximation is evaluated in the tail that is numerically safest.
    a = (-3.969683028665376e1, 2.209460984245205e2,
         -2.759285104469687e2, 1.383577518672690e2,
         -3.066479806614716e1, 2.506628277459239)
    b = (-5.447609879822406e1, 1.615858368580409e2,
         -1.556989798598866e2, 6.680131188771972e1,
         -1.328068155288572e1)
    c = (-7.784894002430293e-3, -3.223964580411365e-1,
         -2.400758277161838, -2.549732539343734,
         4.374664141464968, 2.938163982698783)
    d = (7.784695709041462e-3, 3.224671290700398e-1,
         2.445134137142996, 3.754408661907416)
    low = 0.02425
    high = 1.0 - low
    def horner(coefficients: tuple[float, ...], argument: float) -> float:
        result = coefficients[0]
        for coefficient in coefficients[1:]:
            result = result * argument + coefficient
        return result

    if probability < low:
        q = math.sqrt(-2.0 * math.log(probability))
        value = horner(c, q) / horner((*d, 1.0), q)
    elif probability <= high:
        q = probability - 0.5
        r = q * q
        value = horner(a, r) * q / horner((*b, 1.0), r)
    else:
        q = math.sqrt(-2.0 * math.log1p(-probability))
        value = -horner(c, q) / horner((*d, 1.0), q)

    # Halley's correction materially improves parity with reference libraries
    # around the centre while retaining the accurate tail approximation.
    density = math.exp(-0.5 * value * value) / math.sqrt(2.0 * math.pi)
    if density > 0.0 and math.isfinite(density):
        if value >= 0.0:
            # Compute the upper tail directly; subtracting a CDF from one
            # loses the useful digits in the upper half of the distribution.
            error = 0.5 * math.erfc(value / _SQRT_2) - (1.0 - probability)
            value += error / density / (1.0 + 0.5 * value * error / density)
        else:
            error = normal_cdf(value) - probability
            value -= error / density / (1.0 + 0.5 * value * error / density)
    return value


def _log_prefactor(a: float, x: float) -> float:
    try:
        log_gamma = math.lgamma(a)
    except OverflowError:
        raise ValueError("incomplete gamma parameters exceed stable range")
    exponent = -x + a * math.log(x) - log_gamma
    if math.isnan(exponent) or exponent == math.inf:
        raise ValueError("incomplete gamma parameters exceed stable range")
    return exponent


def _exp_log_prefactor(a: float, x: float) -> float:
    exponent = _log_prefactor(a, x)
    if exponent <= -745.0:
        return 0.0
    if exponent >= 709.0:
        return math.inf
    return math.exp(exponent)


def _regularized_gamma(a: float, x: float) -> tuple[float, float]:
    """Return (P(a,x), Q(a,x)) with bounded series/continued fraction."""
    if x == 0.0:
        return 0.0, 1.0
    if x < a + 1.0:
        # Track a-scaled terms so log(P) can use lgamma(a+1) directly.  This
        # avoids subtracting two ~log(a) values and preserves Q for tiny df.
        scaled_total = 1.0
        scaled_term = 1.0
        for index in range(1, _MAX_ITERATIONS + 1):
            scaled_term *= x / (a + index)
            scaled_total += scaled_term
            if abs(scaled_term) <= abs(scaled_total) * _RELATIVE_TOLERANCE:
                try:
                    log_lower = -x + a * math.log(x) - math.lgamma(a + 1.0) + math.log(scaled_total)
                except OverflowError as error:
                    raise ValueError("incomplete gamma parameters exceed stable range") from error
                if math.isnan(log_lower) or log_lower == math.inf:
                    raise ValueError("incomplete gamma parameters exceed stable range")
                if log_lower >= 0.0:
                    return 1.0, 0.0
                lower = 0.0 if log_lower <= -745.0 else math.exp(log_lower)
                # -expm1(log(P)) retains the upper-tail digits when P is
                # close to one (especially for very small fractional df).
                upper = -math.expm1(log_lower)
                return _probability(lower), _probability(upper)
        raise ValueError("incomplete gamma series did not converge")

    b = x + 1.0 - a
    d = 1.0 / b if b != 0.0 else 1.0 / _FPMIN
    c = 1.0 / _FPMIN
    h = d
    for index in range(1, _MAX_ITERATIONS + 1):
        coefficient = -index * (index - a)
        b += 2.0
        d = coefficient * d + b
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = b + coefficient / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) <= _RELATIVE_TOLERANCE:
            upper = _exp_log_prefactor(a, x) * h
            upper = _probability(upper)
            return _probability(1.0 - upper), upper
    raise ValueError("incomplete gamma continued fraction did not converge")


def chi_square_cdf(x: object, df: object) -> float:
    """Return the lower-tail chi-square probability."""
    value = _finite_real(x, "x")
    if value < 0.0:
        raise ValueError("x must be non-negative")
    degrees = _positive(df, "df")
    return _regularized_gamma(degrees * 0.5, value * 0.5)[0]


def chi_square_sf(x: object, df: object) -> float:
    """Return the chi-square upper tail directly via Q(df/2, x/2)."""
    value = _finite_real(x, "x")
    if value < 0.0:
        raise ValueError("x must be non-negative")
    degrees = _positive(df, "df")
    return _regularized_gamma(degrees * 0.5, value * 0.5)[1]


def _beta_continued_fraction(a: float, b: float, x: float) -> float:
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < _FPMIN:
        d = _FPMIN
    d = 1.0 / d
    result = d
    for index in range(1, _MAX_ITERATIONS + 1):
        m2 = 2.0 * index
        numerator = index * (b - index) * x / ((qam + m2) * (a + m2))
        d = 1.0 + numerator * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + numerator / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        result *= d * c
        numerator = -(a + index) * (qab + index) * x / ((a + m2) * (qap + m2))
        d = 1.0 + numerator * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + numerator / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        delta = d * c
        result *= delta
        if abs(delta - 1.0) <= _RELATIVE_TOLERANCE:
            return result
    raise ValueError("incomplete beta continued fraction did not converge")


def _regularized_beta(x: float, a: float, b: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    log_term = (math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
                + a * math.log(x) + b * math.log1p(-x))
    term = 0.0 if log_term <= -745.0 else math.exp(log_term)
    threshold = (a + 1.0) / (a + b + 2.0)
    if x < threshold:
        return _probability(term * _beta_continued_fraction(a, b, x) / a)
    complement = term * _beta_continued_fraction(b, a, 1.0 - x) / b
    return _probability(1.0 - complement)


def _regularized_beta_log_x(log_x: float, a: float, b: float) -> float:
    """Small-x beta tail when x itself underflows a binary64 value."""
    try:
        gamma_difference = math.lgamma(a + b) - math.lgamma(b)
    except OverflowError as error:
        raise ValueError("incomplete beta parameters exceed stable range") from error
    log_term = gamma_difference - math.lgamma(a) + a * log_x
    if log_term <= -745.0:
        return 0.0
    return _probability(math.exp(log_term) / a)


def t_cdf(t: object, df: object) -> float:
    """Return the lower-tail Student t probability for finite t and df > 0."""
    value = _finite_real(t, "t")
    degrees = _positive(df, "df")
    if value == 0.0:
        return 0.5
    # Keep df/(df+t²) in log space: t² may overflow although the beta tail
    # remains representable (notably for tiny fractional df).
    log_degrees = math.log(degrees)
    log_squared = 2.0 * math.log(abs(value))
    largest = max(log_degrees, log_squared)
    log_denominator = largest + math.log1p(math.exp(min(log_degrees, log_squared) - largest))
    log_ratio = log_degrees - log_denominator
    if log_ratio <= -745.0:
        beta_tail = _regularized_beta_log_x(log_ratio, degrees * 0.5, 0.5)
    else:
        beta_tail = _regularized_beta(math.exp(log_ratio), degrees * 0.5, 0.5)
    tail = 0.5 * beta_tail
    return _probability(tail if value < 0.0 else 1.0 - tail)


def f_sf(x: object, df1: object, df2: object) -> float:
    """Return the upper-tail F probability via I(df2/(df2+df1*x))."""
    value = _finite_real(x, "x")
    if value < 0.0:
        raise ValueError("x must be non-negative")
    first = _positive(df1, "df1")
    second = _positive(df2, "df2")
    if value == 0.0:
        return 1.0
    # Form z in log space so df1*x overflow cannot turn a representable
    # upper tail into an artificial zero.
    log_second = math.log(second)
    log_product = math.log(first) + math.log(value)
    largest = max(log_second, log_product)
    log_denominator = largest + math.log1p(math.exp(min(log_second, log_product) - largest))
    log_ratio = log_second - log_denominator
    if log_ratio <= -745.0:
        return _regularized_beta_log_x(log_ratio, second * 0.5, first * 0.5)
    return _regularized_beta(math.exp(log_ratio), second * 0.5, first * 0.5)


__all__ = [
    "normal_cdf", "inverse_normal_cdf", "t_cdf",
    "chi_square_cdf", "chi_square_sf", "f_sf",
]
