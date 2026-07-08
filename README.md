# Quick Maths

Quick Maths is a local-first mastery testing and prerequisite mapping skeleton for AI-assisted learning. It loads skills from YAML, generates mastery tests, grades answers, stores local progress in SQLite, shows a prerequisite map, and exports CSV/Markdown summaries for a preferred AI tutor.

Learners enter normal school-style math notation. The app separates final answers from shown work, autogrades final answers only, and exports work for AI tutor review.

## Version 0.2 Scope

This repository intentionally includes only a few sample skills. The goal is the infrastructure: content-as-data, generated problems, final-answer grading, captured/procedural/proof work, tutor review packets, reflection, persistence, graph status, and exports.

## Run Locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
streamlit run app/Quick_Maths.py
```

For authoring/dev tools, including Author Preview and Lessons-Dev:

```powershell
streamlit run app/Quick_Maths_Dev.py
```

`Lessons-Dev` can launch a mastery test for any lesson, including locked lessons. Use the normal app for real learner progress.

On launch, Quick Maths opens a full-screen profile picker using `Logosketch.png`. Each profile has separate local progress, attempts, reviews, and exports. Use the sidebar `Log Out` button to return to the profile picker.

## Test

```powershell
pytest
```

## Validate Content

```powershell
python -m quickmaths.cli validate-content
```

## Add A Skill

Create a YAML file in `content/math/algebra_foundations/skills/`, add its ID to `track.yaml`, run content validation, and restart Streamlit. No Python change should be required for ordinary skills.
