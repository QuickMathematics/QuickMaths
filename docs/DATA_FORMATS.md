# Data Formats

Content is YAML. Runtime progress is SQLite. Portable outputs are CSV and Markdown.

Important local files:

- `content/**/track.yaml`: track metadata and skill ordering.
- `content/**/skills/*.yaml`: skill metadata, theory, examples, and tests.
- `data/quick_maths.sqlite`: local user, attempts, attempt questions, and progress.
- `data/exports/progress.csv`: current progress state.
- `data/exports/attempts.csv`: test attempt history.
- `data/exports/latest_tutor_summary.md`: latest AI tutor handoff.

Attempt question rows store final answers and work separately:

- `user_final_answer`: learner final answer, autograded when possible.
- `user_work`: optional or required shown work/proof text for tutor review.
- `answer_mode`: response mode from the question YAML.
- `work_review_status`: `not_required`, `submitted_for_tutor_review`, or `missing_required_work`.
- `work_check_status`: detailed work/proof status such as `correct`, `incorrect`, `uncertain`, or `pending_review`.
- `review_required` / `review_completed`: review workflow flags.

Reviews live in the `reviews` table and store reviewer type, verdict, score, confidence, obligation results, and feedback.
