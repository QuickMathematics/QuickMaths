# Formal teaching usability update

- Adds sin/cos (radians), exp and natural log to the allowlisted Cartesian grammar
  in Python and JavaScript. Domain gaps, poles, overflow and trig extrema are
  handled by interval evaluation. No package code is executed.
- Corrects native x**0 interval evaluation to match the browser.
- Adds Select facts to cite to the learner editor. It offers root assumptions and
  earlier root steps, excludes the edited step and later/local steps, and uses
  the existing draft-edit path to withdraw stale verification.
- Updates Studio graph help, schema descriptions, authoring/student/educator
  guides and PDFs, and distinguishes production browser verification from the
  assessment-ineligible experimental harness.
- Documents that allowed-rule restrictions do not establish method compliance.
  Nonempty assessment_policy remains blocked. Full subproof construction and
  semantic method enforcement are not implemented in this focused update.

Validation: 32 focused JavaScript graph/proof-workspace tests and six Python
lesson-display tests pass. Includes 100 input intervals for each elementary
function, log/overflow cases, pole segmentation and fact-scope restrictions.
No full Lean or phone corpus rerun; certificate/kernel code is unchanged.
