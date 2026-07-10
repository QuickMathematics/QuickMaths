from quickmaths.author_preview import find_ugly_math_patterns, generate_preview_samples, samples_to_markdown, skill_metadata
from quickmaths.content_loader import load_curriculum
from quickmaths.models import Example, MasteryRules, ProblemTemplate, Skill, SkillTest


def test_ugly_math_pattern_detector_flags_authoring_artifacts():
    assert "contains '+ -'" in find_ugly_math_patterns("Simplify: 4x + -3x")
    assert "contains '1x'" in find_ugly_math_patterns("Simplify: 1x + 2")
    assert "contains '-1x'" in find_ugly_math_patterns("Simplify: -1x + 2")
    assert find_ugly_math_patterns("Simplify: 11x - 3x") == []
    assert find_ugly_math_patterns("Simplify: 1x + 2", allowed_patterns=["contains '1x'"]) == []


def test_preview_samples_grade_expected_answers_and_metadata():
    _, skills, _ = load_curriculum()
    skill = skills["MATH_PREALG_002"]
    samples = generate_preview_samples(skill, sample_count=2, base_seed=7)
    metadata = skill_metadata(skill)

    assert metadata["id"] == "MATH_PREALG_002"
    assert metadata["generated_template_count"] == len(skill.test.questions)
    assert len(samples) == metadata["generated_template_count"] * 2
    assert all(not sample.generation_error for sample in samples)
    assert all(sample.expected_answer_correct for sample in samples)
    assert all(not sample.ugly_warnings for sample in samples)


def test_preview_markdown_contains_sample_details():
    _, skills, _ = load_curriculum()
    skill = skills["MATH_PREALG_002"]
    samples = generate_preview_samples(skill, sample_count=1, base_seed=11)
    markdown = samples_to_markdown(skill, samples)

    assert "# Author Preview: Combining like terms" in markdown
    assert "## Metadata" in markdown
    assert "Prompt:" in markdown
    assert "Expected answer grades correct: True" in markdown


def test_preview_records_generation_failures():
    skill = Skill(
        id="S",
        name="Broken Skill",
        domain="Math",
        subdomain="Test",
        description="Broken generator",
        prerequisites=[],
        mastery=MasteryRules(),
        theory="Theory",
        examples=[Example("p", "s")],
        test=SkillTest(
            question_count=1,
            randomize_order=False,
            questions=[
                ProblemTemplate(
                    id="BROKEN",
                    type="generated",
                    prompt_template="{a}",
                    variables={"a": {"type": "int", "min": 2, "max": 1}},
                    answer={"type": "numeric", "value": "{a}"},
                    grading={"method": "exact_numeric"},
                    max_attempts=1,
                )
            ],
        ),
    )

    samples = generate_preview_samples(skill, sample_count=1, base_seed=1)
    assert samples[0].generation_error
    assert samples[0].instance is None
