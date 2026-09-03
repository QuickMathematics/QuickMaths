# QuickMaths Bridge

QuickMaths Bridge turns a free GitHub repository into a small, auditable handoff channel between a learner's browser and an agent workspace. It does not run a model, host a backend, or expose the learner's browser to the internet.

The learner page remains local-first. Normal actions save instantly in browser storage, then a short debounce writes a complete workspace checkpoint to `learner-state.json`. That checkpoint includes every learner and educator profile, curriculum, attempt, review, installed pack, map plan, and supplemental educator guidance stored for QuickMaths on this browser origin. It is not scoped to the currently visible profile.

The agent workspace pulls that exact revision, works through QuickMaths WebMCP tools, and publishes `agent-state.json`. The learner accepts it only when it was based on the current learner revision and no local changes are waiting to sync.

Agent-side changes are transactional: tool calls mark the workspace dirty but never trigger the learner's automatic debounce. Nothing reaches `agent-state.json` until the agent or human explicitly calls `publish_agent_checkpoint` / **Publish agent checkpoint**.

## What you need

- A GitHub account.
- Your QuickMaths Pages fork, or the public QuickMaths site for testing.
- A separate private repository such as `quickmaths-sync`, initialized with a README so its `main` branch exists.
- A fine-grained GitHub personal access token limited to that one data repository with **Contents: Read and write** for the learner phone. No Actions, administration, account, or source-repository access is needed.
- For the remote-agent flow: a computer running a Codex task with its in-app browser open to the Agent Bridge. External browser tabs cannot expose the WebMCP tools. The computer and task must remain available while you continue it remotely from your phone.
- The QuickMaths source checkout and Git command-line access to the private data repository on that computer. Git Credential Manager or `gh auth login` can supply the host credential.

## One-time setup

1. On GitHub, create a **private** repository named `quickmaths-sync`. Turn on **Add a README file** and keep the default `main` branch.
2. Open GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
3. Create a token with a sensible expiry. Under repository access, choose **Only select repositories** and select `quickmaths-sync`.
4. Under repository permissions, set **Contents** to **Read and write**. Leave everything else at its minimum.
5. In the learner app, open **Settings → Workspace Storage**. Enter the owner, private repository, `main`, and token. QuickMaths verifies privacy and write access before saving the connection. On a personal phone, **Remember token on this device** enables background reconnects. Leave it off on shared devices.
6. The first connection asks which copy wins only when both the browser and GitHub already contain learner data. Read the labels carefully. Git history keeps the replaced remote version, but a downloaded JSON backup is still the easiest recovery file.
7. On the agent computer, run the following from the QuickMaths source checkout, replacing the repository URL:

   ```powershell
   python -m quickmaths.cli agent-bridge --repo https://github.com/YOUR-NAME/quickmaths-sync.git
   ```

8. Open the printed `http://127.0.0.1:.../agent-bridge.html#local=...` URL as the top-level page in the Codex built-in browser. The fragment is a short-lived local capability, not a GitHub credential; the page immediately removes it from browser history. The workspace connects and pulls automatically.

The older all-browser route remains available at `/agent-bridge.html`, but it needs a second copy of the fine-grained token in that browser. The CLI route is preferred for Codex because it reuses host Git authentication and never exposes the GitHub token to JavaScript or WebMCP.

## Start the agent task

Keep the Agent Bridge as a top-level browser page and use this starting prompt:

> You are my QuickMaths learning agent. Open the QuickMaths Agent Bridge in the ChatGPT or Codex in-app browser and keep that already-open tab as the top-level page; external browser tabs cannot expose WebMCP tools. First call `get_agent_guide` with `section: "summary"`, then call `sync_from_learner` before inspecting progress, recommending work, or tutoring. Use only the registered QuickMaths tools to read or change learning state. Tutor Socratically, never reveal pre-submission answer keys, and preserve the learner's subject and Hard/Open path choices. After any saved feedback, follow-up problem, preference change, or staged lesson set, call `publish_agent_checkpoint`. If sync reports a conflict, pull the learner again and repeat the intended change from current state; never force stale output over learner work. Recommend a downloadable JSON backup at natural stopping points.

The bridge page exposes the 17 learning tools plus:

- `get_bridge_sync_status` — inspect connection, dirty state, and revision timing.
- `sync_from_learner` — pull the authoritative learner checkpoint before work.
- `publish_agent_checkpoint` — publish changes based on that learner revision.

Codex Remote continues the task that is running on the computer; it does not make a static GitHub Pages tab execute a local agent by itself. The host computer still needs to be online, signed in, and running the task with the Agent Bridge open.

## Conflict and recovery rules

- The app never merges arbitrary JSON fields. A complete checkpoint wins only after a verified handoff.
- A learner device cannot apply agent output while local changes are unsynced.
- An agent cannot publish if the learner repository revision changed after its last pull.
- An agent response based on an older learner revision is marked as seen and ignored without changing learner data; the agent must pull the current learner checkpoint and repeat its intended action.
- A second learner device cannot overwrite a newer GitHub learner file without an explicit choice.
- After the learner chooses **Load GitHub copy** or **Use this device**, that choice resolves the initial handoff immediately; a narrowly raced GitHub write is retried once only for this explicit human-approved resolution.
- `learner-state.json` and `agent-state.json` contain learning records, not the GitHub token.
- Repository history is a recovery trail, not a substitute for the app's **Download JSON backup** button.

If the bridge reports a conflict, stop editing on one side, click **Sync now** on the learner, then call `sync_from_learner` on the agent and repeat the intended agent action.

## Security model

The phone token is a bearer credential. Anyone who obtains it can do whatever its GitHub permissions allow. Restricting it to a dedicated private data repository keeps the blast radius away from the QuickMaths source fork. The learner app stores the token in `sessionStorage` by default or `localStorage` only after the human checks **Remember**; it is never put in a cookie, app backup, lesson set, synced state file, URL, or WebMCP tool output.

The local Codex transport binds only to `127.0.0.1`, accepts exactly `learner-state.json` and `agent-state.json`, requires an unguessable per-process capability, rejects cross-origin writes, and performs Git without shell execution or interactive prompts. Git credentials stay in the operating system's Git credential manager. Stop the command with `Ctrl+C` when the agent session is finished.

Revoke the token from GitHub immediately if a device is lost or the token may have been exposed. Disconnecting QuickMaths removes its local copy but does not revoke the credential at GitHub.

## Cost and limits

The bridge has no QuickMaths server or model API bill. It uses static GitHub Pages and ordinary Git commits in the selected repository. Learner checkpoint writes are debounced to avoid one commit per keystroke; agent publication remains explicit. Polling backs off when nothing changes. GitHub's current account and API limits still apply.
