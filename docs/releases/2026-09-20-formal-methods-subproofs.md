# Method assessment and learner subproof controls

## Implemented

- Adds structural method grading for induction, cases, negation by contradiction,
  universal introduction, implication and existential elimination. The last root
  step establishing the exact goal must use the required closing rule. Decorative
  or overwritten method steps fail. An exact final wrapper is deliberately not
  accepted as the required closing rule.
- Requires the existing fresh submitted Lean certificate independently of method
  matching. Unknown policy fields/methods remain blocked. Policy changes are part
  of runtime identity; edit, restore and replay boundaries remain intact.
- Adds native open/close subproof RPC operations using existing normalization,
  scope, discharge and preflight checks. Root assumptions cannot be added by
  these operations. Cases split a visible disjunction into isolated children.
- Adds learner controls for nested scopes, local assumptions and binders, cases,
  closing rules and scoped fact selection. Closings require a cited fact in the
  selected child. Existing steps can be repaired; scopes survive saved drafts.
- Adds Studio's method selector and applies the method gate to checked references.
- Repackages and pins the native browser verifier adapter; no Lean rules,
  generator, runtime environment, certificate format or mathematical coverage
  changed.
- Updates authoring/student/educator guides, PDFs, manifest and schema guidance.

## Explicit limits

Method grading checks a defined proof structure, not arbitrary pedagogical
quality or mental reasoning. Derivative-definition grading remains unsupported.
The contradiction option currently proves a negation via not_intro; it is not
an unrestricted classical proof-by-contradiction strategy. Scoped author reference
steps remain outside the existing reference-step schema; bounded search can
supply references for supported goals, with the method checked separately.

## Focused validation

- 127 JavaScript controller, certificate-client, method, workspace and Studio tests.
- 26 native interactive/scope/quantifier/case/induction tests.
- Six real browser Lean proofs, one per supported method, with assessment credit
  issued only after verification and withheld after restoration.
- Actual learner-page open/close subproof interaction passed.
- No full corpus or long phone suite rerun; iPhone support remains deferred.

See scripts/test_browser_formal_methods.py and the adjacent JSON evidence file.
