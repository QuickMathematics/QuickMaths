from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import yaml
from yaml.constructor import ConstructorError
from yaml.nodes import MappingNode

from quickmaths.config import DEFAULT_TRACK_DIR, SUPPORTED_GRADING_METHODS
from quickmaths.models import Example, MasteryRules, ProblemTemplate, Skill, SkillTest, Track


class ContentError(ValueError):
    pass


class _UniqueKeySafeLoader(yaml.SafeLoader):
    """Safe YAML loader that rejects mappings with repeated keys."""

    def construct_mapping(self, node: MappingNode, deep: bool = False) -> dict[Any, Any]:
        if not isinstance(node, MappingNode):
            raise ConstructorError(None, None, f"expected a mapping node, but found {node.id}", node.start_mark)
        self.flatten_mapping(node)
        mapping: dict[Any, Any] = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                raise ConstructorError(
                    "while constructing a mapping",
                    node.start_mark,
                    f"found duplicate key {key!r}",
                    key_node.start_mark,
                )
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def _safe_load_unique(text: str) -> Any:
    return yaml.load(text, Loader=_UniqueKeySafeLoader)


def load_track(track_dir: Path = DEFAULT_TRACK_DIR) -> Track:
    path = track_dir / "track.yaml"
    data = _read_yaml(path)
    try:
        return Track(
            id=data["id"],
            name=data["name"],
            domain=data["domain"],
            description=data.get("description", ""),
            entry_skills=list(data.get("entry_skills", [])),
            exit_skills=list(data.get("exit_skills", [])),
            skills=list(data.get("skills", [])),
            schema_version=str(data.get("schema_version", "0.2")),
        )
    except KeyError as exc:
        raise ContentError(f"{path}: missing required track field '{exc.args[0]}'") from exc


def load_skills(track_dir: Path = DEFAULT_TRACK_DIR, include_drafts: bool = False) -> dict[str, Skill]:
    skill_dir = track_dir / "skills"
    skills: dict[str, Skill] = {}
    paths = sorted(skill_dir.glob("*.yaml"))
    if include_drafts:
        paths.extend(sorted((track_dir / "drafts").glob("*.yaml")))
    for path in paths:
        skill = load_skill_file(path)
        if skill.draft and not include_drafts:
            continue
        if skill.id in skills:
            previous = skills[skill.id].source_path
            raise ContentError(f"{path}: duplicate skill id '{skill.id}' also found in {previous}")
        skills[skill.id] = skill
    return skills


def load_skill_file(path: Path) -> Skill:
    text = path.read_text(encoding="utf-8")
    try:
        data = _safe_load_unique(text)
    except yaml.YAMLError as exc:
        raise ContentError(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ContentError(f"{path}: skill file must contain a YAML mapping")
    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return _skill_from_dict(data, path, content_hash)


def validate_content(track: Track, skills: dict[str, Skill]) -> list[str]:
    warnings: list[str] = []
    missing_from_track = [skill_id for skill_id in track.skills if skill_id not in skills]
    if missing_from_track:
        raise ContentError(f"track.yaml references missing skill IDs: {', '.join(missing_from_track)}")
    extra_skills = [skill_id for skill_id, skill in skills.items() if skill_id not in track.skills and not skill.draft]
    if extra_skills:
        warnings.append(f"Skills not listed in track.yaml: {', '.join(extra_skills)}")
    for skill in skills.values():
        for prereq in skill.prerequisites:
            if prereq not in skills:
                raise ContentError(f"{skill.source_path}: prerequisite '{prereq}' is not a loaded skill ID")
        if not skill.examples:
            warnings.append(f"{skill.id}: no examples")
        if not skill.theory.strip():
            warnings.append(f"{skill.id}: no theory")
        if len(skill.test.questions) < 2:
            warnings.append(f"{skill.id}: fewer than two test question templates")
        for question in skill.test.questions:
            method = question.grading.get("method")
            if method not in SUPPORTED_GRADING_METHODS:
                raise ContentError(
                    f"{skill.source_path}: question '{question.id}' uses unsupported grading method '{method}'"
                )
    return warnings


def load_curriculum(track_dir: Path = DEFAULT_TRACK_DIR, include_drafts: bool = False) -> tuple[Track, dict[str, Skill], list[str]]:
    track = load_track(track_dir)
    skills = load_skills(track_dir, include_drafts=include_drafts)
    warnings = validate_content(track, skills)
    return track, skills, warnings


def _read_yaml(path: Path) -> dict[str, Any]:
    try:
        data = _safe_load_unique(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ContentError(f"{path}: file not found") from exc
    except yaml.YAMLError as exc:
        raise ContentError(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ContentError(f"{path}: expected a YAML mapping")
    return data


def _skill_from_dict(data: dict[str, Any], path: Path, content_hash: str) -> Skill:
    required = ["id", "name", "domain", "subdomain", "description", "prerequisites", "mastery", "theory", "test"]
    for field_name in required:
        if field_name not in data:
            raise ContentError(f"{path}: missing required skill field '{field_name}'")
    try:
        questions = [
            ProblemTemplate(
                id=item["id"],
                type=item.get("type", "generated"),
                prompt_template=item.get("prompt_template", item.get("prompt", "")),
                variables=dict(item.get("variables", {})),
                derived=dict(item.get("derived", {})),
                constraints=list(item.get("constraints", [])),
                answer=dict(item.get("answer", {})),
                grading=dict(item.get("grading", {})),
                explanation_template=item.get("explanation_template", ""),
                solution_steps=list(item.get("solution_steps", [])),
                mistake_tags=list(item.get("mistake_tags", [])),
                difficulty=item.get("difficulty", "medium"),
                options=list(item.get("options", [])),
                max_attempts=int(item.get("max_attempts", 100)),
                answer_mode=item.get("answer_mode", "final_only"),
                work=dict(item.get("work", {})),
                review_policy=dict(item.get("review_policy", {})),
            )
            for item in data["test"].get("questions", [])
        ]
        return Skill(
            id=data["id"],
            name=data["name"],
            domain=data["domain"],
            subdomain=data["subdomain"],
            description=data["description"],
            prerequisites=list(data.get("prerequisites", [])),
            mastery=MasteryRules(**data.get("mastery", {})),
            theory=data.get("theory", ""),
            examples=[Example(**item) for item in data.get("examples", [])],
            test=SkillTest(
                question_count=int(data["test"].get("question_count", len(questions))),
                randomize_order=bool(data["test"].get("randomize_order", True)),
                questions=questions,
            ),
            tags=list(data.get("tags", [])),
            unlocks=list(data.get("unlocks", [])),
            applications=list(data.get("applications", [])),
            node_type=data.get("node_type", "concept"),
            source_path=str(path),
            content_hash=content_hash,
            schema_version=str(data.get("schema_version", "0.2")),
            draft=bool(data.get("draft", False)),
            deprecated=bool(data.get("deprecated", False)),
            replacement_skill_id=str(data.get("replacement_skill_id", "") or ""),
        )
    except KeyError as exc:
        raise ContentError(f"{path}: question is missing required field '{exc.args[0]}'") from exc
    except TypeError as exc:
        raise ContentError(f"{path}: invalid field shape: {exc}") from exc
