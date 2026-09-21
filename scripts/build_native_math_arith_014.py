"""Build MATH_ARITH_014: scientific notation arithmetic and orders of magnitude."""
from native_number_foundations_common import *

theory = '''Scientific notation writes a nonzero number as a×10^n, where 1≤|a|<10 and n is an integer. The coefficient a carries the meaningful leading digits; the exponent n records how far the decimal point is from the displayed coefficient. For example, 4,700,000 = 4.7×10^6 and 0.000047 = 4.7×10^-5. The exponent is a count of place shifts, not a measurement unit and not the number of zeros in every written form.

To convert a large number to scientific notation, move the decimal point left until one nonzero digit remains before it. Count left moves as a positive exponent. For a small positive number, move right and use a negative exponent. Restore the ordinary number by reversing the shifts. A zero has no normalized scientific notation because it has no first nonzero digit; write 0 separately. Negative values keep the negative sign in the coefficient, such as −3.2×10^4.

Multiplication uses the product of coefficients and addition of exponents: (a×10^m)(b×10^n)=(ab)×10^(m+n). If |ab| is outside [1,10), normalize by shifting its decimal and adjusting the exponent. Example: (3×10^4)(2×10^3)=6×10^7. For 8×10^5 times 4×10^2, the raw coefficient 32 becomes 3.2 and the exponent 7 becomes 8, giving 3.2×10^8. Keep the coefficient and power parts separate until the final normalization.

Division divides coefficients and subtracts exponents: (a×10^m)/(b×10^n)=(a/b)×10^(m−n), with b nonzero. If a/b is less than 1, normalize by moving the decimal right and reducing the exponent. For (6×10^7)/(2×10^3), the coefficient quotient is 3 and exponent difference is 4, so the result is 3×10^4. Check by multiplying the quotient by the divisor.

Addition and subtraction require matching powers of ten first. You may rewrite 2.4×10^6 as 24×10^5, or rewrite 7×10^5 as 0.7×10^6. Then combine coefficients with the same power: 2.4×10^6 + 0.7×10^6 = 3.1×10^6. Adding coefficients while ignoring different exponents is a common error: 2×10^6 + 3×10^4 is not 5×10^10. For widely separated exponents, an estimate may show that the smaller term changes only later digits, but keep it when an exact sum is requested.

Orders of magnitude compare powers of ten. A value near 7×10^6 has order 10^6; a value 7×10^−6 has order 10^−6. If “nearest order” is requested, compare the coefficient to √10≈3.16: 7×10^6 is closer on a logarithmic scale to 10^7 than 10^6, while 2×10^6 is closer to 10^6. In elementary comparisons, the exponent gives the main scale, then the coefficient breaks ties. State whether you mean exponent-based scale or nearest power, because those are different conventions.

Scientific notation is especially helpful for unit conversions, astronomy, cells, computing storage, and rates with extreme scales. Keep units beside the coefficient and do not let a prefix such as micro- silently alter the exponent. Significant figures live in the coefficient: 4.70×10^3 has three significant figures, while 4.7×10^3 has two. Round only after arithmetic and normalize again after rounding. The capstone asks you to multiply two quantities with opposite exponents, normalize the coefficient, and explain why the exponents add.
The exponent rules are consequences of place-value multiplication. Ten to the fourth times ten to the third is ten to the seventh because four place shifts followed by three more shifts make seven shifts. Division reverses those shifts, so a negative exponent naturally represents a reciprocal: 10^-3=1/1000. This interpretation helps when an answer is written in ordinary notation and prevents sign mistakes in exponent subtraction.

Normalization is not optional decoration. A coefficient of 32 violates the convention 1≤|a|<10, so either shift its decimal point or leave it explicitly unnormalized and label it as an intermediate. After addition, subtraction, multiplication, or division, check the coefficient range and adjust the exponent exactly once. For addition with distant powers, align exponents before combining; for example, 2.0×10^8+3.0×10^5=2.003×10^8, not 5.0×10^13. The exponent indicates scale while the coefficient preserves the leading detail.

Orders of magnitude are a comparison tool, not an automatic rounding answer. Two values with exponents differing by six are separated by a million before coefficient effects. When coefficients are close to a threshold such as 3.16 for nearest-power conventions, state the convention and compare the values rather than relying on the exponent alone. Units remain attached: 4×10^3 m and 4×10^3 kg have the same numerical scale but describe different quantities. Scientific notation makes that distinction visible when the unit is written beside the number.
'''

examples = [
    example('Write 4,700,000 in scientific notation.', '4.7×10^6', 'Move the decimal six places left.'),
    example('Write 0.000047 in scientific notation.', '4.7×10^-5', 'Move the decimal five places right, so the exponent is negative.'),
    example('Multiply (3×10^4)(2×10^3).', '6×10^7', 'Multiply coefficients and add exponents.'),
    example('Multiply (8×10^5)(4×10^2).', '3.2×10^8', '8×4=32; normalize 32×10^7 to 3.2×10^8.'),
    example('Divide (6×10^7)/(2×10^3).', '3×10^4', 'Divide coefficients and subtract exponents.'),
    example('Add 2.4×10^6 + 0.7×10^6.', '3.1×10^6', 'The powers already match, so add coefficients.'),
    example('Rewrite 7×10^5 using 10^6.', '0.7×10^6', 'Move the decimal one place left and increase the exponent.'),
    example('Which is larger: 5×10^−3 or 5×10^−4?', '5×10^−3', 'The exponent −3 represents ten times the size of −4 with equal coefficients.'),
    example('How many significant figures in 4.70×10^3?', '3', 'The coefficient 4.70 has three significant digits.'),
    example('What is the order-of-magnitude scale of 7×10^6 by exponent?', '10^6', 'The written power is 10^6; nearest-power conventions should be stated separately.'),
]
apps = [
    application('Astronomy and microscopy', 'Scientific notation keeps distances, masses, and cell sizes readable while preserving scale.'),
    application('Computing and engineering', 'Very large and small capacities, frequencies, and tolerances can be multiplied or divided by tracking exponents.'),
    application('Unit prefixes', 'Nano-, micro-, kilo-, and mega-scale conversions are exponent changes attached to a physical unit.'),
    application('Data interpretation', 'Orders of magnitude help compare populations or measurements before detailed arithmetic is attempted.'),
]
v = lambda lo, hi: {"type": "int", "min": lo, "max": hi}
questions = [
    fixed('ARITH014_LARGE_NORMALIZE', 'Write 4,700,000 as a coefficient only (the coefficient in scientific notation).', '4.7', 'Move six places left: 4.7×10^6.', tags=['notation', 'normalization']),
    fixed('ARITH014_SMALL_EXPONENT', 'In 0.000047=4.7×10^n, enter n.', '-5', 'The decimal moves five places right, so n is −5.', tags=['notation', 'negative_exponent']),
    generated('ARITH014_MULTIPLY_COEFF', 'Compute ({a}×10^4)({b}×10^3) and enter the coefficient before normalization.', {'a': v(2, 4), 'b': v(2, 4)}, {'coefficient': 'a*b'}, '{coefficient}', 'Multiply coefficients separately; exponents add to 7 before any normalization.', tags=['multiplication', 'exponents']),
    choice('ARITH014_MULTIPLY', 'A learner claims (3×10^4)(2×10^3)=6×10^12. What went wrong?', 'B', [('A','The coefficient must be added'),('B','Exponents should be added, giving 6×10^7'),('C','Exponents should be divided'),('D','The product is correct')], '10^4×10^3=10^(4+3), so the product is 6×10^7.'),
    fixed('ARITH014_NORMALIZE_32', 'For 32×10^7, enter the normalized coefficient.', '3.2', 'Move the decimal one place left to make 3.2 and raise the exponent to 8.', tags=['normalization']),
    choice('ARITH014_NORMALIZE_EXP', 'Which is the normalized form of (2×10^3)/(8×10^7)?', 'D', [('A','2.5×10^-3'),('B','0.25×10^-4'),('C','2.5×10^5'),('D','2.5×10^-5')], 'The quotient is 0.25×10^-4. Multiplying its coefficient by 10 requires reducing its exponent by 1.'),
    fixed('ARITH014_DIVIDE', 'Compute (6×10^7)/(2×10^3) and enter the coefficient.', '3', '6÷2=3 and 7−3=4.', tags=['division', 'exponents']),
    generated('ARITH014_DIVIDE_EXP', 'For ({a}×10^8)/({b}×10^3), enter the exponent before normalization.', {'a': v(2, 9), 'b': v(2, 9)}, {'exponent': '8-3'}, '{exponent}', 'Division subtracts the denominator exponent from the numerator exponent.', tags=['division', 'exponents']),
    fixed('ARITH014_ADD_MATCH', 'Add 2.4×10^6 + 0.7×10^6 and enter the coefficient.', '3.1', 'The powers match, so add 2.4+0.7=3.1.', tags=['addition', 'matching_powers']),
    fixed('ARITH014_REWRITE_POWER', 'Rewrite 7×10^5 as c×10^6. Enter c.', '0.7', 'Increasing the exponent by 1 requires dividing the coefficient by 10.', tags=['addition', 'matching_powers']),
    fixed('ARITH014_ADD_DIFFERENT', 'Subtract 2.0×10^6 − 3.0×10^5 and enter the coefficient of 10^6.', '1.7', 'First rewrite 3.0×10^5 as 0.3×10^6. Then 2.0−0.3=1.7 with the common power 10^6.', tags=['subtraction', 'matching_powers']),
    choice('ARITH014_ORDER_COMPARE', 'Which value is larger?', 'A', [('A', '5×10^-3'), ('B', '5×10^-4'), ('C', 'They are equal'), ('D', 'Cannot compare powers of ten')], 'With equal coefficients, exponent −3 gives the larger value.', tags=['order_of_magnitude']),
    fixed('ARITH014_SIG_FIGS', 'How many significant figures are in 4.70×10^3?', '3', 'All coefficient digits 4, 7, and trailing decimal 0 count.', tags=['significant_figures']),
    choice('ARITH014_ZERO', 'Which coefficient is valid in normalized scientific notation?', 'C', [('A', '0.4'), ('B', '14'), ('C', '4.0'), ('D', '0')], 'A normalized coefficient has absolute value at least 1 and less than 10.', tags=['notation', 'normalization']),
    choice('ARITH014_NEGATIVE', 'In −3.2×10^4, where does the negative sign belong?', 'A', [('A', 'In the coefficient'), ('B', 'In the exponent only'), ('C', 'It disappears'), ('D', 'It belongs to the unit')], 'The coefficient carries the sign; the exponent controls scale.', tags=['signed_values']),
    generated('ARITH014_POWER_TEN', 'Compute 10^{m}×10^{n}; enter the exponent.', {'m': v(2, 8), 'n': v(2, 8)}, {'exp': 'm+n'}, '{exp}', 'Same-base powers multiply by adding exponents.', tags=['powers', 'exponents']),
    generated('ARITH014_RATIO_SCALE', 'Compute (4×10^{m})/(2×10^{n}); enter the exponent.', {'m': v(4, 9), 'n': v(1, 3)}, {'exp': 'm-n'}, '{exp}', 'Divide powers of ten by subtracting exponents.', tags=['division', 'exponents']),
    choice('ARITH014_ORDER_SCALE', 'Which is the nearest power of ten to 7×10^6 on a logarithmic scale?', 'B', [('A','10^6'),('B','10^7'),('C','10^5'),('D','10^-6')], 'The logarithmic midpoint between 10^6 and 10^7 is sqrt(10)×10^6. Since 7 exceeds sqrt(10), choose 10^7.'),
    choice('ARITH014_UNIT_PREFIX', 'How many times as long is 6×10^-3 m as 3×10^-6 m?', 'A', [('A','2000'),('B','2'),('C','0.002'),('D','1000')], 'Divide matching units: (6/3)×10^(-3+6)=2×10^3=2000.'),
    capstone('ARITH014_CAPSTONE', 'Compute (3.2×10^5)(4×10^−3). Enter the ordinary-number result.', '1280', ['Multiplies coefficients and adds exponents to obtain 12.8×10^2 before normalization.', 'Normalizes 12.8×10^2 to 1.28×10^3 and converts it to 1280.', 'Explains why exponents add in multiplication and checks the scale or ordinary-number result.'], '(3.2×4)×10^(5−3)=12.8×10^2=1.28×10^3=1280. The coefficient is normalized by moving the decimal one place left and increasing the exponent.'),
]

figure('arith014-normalize.svg', 'Normalize a scientific-notation product', '<rect x="45" y="90" width="250" height="78" fill="#d9eee5"/><rect x="505" y="90" width="250" height="78" fill="#f5dfb5"/><text x="170" y="140" text-anchor="middle" font-size="27">32×10⁷</text><path d="M310 130 H485" stroke="#287365" stroke-width="4"/><text x="365" y="112" font-size="18">shift</text><text x="630" y="140" text-anchor="middle" font-size="27">3.2×10⁸</text><text x="160" y="240" font-size="21">coefficient ÷10, exponent +1</text>')
figure('arith014-add.svg', 'Match powers before addition', '<rect x="45" y="84" width="280" height="82" fill="#d9eee5"/><rect x="475" y="84" width="280" height="82" fill="#f5dfb5"/><text x="185" y="136" text-anchor="middle" font-size="25">2×10⁶</text><text x="400" y="136" text-anchor="middle" font-size="25">+</text><text x="615" y="136" text-anchor="middle" font-size="25">0.03×10⁶</text><text x="260" y="250" font-size="24">= 2.03×10⁶</text>')

save('MATH_ARITH_014', 'Scientific notation arithmetic and orders of magnitude', theory, ['MATH_ARITH_009', 'MATH_EXP_001'], examples, apps, questions, [media('arith014-normalize.svg', 'The product 32 times ten to the seventh is normalized to 3.2 times ten to the eighth by shifting the coefficient.', 'Normalization keeps one nonzero digit before the decimal point.'), media('arith014-add.svg', 'The term 2 times ten to the sixth is added to 0.03 times ten to the sixth after matching powers.', 'Addition requires equal powers of ten first.')], tags=['arithmetic', 'scientific_notation', 'exponents', 'orders_of_magnitude'])
