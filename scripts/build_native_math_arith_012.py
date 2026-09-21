"""Build MATH_ARITH_012: percentages, reverse percentages and percentage points."""
from native_number_foundations_common import *

theory = '''A percent is a rate per hundred. The symbol % means divide by 100, so 20% = 20/100 = 0.20 = 1/5. A percentage can describe a part of a reference base, a change from an earlier value, or a comparison between two groups. Always name the base: 20% of 80 is 16, while 20% of 200 is 40. The same percent does not mean the same number when the base changes.

To find p% of an amount A, multiply A by p/100. For 15% of 60, use 0.15×60=9. To find what percent a part B is of a base A, divide B by A and multiply by 100: 18 is 30% of 60 because 18/60=0.30. A percent increase from old value O to new value N is (N−O)/O×100%; the old value is the reference base. A decrease uses the same formula with the signed change or with O−N as a positive decrease.

Percent change is not the same as percentage points. If a survey share moves from 40% to 55%, the increase is 15 percentage points because 55−40=15. Relative percent change is 15/40×100%=37.5%, because the original 40% is the base. Say which one you mean. A move from 0.40 to 0.55 can be described as +0.15 in proportion units, +15 percentage points, or a 37.5% relative increase.

A forward percentage change uses a multiplier. Increasing by r% multiplies the old amount by 1+r/100; decreasing by r% multiplies it by 1−r/100. An 80% result after a 20% decrease came from 100 because 100×0.80=80. Two successive changes multiply their factors: a 20% increase then a 20% decrease gives 1.20×0.80=0.96, a net 4% decrease. The percentages act on different intermediate bases, so “up 20 then down 20” does not cancel.

Reverse percentages undo the multiplier. If a final value F is after an r% increase, original O=F/(1+r/100). If F is after an r% decrease, O=F/(1−r/100). Do not subtract r% of the final value when reversing a change; the final value is not the original reference base. For a 20% discount, a sale price of $80 means O=$80/0.80=$100. The check is to apply the stated change forward and recover $80.

Percentage points are especially useful for rates, probabilities, and survey shares. A tax rate moving from 5% to 6% rises 1 percentage point, but its relative increase is 20% because 1/5=0.20. A percentage point is an absolute difference between percentages; percent change is a ratio of a difference to a base. Keep the percent sign attached to rates and use a separate unit such as “points” when comparing them.

Rounding can enter at the final display, but keep the unrounded multiplier while calculating. A discount of 12.5% is exactly one eighth, so multiplying by 0.875 may be clearer than subtracting a rounded dollar amount. In a context, identify whether the question asks for the percent, the percentage amount, the final value, or the original value. Label the reference base and check by reversing the operation. The capstone asks you to recover an original price from a reduction and to explain why the final price cannot be used as the base for a simple subtraction.
A percentage amount and a percentage rate should be kept separate. Saying “the discount is 20%” gives a rate; saying “the discount is $16” gives an amount for a particular base. To compute the amount, multiply the rate by the base. To compare two discounts, compare both their rates and the bases they act on. A $16 discount could be 20% of $80 or 8% of $200, so the dollar amount alone does not identify the percentage.

Repeated changes are easiest to audit by naming each base. Start with O, apply the first multiplier to get an intermediate value, then apply the second multiplier to that intermediate value. If a quantity decreases by 10% three times, the multiplier is 0.9³, not 0.7; “30% total” would be a different policy. Reverse each multiplier in reverse order if you need to recover an original after several stages. For a final rate, also distinguish a percentage-point change from a percent change in the rate itself, especially when the old rate is small.
'''

examples = [
    example('Find 20% of 80.', '16', '0.20×80=16.'),
    example('What percent of 60 is 18?', '30%', '18÷60×100%=30%.'),
    example('A value rises from 40 to 50. Percent increase?', '25%', '(50−40)/40×100%=25%.'),
    example('A survey share rises from 40% to 55. What is the change in percentage points?', '15 percentage points', 'Subtract the rates: 55−40=15 points.'),
    example('What is the relative percent increase from 40% to 55%?', '37.5%', '15/40×100%=37.5%.'),
    example('Increase 120 by 10%.', '132', '120×1.10=132.'),
    example('Decrease 120 by 10%.', '108', '120×0.90=108.'),
    example('A 20% reduction leaves $80. Original price?', '$100', '80÷0.80=100; reducing 100 by 20% gives 80.'),
    example('Apply +20% then −20% to 100.', '96', '100×1.20×0.80=96, a net 4% decrease.'),
    example('A rate moves from 5% to 6%. Relative increase?', '20%', 'The one-point increase is 1/5 of the original 5% rate.'),
]
apps = [
    application('Sales and tax', 'Discounts and tax rates use multipliers, while reverse percentages recover an original listed price.'),
    application('Survey reporting', 'Percentage points describe changes in shares, and relative percent change compares that difference to the starting share.'),
    application('Growth and depreciation', 'Repeated percentage changes multiply successive bases, so a later change cannot be treated as if the base stayed fixed.'),
    application('Health and risk communication', 'Risk percentages are meaningful only with a stated reference population or baseline rate.'),
]
v = lambda lo, hi: {"type": "int", "min": lo, "max": hi}
questions = [
    fixed('ARITH012_PERCENT_OF', 'Enter 20% of 80.', '16', '20/100×80=16.', tags=['percent_of', 'base']),
    generated('ARITH012_PERCENT_OF_VAR', 'A part is {part} and equals {percent}% of a whole. Enter the whole.', {'whole': v(80, 240), 'percent': v(20, 50)}, {'part': 'whole*percent/100'}, '{whole}', 'Since part={percent}/100×whole, divide {part} by {percent}/100 to recover {whole}.', tags=['reverse_percent', 'whole_from_part']),
    fixed('ARITH012_PART_PERCENT', 'What percent of 60 is 18? Enter the number before the percent sign.', '30', '18÷60×100=30.', tags=['percent_comparison', 'base']),
    fixed('ARITH012_PART_PERCENT_VAR', 'A receipt total is $120 including 20% VAT. Enter the pre-tax price.', '100', 'The tax-inclusive total is 1.20 times the base, so 120÷1.20=100.', tags=['reverse_percent', 'vat']),
    fixed('ARITH012_INCREASE', 'A value rises from 40 to 50. Enter percent increase.', '25', '(50−40)/40×100=25%.', tags=['percent_change', 'increase']),
    fixed('ARITH012_DECREASE', 'A value falls from 80 to 60. Enter percent decrease.', '25', '(80−60)/80×100=25%.', tags=['percent_change', 'decrease']),
    fixed('ARITH012_POINTS', 'A survey share moves from 40% to 55%. Enter the change in percentage points.', '15', '55−40=15 percentage points.', tags=['percentage_points']),
    fixed('ARITH012_RELATIVE_RATE', 'A rate moves from 5% to 6%. Enter its relative percent increase.', '20', 'The one-point change divided by the old 5% rate is 20%.', tags=['percentage_points', 'percent_change']),
    fixed('ARITH012_MULTIPLIER_UP', 'Enter the multiplier for a 20% increase.', '1.2', 'Increase multiplier = 1+0.20=1.20.', tags=['multipliers']),
    fixed('ARITH012_MULTIPLIER_DOWN', 'Enter the multiplier for a 20% decrease.', '0.8', 'Decrease multiplier = 1−0.20=0.80.', tags=['multipliers']),
    fixed('ARITH012_FORWARD_UP', 'Increase 120 by 10%.', '132', '120×1.10=132.', tags=['percent_change']),
    fixed('ARITH012_FORWARD_DOWN', 'A $200 price is reduced by 10% and then increased by 20%. Enter the final price.', '216', 'Apply both multipliers in order: 200×0.90×1.20=216.', tags=['successive_change', 'discount', 'surcharge']),
    fixed('ARITH012_REVERSE_DOWN', 'A final price of $96 follows a 20% discount and then 20% VAT. Enter the original price.', '100', 'Reverse the stages: 96÷1.20÷0.80=100.', tags=['reverse_percent', 'successive_change', 'vat']),
    fixed('ARITH012_REVERSE_UP', 'A 25% increase produces 100. Enter the original value.', '80', '100÷1.25=80.', tags=['reverse_percent']),
    fixed('ARITH012_SUCCESSIVE', 'Apply +20% then −20% to 100. Enter the final value.', '96', '100×1.20×0.80=96.', tags=['successive_change']),
    choice('ARITH012_REFERENCE_BASE', 'For a change from 40 to 50, which is the percent-change reference base?', 'A', [('A', 'The old value 40'), ('B', 'The new value 50'), ('C', 'The difference 10'), ('D', 'The average 45')], 'Percent change compares the change with the original value.', tags=['reference_base']),
    choice('ARITH012_POINTS_V_PERCENT', 'A survey share rises from 40% to 55%. Which pair correctly describes the change?', 'D', [('A', '15% and 15 percentage points'), ('B', '37.5 percentage points and 15%'), ('C', '40% relative increase and 15 points'), ('D', '37.5% relative increase and 15 percentage points')], 'Subtracting rates gives 15 points; dividing that difference by the old 40% gives 37.5%.', tags=['percentage_points', 'reasoning']),
    choice('ARITH012_DISCOUNT_VAR', 'An item costs $100, is marked up to $125, and sells for $120. Which pair is correct?', 'B', [('A', '25% markup and 20% profit margin'), ('B', '25% markup and 16.67% profit margin'), ('C', '20% markup and 25% profit margin'), ('D', '20% markup and 16.67% profit margin')], 'Markup is (125−100)/100=25%; profit margin is (120−100)/120=16.67%, so option B uses the correct reference bases.', tags=['markup', 'profit_margin', 'reference_base']),
    fixed('ARITH012_WRONG_REVERSE', 'Increase 80 by 20%. Enter the final value.', '96', 'A forward increase uses 1.20×80=96; subtracting 20% would answer a decrease question.', tags=['percent_change', 'forward_increase']),
    capstone('ARITH012_CAPSTONE', 'A jacket is sold for $80 after a 20% reduction. Enter its original price.', '100', ['Identifies that $80 is 80% of the original, so sets up 80=0.80×original.', 'Divides by 0.80 to obtain an original price of $100 and labels dollars.', 'Explains why subtracting 20% of the final price uses the wrong reference base and checks the forward reduction.'], 'Let O be the original. 0.80O=80, so O=100. A 20% reduction of $100 is $20, leaving $80; taking 20% of $80 would answer a different question.'),
]

figure('arith012-reference-base.svg', 'The reference base controls the percentage', '<rect x="48" y="90" width="290" height="86" fill="#d9eee5"/><rect x="462" y="90" width="290" height="86" fill="#f5dfb5"/><text x="193" y="143" text-anchor="middle" font-size="26">20% of 80 = 16</text><text x="607" y="143" text-anchor="middle" font-size="26">20% of 200 = 40</text><text x="100" y="245" font-size="22">same rate, different base, different amount</text>')
figure('arith012-reverse.svg', 'Reverse a 20% reduction', '<rect x="46" y="92" width="255" height="85" fill="#f5dfb5"/><path d="M315 134 H475" stroke="#287365" stroke-width="4"/><text x="370" y="116" font-size="18">÷0.80</text><rect x="500" y="92" width="255" height="85" fill="#d9eee5"/><text x="174" y="145" text-anchor="middle" font-size="28">$80 final</text><text x="627" y="145" text-anchor="middle" font-size="28">$100 original</text><text x="88" y="260" font-size="22">forward check: $100×0.80=$80</text>')

save('MATH_ARITH_012', 'Percentages, reverse percentages and percentage points', theory, ['MATH_ARITH_005', 'MATH_ARITH_009'], examples, apps, questions, [media('arith012-reference-base.svg', 'Two boxes show that 20 percent of 80 is 16 while 20 percent of 200 is 40.', 'A percentage is meaningless without its reference base.'), media('arith012-reverse.svg', 'An arrow divides a final 80 dollar price by 0.80 to recover the original 100 dollar price.', 'Reverse the multiplier instead of subtracting from the final value.')], tags=['arithmetic', 'percentages', 'reverse_percentages', 'percentage_points', 'reference_base'])
