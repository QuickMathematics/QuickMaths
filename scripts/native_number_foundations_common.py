"""Deterministic builders for the native number-foundations lessons.

Each lesson-specific builder owns its theory, examples, applications, questions,
and two small SVG figures.  This helper only keeps the legacy native YAML shape
consistent; it contains no random generation or executable grading logic.
"""
from pathlib import Path
from html import escape
import re
import yaml

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "content/math/algebra_foundations/skills"
MEDIA = SKILLS / "media/native-number-foundations"


def example(prompt, solution, explanation):
    return {"prompt": prompt, "solution": solution, "explanation": explanation}


def application(title, description):
    return {"title": title, "description": description}


def generated(qid, prompt, variables, derived, answer, explanation, *, difficulty="medium", tags=None):
    return {
        "id": qid,
        "type": "generated",
        "prompt_template": prompt,
        "difficulty": difficulty,
        "answer_mode": "final_only",
        "variables": variables,
        "derived": derived,
        "constraints": [],
        "answer": {"type": "numeric", "value": answer},
        "grading": {"method": "exact_numeric"},
        "work": {"mode": "none"},
        "review_policy": {"work_review": "none", "mastery_requires_review_pass": False, "allow_self_review": True},
        "explanation_template": explanation,
        "mistake_tags": tags or ["operation_meaning", "place_value"],
    }


def fixed(qid, prompt, answer, explanation, *, difficulty="medium", tags=None):
    return {
        "id": qid,
        "type": "fixed",
        "prompt": prompt,
        "difficulty": difficulty,
        "answer_mode": "final_only",
        "answer": {"type": "numeric", "value": answer},
        "grading": {"method": "exact_numeric"},
        "work": {"mode": "none"},
        "review_policy": {"work_review": "none", "mastery_requires_review_pass": False, "allow_self_review": True},
        "explanation_template": explanation,
        "mistake_tags": tags or ["reasoning", "calculation"],
    }


def choice(qid, prompt, answer, options, explanation, *, difficulty="medium", tags=None):
    return {
        "id": qid, "type": "fixed", "prompt": prompt, "difficulty": difficulty,
        "answer_mode": "final_only", "answer": {"type": "choice", "value": answer},
        "grading": {"method": "multiple_choice"},
        "options": [{"id": letter, "label": label} for letter, label in options],
        "work": {"mode": "none"},
        "review_policy": {"work_review": "none", "mastery_requires_review_pass": False, "allow_self_review": True},
        "explanation_template": explanation, "mistake_tags": tags or ["conceptual_reasoning"],
    }
def capstone(qid, prompt, answer, criteria, explanation):
    return {
        "id": qid,
        "type": "fixed",
        "prompt": prompt,
        "difficulty": "hard",
        "answer_mode": "final_plus_required_work",
        "answer": {"type": "numeric", "value": answer},
        "grading": {"method": "exact_numeric"},
        "work": {
            "mode": "rubric_check",
            "prompt": "Explain the model, show labelled calculations, and state units or assumptions. A final number alone is not enough.",
            "rubric": {"criteria": [{"id": f"criterion_{i+1}", "description": text, "weight": 2} for i, text in enumerate(criteria)]},
        },
        "review_policy": {"work_review": "tutor_required", "mastery_requires_review_pass": True, "allow_self_review": False},
        "explanation_template": explanation,
        "mistake_tags": ["capstone_reasoning", "model_selection"],
    }


def figure(filename, title, body, *, width=800, height=360):
    MEDIA.mkdir(parents=True, exist_ok=True)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
<rect width="{width}" height="{height}" rx="20" fill="#fffdf7"/>
<g font-family="sans-serif" fill="#163f36"><text x="28" y="40" font-size="24" font-weight="bold">{escape(title)}</text>{body}</g></svg>'''
    (MEDIA / filename).write_text(svg, encoding="utf-8")


def media(filename, alt, caption, *, width=800, height=360):
    return {"src": f"media/native-number-foundations/{filename}", "alt": alt, "caption": caption, "width": width, "height": height, "fit": "contain"}


def save(skill_id, name, theory, prerequisites, examples, applications, questions, images, *, topic="Arithmetic Foundations", tags=None):
    assert len(examples) == 10, (skill_id, "examples", len(examples))
    assert len(applications) == 4, (skill_id, "applications", len(applications))
    assert len(questions) == 20, (skill_id, "questions", len(questions))
    assert sum(q.get("work", {}).get("mode") == "rubric_check" for q in questions) == 1
    assert questions[-1]["review_policy"]["work_review"] == "tutor_required"
    data = {
        "id": skill_id,
        "schema_version": "0.2",
        "name": name,
        "domain": "Math",
        "subdomain": "Arithmetic",
        "topic": topic,
        "description": (" ".join(re.split(r"(?<=[.!?])\\s+(?=[A-Z])", theory.split("\\n", 1)[0])[:2]).strip())[:200],
        "prerequisites": prerequisites,
        "unlocks": [],
        "tags": tags or ["arithmetic", "foundations", "reasoning"],
        "mastery": {"passing_score": 0.8, "minimum_confidence": 3, "max_guessing_allowed": "maybe", "review_after_days_if_mastered": 7, "review_after_days_if_learning": 2},
        "theory": theory,
        "examples": examples,
        "applications": applications,
        "media": images,
        "test": {"question_count": 20, "randomize_order": True, "questions": questions},
    }
    stem = name.lower().replace(",", "").replace("-", "_").replace(" ", "_")
    (SKILLS / f"{skill_id}_{stem}.yaml").write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=105), encoding="utf-8")
