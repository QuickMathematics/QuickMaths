from __future__ import annotations

from dataclasses import asdict
import argparse
import base64
import hashlib
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from quickmaths.content_loader import load_curriculum
from quickmaths.problem_generator import generate_test
from quickmaths.lesson_media import prepare_lesson_media


OUTPUT_PATH = PROJECT_ROOT / "docs" / "curriculum-data.json"
FIRST_PARTY_EXPANSION_PATH = PROJECT_ROOT / "content" / "geography" / "foundations" / "web-curriculum.json"
MAX_VARIANT_SEEDS = 12
DEFAULT_NATIVE_MEDIA_BUDGET = 1_000_000


def stable_seed(skill_id: str) -> int:
    digest = hashlib.sha256(skill_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 2_000_000_000 or 1


def _attribution_key(value: object, fallback: str) -> str:
    return str(value or fallback)


def _media_report(*, budget: int, assets: dict, attributions: dict) -> dict:
    total = sum(asset["bytes"] for asset in assets.values())
    report = {
        "budget_bytes": budget,
        "total_bytes": total,
        "remaining_bytes": budget - total,
        "asset_count": len(assets),
    }
    for label in ("subdomain", "branch", "source_folder"):
        report[f"by_{label}"] = {
            key: {"bytes": value["bytes"], "asset_count": value["asset_count"]}
            for key, value in sorted(attributions[label].items())
        }
    return report


def build_payload(*, native_media_budget: int = DEFAULT_NATIVE_MEDIA_BUDGET, media_report_path: Path | None = None, previous_media_report: dict | None = None) -> dict:
    if type(native_media_budget) is not int or native_media_budget < 0:
        raise ValueError("Native media budget must be a non-negative integer.")
    track, skills, warnings = load_curriculum()
    skill_rows = []
    assets = {}
    attributions = {"subdomain": {}, "branch": {}, "source_folder": {}}

    def collect_media(rows, folder, *, branch):
        media_pack, files = prepare_lesson_media({"skills": rows}, folder, portable=False)
        for asset in media_pack.get("assets", []):
            if asset["path"] in assets and assets[asset["path"]]["sha256"] != asset["sha256"]:
                raise ValueError(f"Native media path collision: {asset['path']}")
            if asset["path"] not in assets:
                assets[asset["path"]] = {**asset, "data_base64": base64.b64encode(files[asset["path"]]).decode("ascii")}
                source_folder = str(folder.relative_to(PROJECT_ROOT)).replace("\\", "/")
                first_row = rows[0] if rows else {}
                keys = {
                    "subdomain": _attribution_key(first_row.get("subdomain"), "unknown"),
                    "branch": branch,
                    "source_folder": source_folder,
                }
                for label, key in keys.items():
                    bucket = attributions[label].setdefault(key, {"bytes": 0, "asset_count": 0})
                    bucket["bytes"] += asset["bytes"]
                    bucket["asset_count"] += 1
        total = sum(asset["bytes"] for asset in assets.values())
        if total > native_media_budget:
            raise ValueError(
                f"Native embedded media exceeds the configured budget of {native_media_budget} bytes."
            )
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
                for optional in ("media", "diagram", "math_blocks"):
                    if not row.get(optional):
                        row.pop(optional, None)
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
                    "rational_equation_steps",
                    "sign_chart_steps",
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
                "topic": skill.topic,
                "description": skill.description,
                "prerequisites": skill.prerequisites,
                "unlocks": skill.unlocks,
                "tags": skill.tags,
                "mastery": asdict(skill.mastery),
                "theory": skill.theory,
                **({"math_blocks": skill.math_blocks} if skill.math_blocks else {}),
                "examples": [{key: value for key, value in asdict(example).items() if key not in {"media", "diagram", "math_blocks"} or value} for example in skill.examples],
                **({"media": skill.media} if skill.media else {}),
                "applications": skill.applications,
                "question_count": question_count,
                "native_randomize_order": skill.test.randomize_order,
                "native_templates": [{key: value for key, value in asdict(template).items() if key not in {"media", "diagram", "math_blocks"} or value} for template in skill.test.questions],
                "problems": problems,
            }
        )
        collect_media([skill_rows[-1]], Path(skill.source_path).parent, branch="core")
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
        for native_skill in native_skills:
            collect_media([native_skill], FIRST_PARTY_EXPANSION_PATH.parent, branch="math_bridge")
        generated_from.append(str(FIRST_PARTY_EXPANSION_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"))
    payload = {
        "schema_version": "2.0",
        "generated_from": generated_from,
        "subjects": subjects,
        "track": track_row,
        "warnings": warnings,
        "skills": skill_rows,
        **({"assets": list(assets.values())} if assets else {}),
    }
    report = _media_report(budget=native_media_budget, assets=assets, attributions=attributions)
    if previous_media_report is not None:
        previous_total = previous_media_report.get("total_bytes")
        if type(previous_total) is not int or previous_total < 0:
            raise ValueError("Previous media report needs a non-negative total_bytes integer.")
        report["growth_bytes"] = report["total_bytes"] - previous_total
        report["previous_total_bytes"] = previous_total
    payload["native_media_report"] = report
    if media_report_path is not None:
        media_report_path = Path(media_report_path)
        media_report_path.parent.mkdir(parents=True, exist_ok=True)
        media_report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Export native web curriculum data.")
    parser.add_argument("--native-media-budget", type=int, default=DEFAULT_NATIVE_MEDIA_BUDGET)
    parser.add_argument("--media-report", type=Path, help="Write the deterministic native media budget report to this path.")
    parser.add_argument("--previous-media-report", type=Path, help="Compare growth with a previous batch report.")
    args = parser.parse_args()
    baseline = json.loads(args.previous_media_report.read_text(encoding="utf-8")) if args.previous_media_report else None
    OUTPUT_PATH.write_text(
        json.dumps(build_payload(native_media_budget=args.native_media_budget, media_report_path=args.media_report, previous_media_report=baseline), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
