# QuickMaths Lesson Depot

The Lesson Depot is a zero-cost, open-source catalog of declarative QuickMaths lesson sets. The browser never receives a GitHub write token: anyone can browse and install, while submissions use pull requests and community voting/comments use GitHub Discussions.

## Package layout

```text
docs/lesson-depot/lessons/<slug>/<version>/
  metadata.json
  lesson-set.json
```

`metadata.json` must contain `id`, `slug`, `version`, `name`, `author`, `license`, `description`, `tags`, `published_at`, and `updated_at`. Lesson content should use an explicit open content license such as CC BY 4.0. Code in this repository remains MIT licensed.

The lesson file must follow `quickmaths.lesson-set` schema 2.0 and pass the same complete validator used by local uploads and WebMCP staging. See the [Agent Lesson Authoring Guide](../CUSTOM_LESSON_SETS.md).

## Build and validate

From the repository root:

```powershell
python -m scripts.lesson_depot docs/lesson-depot --output docs/lesson-depot
node scripts/validate_lesson_depot.mjs docs/lesson-depot
python -m pytest
cd docs
npm test
```

The catalog contains a SHA-256 hash for each reviewed file. QuickMaths checks that hash and then runs its local lesson validator before showing the install confirmation. A least-privilege scheduled Action reads matching GitHub Discussions titled `[Lesson] PACK_ID` and materializes their 👍 reaction and comment totals into `community.json`; the public app never spends GitHub API quota per page view.

## Community flow

1. Build and validate in Lesson Studio or with the authoring guide.
2. Submit one package in a pull request.
3. Automated checks verify the package and deterministic catalog.
4. Maintainers review and merge.
5. A matching GitHub Discussion carries votes, comments, questions, and future update notes.

Answer keys are necessarily present in author packages. Do not paste raw lesson files into learner tutoring conversations or reveal solutions before submission.
