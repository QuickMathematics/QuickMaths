// Dependency-free, bounded distribution kernels for trusted native templates.
// Keep coefficient order and stopping rules aligned with quickmaths/distributions.py.

const MAX_ITERATIONS = 300;
const RELATIVE_TOLERANCE = 1e-14;
const FPMIN = 1e-300;
const SQRT_2 = Math.sqrt(2);

function finiteReal(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a finite real number.`);
  return value;
}

function positive(value, name) {
  const result = finiteReal(value, name);
  if (!(result > 0)) throw new Error(`${name} must be greater than zero.`);
  return result;
}

function probability(value) {
  if (!Number.isFinite(value)) throw new Error("probability computation did not converge.");
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function normal_cdf(z) {
  if (arguments.length !== 1) throw new Error("normal_cdf expects one argument.");
  const value = finiteReal(z, "z");
  if (value <= -39) return 0;
  if (value >= 39) return 1;
  const x = Math.abs(value) / SQRT_2;
  const tail = 0.5 * regularizedGamma(0.5, x * x)[1];
  return probability(value < 0 ? tail : 1 - tail);
}

// Accurate complementary error function using the same normal-tail continued
// fraction as the Python implementation.  This avoids the ~1e-7 A&S error in
// the acceptance vectors while remaining dependency-free.
function erfc(value) {
  const x = finiteReal(value, "x");
  if (x < 0) return 2 - erfc(-x);
  return regularizedGamma(0.5, x * x)[1];
}

export function inverse_normal_cdf(p) {
  if (arguments.length !== 1) throw new Error("inverse_normal_cdf expects one argument.");
  const probabilityValue = finiteReal(p, "p");
  if (!(probabilityValue > 0 && probabilityValue < 1)) throw new Error("p must be strictly between zero and one.");
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const horner = (coefficients, argument) => coefficients.slice(1).reduce((result, coefficient) => result * argument + coefficient, coefficients[0]);
  const low = 0.02425;
  const high = 1 - low;
  let value;
  if (probabilityValue < low) {
    const q = Math.sqrt(-2 * Math.log(probabilityValue));
    value = horner(c, q) / horner([...d, 1], q);
  } else if (probabilityValue <= high) {
    const q = probabilityValue - 0.5;
    value = horner(a, q * q) * q / horner([...b, 1], q * q);
  } else {
    const q = Math.sqrt(-2 * Math.log1p(-probabilityValue));
    value = -horner(c, q) / horner([...d, 1], q);
  }
  const density = Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
  if (density > 0 && Number.isFinite(density)) {
    const error = value >= 0
      ? 0.5 * erfc(value / SQRT_2) - (1 - probabilityValue)
      : normal_cdf(value) - probabilityValue;
    value += value >= 0
      ? error / density / (1 + 0.5 * value * error / density)
      : -error / density / (1 + 0.5 * value * error / density);
  }
  return value;
}

function logGamma(value) {
  const coefficients = [0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.50734327868691, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const shifted = value - 1;
  let sum = coefficients[0];
  for (let index = 1; index < coefficients.length; index += 1) sum += coefficients[index] / (shifted + index);
  const t = shifted + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

function logPrefactor(a, x) {
  const logGammaValue = logGamma(a);
  if (!Number.isFinite(logGammaValue)) throw new Error("incomplete gamma parameters exceed stable range.");
  const exponent = -x + a * Math.log(x) - logGammaValue;
  if (Number.isNaN(exponent) || exponent === Infinity) throw new Error("incomplete gamma parameters exceed stable range.");
  return exponent;
}

function expLogPrefactor(a, x) {
  const exponent = logPrefactor(a, x);
  if (exponent <= -745) return 0;
  if (exponent >= 709) return Infinity;
  return Math.exp(exponent);
}

function regularizedGamma(a, x) {
  if (x === 0) return [0, 1];
  if (x < a + 1) {
    // Keep a-scaled terms and use lgamma(a+1), preserving Q for tiny df.
    let scaledTotal = 1;
    let scaledTerm = 1;
    for (let index = 1; index <= MAX_ITERATIONS; index += 1) {
      scaledTerm *= x / (a + index);
      scaledTotal += scaledTerm;
      if (Math.abs(scaledTerm) <= Math.abs(scaledTotal) * RELATIVE_TOLERANCE) {
        const logGammaNext = logGamma(a + 1);
        if (!Number.isFinite(logGammaNext)) throw new Error("incomplete gamma parameters exceed stable range.");
        const logLower = -x + a * Math.log(x) - logGammaNext + Math.log(scaledTotal);
        if (Number.isNaN(logLower) || logLower === Infinity) throw new Error("incomplete gamma parameters exceed stable range.");
        if (logLower >= 0) return [1, 0];
        const lower = logLower <= -745 ? 0 : Math.exp(logLower);
        return [probability(lower), probability(-Math.expm1(logLower))];
      }
    }
    throw new Error("incomplete gamma series did not converge.");
  }
  let b = x + 1 - a;
  let d = b === 0 ? 1 / FPMIN : 1 / b;
  let c = 1 / FPMIN;
  let h = d;
  for (let index = 1; index <= MAX_ITERATIONS; index += 1) {
    const coefficient = -index * (index - a);
    b += 2;
    d = coefficient * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + coefficient / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) <= RELATIVE_TOLERANCE) {
      const upper = probability(expLogPrefactor(a, x) * h);
      return [probability(1 - upper), upper];
    }
  }
  throw new Error("incomplete gamma continued fraction did not converge.");
}

export function chi_square_cdf(x, df) {
  if (arguments.length !== 2) throw new Error("chi_square_cdf expects two arguments.");
  const value = finiteReal(x, "x");
  if (value < 0) throw new Error("x must be non-negative.");
  const degrees = positive(df, "df");
  return regularizedGamma(degrees * 0.5, value * 0.5)[0];
}

export function chi_square_sf(x, df) {
  if (arguments.length !== 2) throw new Error("chi_square_sf expects two arguments.");
  const value = finiteReal(x, "x");
  if (value < 0) throw new Error("x must be non-negative.");
  const degrees = positive(df, "df");
  return regularizedGamma(degrees * 0.5, value * 0.5)[1];
}

function betaContinuedFraction(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let result = d;
  for (let index = 1; index <= MAX_ITERATIONS; index += 1) {
    const m2 = 2 * index;
    let numerator = index * (b - index) * x / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + numerator / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    result *= d * c;
    numerator = -(a + index) * (qab + index) * x / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + numerator / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) <= RELATIVE_TOLERANCE) return result;
  }
  throw new Error("incomplete beta continued fraction did not converge.");
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logTerm = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  const term = logTerm <= -745 ? 0 : Math.exp(logTerm);
  const threshold = (a + 1) / (a + b + 2);
  if (x < threshold) return probability(term * betaContinuedFraction(a, b, x) / a);
  return probability(1 - term * betaContinuedFraction(b, a, 1 - x) / b);
}

function regularizedBetaLogX(logX, a, b) {
  let gammaDifference = logGamma(a + b) - logGamma(b);
  if (!Number.isFinite(gammaDifference)) {
    throw new Error("incomplete beta parameters exceed stable range.");
  }
  const logTerm = gammaDifference - logGamma(a) + a * logX;
  if (logTerm <= -745) return 0;
  return probability(Math.exp(logTerm) / a);
}

export function t_cdf(t, df) {
  if (arguments.length !== 2) throw new Error("t_cdf expects two arguments.");
  const value = finiteReal(t, "t");
  const degrees = positive(df, "df");
  if (value === 0) return 0.5;
  const logDegrees = Math.log(degrees);
  const logSquared = 2 * Math.log(Math.abs(value));
  const largest = Math.max(logDegrees, logSquared);
  const logDenominator = largest + Math.log1p(Math.exp(Math.min(logDegrees, logSquared) - largest));
  const logRatio = logDegrees - logDenominator;
  const betaTail = logRatio <= -745
    ? regularizedBetaLogX(logRatio, degrees * 0.5, 0.5)
    : regularizedBeta(Math.exp(logRatio), degrees * 0.5, 0.5);
  const tail = 0.5 * betaTail;
  return probability(value < 0 ? tail : 1 - tail);
}

export function f_sf(x, df1, df2) {
  if (arguments.length !== 3) throw new Error("f_sf expects three arguments.");
  const value = finiteReal(x, "x");
  if (value < 0) throw new Error("x must be non-negative.");
  const first = positive(df1, "df1");
  const second = positive(df2, "df2");
  if (value === 0) return 1;
  const logSecond = Math.log(second);
  const logProduct = Math.log(first) + Math.log(value);
  const largest = Math.max(logSecond, logProduct);
  const logDenominator = largest + Math.log1p(Math.exp(Math.min(logSecond, logProduct) - largest));
  const logRatio = logSecond - logDenominator;
  if (logRatio <= -745) return regularizedBetaLogX(logRatio, second * 0.5, first * 0.5);
  return regularizedBeta(Math.exp(logRatio), second * 0.5, first * 0.5);
}
