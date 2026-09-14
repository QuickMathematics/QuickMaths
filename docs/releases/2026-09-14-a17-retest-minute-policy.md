# A17 retest, reusable procedure and one-minute policy

The uploaded two-case A17 result passed both optimized monomial proofs in
7.853 and 6.642 seconds. The previous phone times were 16.519 and 13.512 seconds.
The new run completed in 61.27 seconds including setup and left zero temporary
directories. Its deployment pins match the tested candidate. Both results
remain assessment-ineligible, with compiler exit zero and the allowed axioms.

The clearly labeled [Formal proof optimization procedure](../FORMAL_PROOF_OPTIMIZATION_PROCEDURE.md)
records the exact reusable workflow, commands, safeguards and evidence standard
for applying this approach to other existing proof families later.

New native/browser-bound jobs, authoring requests and Studio reference checks
now default to 60 seconds, within the existing 1–60-second contract. The client
allows an additional five seconds for transport. Explicit shorter budgets and
saved requests/certificates are preserved. The experimental timing mode now
uses a 60-second allowance rather than 120 seconds; historical corpus requests
and results retain their original policy. Runtime initialization is separate.

Added learner-facing guidance beside the proof workspace and during Studio
reference checks; updated student, educator, formal-learning and authoring
guides. No proof-source, mathematical coverage, certificate schema or browser
assessment eligibility changes were made.

Focused validation: bridge/contract tests, client/binding/workspace tests,
timing-policy tests, Studio tests and authoring tests. No new kernel corpus or
phone suite was needed for this default-budget/documentation change.

## iPhone testing

Apple's official iOS Simulator runs through Xcode on macOS and supports Safari
webpage testing. This Windows workspace can use Playwright WebKit for preliminary
checks, but its WebKit build is not shipped Safari. The simulator uses the Mac's
CPU/memory, so it cannot establish actual iPhone memory pressure, performance or
tab survival. Physical iPhone Safari remains the final capacity check; it need
not block earlier simulator/engine compatibility work.

Sources: [Apple simulator setup](https://developer.apple.com/documentation/safari-developer-tools/installing-xcode-and-simulators),
[Apple simulator limitations](https://developer.apple.com/library/archive/documentation/IDEs/Conceptual/iOS_Simulator_Guide/TestingontheiOSSimulator/TestingontheiOSSimulator.html),
[Playwright browser differences](https://playwright.dev/docs/browsers).
