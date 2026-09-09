# Declarative math display

Use `normalizeMathBlocks`, `resolveMathBlocks`, and `renderMathBlocks` from `math-display.js` to author safe, dependency-free math fragments. Every block has an explicit `type`, authored `alt`, and copyable `linear_text`. Unknown keys and oversized content are rejected; authored strings are escaped before rendering.

The accepted block types are `piecewise`, `fraction`, `limit`, `derivation`, and `notation`.

```js
const blocks = [
  {
    type: "piecewise",
    rows: [
      { expression: "x²", condition: "x ≥ 0" },
      { expression: "−x", condition: "x < 0" }
    ],
    alt: "Absolute value as a piecewise function",
    linear_text: "x squared for x at least zero; negative x for x less than zero"
  },
  {
    type: "fraction",
    numerator: "x + 1",
    denominator: "x − 1",
    alt: "A rational expression",
    linear_text: "x plus one over x minus one"
  }
];

const html = renderMathBlocks(blocks);
```

Limits support `direction: "left"`, `"right"`, or `"both"`. Derivation steps are strings and may contain newlines; the renderer preserves them. `renderMathBlocks(undefined)` and `renderMathBlocks([])` return an empty string.

For public parameters, use `{name}` placeholders and resolve them explicitly:

```js
const resolved = resolveMathBlocks([
  {
    type: "limit", variable: "{variable}", to: "{endpoint}", direction: "both",
    expression: "sin({variable}) / {variable}",
    alt: "A standard trigonometric limit",
    linear_text: "the limit of sine variable over variable as variable approaches endpoint"
  }
], { variable: "x", endpoint: 0 });
```

Unknown placeholder variables, unknown properties, non-finite numeric values and oversized values are rejected. Only `{identifier}` binds a public value; other braces remain literal set notation, such as `{1, 2}` or `{ x | x > 0 }`. Use spaces for a literal singleton set, `{ x }`, to distinguish it from a placeholder. Include `math-display.css` wherever the rendered fragments are displayed; long expressions and piecewise rows remain horizontally scrollable without hiding their conditions.
