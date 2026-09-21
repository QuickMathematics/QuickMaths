# Formal fixture registration and assessment sizing

- Registers `derivative_definition_square.json` in the positive kernel corpus alongside derivative fixtures. Strict fixture classification is unchanged, and a focused test checks complete classification and this fixture's positive membership. The batch runner inherits the new coverage.
- Preserves the exporter policy: formal-containing lessons retain configured `question_count` while exporting every template. The native browser selector now honors that count, uses distinct scenarios, and rotates through the full catalog across retakes before applying order randomization.
- Separates configured length, ordinary scenario coverage and complete catalog coverage in app tests. Added formal scenarios no longer inflate a single assessment or disappear from coverage.
- Ordinary questions still must pass their declared graders with their expected answers. Formal answer strings must fail ordinary grading and carry bound formal jobs. Existing formal controller tests exercise certificate-to-assessment and forged-status rejection separately.
- Documents the policy in the formal learning guide. No curriculum, certificate format, proof rules, or mathematical coverage changes.

Validation: four focused Python tests and nine targeted JavaScript tests passed. The real native per-request certificate check also passed for `derivative_definition_square.json`. This is not a claim that the full hosted CI workflow or later reference/replay gates have completed.
