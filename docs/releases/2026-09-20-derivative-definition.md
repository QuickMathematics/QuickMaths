# Derivative-definition method grading

## Changes

- Adds the native `derivative_from_limit` rule. It cites a proved finite, two-sided punctured limit at zero of exactly `(f(a+h)-f(a))/h`, matching the derivative function, point and value. Additional domain restrictions and parameter capture are rejected.
- Generates the pinned Mathlib theorem `hasDerivAt_iff_tendsto_slope_zero.mpr`. Lean still checks the complete submitted proof and its allowed axioms; the certificate format and assessment trust boundary are unchanged.
- Adds `required_method: derivative_definition` to the method selector and assessment gate. The actual final goal step must use the bridge. A direct derivative shortcut or an unused definition step does not earn method credit.
- Adds the difference-quotient rule to learner controls and the simplified-expression input for `rational_hole_limit`.
- Infers both limits and derivatives capabilities in native lesson metadata and the browser. The combined exact-import environment reuses all 104 existing derivative packs (4,064 modules; 319,594,273 compressed bytes). No additional runtime/module download is needed; catalog metadata and the small verifier source archive are updated.
- Adds an importable example: `examples/derivative-definition.lesson-set.json`. It proves the derivative of x² at 3 by simplifying the quotient to h+6 on h ≠ 0, proving its limit, then citing it.
- Updates Studio, authoring and user guidance, manifest and schema guidance.
- Corrects an older calculus test assertion for the already shipped `public theorem` declaration format.

## Focused validation

- 10 new native guard tests passed, including wrong direction, point, value, quotient, denominator, extra domain restrictions, missing/extra citations and variable capture.
- 39 existing calculus, derivative and formal metadata tests passed.
- 99 JavaScript method, metadata, controller and proof-workspace tests passed.
- Actual native Lean accepted the generated square-function proof with only `propext`, `Classical.choice`, and `Quot.sound`.
- Actual desktop Chromium browser Lean accepted the same native-generated source. First request, including initialization, took 22.375 seconds on this test machine; this is not a mobile performance claim.
- A false limit was rejected without a certificate. The app blocked a polynomial-derivative shortcut and granted assessment eligibility to the correct definition-based submitted proof.
- The example pack passes the normal app import normalizer.
- Evidence: `2026-09-20-derivative-definition-evidence.json`. Reproduce with `scripts/test_browser_derivative_definition.py`; set `QM_BROWSER_TEST_DIR` to choose a drive with enough browser staging space. This run used F: because X: was nearly full.

## Scope

This is a precise structural method check plus kernel verification, not an arbitrary teaching-strategy or mental-reasoning grader. The bridge requires the exact authored quotient structure; equivalent rearrangements must first be presented in that form. Existing limit rules determine which quotient proofs can be constructed. No general epsilon-delta proof UI, one-sided derivative convention, or new physical-phone validation is claimed.

The previous method/subproof update is documented separately in `2026-09-20-formal-methods-subproofs.md`; its derivative-definition limitation is superseded by this update.
