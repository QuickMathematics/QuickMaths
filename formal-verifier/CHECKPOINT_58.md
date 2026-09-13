# Checkpoint 58 — one residual factorial power via exact ratio growth/decay

This checkpoint extends checkpoint 57 only at the residual factorial-multiplicity boundary. It still uses exact ratio-test reconstruction and adds no Stirling approximation.

## Added

After same-shift cancellation and deterministic quotient splitting, the matcher may now accept **exactly one** unmatched shifted-factorial power.

- One extra denominator factorial contributes `1 / (n+k+1) -> 0`. Lean multiplies that reciprocal-linear limit by the already-checked polynomial quotient, geometric normalization, and balanced factorial-quotient limits, so the complete successive norm ratio tends to `0` and the series is summable.
- One extra numerator factorial contributes `n+k+1 -> +∞`. Lean proves the complete norm ratio tends to `Filter.atTop`, obtains an eventual lower bound `2 <= ||a_(n+1)|| / ||a_n||`, reconstructs the eventual nonzero tail, and applies `not_summable_of_ratio_norm_eventually_ge`.

The balanced quotient factors still remain explicit proof metadata, and the generated theorem still targets the learner's original factorial expression. Every factorial cancellation is justified from named `Nat.factorial_succ` recurrences, exact factorial nonzero facts, `field_simp`, and ring normalization.

## Preserved boundaries

Residual factorial-power imbalance of magnitude two or greater is still rejected. Existing source-size caps remain in force, as do the restrictions against non-affine factorial arguments, zero/symbolic factorial powers, zero geometric bases, non-polynomial residual denominators, and general factorial/Stirling asymptotics.

The finite ratio-test boundary `L = 1` remains unchanged for balanced families. The new numerator-imbalance branch is not represented as a fake finite limit; its ratio is explicitly reconstructed as tending to `Filter.atTop`.

## Validation

Focused regressions cover one extra denominator power, one extra numerator power, composition with polynomial quotients and geometric normalization, imbalance-two refusal, and the public `prove_text` path. The pinned mathlib revision contains the divergence theorem and positive-constant/`atTop` multiplication lemmas used by the generated artifact. No certificate is emitted without the pinned Lean/mathlib kernel.
