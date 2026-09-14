# A17 timing result and bounded optimization priorities

The third phone report passed all twelve previously timed-out cases in one
environment. Individual proofs took **10.59–22.97 seconds**. The complete test
took **4 minutes 11 seconds**, including staging and a 13.81-second import.
There were no environment errors. This is successful extended-budget physical
verification, not evidence that the original ten-second policy was satisfied.

Storage started at 335,581,013 bytes and finished at 335,581,215 bytes, with
**zero temporary directories**. Reported filesystem usage after the test was
202 bytes; approximately 336 MB of verified cache data remained. The earlier
30 GB accumulation did not recur in this run.

## Optimization scope

Treat the ten-second target as a performance objective, not a reason to redesign
the browser runtime. This review changes no generator, budget, certificate,
assessment eligibility, or mathematical coverage. No new phone suite is needed
just to establish the outcome above.

Inspection of the native generator identifies three bounded areas:

1. `_render_explicit_polynomial_facts` emits `compute_degree! <;> norm_num`
   for both degree and leading-coefficient facts. The warning sites include
   trailing `norm_num` calls after the first tactic already closes the goal.
   Remove redundant scaffolding only where it is unnecessary across the
   supported coefficient cases, not just in one observed fixture.
2. `_render_polynomial_nth_root_limit` constructs both a polynomial and its
   leading monomial, then a relative-limit proof. For inputs already equal to
   their leading monomial, a dedicated kernel-checked path could avoid building
   that duplicate relative-limit argument. This is a potentially more meaningful
   reduction than removing dead trailing tactics; it has not been implemented
   or benchmarked in this review.
3. Root and powered-factorial renderers repeatedly use broad `simp`, `ring`,
   and `convert!` combinations to reconnect normalized expressions. Profile
   these executed steps and replace only measured expensive sites with narrower
   rewrites or reusable checked lemmas. Preserve nonzero and domain guards.

An unreachable tactic does not execute; an unused simp argument is not itself
proof of a significant runtime cost. Warning collection, elaboration, and
linters can also consume time. Warning counts therefore are not timing
attribution, and simply disabling warnings is not claimed as an optimization.

For a future small generator patch, verify only its affected native/browser
cases and rejection boundaries first. Compare source, axiom checks, warnings,
and timings. A new phone retest should contain only changed slow cases, once
each; do not repeat the earlier full phone suite.

Machine-readable timings, warning counts, source hash, and storage evidence are
in `experiments/browser-lean/results/a17-storage/physical-quick-success.json`.
