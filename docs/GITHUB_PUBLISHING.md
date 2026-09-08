# Direct GitHub publishing

Publish this repository with command-line Git and Git Credential Manager (GCM). Signing into GitHub in a browser does not sign Git in, and the ChatGPT GitHub connector has its own permissions.

The default Windows Credential Manager store can fail in a remote or noninteractive Windows session. This checkout instead uses GCM's Windows DPAPI-encrypted files, kept on X: under a directory already excluded by `.gitignore`.

## One-time setup for this checkout

Run from `X:\QuickMaths`:

```powershell
git config --local credential.credentialStore dpapi
git config --local credential.dpapiStorePath X:/QuickMaths/.bridge-runtime/git-credentials
git config --local credential.https://github.com.username QuickMathematics
git credential-manager github login --username QuickMathematics --device --no-ui
```

Complete the device authorization on GitHub as **QuickMathematics**. Keep tokens out of chat, scripts, remote URLs, and Git commits. DPAPI credentials are bound to the Windows user; copying this folder to a different user or machine is not a login migration. A fresh checkout needs its own local configuration.

## Verify and publish

```powershell
git credential-manager github list
git -c credential.interactive=never push --dry-run origin HEAD
git -c credential.interactive=never push origin HEAD
```

Select the intended branch, review the diff, and run relevant checks before the actual push. Fetch and compare the remote revision afterward. The dry run authenticates without uploading a commit.

In Codex, run authenticated Git commands in the approved host execution context. The restricted sandbox can report `Key not valid for use in specified state` when reading the host user's DPAPI store even though login succeeded. Retry the Git operation in the host context; do not replace or expose the stored credential.

If login expires, repeat the device login. If the wrong account is selected, check the repository-local username setting. If GCM reports `wincredman`, verify that these commands are running in the configured checkout. Do not fall back to manually uploading the repository through a browser.

Reference: [GCM credential stores](https://github.com/git-ecosystem/git-credential-manager/blob/main/docs/credstores.md).
