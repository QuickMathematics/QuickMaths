# Statistics and Probability lesson batches

QuickMaths adds 21 native Mathematics lessons from Batches 12–18: 5 Probability lessons (`MATH_PROB_001`–`005`) and 16 Statistics lessons (`MATH_STAT_001`–`016`). Together they add 280 authored assessment scenarios. The native branch contains 84 lessons and the shipped library contains 128 lessons; the hosted illustration library covers 130 figures across 118 library lessons.

## Provenance

Source: `QuickMathematics/QM_Dev_Depot`, `quickmaths-math-batches-12-18-consolidated.zip`.

Git blob: `c889b3e4738d1418524091a45813e41487e9735f`.

The archive describes itself as a source reconstruction: the earlier standalone ZIP files were unavailable when it was assembled. Its lesson YAML refers to historical media whose bytes are omitted. QuickMaths supplies 21 new teaching figures through the hosted illustration library and restores nine embedded assessment diagrams used by 18 graph-reading scenarios.

## Trusted numerical helpers

Native authoring and the browser native retake generator allow six trusted distribution helpers: `normal_cdf(z)`, `inverse_normal_cdf(p)`, `t_cdf(t, df)`, `chi_square_cdf(x, df)`, `chi_square_sf(x, df)`, and `f_sf(x, df1, df2)`. Inputs are domain checked: inverse normal requires `0 < p < 1`; chi-square and F inputs require finite nonnegative statistics and positive degrees of freedom. The helpers are first-party native expression functions only. Uploaded, Depot, and community lesson packages remain fixed validated data and cannot execute generator or helper code.

## Validation

The integration is checked with the native YAML validator, deterministic generation/export checks, browser curriculum tests, and the distribution-function parity vectors supplied with Batches 16–18. Figures are rendered and reviewed at mobile-readable dimensions. Learner teaching prose describes the mathematical idea and does not expose helper-function source strings.
