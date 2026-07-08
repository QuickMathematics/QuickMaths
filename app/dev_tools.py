from __future__ import annotations

import re
from datetime import datetime

import streamlit as st

from app.page_helpers import (
    app_context,
    locked_reason,
    set_page_config,
    status_chip,
    status_label,
    unmet_prerequisites,
)
from quickmaths.author_preview import generate_preview_samples, generated_templates, samples_to_markdown, skill_metadata
from quickmaths.config import DEFAULT_TRACK_DIR, EXPORT_DIR
from quickmaths.content_loader import ContentError, load_curriculum
from quickmaths.utils import display_math
from quickmaths.validation import validate_curriculum


def render_lessons_dev() -> None:
    set_page_config()
    _track, skills, _warnings, progress = app_context()

    st.title("Lessons-Dev")
    st.caption("Developer test launcher. Use this to generate a mastery test for any lesson, including locked lessons.")

    options = {f"{skill.name} ({skill.id})": skill.id for skill in skills.values()}
    selected = st.selectbox("Lesson", list(options))
    skill_id = options[selected]
    skill = skills[skill_id]
    status = _skill_status(skill, progress)

    cols = st.columns([3, 1])
    cols[0].subheader(skill.name)
    cols[0].write(skill.description)
    cols[1].markdown(status_chip(status), unsafe_allow_html=True)

    st.write("Prerequisites:", ", ".join(skills[item].name if item in skills else item for item in skill.prerequisites) or "None")
    unmet = unmet_prerequisites(skill, skills, progress)
    if unmet:
        st.warning(locked_reason(skill, skills, progress))
        for item in unmet:
            st.write(f"- {item['name']}: {status_label(item['status'])}")

    st.write(f"Question templates: {len(skill.test.questions)}")
    st.write(f"Test question count: {skill.test.question_count}")

    if st.button("Take Dev Test", type="primary"):
        st.session_state["dev_allow_locked_test"] = True
        st.session_state["selected_test_skill_id"] = skill.id
        st.session_state["current_skill_id"] = skill.id
        st.session_state.pop("problem_instances", None)
        st.session_state.pop("pending_results", None)
        st.session_state.pop("saved_attempt_id", None)
        st.switch_page("pages/03_Mastery_Test.py")

    st.divider()
    st.markdown(display_math(skill.theory))

    st.subheader("Examples")
    for example in skill.examples:
        with st.expander(display_math(example.prompt)):
            st.write(f"Solution: {display_math(example.solution)}")
            st.write(display_math(example.explanation))


def render_author_preview() -> None:
    set_page_config()

    st.title("Author Preview")
    st.caption("Validate YAML content, inspect rendered generated questions, and catch formatting issues before learners see them.")

    top_cols = st.columns([1, 1, 4])
    if top_cols[0].button("Run Strict Validation", width="stretch"):
        st.session_state["author_preview_strict_validation"] = datetime.utcnow().isoformat()
    if top_cols[1].button("Reload Content", width="stretch"):
        st.cache_data.clear()
        st.rerun()

    _show_validation_status(strict=bool(st.session_state.get("author_preview_strict_validation")))

    try:
        _track, skills, loader_warnings = load_curriculum(DEFAULT_TRACK_DIR)
    except ContentError as exc:
        st.error(str(exc))
        st.stop()

    if loader_warnings:
        with st.expander("Loader warnings"):
            for warning in loader_warnings:
                st.warning(warning)

    if "author_preview_seed" not in st.session_state:
        st.session_state["author_preview_seed"] = 1

    skill_options = {f"{skill.name} ({skill.id})": skill.id for skill in skills.values()}
    selected_label = st.selectbox("Skill", list(skill_options))
    skill = skills[skill_options[selected_label]]

    sample_count = st.number_input("Samples per generated template", min_value=1, max_value=50, value=10, step=1)
    cols = st.columns([1, 1, 4])
    if cols[0].button("Reroll Samples", width="stretch"):
        st.session_state["author_preview_seed"] += 10_000
    if cols[1].button("Export Samples Markdown", width="stretch"):
        samples_for_export = generate_preview_samples(skill, int(sample_count), int(st.session_state["author_preview_seed"]))
        markdown = samples_to_markdown(skill, samples_for_export)
        EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        path = EXPORT_DIR / f"author_preview_{_slug(skill.id)}.md"
        path.write_text(markdown, encoding="utf-8")
        st.success(f"Exported {path}")

    st.subheader("Skill Metadata")
    st.json(skill_metadata(skill), expanded=True)

    templates = generated_templates(skill)
    st.subheader("Generated Question Templates")
    if not templates:
        st.info("This skill has no generated question templates.")
        st.stop()

    samples = generate_preview_samples(skill, int(sample_count), int(st.session_state["author_preview_seed"]))
    markdown = samples_to_markdown(skill, samples)
    st.download_button(
        "Download Current Preview Markdown",
        markdown,
        file_name=f"author_preview_{_slug(skill.id)}.md",
        mime="text/markdown",
    )

    samples_by_template = {template.id: [] for template in templates}
    for sample in samples:
        samples_by_template.setdefault(sample.template_id, []).append(sample)

    for template in templates:
        with st.expander(f"{template.id}: {template.prompt_template}", expanded=True):
            st.write(f"Grading method: `{template.grading.get('method', 'exact_text')}`")
            st.write(f"Work mode: `{template.work.get('mode', 'none') if template.work else 'none'}`")
            st.write(f"Review policy: `{template.review_policy or {}}`")
            for sample in samples_by_template.get(template.id, []):
                title = f"Sample {sample.sample_number} | seed {sample.seed}"
                with st.container(border=True):
                    st.markdown(f"#### {title}")
                    if sample.generation_error:
                        st.error(sample.generation_error)
                        continue
                    instance = sample.instance
                    if instance is None:
                        st.error("Generation failed without an instance.")
                        continue
                    if sample.expected_answer_correct:
                        st.success("Expected answer grades as correct.")
                    else:
                        st.error(f"Expected answer did not grade as correct. {sample.grading_message}")
                    for warning in sample.ugly_warnings:
                        st.warning(f"Rendered prompt warning: {warning}")
                    st.write("Prompt")
                    st.code(display_math(instance.prompt), language="text")
                    st.write("Variable values")
                    st.json(instance.values, expanded=False)
                    st.write(f"Expected answer: `{display_math(instance.expected_answer)}`")
                    st.write(f"Grading method: `{instance.grading_method}`")
                    st.write(f"Work mode: `{instance.work.get('mode', 'none') if instance.work else 'none'}`")
                    st.write(f"Review policy: `{instance.review_policy or {}}`")
                    st.write("Solution / explanation")
                    if instance.solution_steps:
                        for step in instance.solution_steps:
                            st.write(f"- {display_math(step)}")
                    else:
                        st.write("None")


def _slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_") or "skill"


def _show_validation_status(strict: bool = False) -> None:
    report = validate_curriculum(DEFAULT_TRACK_DIR, dry_run_generated=True)
    if report.errors:
        st.error(f"Validation found {len(report.errors)} error(s).")
    elif strict and report.warnings:
        st.error(f"Strict validation found {len(report.warnings)} warning(s).")
    elif report.warnings:
        st.warning(f"Validation passed with {len(report.warnings)} warning(s).")
    else:
        st.success("Content validation passed.")
    with st.expander("Validation details", expanded=bool(report.errors or (strict and report.warnings))):
        for line in report.lines():
            st.write(line)


def _skill_status(skill, progress: dict) -> str:
    from quickmaths.graph_engine import status_for_skill

    return status_for_skill(skill, progress)
