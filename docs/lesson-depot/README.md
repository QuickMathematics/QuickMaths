# QuickMaths Lesson Depot

The Lesson Depot is a zero-cost, open-source catalog of declarative QuickMaths lesson sets. Anyone can browse and install without signing in. Submissions use pull requests, while an optional least-privilege GitHub App lets a signed-in user vote with a 👍 reaction and comment on the matching GitHub Discussion from inside QuickMaths.

## Package layout

```text
docs/lesson-depot/lessons/<slug>/<version>/
  metadata.json
  lesson-set.json
```

`metadata.json` must contain `id`, `slug`, `version`, `name`, `author`, `license`, `description`, `tags`, `published_at`, and `updated_at`. Lesson content should use an explicit open content license such as CC BY 4.0. Code in this repository remains MIT licensed.

The lesson file must follow `quickmaths.lesson-set` schema 2.0 and pass the same complete validator used by local uploads and WebMCP staging. See the [Agent Lesson Authoring Guide](../CUSTOM_LESSON_SETS.md).

The published Programming Fundamentals pack demonstrates the richer schema without adding an executable package format: `prompt_blocks` preserve code formatting, `code_trace_steps` grade declarative state tables without running package code, and `python_program` supplies only a pure-function signature plus JSON test data. Learner Python runs separately in a disposable browser Worker under QuickMaths' trusted AST supervisor; lesson authors cannot provide a test harness or arbitrary grader code.

`showcase.json` contains metadata-only **Concept preview** cards used to exercise the populated Depot layout and communicate possible future subjects. They are visually distinct, have no lesson file or community thread, cannot be previewed, staged, or installed, and must use `PACK_PREVIEW_*` IDs plus a preview semantic version. Remove a concept card when its complete reviewed package is published.

## Build and validate

From the repository root:

```powershell
python -m scripts.lesson_depot docs/lesson-depot --output docs/lesson-depot
node scripts/validate_lesson_depot.mjs docs/lesson-depot
python -m pytest
cd docs
npm test
```

The catalog contains a SHA-256 hash for each reviewed file. QuickMaths checks that hash and then runs its local lesson validator before showing the install confirmation. A least-privilege Action creates a matching GitHub Discussion titled `[Lesson] PACK_ID` for each accepted catalog entry, then materializes its 👍 vote and comment totals into `community.json` for anonymous browsing. Connected users fetch the selected live thread only when they open its community panel.

## Community flow

1. Build and validate in Lesson Studio or with the authoring guide.
2. Submit one package in a pull request.
3. Automated checks verify the package and deterministic catalog.
4. Maintainers review and merge.
5. A matching GitHub Discussion carries votes, comments, questions, and future update notes.

## In-app community authorization

The Community GitHub App is installed only on `QuickMathematics/QuickMaths` and requests only repository Discussions read/write. The user access token is separate from the optional learner-storage bridge token. QuickMaths keeps it in `sessionStorage` by default, or in `localStorage` only when the user explicitly chooses to remain connected. It is never placed in a lesson file, learner backup, WebMCP response, URL, or Git commit.

The static callback uses the OAuth authorization-code flow with state and PKCE. A free, stateless Cloudflare Worker holds the GitHub App client secret and performs only code exchange and token refresh; it has no database and retains no user token. Comments and 👍 votes are public GitHub actions attributed to the authorizing GitHub account. Disconnecting clears the browser copy, and GitHub authorization can also be revoked from GitHub settings.

Answer keys are necessarily present in author packages. Do not paste raw lesson files into learner tutoring conversations or reveal solutions before submission.
