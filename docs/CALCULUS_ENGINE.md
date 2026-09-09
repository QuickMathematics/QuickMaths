# Calculus authoring support

## What is implemented

- `diagram`: declarative Cartesian graphs on native templates and resolved portable questions. Native generation resolves diagrams together with prompts from the same draw. Saved visual questions retain their original prompt, display, grading data and learner response after template updates. Attempts retain those resolved displays too.
- `math_blocks`: piecewise rows, fractions, directed limits, derivations and notation on lessons, examples, applications and questions. See [display schema and examples](MATH_DISPLAY.md). These are presentation data, never executable code. Existing text-only fields remain supported. Native explanations preserve each authored line.
- `work.mode: limit_steps`: a structured **tutor-reviewed** argument. Setup, direction, original expression and retained restrictions are checked before submission. A completed form is not a correct proof. Transformations, cancellation validity, domain adequacy, quotient-law hypotheses, continuity and uniqueness still require review; this is not a domain-aware symbolic limit grader.
- The native exporter reports media bytes and supports an explicit native-only budget. The default remains 1,000,000 bytes. Imported-pack limits are unchanged. This bridge still embeds native attachments; hashed hosted chunks and offline prefetch are future work.

## Cartesian graphs

Use `kind: cartesian`, increasing numeric `x_range` and `y_range`, and a nonempty `alt` description. Up to eight curves each have an arithmetic `expression`, an independent `interval`, optional `endpoints` (`open`, `closed` or `none` for each end), and `exclude` values. Several curves express piecewise functions or disconnected intervals. Isolated points use `at`, an optional `label` and `endpoint` (`closed` by default, `open` for a hole). An open curve endpoint and an independently filled value at the same input are separate objects.

`segments` contain `from` and `to` coordinates; `asymptotes` contain `axis` (`x` for vertical, `y` for horizontal) and `value`; `labels` contain `at` and `text`. Declare excluded inputs explicitly even if a reduced expression is continuous there. Undefined square roots and denominator intervals containing zero break paths; samples never join across a declared exclusion. Supported expression syntax is numbers, x, parentheses, +, -, *, /, nonnegative literal integer powers through **8, sqrt and abs. No code, macros, markup, URLs or imported plotting libraries run.

A native template can bind only names explicitly present as `{name}` placeholders in its `prompt_template`. Do not reference hidden answers, derived roots or proof conclusions in labels or descriptions. Literal authored displays must likewise contain only stated givens. Numeric slots also accept bounded constant arithmetic after substitution, such as `{a}**2`; resolved portable questions use numbers, not unresolved placeholders.

```yaml
prompt_template: "For f(x)=x**2, consider the secant between inputs {a} and {b}."
diagram:
  kind: cartesian
  x_range: [-1, 5]
  y_range: [-1, 26]
  alt: "Quadratic f(x)=x squared, with secant inputs {a} and {b}."
  curves:
    - expression: x**2
      interval: [-1, 5]
  segments:
    - from: ["{a}", "{a}**2"]
      to: ["{b}", "{b}**2"]
  labels:
    - at: ["{a}", "{a}**2"]
      text: "a={a}"
```

See `schemas/cartesian-diagram.schema.json`. Render bounds are fixed, sampling is capped at 321 samples per curve, and interval evaluation is conservative: a complex valid curve may have small omitted pieces rather than a false connection. Choose sensible axis bounds; out-of-range secant endpoints are not drawn. Studio preserves resolved graphs through edits, imports and exports, and previews native randomized graphs. Native template code remains repository-authored; portable packs do not execute generators.

## Reviewed limit work

```yaml
work:
  mode: limit_steps
  prompt: "State the setup, preserve the domain and justify each transformation."
  limit:
    variable: x
    approach: "3"
    direction: both
    original_expression: "(x**2-9)/(x-3)"
    restrictions: ["x != 3"]
```

The learner records `structuredWorkJson.limit`: the same setup fields, restrictions, a `steps` list starting with the original expression, and `result_kind` (`finite`, `positive_infinity`, `negative_infinity` or `no_common_limit`). `result_value` is required for finite results. The first expression comparison ignores whitespace only; it intentionally does not authorize cancellation before recording the original domain. A function value at the endpoint is not substituted for a limit. Extra restrictions require revisiting the setup with a tutor; accepted form completeness never establishes their mathematical sufficiency. Native and portable questions force tutor review and disable self-review for this mode. Keep IVT and other open arguments in existing proof/rubric review modes.

## Media capacity

```powershell
python scripts/export_web_curriculum.py --media-report tmp/native-media-report.json
python scripts/export_web_curriculum.py --media-report tmp/next-batch.json --previous-media-report tmp/native-media-report.json
```

Reports include raw bytes, remaining budget, asset count and deduplicated attribution by branch/subdomain/source folder. With a prior report, `growth_bytes` shows the added batch cost. Shared files are attributed to their first source, not counted repeatedly. Use `--native-media-budget BYTES` only for a deliberate native build decision; it does not relax imported media validation or guarantee that larger lesson-set exports fit portable limits. Existing hash/size checks still apply. No new offline promise or network dependency is introduced.
