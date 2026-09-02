from __future__ import annotations

from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from quickmaths.content_loader import load_curriculum
from quickmaths.problem_generator import generate_test


OUTPUT_PATH = PROJECT_ROOT / "docs" / "curriculum-data.json"
FIRST_PARTY_EXPANSION_PATH = PROJECT_ROOT / "content" / "geography" / "foundations" / "web-curriculum.json"
MAX_VARIANT_SEEDS = 12


def stable_seed(skill_id: str) -> int:
    digest = hashlib.sha256(skill_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 2_000_000_000 or 1


def build_payload() -> dict:
    track, skills, warnings = load_curriculum()
    skill_rows = []
    for skill_id in track.skills:
        skill = skills[skill_id]
        question_count = len(skill.test.questions)
        target_bank_size = min(question_count * 2, 100)
        source_template_ids = {template.id for template in skill.test.questions}
        problems = []
        signatures: set[str] = set()
        for variant_index in range(MAX_VARIANT_SEEDS):
            generated = generate_test(skill, stable_seed(skill.id) + variant_index * 104_729)
            for instance in generated:
                signature = json.dumps(
                    [instance.prompt, str(instance.expected_answer), instance.options],
                    sort_keys=True,
                    default=str,
                )
                if signature in signatures:
                    continue
                signatures.add(signature)
                row = asdict(instance)
                row["source_template_id"] = instance.template_id
                row["template_id"] = f"{instance.template_id}__{len(problems) + 1:02d}"
                row["work_required"] = instance.answer_mode in {
                    "final_plus_required_work",
                    "structured_steps",
                    "proof_required",
                } or str(instance.work.get("mode", "none")) in {
                    "required",
                    "procedural_steps",
                    "proof_obligations",
                    "rubric_check",
                }
                problems.append(row)
            covered_template_ids = {problem["source_template_id"] for problem in problems}
            if len(problems) >= target_bank_size and covered_template_ids == source_template_ids:
                break
        covered_template_ids = {problem["source_template_id"] for problem in problems}
        if covered_template_ids != source_template_ids:
            missing = ", ".join(sorted(source_template_ids - covered_template_ids))
            raise RuntimeError(
                f"{skill.id} did not export every authored assessment scenario; missing: {missing}."
            )
        skill_rows.append(
            {
                "id": skill.id,
                "name": skill.name,
                "domain": skill.domain,
                "subdomain": skill.subdomain,
                "description": skill.description,
                "prerequisites": skill.prerequisites,
                "unlocks": skill.unlocks,
                "tags": skill.tags,
                "mastery": asdict(skill.mastery),
                "theory": skill.theory,
                "examples": [asdict(example) for example in skill.examples],
                "applications": skill.applications,
                "question_count": question_count,
                "native_randomize_order": skill.test.randomize_order,
                "native_templates": [asdict(template) for template in skill.test.questions],
                "problems": problems,
            }
        )
    track_row = asdict(track)
    subjects = []
    generated_from = ["content/math/algebra_foundations"]
    if FIRST_PARTY_EXPANSION_PATH.exists():
        expansion = json.loads(FIRST_PARTY_EXPANSION_PATH.read_text(encoding="utf-8"))
        # This expansion now contributes only the native Mathematics bridge.
        # Geography is generated as a separately installable Lesson Depot pack.
        native_skills = [
            skill for skill in expansion.get("skills", [])
            if skill.get("subjectId", "SUBJECT_MATH") == "SUBJECT_MATH"
        ]
        native_skill_ids = {skill["id"] for skill in native_skills}
        extension_track = expansion["track"]
        track_row["skills"].extend(skill_id for skill_id in extension_track.get("skills", []) if skill_id in native_skill_ids)
        track_row["entry_skills"].extend(skill_id for skill_id in extension_track.get("entry_skills", []) if skill_id in native_skill_ids)
        track_row["exit_skills"].extend(skill_id for skill_id in extension_track.get("exit_skills", []) if skill_id in native_skill_ids)
        skill_rows.extend(native_skills)
        generated_from.append(str(FIRST_PARTY_EXPANSION_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"))
    return {
        "schema_version": "2.0",
        "generated_from": generated_from,
        "subjects": subjects,
        "track": track_row,
        "warnings": warnings,
        "skills": skill_rows,
    }


def main() -> None:
    OUTPUT_PATH.write_text(
        json.dumps(build_payload(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
