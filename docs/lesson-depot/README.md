# QuickMaths Lesson Depot

The Lesson Depot is a zero-cost, federated marketplace of declarative QuickMaths lesson sets. Authors keep immutable packages in their own public GitHub repositories. QuickMaths combines the official catalog, automatically discovered community registries, and registries a learner subscribes to directly. Browsing and installation require no account; the optional least-privilege GitHub App provides public recommendations, flags, and comments inside the app.

## Publish inside QuickMaths

Choose **Publish a lesson** in the Depot or **Publish to Lesson Depot** in Lesson Studio. Open a lesson JSON file or use the current Studio draft, connect a GitHub publishing token, choose a public repository and license, then validate and review the release. The final button creates the repository if needed, uploads the lesson and registry in separate commits, and creates or updates the `[Registry]` submission automatically. No manual file upload, hashing, or Discussion editing is needed.

GitHub still requires a one-time credential setup: the dialog links to a personal access token (classic) with `public_repo` and `write:discussion`. These scopes permit writes to public repositories the account can access. The token is held only in memory and sent only to `api.github.com`; closing the page or choosing **Disconnect publishing** clears it. Publishing does not reuse the private Workspace Storage token or change the Community GitHub App’s permissions. GitHub's [repository API](https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user) handles repository creation, and its [Discussions API](https://docs.github.com/en/graphql/reference/discussions) handles the submission.

The review names the destination, author, license, lessons, question count and public files, and shows the exact validated lesson JSON including answers. Only schema-approved lesson content is exported; learner state, workspace backups and arbitrary imported metadata are excluded. New add-on IDs receive a stable repository-specific namespace, including prerequisite links between packages already published in that registry. Native improvements retain their native skill IDs and pass the same native-identity and combined-graph checks as installation.

Existing release files are never overwritten. Increase the release version to change content or licensing. Publishing reuses completed uploads after a failed request, preserves earlier registry entries, checks for concurrent changes, and looks up an existing submission before creating another. If a step fails, choose **Validate and review publication** again and retry. Public publication receipts are stored locally, without tokens or lesson contents, so **Recent publications** can check discovery after a reload.

**Uploaded and submitted** means GitHub has the public files and registry submission. **Check publication status** distinguishes pending validation, a validation rejection for that registry revision, and an exact version/digest listed in the shared Depot. Users refresh the catalog and choose whether to install it. A listed release may still be hidden by community moderation filters.

## Registry format

Each publisher hosts a `quickmaths-registry.json` file using the normal catalog envelope plus a registry identity:

```json
{
  "format": "quickmaths.lesson-depot.catalog",
  "schema_version": "1.0",
  "registry": {
    "id": "github-owner/repository-name",
    "name": "Publisher display name",
    "namespace": "OWNER",
    "homepage_url": "https://github.com/github-owner/repository-name"
  },
  "packages": [
    {
      "id": "PACK_OWNER_TOPIC",
      "slug": "topic",
      "version": "1.0.0",
      "name": "Topic",
      "description": "A complete curriculum.",
      "author": "Publisher",
      "license": "CC BY 4.0",
      "lesson_url": "https://raw.githubusercontent.com/github-owner/repository-name/40_CHARACTER_COMMIT_SHA/topic/1.0.0/lesson-set.json",
      "sha256": "64_CHARACTER_LOWERCASE_SHA256",
      "subject_id": "SUBJECT_TOPIC",
      "subject_name": "Topic",
      "subject_theme": {
        "paperLight": "#fffdf8", "primary": "#153f36", "primaryAlt": "#205c4e",
        "tint": "#b8d9c9", "highlight": "#dceca9", "accent": "#df755b"
      },
      "tags": ["topic"],
      "skills": 1,
      "problems": 10,
      "published_at": "2026-09-03",
      "updated_at": "2026-09-03"
    }
  ]
}
```

The registry URL and every lesson URL must be pinned to complete commit SHAs in the same repository. Use a two-commit publication flow: first commit the final lesson file, then commit a registry that points to that immutable lesson commit and its SHA-256 digest. Pin the submitted registry URL to the second commit. `registry.id` must match the GitHub owner and repository in those URLs. Community package IDs use `PACK_NAMESPACE_*`; their authored skill IDs use `CUSTOM_NAMESPACE_*`. This prevents mutable content from inheriting another version's reviews and prevents accidental identity collisions.

Registries may retain multiple versions of a package. Every release must match its listing's ID and version and pass schema and reference checks. The Depot displays the latest version of each package; those selected versions must also form a valid combined prerequisite graph.

To join global discovery, create a QuickMaths Discussion titled `[Registry] Publisher name` manually on GitHub, or let the in-app **Publish a lesson** flow create it and provide the pinned registry URL. An Action treats every file as untrusted data, checks its URL boundary, size, digest, namespace, schema, and complete prerequisite graph, and writes a small static federation index. Valid work appears as **New** after automated validation and a catalog refresh, without a maintainer merge. Every exact package version receives a public discussion.

Users can also paste a public registry URL under **Settings → Manage lesson sources**. Direct subscriptions appear immediately and remain clearly marked **Subscribed**; they do not need the central discovery index.

## Official package layout

```text
docs/lesson-depot/lessons/<slug>/<version>/
  metadata.json
  lesson-set.json
```

This in-repository layout is reserved for first-party, migration, and reproducible-test copies. Community publishers use the federated registry format above instead of copying content into QuickMaths `main`. `metadata.json` must contain `id`, `slug`, `version`, `name`, `author`, `license`, `description`, `tags`, `published_at`, and `updated_at`. Set `distribution` to `federated` when a vendored fixture is published through an external registry; the builder still validates it but omits it from the official catalog. Lesson content should use an explicit open content license such as CC BY 4.0. Code in this repository remains MIT licensed.

The live federation fixture is [`QuickMathematics/QM_Dev_Depot`](https://github.com/QuickMathematics/QM_Dev_Depot). Its registry publishes immutable copies of Geography and Programming from a repository separate from QuickMaths `main`. `node scripts/test_live_federated_depot.mjs` performs an opt-in network test that discovers both, downloads and verifies their exact commits, validates their complete cross-subject graph, and stages them together for sequential human review.

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

The official catalog contains a SHA-256 hash for each reviewed file. QuickMaths checks that hash and then runs its local lesson validator before showing the install confirmation. One Action maintains the legacy first-party package threads and `community.json`; the federation Action separately creates a digest-bound `[Lesson] registry/PACK@version#digest` Discussion for every accepted external release and materializes its recommendation, flag, and comment totals into `federation.json`. Connected users fetch the selected live thread only when they open its community panel.

## Community flow

1. Build and validate in Lesson Studio or with the authoring guide.
2. Publish the lesson and registry in the author's own public GitHub repository.
3. Pin the lesson URL to its content commit and the registry URL to the later registry commit, then register the feed in a `[Registry]` Discussion.
4. Automated checks add every valid package to the federation index without a maintainer merge.
5. Each exact version and digest receives recommendations, flags, comments, questions, and update notes.

Three recommendations with at least a four-to-one recommendation/flag ratio mark a package **Community recommended**. Two serious flags that reach at least half the recommendation count mark it **Contested** and hide it from ordinary search. Contested work is not erased: users can reveal it deliberately in **Manage lesson sources**. Explain flags in comments so authors can correct their work. A corrected release uses a new semantic version, immutable URL, digest, and review thread.

## In-app community authorization

The Community GitHub App is installed only on `QuickMathematics/QuickMaths` and requests only repository Discussions read/write. The user access token is separate from the optional learner-storage bridge token. QuickMaths keeps it in `sessionStorage` by default, or in `localStorage` only when the user explicitly chooses to remain connected. It is never placed in a lesson file, learner backup, WebMCP response, URL, or Git commit. A recommendation uses 👍. A serious correctness, licensing, or safety flag uses 👎 and should be accompanied by an explanatory comment.

The static callback uses the OAuth authorization-code flow with state and PKCE. A free, stateless Cloudflare Worker holds the GitHub App client secret and performs only code exchange and token refresh; it has no database and retains no user token. Comments and 👍 votes are public GitHub actions attributed to the authorizing GitHub account. Disconnecting clears the browser copy, and GitHub authorization can also be revoked from GitHub settings.

Answer keys are necessarily present in author packages. Do not paste raw lesson files into learner tutoring conversations or reveal solutions before submission.
