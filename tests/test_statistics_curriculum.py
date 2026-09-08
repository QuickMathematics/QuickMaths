"""Integrity checks for the statistics and probability curriculum additions."""

from pathlib import Path

import yaml


ROOT = Path(__file__).parents[1]
SKILLS = ROOT / "content/math/algebra_foundations/skills"
EXPECTED = {f"MATH_STAT_{i:03d}" for i in range(1, 17)} | {
    f"MATH_PROB_{i:03d}" for i in range(1, 6)
}


def _lessons():
    return [yaml.safe_load(path.read_text(encoding="utf-8")) for path in SKILLS.glob("MATH_STAT_*.yaml")] + [
        yaml.safe_load(path.read_text(encoding="utf-8")) for path in SKILLS.glob("MATH_PROB_*.yaml")
    ]


def test_statistics_probability_lessons_are_complete_and_unique():
    lessons = _lessons()
    lesson_text = "\n".join((SKILLS / path.name).read_text(encoding="utf-8") for path in SKILLS.glob("MATH_STAT_*.yaml"))
    lesson_text += "\n".join((SKILLS / path.name).read_text(encoding="utf-8") for path in SKILLS.glob("MATH_PROB_*.yaml"))
    assert {lesson["id"] for lesson in lessons} == EXPECTED
    assert len(lessons) == len(EXPECTED)
    for lesson in lessons:
        assert lesson["domain"] == "Math"
        assert lesson["subdomain"] in {"Statistics", "Probability"}
        assert lesson["topic"]
        assert len(lesson["theory"].strip()) >= 120
        assert len(lesson.get("examples", [])) >= 2
        assert len(lesson.get("applications", [])) >= 2
        assert all(example["prompt"] != example["solution"] for example in lesson["examples"])
        assert all(not example["prompt"].startswith("Calculate or interpret this result") for example in lesson["examples"])
        assert all(not example["solution"].startswith("Step-by-step calculation") for example in lesson["examples"])
        assert not any(application["title"].startswith("Application ") for application in lesson["applications"])
        assert "Worked example for" not in lesson_text
        assert "Substitute values" not in lesson_text
        assert lesson["test"]["question_count"] == len(lesson["test"]["questions"])
        assert len(lesson["test"]["questions"]) >= 10


def test_probability_and_statistics_form_a_prerequisite_chain():
    lessons = {lesson["id"]: lesson for lesson in _lessons()}
    all_ids = {yaml.safe_load(path.read_text(encoding="utf-8"))["id"] for path in SKILLS.glob("*.yaml")}
    assert lessons["MATH_PROB_001"]["subdomain"] == "Probability"
    assert lessons["MATH_PROB_002"]["prerequisites"] == ["MATH_PROB_001"]
    assert lessons["MATH_PROB_005"]["prerequisites"] == ["MATH_PROB_003", "MATH_PROB_004"]
    assert lessons["MATH_STAT_016"]["prerequisites"]
    for lesson in lessons.values():
        for prerequisite in lesson.get("prerequisites", []):
            assert prerequisite in all_ids
