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

## Persistent Storage

The landing page offers two storage modes:

- **Google Drive**: recommended for deployed Streamlit apps. Quick Maths signs in with Google, creates or reuses a folder named `Quick Maths`, downloads the saved SQLite/export files at login, and uploads managed files after saves and exports.
- **Local storage (Not recommended)**: uses the Streamlit server filesystem. This is fine for local development, but deployed app storage can disappear after restarts or redeploys.

For persistent Google Drive sign-in, create a Google Cloud OAuth client, enable the Google Drive API, and register an authorized redirect URI ending in `/oauth2callback`, such as `https://your-streamlit-app-url.streamlit.app/oauth2callback`. Add these Streamlit secrets:

```toml
[auth]
redirect_uri = "https://your-streamlit-app-url.streamlit.app/oauth2callback"
cookie_secret = "replace-with-a-long-random-secret"
client_id = "..."
client_secret = "..."
server_metadata_url = "https://accounts.google.com/.well-known/openid-configuration"
expose_tokens = "access"
client_kwargs = { scope = "openid profile email https://www.googleapis.com/auth/drive.file", prompt = "select_account" }
```

Generate `cookie_secret` with a password generator or `python -c "import secrets; print(secrets.token_urlsafe(32))"`. Streamlit keeps the identity in a secure browser cookie, so refreshes and new tabs restore the Google identity. Google Drive access tokens are shorter-lived and Streamlit does not expose refresh tokens; when Drive access expires, Quick Maths preserves the downloaded local database and shows a reconnect action instead of attempting unsafe token storage. The app requests Google profile/email scopes plus `drive.file`, then stores only Quick Maths managed files in the `Quick Maths` Drive folder.

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
