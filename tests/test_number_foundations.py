from pathlib import Path

import pytest

from quickmaths.content_loader import load_skill_file
from quickmaths.problem_generator import generate_problem

ROOT = Path(__file__).resolve().parents[1]
NUMBERS = ["007", "009", "010", "011", "012", "013", "014"]

def lessons():
    return [load_skill_file(path) for path in sorted((ROOT / "content/math/algebra_foundations/skills").glob("MATH_ARITH_*.yaml")) if any(f"MATH_ARITH_{number}" in path.name for number in NUMBERS)]

# Independent formulas: these are deliberately separate from each YAML derived expression.
ORACLES = {
    "ARITH007_PRODUCT_FACTOR": lambda v: v["p"] * v["q"], "ARITH007_PRIME_DIGIT_SUM": lambda v: (9 + v["a"]) % 3, "ARITH007_LCM_PRIMES": lambda v: 2 ** v["a"] * 3 ** v["b"], "ARITH007_MULTIPLE_STEP": lambda v: v["step"] * v["count"],
    "ARITH009_ADD_TENTHS": lambda v: (v["a"] + v["b"]) / 10, "ARITH009_SUB_HUNDREDTHS": lambda v: (v["a"] - v["b"]) / 100, "ARITH009_WHOLE_MULTIPLY": lambda v: v["a"] * v["n"] / 10, "ARITH009_DECIMAL_PRODUCT": lambda v: v["a"] * v["b"] / 100, "ARITH009_SHARE": lambda v: v["a"] / (10 * v["n"]), "ARITH009_DIVISOR_TENTHS": lambda v: v["pieces"], "ARITH009_TIMES_TEN": lambda v: v["a"] / 10, "ARITH009_DIVIDE_HUNDRED": lambda v: v["a"] / 1000, "ARITH009_SCALE_BOTH_TEN": lambda v: v["a"] / v["b"], "ARITH009_ESTIMATE": lambda v: int((v["a"] + 5) // 10) + int((v["b"] + 5) // 10), "ARITH009_MONEY_CHANGE": lambda v: (v["paid"] - v["cost"]) / 100,
    "ARITH011_EQUIV_RATIO": lambda v: 3 * v["k"], "ARITH011_RATE_FORWARD": lambda v: v["rate"] * v["minutes"], "ARITH011_RATE_BACK": lambda v: v["rate"], "ARITH011_SHARE_VARIABLE": lambda v: 2 * v["k"], "ARITH011_MAP_VARIABLE": lambda v: v["km"] * v["cm"], "ARITH011_COST": lambda v: v["count"] * v["unit"], "ARITH011_RATIO_CHECK": lambda v: 4 * v["k"],
    "ARITH012_PERCENT_OF_VAR": lambda v: v["whole"],
    "ARITH013_METRE_CM": lambda v: v["m"] * 10, "ARITH013_GRAM_KG": lambda v: v["g"] / 1000, "ARITH013_SPEED_VAR": lambda v: v["speed"] * v["half"] / 2, "ARITH013_CAPACITY": lambda v: v["litres"] * 1000,
    "ARITH014_MULTIPLY_COEFF": lambda v: v["a"] * v["b"], "ARITH014_DIVIDE_EXP": lambda v: 5, "ARITH014_POWER_TEN": lambda v: v["m"] + v["n"], "ARITH014_RATIO_SCALE": lambda v: v["m"] - v["n"],
}

# Independent fixed scenario table, including every fixed numeric/capstone question.
FIXED = {
    "ARITH007_FACTOR_LIST":"24", "ARITH007_PRIME_FACTOR_POWER":"B", "ARITH007_PRIME_TEST":"B", "ARITH007_ONE_STATUS":"0", "ARITH007_GCF_COMMON":"A", "ARITH007_LCM_LIST":"24", "ARITH007_GCF_PACK":"42", "ARITH007_GCF_LIST":"6", "ARITH007_FACTOR_PAIR":"6", "ARITH007_LCM_BELLS":"B", "ARITH007_FACTOR_OR_MULTIPLE":"A", "ARITH007_SQUARE_MIDDLE":"7", "ARITH007_DIVISIBILITY_FIVE":"C", "ARITH007_IDENTITY_CHECK":"216", "ARITH007_COMMON_MULTIPLE":"B", "ARITH007_CAPSTONE":"24",
    "ARITH009_SCALE_WARNING":"B", "ARITH009_SCALE_RESULT":"3.7", "ARITH009_SCALE_BOTH_HUNDRED":"C", "ARITH009_TRAILING_ZERO":"C", "ARITH009_UNIT_RATE":"1.6", "ARITH009_UNIT_CHECK":"A", "ARITH009_ORDER_MAGNITUDE":"A", "ARITH009_SCALE_MISSTEP":"B", "ARITH009_CAPSTONE":"30",
    "ARITH010_NEAREST_TEN":"4380", "ARITH010_NEAREST_HUNDRED":"6300", "ARITH010_HALF_UP":"6400", "ARITH010_CARRY":"10.0", "ARITH010_DECIMAL_PLACES":"12.35", "ARITH010_SIG_ZERO":"A", "ARITH010_SIG_MIDDLE":"A", "ARITH010_SIG_SCI":"B", "ARITH010_EXACT_COUNT":"A", "ARITH010_MEASURED":"B", "ARITH010_BOUNDS_TENTH":"C", "ARITH010_BOUNDS_UPPER":"3.57", "ARITH010_TRUNCATION":"B", "ARITH010_TRUNCATION_UPPER":"D", "ARITH010_ADD_PRECISION":"A", "ARITH010_MULT_PRECISION":"9.9", "ARITH010_ACCURACY_PRECISION":"A", "ARITH010_HALF_OPEN":"C", "ARITH010_SCI_PRECISION":"0.05", "ARITH010_CAPSTONE":"48.35",
    "ARITH011_RATIO_SECOND":"49", "ARITH011_SIMPLIFY":"3", "ARITH011_UNIT_RATE":"20", "ARITH011_PARTS_TOTAL":"8", "ARITH011_SHARE_FIRST":"A", "ARITH011_SHARE_SECOND":"54", "ARITH011_MAP":"1.4", "ARITH011_PART_WHOLE":"A", "ARITH011_RATE_UNITS":"A", "ARITH011_DENOMINATOR":"B", "ARITH011_FIXED_FEE":"B", "ARITH011_REVERSE_WARNING":"C", "ARITH011_CAPSTONE":"24",
    "ARITH012_PERCENT_OF":"16", "ARITH012_PART_PERCENT":"30", "ARITH012_INCREASE":"25", "ARITH012_DECREASE":"25", "ARITH012_POINTS":"15", "ARITH012_RELATIVE_RATE":"20", "ARITH012_MULTIPLIER_UP":"1.2", "ARITH012_MULTIPLIER_DOWN":"0.8", "ARITH012_FORWARD_UP":"132", "ARITH012_FORWARD_DOWN":"216", "ARITH012_PART_PERCENT_VAR":"100", "ARITH012_DISCOUNT_VAR":"B", "ARITH012_REVERSE_DOWN":"100", "ARITH012_REVERSE_UP":"80", "ARITH012_SUCCESSIVE":"96", "ARITH012_REFERENCE_BASE":"A", "ARITH012_POINTS_V_PERCENT":"D", "ARITH012_WRONG_REVERSE":"96", "ARITH012_CAPSTONE":"100",
    "ARITH013_AREA_FACTOR":"10000", "ARITH013_VOLUME_FACTOR":"1000000", "ARITH013_AREA_CONVERT":"2.5", "ARITH013_VOLUME_LITRE":"2.5", "ARITH013_RECT_AREA":"26", "ARITH013_RECT_PERIMETER":"135", "ARITH013_ELAPSED":"95", "ARITH013_CROSS_HOUR":"C", "ARITH013_SECONDS":"150", "ARITH013_SPEED":"20", "ARITH013_DIMENSION_COUNT":"2", "ARITH013_DIMENSION_CUBE":"A", "ARITH013_UNIT_CANCEL":"B", "ARITH013_MIXED_DIMENSIONS":"C", "ARITH013_MIDNIGHT":"35", "ARITH013_CAPSTONE":"2",
    "ARITH014_LARGE_NORMALIZE":"4.7", "ARITH014_SMALL_EXPONENT":"-5", "ARITH014_MULTIPLY":"B", "ARITH014_NORMALIZE_32":"3.2", "ARITH014_NORMALIZE_EXP":"D", "ARITH014_DIVIDE":"3", "ARITH014_ADD_MATCH":"3.1", "ARITH014_REWRITE_POWER":"0.7", "ARITH014_ADD_DIFFERENT":"1.7", "ARITH014_ORDER_COMPARE":"A", "ARITH014_SIG_FIGS":"3", "ARITH014_ZERO":"C", "ARITH014_NEGATIVE":"A", "ARITH014_ORDER_SCALE":"B", "ARITH014_UNIT_PREFIX":"A", "ARITH014_CAPSTONE":"1280",
}
def number(value):
    return float(value)

def test_number_foundation_structure_and_fixed_oracles():
    seen = set()
    for skill in lessons():
        assert len(skill.examples) == 10
        assert len(skill.applications) == 4
        assert skill.test.question_count == 20
        assert len(skill.test.questions) == 20
        caps = [q for q in skill.test.questions if q.work.get("mode") == "rubric_check"]
        assert len(caps) == 1
        assert caps[0].review_policy["work_review"] == "tutor_required"
        for q in skill.test.questions:
            assert q.id not in seen
            seen.add(q.id)
            if q.type == "fixed":
                assert q.id in FIXED, q.id
                if q.answer["type"] == "choice": assert q.answer["value"] == FIXED[q.id]
                else: assert number(q.answer["value"]) == pytest.approx(number(FIXED[q.id]))
    assert len(FIXED) == 109

def test_generated_questions_match_independent_oracles_across_100_seeds():
    checked = 0
    for skill in lessons():
        for template in skill.test.questions:
            if template.type != "generated":
                continue
            assert template.id in ORACLES, template.id
            for seed in range(100, 200):
                instance = generate_problem(skill.id, template, seed)
                values = {key: float(value) if any(c in str(value) for c in ".eE") else int(value) for key, value in instance.values.items()}
                assert number(instance.expected_answer) == pytest.approx(float(ORACLES[template.id](values)))
                checked += 1
    assert checked == 3100
