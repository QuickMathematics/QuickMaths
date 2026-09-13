# A17 browser Lean initialization update

## Physical failure used as the target

The uploaded `QM_dev_depot/quickmaths-phone-lean-results.json` reports Android
Chrome 152 and `deviceMemoryGiB: 4`. Algebra, radicals, and limits completed.
The last saved marker is derivative `import-warmup`, after 4,064 modules were
staged: 828,653,181 bytes including setup metadata. Of those, 598,892,176 bytes
were `.olean` files and 228,447,700 bytes were `.ir` files. There is no caught
Lean error or completed derivative result. The user's tab-crash observation and
this marker identify initialization peak as the target; the JSON alone cannot
prove an Android low-memory-killer event.

## Implementation

The new experimental worker stages verified raw module packs in a unique
temporary Origin Private File System (OPFS) directory. Lean sees ordinary
read-only module paths, but their reads are served from pack offsets on disk.
A reusable 64 KiB scratch buffer transfers bytes into the requested destination;
memory mapping allocates the Lean-requested WASM mapping and fills it in bounded
chunks. The whole closure is no longer retained as MEMFS byte arrays alongside
the imported Lean environment.

Compressed and decompressed pack hashes are still verified before staging.
Shared compressed content-addressed caches, exact runtime bytes, all Mathlib
artifacts, native-generated proof sources, compiler-status interpretation, and
axiom checks are unchanged. No import substitutions or theorem overlays were
introduced. Disk errors, short reads/writes, and unavailable OPFS fail visibly;
there is no fallback that silently restores the high-memory path.

The existing pack boundaries already bound decompression work to one pack at a
time. The new path transfers that verified buffer once for disk staging, rather
than slicing every module into transferred arrays and copying them again into
MEMFS. During import, bounded disk reads avoid retaining simultaneous full
decompressed-file and WASM representations. Compressed cache verification still
materializes one compressed object; this is not claimed to be a fully streaming
SHA-256 pipeline.

The phone launcher releases each environment and removes only its experimental
temporary directory. A separate cleanup button removes leftover temporary
staging after a crash, without clearing the shared artifact cache or workspace.
Close other experimental tabs before using it. Allow about 1.2 GiB free site
storage for temporary raw packs plus shared downloads. Persisted crash markers
now include staging mode and the last observed WASM capacity, explicitly not
total process memory.

## Alternatives investigated

An earlier prototype unlinked each staged file after Lean fully read/mapped it
and closed its last descriptor. Derivative proofs passed, and file lifetime was
shorter, but sampled peak private memory did not improve: dead buffers remained
resident through the synchronous import. An owned-buffer staging variant was
also explored; its full run was stopped once the disk-backed approach became
the more relevant candidate. Neither variant is the deployed phone candidate.

The native-checked `QmAbs.lean` rule-library prototype remains promising for
import narrowing. `Deriv.Abs` accounts for 350 exclusive modules and 58,552,236
raw artifact bytes (55.8 MiB), but zero complete removable packs at the current
pack boundaries. A same-name Mathlib overlay would need explicit, separately
versioned provenance; replacing it invisibly would misrepresent the environment.
This update therefore retains the exact original imports. Narrow-rule migration
and browser closure repacking remain separate work, not claimed savings here.

## Validation and interpretation

The complete gate passed: **122/122 positive cases, three rounds (366 kernel
executions), 25 warm repeats, ten browser rejection controls, and 71 freshly
rejected native preflight cases**. All five evidence-tampering checks passed.
The phone-layout smoke test passed with the real isolation shim, including
cleanup after a completed run and after stopping during pack staging.

Measured desktop derivative initialization peak above a normal QuickMaths map:

| Candidate | Incremental private resident peak |
| --- | ---: |
| Original two-worker MEMFS staging, fresh comparison | 2,731 MiB (2.67 GiB) |
| Temporary OPFS staging | 1,796 MiB (1.75 GiB) |

That is approximately **935 MiB / 34% lower initialization peak**. The measurement
window ends at the post-import diagnostic hold, before rejection controls and
corpus execution. Whole-run peaks were 2,731 MiB and 1,810 MiB respectively;
those are recorded separately rather than labelled initialization memory.
Derivative time to ready, excluding intentional profiling holds, was 15.26 s
for the comparison baseline and 14.00 s for the candidate on localhost.

Candidate initialization peaks were 1,566 MiB (algebra), 1,483 MiB (radicals),
1,649 MiB (limits), 1,796 MiB (derivatives), and 1,674 MiB (sequences/series).
These are single-run desktop observations with normal measurement variability,
not phone memory limits or a claim that every browser will have the same peak.

See the accompanying `experiments/browser-lean/results/a17/` evidence for the
complete corpus gate and measured initialization peaks. Four focused filesystem
tests cover byte-exact offset reads/mappings, bounded scratch usage, traversal
rejection, and incomplete disk reads/writes. The production certificate boundary
continues to accept the existing native certificate control and reject browser
environment substitutions and missing certificates.

All results remain assessment-ineligible with null certificates. Native
preflight rejection of 71 invalid requests is distinct from the browser's
invalid-proof and `sorry` controls. Desktop measurements do not establish that
the 4 GiB A17 now succeeds; the new candidate requires a physical retest,
starting with **Derivatives**, then **All five**, followed by JSON export.
