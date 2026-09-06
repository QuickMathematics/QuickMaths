# Lesson illustration coverage

Completed 6 September 2026, following the audit of commit `1566d69`.

## Lesson pages

| Library | Lessons | Illustrated before | Illustrated now |
| --- | ---: | ---: | ---: |
| Native Mathematics | 63 | 16 | 63 |
| Programming | 28 | 0 | 28 |
| Optional Geography | 15 | 0 | 15 |
| Optional Estimation Lab | 1 | 0 | 1 |
| **Total** | **107** | **16** | **107** |

The new library contains **109 Matplotlib SVG figures for 97 lessons**: the 91 previously empty lessons and extra views for the six illustrated trigonometry lessons. Original embedded Geometry figures remain available.

Coverage includes fraction strips, multiplication and division models, percent grids, substitution and balance diagrams, area models, interval unions, sign charts, sequences, exponential/logarithmic curves and domains, rational holes/asymptotes, quadratic roots/vertices/optimization, function mappings and all three linear-system cases.

Programming figures cover all 28 lessons, including aliases and copies, nested records, object instances, control flow, files and exceptions, growth rates and binary search, generator state, recursion traversal, stack unwinding and memoization. Geography diagrams cover all 15 optional lessons and distinguish conceptual models from measured or navigational data.

The six trigonometry lessons now also include special triangles/elevation, radian arcs/reference turns, period/phase comparisons, signed quadrant components, multiple cycles/tangent, and SSA/area views.

## Assessments

- Existing coverage remains: 48 coordinate/line scenarios, 18 selected bearing/arc/sphere scenarios, and four authored triangle-area diagrams.
- **73 of 79 trigonometry scenarios** now have diagrams reconstructed from displayed givens: 12 right-triangle, 12 radian/unit-circle, 13 graph, 7 quadrant/ratio, 13 equation and 16 oblique-triangle scenarios.
- Six abstract identity questions retain text/choices. A generic picture would either add no useful information or reveal the identity being tested.
- Eleven additional triangle-area scenarios have diagrams for stated lengths, missing dimensions, unit conversions and a corner cutout. Authored figures take precedence.
- Saved drafts and results reconstruct the original picture from the saved prompt. Answer keys, hidden generator values and response choices never supply diagram labels.

## Delivery and authoring

The app loads the new library from `assets/media/lesson-illustrations/` as figures approach the viewport. Assets have content-hashed filenames, SHA-256 verification, dimensions, alternative descriptions and teaching captions. No Python executes in the learner's browser.

Known lessons match by ID and a compatibility fingerprint of their name, theory and worked examples. Edited native overrides do not receive automatic additions. Existing installed Programming lessons gain figures without reinstalling or rewriting the published pack, learner progress or private workspace. Optional packs gain their figures when installed.

Studio copies include matching figures as ordinary hosted media assets, preserving existing embedded media and another publisher's asset base URL. Already included figures are not duplicated. Normal media limits still apply. Hosted figures require the published files to remain available; caching is not an offline guarantee.

Rebuild with `python -m scripts.build_lesson_illustrations`. For local visual review, add `--preview-dir tmp/illustration-previews`.

## Verification

Automated checks cover all 107 lessons, source compatibility, asset sizes/digests, imports/exports/backups, duplicate suppression and 100 randomized retakes for every spatial trigonometry scenario. Figures receive a rendered layout review, with browser checks for image loading, narrow widths and assessment labels.
