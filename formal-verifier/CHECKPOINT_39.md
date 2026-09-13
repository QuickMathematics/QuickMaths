# Checkpoint 39 — shifted-power syntax and implicit Nat-to-Real polynomial coercions

This checkpoint does **not** add a new asymptotic theorem family. Inspection of
checkpoint 38 showed that exact shifted powers such as
`(real(n)+a)^k/(real(n)+b)^m * r^n` already normalize to the existing
polynomial-quotient ratio reconstruction whenever `k,m` are nonnegative
integers and `a,b,r` are exact rationals.

The missing piece was the public syntax boundary: ordinary student notation can
leave the bound natural index as bare `n` inside an otherwise real-coercible
series term. The exact polynomial normalizer now treats bare bound `n` and
explicit `real(n)` as the same polynomial indeterminate. The generated Lean
artifact still inserts/checks the Nat-to-Real coercion rather than trusting the
Python normalization.

## Newly accepted examples

- `(n + 1)^3 * (1/2)^n`;
- `((n + 1/2)^2 / (n + 3/2)^3) * (1/3)^n`;
- `((n - 1/2)^2 / (n + 5/2)^2) * 2^n` on the `L > 1` branch.

The first uses the existing polynomial-geometric quotient-limit proof. The
second and third use checkpoint 38's polynomial-quotient proof, including exact
rational coefficient reconstruction and eventual nonzero tail certificates.

## Trust boundary

Python only normalizes the bound index syntactically and recovers exact rational
coefficients. Lean still rebuilds the explicit `Polynomial ℝ` values and checks
all polynomial identities, tail nonzero certificates, quotient limits, and
Nat-to-Real coercions. The shifted-polynomial nonzero certificate now gives its
original expression an explicit `: ℝ` type annotation so bare-index syntax
cannot accidentally elaborate as Nat arithmetic inside the proof artifact.

## Deliberate ambiguity retained

Pure integer division is **not** silently reinterpreted. For example,
`((n+1)^3 / (n+2)^2) * (1/2)^n` remains ambiguous at the type boundary because
both operands of `/` are syntactically natural/integer expressions. Authors can
write `real(n)` explicitly or use a rational/real operand. This keeps school
integer division from being guessed as real division.

Negative powers are not added by this checkpoint; the supported polynomial
power fragment remains exact nonnegative integer exponents with the existing
degree-64 bound. `L = 1` remains inconclusive.

## Validation

- 373/373 formal-verifier tests pass;
- 21/21 app-level formal tests pass;
- 14/14 browser formal evidence/client/integration tests pass;
- Lean/Lake is unavailable in this runtime, so successful generated proofs stop
  at `verification_unavailable` and no certificate is fabricated.
