## What this changes

<!-- For lesson submissions, name the package ID and version. -->

## Lesson Depot checklist

- [ ] I have the right to publish all submitted lesson content under its declared license.
- [ ] The lesson uses declarative `quickmaths.lesson-set` schema 2.0; it contains no scripts or remote executable content.
- [ ] I ran `python -m scripts.lesson_depot docs/lesson-depot --output docs/lesson-depot`.
- [ ] I ran `node scripts/validate_lesson_depot.mjs docs/lesson-depot` to check every package and the combined prerequisite graph.
- [ ] I ran the focused Python tests and `npm test` inside `docs/`.
- [ ] I did not include learner progress, tokens, credentials, or private assessment material.
