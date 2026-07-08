from quickmaths.tutor_prompts import DEFAULT_TUTOR_PROMPT


def test_default_tutor_prompt_explains_quick_maths_workflow():
    required_phrases = [
        "prerequisite mapping app",
        "YAML skill files",
        "Generated questions",
        "separates my final answer from my shown work",
        "autogrades final answers",
        "symbolic_expression",
        "equation_solution",
        "theorem_conclusion",
        "procedural_steps",
        "work_check_status",
        "pending_review",
        "not set equal to the latest test percent",
        "Do not interpret 7/8 as 87.5 mastery",
        "proof",
        "rubric",
        "Ask one practice question at a time",
        "retest in Quick Maths",
    ]
    for phrase in required_phrases:
        assert phrase in DEFAULT_TUTOR_PROMPT
