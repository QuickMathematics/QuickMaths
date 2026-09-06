# QuickMaths Bridge

QuickMaths Bridge turns a free GitHub repository into a small, auditable handoff channel between a learner's browser and an agent workspace. It does not run a model, host a backend, or expose the learner's browser to the internet.

The learner page remains local-first. Normal actions save instantly in browser storage, then a short debounce writes a complete workspace checkpoint to `learner-state.json`. That checkpoint includes every learner and educator profile, curriculum, attempt, review, installed pack, map plan, and supplemental educator guidance stored for QuickMaths on this browser origin. It is not scoped to the currently visible profile.

At the start of each prompt, the agent calls `begin_agent_task`. This records the UTC start time locally, then pulls the starting learner revision. After working through QuickMaths tools, the agent publishes `agent-state.json` with that original `task_started_at`, `base_learner_sha`, and the finished `app_state`. The timestamp is pushed with the update; no separate start-time commit is needed.

Agent-side changes are transactional: tool calls mark the workspace dirty but never trigger the learner's automatic debounce. Nothing reaches `agent-state.json` until the agent or human explicitly calls `publish_agent_checkpoint` / **Publish agent checkpoint**.

## What you need

- A GitHub account.
- Your QuickMaths Pages fork, or the public QuickMaths site for testing.
- A separate private repository such as `quickmaths-sync`, initialized with a README so its `main` branch exists.
- A fine-grained GitHub personal access token limited to that one data repository with **Contents: Read and write** for the learner phone. No Actions, administration, account, or source-repository access is needed.
- For the remote-agent flow: a computer running a Codex task with its in-app browser open to the Agent Bridge. External browser tabs cannot expose the WebMCP tools. The computer and task must remain available while you continue it remotely from your phone.
- The QuickMaths source checkout and Git command-line access to the private data repository on that computer. Git Credential Manager or `gh auth login` can supply the host credential.

## One-time setup

Complete first-time agent-in-the-loop setup on the computer that will remain online. A phone can continue an already-prepared remote task, but it cannot create the first desktop WebMCP session.

1. On GitHub, create a **private** repository named `quickmaths-sync`. Turn on **Add a README file** and keep the default `main` branch.
2. Open GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
3. Create a token with a sensible expiry. Under repository access, choose **Only select repositories** and select `quickmaths-sync`.
4. Under repository permissions, set **Contents** to **Read and write**. Leave everything else at its minimum.
5. In the learner app, open **Settings → Workspace Storage**. Enter the owner, private repository, `main`, and token. QuickMaths verifies privacy and write access before saving the connection. On a personal phone, **Remember token on this device** enables background reconnects. Leave it off on shared devices.
6. The first connection opens a merge window when both the browser and GitHub already contain independent learner data. Choose which changed items to keep from each side. Git history keeps the replaced remote version, but a downloaded JSON backup is still the easiest recovery file.
7. On the agent computer, run the following from the QuickMaths source checkout, replacing the repository URL:

   ```powershell
   python -m quickmaths.cli agent-bridge --repo https://github.com/YOUR-NAME/quickmaths-sync.git
   ```

8. Open the printed `http://127.0.0.1:.../agent-bridge.html#local=...` URL as the top-level page in the Codex built-in browser. The fragment is a short-lived local capability, not a GitHub credential; the page immediately removes it from browser history. The workspace connects and pulls automatically.

The older all-browser route remains available at `/agent-bridge.html`, but it needs a second copy of the fine-grained token in that browser. The CLI route is preferred for Codex because it reuses host Git authentication and never exposes the GitHub token to JavaScript or WebMCP.

## Prepare the remote computer

Before leaving the computer on for a phone session:

- Save work and close only applications or high-load processes you recognize and do not need. In Task Manager, never end Windows, security, driver, Git credential, browser, Codex, or remote-session processes. The agent must not terminate processes without explicit human approval.
- Temporarily set Sleep to **Never** and disable hibernation for the duration of the remote session. Keep a laptop plugged in and ventilated. Restore normal power settings when you return.
- Prepare lesson packages on the desktop. For security, an agent may stage packages only in the desktop QuickMaths session and a human must approve each installation in the visible app. If you will work from mobile, install and approve the required packs yourself first, then tell the agent to build the custom curriculum from the installed library.

## Start the agent task

Keep the Agent Bridge as a top-level browser page and use this starting prompt:

> You are my QuickMaths learning agent. Open the QuickMaths Agent Bridge in the ChatGPT or Codex in-app browser and keep that already-open tab as the top-level page; external browser tabs cannot expose WebMCP tools. For every new prompt, first call `begin_agent_task` to note the start time locally and pull the starting learner revision, then call `get_agent_guide` with `section: "summary"` before inspecting progress, recommending work, or tutoring. Use only the registered QuickMaths tools to read or change learning state. Tutor Socratically, never reveal pre-submission answer keys, and preserve the learner's subject and Hard/Open path choices. After any saved feedback, follow-up problem, preference change, or staged lesson set, call `publish_agent_checkpoint`. Push the original task start time with your finished work. If the learner kept working, their app will open a merge window. Never force over another agent checkpoint. Recommend a downloadable JSON backup at natural stopping points.

The bridge page exposes the QuickMaths learning and authoring tools plus:

- `begin_agent_task` — first action for each prompt; note the start time locally and load the learner checkpoint.
- `get_bridge_sync_status` — inspect connection, dirty state, and revision timing.
- `sync_from_learner` — pull the authoritative learner checkpoint before work.
- `publish_agent_checkpoint` — publish changes based on that learner revision.

Codex Remote continues the task that is running on the computer; it does not make a static GitHub Pages tab execute a local agent by itself. The host computer still needs to be online, signed in, and running the task with the Agent Bridge open.

## Conflict and recovery rules

- The app compares both the current GitHub learner snapshot and the local device with the task's starting revision. If unchanged, the agent update is applied automatically. Timers and viewport changes alone do not cause a merge.
- If either contains other changes, the app opens a merge window on the current page. It preserves the original local workspace until the merge is successfully saved.
- The comparison describes individual changes with checkboxes: profile preferences, curriculum settings, lesson text and questions, mastery updates, feedback, test attempts, unfinished tests, queued lesson sets, map notes, node positions, paths, and hidden lessons. Independent changes are checked by default; unchecking restores that item's starting value. A GitHub note and two local node moves can all be kept together. Overlapping edits and deletions require one choice, or **Keep the starting value**. Complete questions, attempts, feedback assessments, unfinished tests, and paired mastery level/score values stay together to avoid invalid combinations.
- **Keep all independent changes** and **Uncheck independent changes** adjust checkboxes without resolving conflicts. Activity history is combined automatically; device navigation and session time remain local. **Save merged workspace** saves the chosen combination to GitHub and this device. **Not now** leaves synchronization paused; reopen it with **Compare versions** in Settings.
- Missing starting Git history requires explicit two-way choices for every difference. A timestamp alone never authorizes overwriting learner work.
- If either remote revision or meaningful local content changes during review, refresh the comparison. Writes use GitHub's expected file SHA and never retry by overwriting an unseen revision. Failed writes leave local work intact.
- Selecting incompatible dependencies, such as keeping progress but removing its lesson set, is rejected before saving. Keep the related profile, curriculum and lesson set too, or discard that work in the comparison.
- Resolved agent checkpoints record the same revision in `applied_agent_sha` and `resolved_agent_sha` in the canonical learner envelope. This includes an explicit choice to skip a change, so other devices respect that choice. Older clients sometimes recorded a merely seen revision as applied; without the matching resolution marker, differing agent content must be checked again.
- **Sync now** checks both the shared learner workspace and agent updates before pushing. A pending agent update blocks a learner push until it is applied or reviewed; pushing cannot dismiss the comparison.
- Agent work can publish even if the learner changed during the prompt. An unpublished task must be published before starting another. Another agent's concurrent checkpoint cannot be overwritten silently.
- The two checkpoint files contain learning records, not the GitHub token. Repository history remains a recovery trail; downloadable JSON backups are still useful.

## Security model

The phone token is a bearer credential. Anyone who obtains it can do whatever its GitHub permissions allow. Restricting it to a dedicated private data repository keeps the blast radius away from the QuickMaths source fork. The learner app stores the token in `sessionStorage` by default or `localStorage` only after the human checks **Remember**; it is never put in a cookie, app backup, lesson set, synced state file, URL, or WebMCP tool output.

The local Codex transport binds only to `127.0.0.1`, accepts exactly `learner-state.json` and `agent-state.json`, requires an unguessable per-process capability, rejects cross-origin writes, and performs Git without shell execution or interactive prompts. Git credentials stay in the operating system's Git credential manager. Stop the command with `Ctrl+C` when the agent session is finished.

Revoke the token from GitHub immediately if a device is lost or the token may have been exposed. Disconnecting QuickMaths removes its local copy but does not revoke the credential at GitHub.

## Cost and limits

The bridge has no QuickMaths server or model API bill. It uses static GitHub Pages and ordinary Git commits in the selected repository. Learner checkpoint writes are debounced to avoid one commit per keystroke; agent publication remains explicit. Polling backs off when nothing changes. GitHub's current account and API limits still apply.
