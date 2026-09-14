# A17 timeout diagnostics and temporary-storage repair

## What the phone report establishes

The second uploaded A17 report completed all five environments: 330 of 366
standard-budget proof executions succeeded. The other 36 were the same twelve
series cases timing out at 10 seconds in each of three rounds. Derivatives
completed; their 13.3-second import warm-up is separate from the per-proof
deadline. The slowest successful derivative proof was about 5.37 seconds.

The twelve series completion times are still unknown: the original runner
killed each worker at its deadline. Those observations establish a lower bound
near ten seconds, not the eventual completion time.

The series environment initialized 37 times. Its report records
`NoModificationAllowedError` during staging cleanup and 30,668,673,312 bytes of
filesystem usage, plus approximately 336 MB of shared cache data. This is actual
reported usage, not confusion with the larger storage quota. Failed cleanup
followed by repeated environment creation accumulated another raw pack closure
on each retry.

## Storage fix

- After import, unlink the staged module paths, explicitly close every OPFS
  access handle, and remove the session directory **before any timed proof**.
  The imported environment remains available for proof execution.
- Make worker disposal idempotent and wait for cleanup on a timeout. Do not
  create another environment if cleanup or initialization failed.
- Serialize phone tests and cleanup across updated tabs with a Web Lock.
- Clean only `qm-lean-experimental-staging` before starting a new test. Locked
  leftovers stop the test with instructions to close older tabs; they do not
  trigger more allocations.
- Show estimated origin storage and temporary-directory count, and record
  before/after storage in the export. Shared verified caches and user workspace
  data are not deleted.

To reclaim the existing accumulation, close old experimental tabs and press
**Clear temporary staging** on the updated page. Cleanup requires no proof run.
If an older tab still holds a handle, cleanup fails visibly until it is closed.

## Lightweight phone retest

The default is **12 slow cases · once each**. It loads only the series
environment, performs its two existing rejection controls, and runs the twelve
identified timeout cases once. There are **no warm repeats or profiling pauses**.
The first failure or 120-second diagnostic ceiling stops the test, without
rebuilding and retrying. The full developer regression is optional, not the
requested phone retest.

Each result retains the original request/source and 10-second budget alongside
the diagnostic allowance, actual elapsed time, and an indication of exceeding
the original policy. Extended-budget results cannot pass the standard parity
evidence gate. No production request policy, certificate eligibility, grading,
Lean/Mathlib pin, module pack, or mathematical coverage changed.

## Validation

The cleanup worker passed the existing 122-case desktop corpus across three
rounds (366 successes), 25 warm repeats, ten browser rejection controls, and
71 fresh native preflight rejections. The final lightweight timing selection is
tested separately; it is not represented as full-corpus parity evidence.
The exact harness used for the full run is retained with its evidence.

Focused checks cover byte-exact bounded reads, closed-handle deletion order,
locked-directory errors, cleanup scope, cross-tab exclusion, unchanged standard
deadlines, and rejection of extended-budget results as parity evidence.
Browser regression checks exercise cancellation and a deliberately injected
deadline expiry followed by recovery without retaining staging directories.

Physical completion times for the twelve slow cases require the next exported
A17 run. Desktop times cannot substitute for those measurements.
