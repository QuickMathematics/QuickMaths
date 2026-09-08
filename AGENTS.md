# Workspace

- Avoid writing files to C:. Keep temporary work on X: or F:.
- Record the task start in `agent-task.json` before changing project content. Preserve that start time while completing and publishing the same update.

# Publishing

- Prefer direct Git fetch/push through the repository's configured Git Credential Manager. Browser sign-in and the ChatGPT GitHub connector do not authenticate command-line Git.
- This checkout uses the QuickMathematics account and a Windows DPAPI-encrypted credential store under the ignored `.bridge-runtime/git-credentials/` directory. Never read, print, commit, or upload credential files.
- For routine publishing, use noninteractive Git. If authentication fails, diagnose the credential helper and restore its login; do not default to bulk browser uploads.
- Follow `docs/GITHUB_PUBLISHING.md` for setup and verification. Use `codex/` branches for changes that need review, run the relevant checks, and verify the remote commit after publishing.

# Validation

- Keep testing proportional to the change. For small updates, run focused relevant tests and targeted browser checks; do not rerun the full suite on every push unless broader risk or failures justify it.
