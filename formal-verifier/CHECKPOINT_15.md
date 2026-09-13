# Checkpoint 15 — periodic residue-class divergence

Date: 11 September 2026

## Scope

This checkpoint generalizes the previous parity-only oscillation proof into a small reusable residue-class subsequence proof for exact periodic real sequences.

It deliberately stops at periods 2, 3, and 4. The goal is to establish the proof architecture and formal syntax without turning Python into a general periodicity oracle.

## Natural modulo in the formal expression language

The typed expression contract now has `mod_nat`, surfaced in text as `%`.

Modulo is intentionally restricted by the type checker to natural-number operands. For example,

`n % 3`

is a natural expression when `n : nat`, while modulo on a real expression is rejected during request normalization.

The JSON schema, learner text parser/renderer, preview renderer, Lean renderer, substitution/free-variable plumbing, symbolic candidate layer, and domain-analysis traversal all understand this node.

This is a semantic AST extension rather than a textual macro: Lean receives genuine natural-number `%`.

## Exact periodic divergence family

`sequence_elementary_divergence` now additionally recognizes exact rational-valued expressions whose dependence on the sequence index is entirely through one modulus `n % p`, where `p` is one of `2`, `3`, or `4`.

The recognizer evaluates the expression on each residue class using exact rational arithmetic. It accepts a no-finite-limit claim only if two residue classes have provably different exact values.

Examples in the acceptance corpus include:

- period 2: `if n % 2 = 0 then 7 else -3`;
- period 3: `0, 1, 2, 0, 1, 2, ...`;
- period 4: `1, 1, 5, 5, 1, 1, 5, 5, ...`.

A syntactically periodic but constant sequence is rejected as divergent. Modulus 5 remains outside this checkpoint. A sequence such as `real(n) + periodic_part(n)` is also rejected by this rule because its value is not determined solely by the residue class.

## Kernel reconstruction

Python does not certify the residue argument.

For two residue classes `r != s`, generated Lean:

1. assumes a finite limit `l`;
2. proves the index maps `k |-> p*k+r` and `k |-> p*k+s` tend to `atTop`;
3. composes the alleged limit with both maps;
4. simplifies `% p` using natural modulo lemmas to obtain two constant subsequences;
5. uses uniqueness of neighborhood limits to force `l` to equal both exact constants;
6. closes with exact arithmetic because those constants differ.

The proof uses `Nat.add_mod` and `Nat.mul_mod_right`, which are standard Lean natural-number lemmas. The strict kernel acceptance corpus is the final authority for elaboration.

## Parser boundary kept intentionally small

The school-text parser supports top-level piecewise expressions such as

`if n % 3 = 0 then 0 else if n % 3 = 1 then 1 else 2`.

This checkpoint does **not** add an inline piecewise parser for constructs such as `3 + 2 * (if ... then ... else ...)`. The typed AST can represent arithmetic around a piecewise node, and the periodic evaluator can reason about it, but expanding the textual grammar is a separate concern.

## Coverage

Positive kernel fixtures now include period-2, period-3, and period-4 modulo-periodic divergence.

Negative fixtures cover:

- a periodic expression that is actually constant;
- an otherwise valid exact periodic expression with modulus 5;
- a modulo-periodic perturbation plus the unbounded term `real(n)`.

The experimental lesson pack adds the period-three sequence `0,1,2,0,1,2,...` with a residue-subsequence reference proof.

## Validation

Local validation for this checkpoint:

- focused sequence/contract tests: **67/67 passed**;
- schema included in the focused gate: **69/69 passed**;
- complete formal verifier: **260/260 passed**;
- touched QuickMaths loader/bridge/example surfaces: **19/19 passed**;
- formal lesson/reference bridge: **33/33** reference proofs reach `ready_for_kernel`, **33/33** then stop at `verification_unavailable` with Lean absent, and **0** certificates are minted.

This container still has no Lean/Lake installation, so the newly generated periodic artifacts have not been kernel-compiled here. They are included in `scripts/kernel_acceptance.py` so a real pinned-toolchain run must certify them before production claims are made.

## Next small boundary

A natural next step is **subsequence divergence with vanishing perturbations**, such as `(-1)^n + 1/(n+1)` or a residue-periodic core plus a sequence already proved to tend to zero. That would reuse the new residue-class witness architecture while staying separate from infinite-series convergence.
