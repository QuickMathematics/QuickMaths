"""Independent answer oracles for the six native plane-geometry lessons."""
from fractions import Fraction as F
from pathlib import Path
import math

import pytest
import yaml
from quickmaths.content_loader import load_skill_file
from quickmaths.grading import grade_answer
from quickmaths.problem_generator import generate_problem

ROOT = Path(__file__).resolve().parents[1]
LESSONS = {
    "MATH_GEOM_005": "content/math/algebra_foundations/skills/MATH_GEOM_005_angle_relationships_parallel_lines.yaml",
    "MATH_GEOM_006": "content/math/algebra_foundations/skills/MATH_GEOM_006_triangles_quadrilaterals_polygons.yaml",
    "MATH_GEOM_007": "content/math/algebra_foundations/skills/MATH_GEOM_007_perimeter_area_composites.yaml",
    "MATH_GEOM_008": "content/math/algebra_foundations/skills/MATH_GEOM_008_pythagoras_coordinate_distance.yaml",
    "MATH_GEOM_009": "content/math/algebra_foundations/skills/MATH_GEOM_009_rigid_transformations_symmetry_congruence.yaml",
    "MATH_GEOM_010": "content/math/algebra_foundations/skills/MATH_GEOM_010_similarity_scale_drawings.yaml",
}


def _f(values):
    return {key: F(value) for key, value in values.items()}


def _root(rad):
    return f"sqrt({rad})"


GENERATED_RULES = {
    "GEOM005_VERTICAL_002": lambda v: v["a"],
    "GEOM005_LINEAR_PAIR_003": lambda v: 180 - v["a"],
    "GEOM005_ALTERNATE_006": lambda v: v["a"],
    "GEOM005_COINTERIOR_007": lambda v: 180 - v["a"],
    "GEOM006_QUAD_SUM_002": lambda v: 360 - v["a"] - v["b"] - v["c"],
    "GEOM006_EXTERIOR_005": lambda v: 360 / v["n"],
    "GEOM006_DIAGONALS_014": lambda v: v["n"] - 2,
    "GEOM007_RECT_PERIMETER_002": lambda v: 2 * v["l"] + 2 * v["w"],
    "GEOM007_SQUARE_003": lambda v: v["s"] * v["s"],
    "GEOM007_MISSING_WIDTH_006": lambda v: v["a"] / v["l"],
    "GEOM007_MISSING_HEIGHT_007": lambda v: v["a"] / v["b"],
    "GEOM008_HORIZONTAL_006": lambda v: v["x2"] - v["x1"],
    "GEOM008_VERTICAL_007": lambda v: v["y2"] - v["y1"],
    "GEOM008_RADICAL_015": lambda v: _root(2 * v["a"] ** 2),
    "GEOM009_VECTOR_006": lambda v: f"({v['y']}, {v['x']})",
    "GEOM010_DRAWING_002": lambda v: v["r"] * v["d"],
    "GEOM010_AREA_FACTOR_007": lambda v: v["k"] * v["k"],
    "GEOM010_PERIMETER_FACTOR_008": lambda v: v["p"] * v["k"],
}

FIXED_EXPECTED = {
    "GEOM005_VERTEX_NAME_001": "B", "GEOM005_AROUND_POINT_004": "160", "GEOM005_CORRESPONDING_005": "71",
    "GEOM005_CONVERSE_008": "A", "GEOM005_NOT_CONVERSE_009": "B", "GEOM005_OBJECTS_010": "B",
    "GEOM005_TWO_MEASURES_011": "56", "GEOM005_ROTATION_012": "B", "GEOM005_TUTOR_REASONING_013": "108",
    "GEOM005_STRAIGHT_014": "67", "GEOM005_FULLTURN_015": "82.5", "GEOM005_ALT_EXTERIOR_016": "57",
    "GEOM005_PARALLEL_CHECK_017": "A", "GEOM005_NO_VISUAL_018": "B", "GEOM005_MIXED_019": "B", "GEOM005_PARALLEL_CLAIM_020": "A",
    "GEOM006_TRIANGLE_SUM_001": "67", "GEOM006_PENTAGON_SUM_003": "540", "GEOM006_REGULAR_OCTAGON_004": "135",
    "GEOM006_TRIANGLE_INEQUALITY_006": "B", "GEOM006_SIDE_CLASS_007": "B", "GEOM006_ANGLE_CLASS_008": "A", "GEOM006_HIERARCHY_009": "B",
    "GEOM006_TRAPEZOID_CONVENTION_010": "B", "GEOM006_TUTOR_POLYGON_011": "140", "GEOM006_ROTATION_012": "A",
    "GEOM006_CONCAVE_013": "B", "GEOM006_TRIANGLE_ORDER_015": "A", "GEOM006_EXTERIOR_SUM_016": "360", "GEOM006_SIMPLE_017": "B",
    "GEOM006_SQUARE_018": "B", "GEOM006_REGULAR_DECAGON_019": "144", "GEOM006_INEQUALITY_020": "B",
    "GEOM007_RECT_AREA_001": "66", "GEOM007_PARALLELOGRAM_004": "52", "GEOM007_TRAPEZOID_005": "66", "GEOM007_UNIT_008": "30000",
    "GEOM007_COMPOSITE_009": "114", "GEOM007_TUTOR_COMPOSITE_010": "44", "GEOM007_PERIMETER_COMPOSITE_011": "36",
    "GEOM007_NOT_HEIGHT_012": "B", "GEOM007_PERIMETER_UNITS_013": "5", "GEOM007_TRAPEZOID_MISSING_014": "6", "GEOM007_ROTATION_016": "48",
    "GEOM007_PRICE_017": "192", "GEOM007_RECT_SCALE_015": "B", "GEOM007_PERIMETER_PRICE_018": "84", "GEOM007_UNIT_CHOICE_019": "B", "GEOM007_OUTSIDE_BOUNDARY_020": "B",
    "GEOM008_HYPOTENUSE_001": "15", "GEOM008_MISSING_LEG_002": "15", "GEOM008_RADICAL_003": "sqrt(13)", "GEOM008_SIMPLIFY_004": "7sqrt(2)",
    "GEOM008_DISTANCE_005": "10", "GEOM008_CONVERSE_008": "A", "GEOM008_NOT_RIGHT_009": "A", "GEOM008_TUTOR_DISTANCE_010": "10",
    "GEOM008_RECT_DIAGONAL_011": "13", "GEOM008_OBTUSE_012": "C", "GEOM008_ACUTE_013": "A", "GEOM008_ORIGIN_014": "C",
    "GEOM008_LONGEST_016": "A", "GEOM008_SIGN_017": "A", "GEOM008_CHECK_018": "A", "GEOM008_DISTANCE_019": "A", "GEOM008_NONRIGHT_020": "A",
    "GEOM009_TRANSLATE_001": "(2, -2)", "GEOM009_REFLECT_X_002": "(7, 5)", "GEOM009_REFLECT_Y_003": "(2, 6)", "GEOM009_ROTATE_004": "(1, 4)",
    "GEOM009_ROTATE_005": "(3, -5)", "GEOM009_RIGID_007": "B", "GEOM009_ROTATION_CENTER_008": "C", "GEOM009_SYMMETRY_009": "2",
    "GEOM009_TUTOR_CONGRUENCE_010": "SSS", "GEOM009_SAS_011": "B", "GEOM009_ASA_012": "C", "GEOM009_SSA_013": "D",
    "GEOM009_DILATION_014": "B", "GEOM009_REFLECTION_015": "C", "GEOM009_CORRESPONDENCE_016": "B'C'", "GEOM009_ORIENTATION_017": "D",
    "GEOM009_SQUARE_SYMMETRY_018": "4", "GEOM009_DISTANCE_CHECK_019": "9", "GEOM009_COMBINE_020": "B",
    "GEOM010_FACTOR_001": "3", "GEOM010_AA_003": "B", "GEOM010_SAS_004": "C", "GEOM010_SSS_005": "D", "GEOM010_CORRESPONDENCE_006": "A'C'",
    "GEOM010_TUTOR_SCALE_009": "54", "GEOM010_SHADOW_010": "6", "GEOM010_CONGRUENT_011": "B", "GEOM010_UNIT_012": "6",
    "GEOM010_NO_ASSUMPTION_013": "C", "GEOM010_RIGHT_TRIG_014": "D", "GEOM010_AREA_VALUE_015": "5", "GEOM010_REDUCTION_016": "A",
    "GEOM010_PROPORTION_017": "12", "GEOM010_SSS_CHECK_018": "B", "GEOM010_PARALLEL_019": "C", "GEOM010_LENGTH_V_AREA_020": "D",
}


def test_native_plane_contract_and_option_shape():
    for skill_id, relative in LESSONS.items():
        data = yaml.safe_load((ROOT / relative).read_text(encoding="utf-8"))
        questions = data["test"]["questions"]
        assert data["test"]["question_count"] == len(questions) == 20
        assert len({q["id"] for q in questions}) == 20
        assert len(data["examples"]) == 10 and len(data["applications"]) == 4
        assert len(data["theory"].split()) >= 700
        caps = [q for q in questions if q.get("review_policy", {}).get("work_review") == "tutor_required"]
        assert len(caps) == 1 and caps[0]["work"]["mode"] == "rubric_check"
        assert len(caps[0]["work"]["rubric"]["criteria"]) >= 4
        for q in questions:
            for option in q.get("options", []):
                assert set(option) == {"id", "label"} and isinstance(option["label"], str)


def test_every_template_has_an_independent_oracle():
    generated, fixed = set(), set()
    for relative in LESSONS.values():
        skill = load_skill_file(ROOT / relative)
        for template in skill.test.questions:
            (generated if template.type == "generated" else fixed).add(template.id)
    assert generated == set(GENERATED_RULES)
    assert fixed == set(FIXED_EXPECTED)


def test_generated_answers_against_independent_oracles_and_wrong_controls():
    for relative in LESSONS.values():
        skill = load_skill_file(ROOT / relative)
        for template in skill.test.questions:
            if template.type != "generated":
                continue
            for seed in range(100):
                problem = generate_problem(skill.id, template, seed)
                expected = GENERATED_RULES[template.id](_f(problem.values))
                if isinstance(expected, str):
                    assert problem.expected_answer == expected, (template.id, seed)
                    wrong = "WRONG"
                else:
                    assert float(F(problem.expected_answer)) == pytest.approx(float(expected)), (template.id, seed)
                    wrong = str(float(expected) + 1)
                assert grade_answer(problem, problem.expected_answer).final_answer_grade.status == "correct"
                assert grade_answer(problem, wrong).final_answer_grade.status == "incorrect"


def test_fixed_answers_and_distractors_against_independent_table():
    for relative in LESSONS.values():
        skill = load_skill_file(ROOT / relative)
        for template in skill.test.questions:
            if template.type != "fixed":
                continue
            problem = generate_problem(skill.id, template, 0)
            expected = FIXED_EXPECTED[template.id]
            assert problem.expected_answer == expected, template.id
            assert grade_answer(problem, expected).final_answer_grade.status == "correct"
            if problem.options:
                for option in problem.options:
                    assert grade_answer(problem, option["id"]).final_answer_grade.status == ("correct" if option["id"] == expected else "incorrect")
