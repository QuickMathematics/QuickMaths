# Formal import-cost analysis (2026-09-13)

This is a static closure-and-artifact accounting report for all five curated profiles.
`Init` is included implicitly, as in `corpus-closure.py`. Raw bytes sum each module’s
`.olean`, `.ir`, and `.ir.sig` files. Compressed costs charge the complete shared pack
whenever any module in that pack is touched; they are not per-declaration serialized sizes.

## Verification

- Profiles analyzed: **5**.
- Every computed graph union exactly matches its declared `profile.modules` set.
- Every computed profile pack union and compressed-byte total exactly matches the manifest’s packs assigned to that profile.
- Corpus SHA-256: `4ebbfbee68735adf8a0517eca7ac92a3be6fa3352a8dc45e617d6629434b1e7d`; viability/config SHA-256: `501006f731ebc2b5e32a348887ea49f17d746cf743effbf3167950c2c217f2c0`.
- Common algebra baseline (intersection of all five closures): **2,455 modules / 509,331,120 raw bytes**.

## Profile totals

| Profile | Modules | Raw bytes | Touched packs | Compressed pack bytes | Growth above common algebra |
|---|---:|---:|---:|---:|---:|
| `qm-formal-v1-ed8d51650a0bb7da` | 2,455 | 509,331,120 | 63 | 188,685,820 | 0 modules / 0 bytes |
| `qm-formal-v1-47dfa7faf67fa573` | 2,998 | 593,291,372 | 74 | 222,560,782 | 543 modules / 83,960,252 bytes |
| `qm-formal-v1-a8d843f013bdac16` | 3,451 | 702,080,840 | 88 | 267,471,808 | 996 modules / 192,749,720 bytes |
| `qm-formal-v1-d9180291ee776ddb` | 4,064 | 827,908,836 | 104 | 319,594,273 | 1,609 modules / 318,577,716 bytes |
| `qm-formal-v1-bb0d3439bce63261` | 3,919 | 791,392,876 | 100 | 303,925,894 | 1,464 modules / 282,061,756 bytes |

## Direct imports: `qm-formal-v1-ed8d51650a0bb7da`

| Root | Inclusive closure | Exclusive marginal modules | Above common algebra | Packs touched by exclusive modules | Packs removable on root removal | Largest artifact modules |
|---|---:|---:|---:|---:|---:|---|
| `Mathlib.Basic.Real.Basic` | 2,253 modules / 472,172,236 bytes | 20 modules / 4,744,468 bytes | 0 modules / 0 bytes | 5 packs / 16,542,709 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.FieldSimp` | 2,202 modules / 465,564,128 bytes | 5 modules / 2,832,776 bytes | 0 modules / 0 bytes | 3 packs / 8,220,042 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Linarith` | 2,298 modules / 485,202,700 bytes | 17 modules / 5,468,676 bytes | 0 modules / 0 bytes | 6 packs / 17,765,511 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.NormNum` | 2,277 modules / 476,448,464 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Positivity` | 2,393 modules / 490,136,588 bytes | 103 modules / 13,121,880 bytes | 0 modules / 0 bytes | 11 packs / 35,347,945 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Ring` | 2,209 modules / 466,756,592 bytes | 6 modules / 746,244 bytes | 0 modules / 0 bytes | 3 packs / 8,694,005 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |

Marginal means the root’s reachable module set minus the closure retained by the other direct roots. The first pack column charges every pack touched by those exclusive modules; the second is the actually removable pack set (profile packs minus packs still touched by remaining roots). Inclusive rows overlap by design; summing them is not a profile total.

## Direct imports: `qm-formal-v1-47dfa7faf67fa573`

| Root | Inclusive closure | Exclusive marginal modules | Above common algebra | Packs touched by exclusive modules | Packs removable on root removal | Largest artifact modules |
|---|---:|---:|---:|---:|---:|---|
| `Mathlib.Analysis.Real.Sqrt` | 2,995 modules / 592,851,080 bytes | 0 modules / 0 bytes | 542 modules / 83,796,336 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Basic.Real.Basic` | 2,253 modules / 472,172,236 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.FieldSimp` | 2,202 modules / 465,564,128 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Linarith` | 2,298 modules / 485,202,700 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.NormNum` | 2,277 modules / 476,448,464 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.NormNum.RealSqrt` | 2,996 modules / 593,014,996 bytes | 1 modules / 163,916 bytes | 543 modules / 83,960,252 bytes | 1 packs / 3,126,425 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Positivity` | 2,393 modules / 490,136,588 bytes | 2 modules / 276,376 bytes | 0 modules / 0 bytes | 1 packs / 2,743,565 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Ring` | 2,209 modules / 466,756,592 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |

Marginal means the root’s reachable module set minus the closure retained by the other direct roots. The first pack column charges every pack touched by those exclusive modules; the second is the actually removable pack set (profile packs minus packs still touched by remaining roots). Inclusive rows overlap by design; summing them is not a profile total.

## Direct imports: `qm-formal-v1-a8d843f013bdac16`

| Root | Inclusive closure | Exclusive marginal modules | Above common algebra | Packs touched by exclusive modules | Packs removable on root removal | Largest artifact modules |
|---|---:|---:|---:|---:|---:|---|
| `Lean.Elab.Tactic.NormCast` | 1,191 modules / 226,349,332 bytes | 1 modules / 690,524 bytes | 2 modules / 892,896 bytes | 1 packs / 3,327,804 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Lean.Elab.Tactic.Omega` | 1,065 modules / 196,048,896 bytes | 0 modules / 0 bytes | 7 modules / 1,970,560 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Analysis.Real.Sqrt` | 2,995 modules / 592,851,080 bytes | 0 modules / 0 bytes | 542 modules / 83,796,336 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Exp` | 3,423 modules / 698,439,592 bytes | 0 modules / 0 bytes | 970 modules / 189,384,848 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Log.Basic` | 3,435 modules / 699,546,416 bytes | 12 modules / 1,106,824 bytes | 982 modules / 190,491,672 bytes | 5 packs / 16,604,434 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Trigonometric.Basic` | 3,435 modules / 699,843,200 bytes | 12 modules / 1,403,608 bytes | 982 modules / 190,788,456 bytes | 4 packs / 13,736,409 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Basic.Real.Basic` | 2,253 modules / 472,172,236 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Continuity` | 1,418 modules / 269,869,720 bytes | 0 modules / 0 bytes | 2 modules / 83,124 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Tactic.Convert` | 1,266 modules / 242,973,728 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Tactic.FieldSimp` | 2,202 modules / 465,564,128 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.FunProp` | 1,254 modules / 244,923,836 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Tactic.GCongr` | 1,303 modules / 255,746,536 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Linarith` | 2,298 modules / 485,202,700 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.NormNum` | 2,277 modules / 476,448,464 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.NormNum.RealSqrt` | 2,996 modules / 593,014,996 bytes | 1 modules / 163,916 bytes | 543 modules / 83,960,252 bytes | 1 packs / 3,126,425 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Positivity` | 2,393 modules / 490,136,588 bytes | 2 modules / 276,376 bytes | 0 modules / 0 bytes | 1 packs / 2,743,565 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Ring` | 2,209 modules / 466,756,592 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Topology.Algebra.Order.Field` | 2,734 modules / 547,686,372 bytes | 0 modules / 0 bytes | 327 modules / 51,368,056 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Topology.Order.IntermediateValue` | 2,440 modules / 492,825,548 bytes | 0 modules / 0 bytes | 179 modules / 23,477,904 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |

Marginal means the root’s reachable module set minus the closure retained by the other direct roots. The first pack column charges every pack touched by those exclusive modules; the second is the actually removable pack set (profile packs minus packs still touched by remaining roots). Inclusive rows overlap by design; summing them is not a profile total.

## Direct imports: `qm-formal-v1-d9180291ee776ddb`

| Root | Inclusive closure | Exclusive marginal modules | Above common algebra | Packs touched by exclusive modules | Packs removable on root removal | Largest artifact modules |
|---|---:|---:|---:|---:|---:|---|
| `Lean.Elab.Tactic.NormCast` | 1,191 modules / 226,349,332 bytes | 1 modules / 690,524 bytes | 2 modules / 892,896 bytes | 1 packs / 3,327,804 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Lean.Elab.Tactic.Omega` | 1,065 modules / 196,048,896 bytes | 0 modules / 0 bytes | 7 modules / 1,970,560 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Analysis.Calculus.Deriv.Abs` | 4,025 modules / 823,606,908 bytes | 350 modules / 58,552,236 bytes | 1,570 modules / 314,275,788 bytes | 19 packs / 62,953,046 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.Calculus.Deriv.Inv` | 3,551 modules / 737,338,356 bytes | 0 modules / 0 bytes | 1,096 modules / 228,007,236 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.Calculus.Deriv.Pow` | 3,548 modules / 736,484,660 bytes | 0 modules / 0 bytes | 1,093 modules / 227,153,540 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.Real.Sqrt` | 2,995 modules / 592,851,080 bytes | 0 modules / 0 bytes | 542 modules / 83,796,336 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.ExpDeriv` | 3,690 modules / 766,746,368 bytes | 0 modules / 0 bytes | 1,235 modules / 257,415,248 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Log.Deriv` | 3,710 modules / 768,293,608 bytes | 8 modules / 314,224 bytes | 1,255 modules / 258,962,488 bytes | 3 packs / 8,682,536 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Sqrt` | 3,563 modules / 741,118,600 bytes | 0 modules / 0 bytes | 1,108 modules / 231,787,480 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Trigonometric.Deriv` | 3,696 modules / 767,375,276 bytes | 1 modules / 150,728 bytes | 1,241 modules / 258,044,156 bytes | 1 packs / 3,606,406 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Basic.Real.Basic` | 2,253 modules / 472,172,236 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Continuity` | 1,418 modules / 269,869,720 bytes | 0 modules / 0 bytes | 2 modules / 83,124 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Tactic.Convert` | 1,266 modules / 242,973,728 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Tactic.FieldSimp` | 2,202 modules / 465,564,128 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.FunProp` | 1,254 modules / 244,923,836 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Tactic.GCongr` | 1,303 modules / 255,746,536 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Linarith` | 2,298 modules / 485,202,700 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.NormNum` | 2,277 modules / 476,448,464 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.NormNum.RealSqrt` | 2,996 modules / 593,014,996 bytes | 1 modules / 163,916 bytes | 543 modules / 83,960,252 bytes | 1 packs / 3,126,425 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Positivity` | 2,393 modules / 490,136,588 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Ring` | 2,209 modules / 466,756,592 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |

Marginal means the root’s reachable module set minus the closure retained by the other direct roots. The first pack column charges every pack touched by those exclusive modules; the second is the actually removable pack set (profile packs minus packs still touched by remaining roots). Inclusive rows overlap by design; summing them is not a profile total.

## Direct imports: `qm-formal-v1-bb0d3439bce63261`

| Root | Inclusive closure | Exclusive marginal modules | Above common algebra | Packs touched by exclusive modules | Packs removable on root removal | Largest artifact modules |
|---|---:|---:|---:|---:|---:|---|
| `Lean.Elab.Tactic.NormCast` | 1,191 modules / 226,349,332 bytes | 1 modules / 690,524 bytes | 2 modules / 892,896 bytes | 1 packs / 3,327,804 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Lean.Elab.Tactic.Omega` | 1,065 modules / 196,048,896 bytes | 0 modules / 0 bytes | 7 modules / 1,970,560 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Analysis.PSeries` | 3,914 modules / 790,192,116 bytes | 343 modules / 70,056,304 bytes | 1,461 modules / 281,137,372 bytes | 12 packs / 36,454,086 bytes | 1 packs / 2,905,828 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.Polynomial.Basic` | 3,572 modules / 720,205,756 bytes | 1 modules / 69,944 bytes | 1,119 modules / 211,151,012 bytes | 1 packs / 152,355 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.Real.Sqrt` | 2,995 modules / 592,851,080 bytes | 0 modules / 0 bytes | 542 modules / 83,796,336 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Exp` | 3,423 modules / 698,439,592 bytes | 0 modules / 0 bytes | 970 modules / 189,384,848 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Log.Basic` | 3,435 modules / 699,546,416 bytes | 0 modules / 0 bytes | 982 modules / 190,491,672 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Pow.Real` | 3,513 modules / 709,627,088 bytes | 0 modules / 0 bytes | 1,060 modules / 200,572,344 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecialFunctions.Trigonometric.Basic` | 3,435 modules / 699,843,200 bytes | 0 modules / 0 bytes | 982 modules / 190,788,456 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Analysis.SpecificLimits.Normed` | 3,237 modules / 650,995,460 bytes | 0 modules / 0 bytes | 784 modules / 141,940,716 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Basic.Real.Basic` | 2,253 modules / 472,172,236 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.ComputeDegree` | 2,759 modules / 560,952,824 bytes | 0 modules / 0 bytes | 322 modules / 56,500,508 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Continuity` | 1,418 modules / 269,869,720 bytes | 0 modules / 0 bytes | 2 modules / 83,124 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Tactic.Convert` | 1,266 modules / 242,973,728 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Tactic.FieldSimp` | 2,202 modules / 465,564,128 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.FinCases` | 2,055 modules / 437,304,776 bytes | 0 modules / 0 bytes | 1 modules / 169,132 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.FunProp` | 1,254 modules / 244,923,836 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Init.Prelude` (2,545,600); `Std.Data.DTreeMap.Internal.Operations` (2,282,576) |
| `Mathlib.Tactic.GCongr` | 1,303 modules / 255,746,536 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Linarith` | 2,298 modules / 485,202,700 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.NormNum` | 2,277 modules / 476,448,464 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.NormNum.RealSqrt` | 2,996 modules / 593,014,996 bytes | 1 modules / 163,916 bytes | 543 modules / 83,960,252 bytes | 1 packs / 3,126,425 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Positivity` | 2,393 modules / 490,136,588 bytes | 2 modules / 276,376 bytes | 0 modules / 0 bytes | 1 packs / 2,743,565 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |
| `Mathlib.Tactic.Ring` | 2,209 modules / 466,756,592 bytes | 0 modules / 0 bytes | 0 modules / 0 bytes | 0 packs / 0 bytes | 0 packs / 0 bytes | `Std.Data.DTreeMap.Internal.Model` (4,391,360); `Mathlib.Tactic.Translate.Core` (2,617,908); `Init.Prelude` (2,545,600) |

Marginal means the root’s reachable module set minus the closure retained by the other direct roots. The first pack column charges every pack touched by those exclusive modules; the second is the actually removable pack set (profile packs minus packs still touched by remaining roots). Inclusive rows overlap by design; summing them is not a profile total.

## Interpretation

The numbers support profile-level and root-level cost decisions only. They do not claim per-declaration or per-proof serialized-byte precision. A root can have a small exclusive module marginal while still touching a large shared pack, and a profile’s compressed download is the union of its touched packs.
