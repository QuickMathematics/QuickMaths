# Quick Maths

Quick Maths is a local-first mastery testing and prerequisite mapping app for AI-assisted learning. It loads skills from YAML, generates mastery tests, grades answers, stores learner progress, shows a prerequisite map, and exports portable progress records for a preferred AI tutor.

Learners enter normal school-style math notation. The app separates final answers from shown work, autogrades final answers only, and exports work for AI tutor review.

## WebMCP Challenge Demo

The zero-cost static app in [`docs/`](docs/) brings 43 first-party Mathematics and Geography lessons to the browser: the original 25-skill Algebra Foundations track, a three-lesson coordinate-geometry bridge, and a substantial 15-lesson Geography curriculum spanning spatial inquiry, cartography, Earth systems, population, cities, trade, territory, risk, and regional synthesis. It includes a replayable new-profile tutorial, learner landing page, profiles, dashboard, prerequisite mastery maps with focused and all-subject lane views, five-question tests, results and reflection, tutor reviews, the original analog clock, JSON backup/load, and CSV exports. Schema 2.0 lesson sets can extend either built-in subject or create new themed subjects with cross-subject prerequisite bridges; each profile can choose an enforced Hard path or guideline-only Open path. A built-in Human Lesson Creator and public Lesson Depot provide no-code authoring and community distribution, including optional in-app GitHub Discussion votes and comments. Seventeen WebMCP tools let a compatible ChatGPT or Codex browser inspect subjects and progress, search or stage community content, navigate the visible app, tutor, validate lesson JSON, and stage content for human-controlled installation.

QuickMaths Bridge adds an optional mobile-to-agent handoff without adding a hosted application server. The learner app checkpoints complete state to `learner-state.json` in a dedicated private GitHub repository; a separate top-level Agent Bridge page exposes the learning tools plus three sync tools and returns revision-bound agent changes through `agent-state.json`. Stale responses and unsynced local overwrites are rejected. The preferred Codex transport is a loopback CLI that uses the host's existing Git credentials, so the agent browser never receives the GitHub token.

Without Bridge, all learning state remains in browser `localStorage`; visible backup and restore controls in Settings make it portable between browsers. The static build needs no model API, QuickMaths account, API key, or paid hosting. Bridge users supply their own narrow GitHub repository token. Separately, Lesson Depot participants may authorize the least-privilege QuickMaths Community GitHub App to vote with a 👍 reaction and comment in the public repository. Its short-lived user token is kept in `sessionStorage` by default (or `localStorage` only when the user chooses **Keep me connected**) and never enters learning backups, bridge files, WebMCP output, or commits. A stateless Cloudflare Worker protects the GitHub App client secret and only exchanges or refreshes OAuth tokens. See the [QuickMaths Bridge guide](docs/QUICKMATHS_BRIDGE.md).

Run it locally:

```powershell
python -m http.server 8765 --directory docs
```

Then open `http://localhost:8765/`. See [WEBMCP_CHALLENGE.md](WEBMCP_CHALLENGE.md) for architecture, testing, deployment, and the under-three-minute demo script.

The dedicated agent workspace is at `http://localhost:8765/agent-bridge.html`, and the mobile setup guide is at `http://localhost:8765/bridge-guide.html`.

For a Codex host already authenticated to the private data repository, run the WebMCP workspace over the local Git transport:

```powershell
python -m quickmaths.cli agent-bridge --repo https://github.com/YOUR-NAME/quickmaths-sync.git
```

Open the printed `127.0.0.1` URL in the compatible agent browser. The loopback server exposes only the two checkpoint files, uses SHA-checked Git commits, and stops with `Ctrl+C`. The learner phone still connects from **Settings → QuickMaths Bridge** with its repository-scoped fine-grained token.

## Version 0.2 Scope

The first-party browser curriculum contains 43 connected lessons and 555 assessment questions. The Python/Streamlit app remains the original Mathematics authoring and reference implementation; the web export combines its 375 seeded Algebra variants with 180 reviewed Mathematics-bridge and Geography questions, serving rotating five-question tests without a backend.

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
npm --prefix docs test
```

## Validate Content

```powershell
python -m quickmaths.cli validate-content
```

## Add A Skill

Create a YAML file in `content/math/algebra_foundations/skills/`, add its ID to `track.yaml`, run content validation, and restart Streamlit. No Python change should be required for ordinary skills.
