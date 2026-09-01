# QuickMaths WebMCP Challenge

QuickMaths now includes a static, agent-native algebra workspace built on the existing `MATH_ALG_002` **Two-step equations** skill. The extension is intentionally small enough to understand in one demo and cheap enough to keep online: GitHub Pages hosts it for free, while all learner state stays in the browser.

## What changed

The original Streamlit app exports a learner's work for an AI tutor to review elsewhere. The challenge workspace closes that loop. A compatible ChatGPT or Codex browser discovers tools directly on the page, so its agent can inspect the exact attempt on screen, write feedback back into the lesson, and choose the next practice problem without copy/paste or a custom model API.

The page exposes four imperative WebMCP tools through `document.modelContext.registerTool()`:

| Tool | Effect |
| --- | --- |
| `get_learning_context` | Reads the current skill, problem metadata, mastery, and optional recent activity. It never returns the answer key. |
| `inspect_student_work` | Reads the learner's final answer and shown work, then returns a bounded diagnosis. |
| `record_tutor_feedback` | Saves concise Socratic feedback to local browser state and renders it beside the work. |
| `create_followup_problem` | Opens one problem from a fixed, allowlisted algebra bank based on difficulty or misconception. |

Every write is visible in the tutor activity log. Inputs use strict JSON Schemas and are validated again at runtime. User-authored and tutor-authored text is rendered with `textContent`, never `innerHTML`. The page accepts no arbitrary HTML, JavaScript, problem expression, solution, storage key, or network destination from an agent.

## Architecture

```text
ChatGPT / Codex browser agent
            │
            │ WebMCP tool calls
            ▼
document.modelContext.registerTool
            │
            ▼
QuickMaths learning store ──► visible lesson + tutor activity
            │
            └───────────────► browser localStorage
```

There is no server application in this path. The static files are:

- `docs/index.html` — the accessible lesson workspace and agent activity UI
- `docs/challenge.css` — responsive visual system
- `docs/challenge-core.js` — problem bank, grading, inspection, feedback, persistence
- `docs/webmcp-tools.js` — tool schemas, validation, registration, and execution
- `docs/challenge.js` — DOM bindings and non-agent fallback controls

## Run and test

Requires Python only for a local static server and Node 18+ for the contract tests.

```powershell
python -m http.server 8765 --directory docs
npm --prefix docs test
```

Open `http://localhost:8765/` in a compatible ChatGPT or Codex built-in browser. The Agent Studio status changes to **Agent tools connected** when the browser discovers all four tools. Ordinary browsers show **Ready for a WebMCP browser** and retain the complete local fallback experience.

The automated suite covers malformed browser state, persistence, hidden-answer privacy, grading, bounded feedback, allowlisted follow-ups, registration, input rejection, and the full inspect → feedback → follow-up workflow.

## Under-three-minute demo

1. Open the workspace and point out the connected Agent Studio and the four visible tool names.
2. Click **Load demo mistake**. The attempt reads `3x = 25`, then `x = 8.33`.
3. Ask the browser agent: **“Review my current work Socratically. Inspect it, save concise tutor feedback, then create one follow-up problem targeting my misconception. Do not reveal the answer.”**
4. Show the activity log as the agent inspects the attempt and writes its non-spoiler diagnosis beside the learner's work.
5. Show the follow-up equation `4x - 7 = 21` selected for equation-balance practice.
6. Refresh once to demonstrate that progress survives locally without an account, server, database, or API key.

If the recording environment does not expose WebMCP, use **Ask tutor to review** and **Practice a targeted follow-up** to demonstrate the identical UI state transitions, then show the registered tools in a compatible Codex browser.

## Free deployment

This repository already uses the MIT License and is public. GitHub Pages can publish directly from the `docs` folder:

1. Push the challenge files to the repository's `main` branch.
2. Open **Settings → Pages** in GitHub.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select **main** and **/docs**, then save.
5. After GitHub finishes publishing, verify `https://srednjak.github.io/QuickMaths/` in the target agent browser.

No paid hosting or OpenAI API billing is involved. WebMCP keeps the agent in the browser; the web page supplies tools and state, while the user's existing ChatGPT or Codex session supplies the agent.

## Submission checklist

- [ ] Live public GitHub Pages URL
- [ ] Public GitHub repository URL
- [x] Open-source license (MIT)
- [x] Four discoverable WebMCP tools
- [x] Useful non-agent fallback
- [x] Automated contract tests
- [ ] Public video under three minutes
- [ ] Devpost entry submitted before the deadline

References: [OpenAI WebMCP documentation](https://learn.chatgpt.com/docs/webmcp), [GitHub Pages publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), and [challenge rules](https://webmcp.devpost.com/rules).
