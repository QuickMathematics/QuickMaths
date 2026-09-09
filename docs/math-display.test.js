import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMathBlocks, renderMathBlocks, resolveMathBlocks } from "./math-display.js";

const base = { type: "notation", text: "x → 0", alt: "Endpoint notation", linear_text: "x tends to zero" };

test("normalizes the supported schema and preserves multiline derivation steps", () => {
  const blocks = normalizeMathBlocks([
    { type: "piecewise", rows: [{ expression: "x + 1", condition: "x < 0" }], alt: "Piecewise function", linear_text: "x plus one when x is less than zero" },
    { type: "fraction", numerator: "x + 1", denominator: "x - 1", alt: "A fraction", linear_text: "x plus one over x minus one" },
    { type: "limit", variable: "x", to: "0", direction: "both", expression: "sin(x) / x", alt: "A limit", linear_text: "limit as x tends to zero of sine x over x" },
    { type: "derivation", steps: ["Line one\nwith continuation", "Line two", "Line three", "Line four"], alt: "Four steps", linear_text: "Four-step derivation" },
    base,
  ]);
  assert.equal(blocks[3].steps[0], "Line one\nwith continuation");
  assert.equal(blocks.length, 5);
});

test("escapes malicious authored input and keeps endpoint characters visible", () => {
  const html = renderMathBlocks([{ ...base, text: "<img src=x onerror=alert(1)> & x → 0", alt: "<script>alert(1)</script>", linear_text: "x < 0 && x > -1" }]);
  assert.doesNotMatch(html, /[>"']<(?:img|script)(?:\s|>)/);
  assert.match(html, /&lt;img/);
  assert.match(html, /→/);
  assert.match(html, /math-display__linear/);
});

test("rejects unknown keys, malformed blocks, and unsupported values", () => {
  assert.throws(() => normalizeMathBlocks([{ ...base, extra: true }]), /unknown key/);
  assert.throws(() => normalizeMathBlocks([{ ...base, alt: "" }]), /alt/);
  assert.throws(() => normalizeMathBlocks([{ type: "limit", variable: "x", to: "0", direction: "up", expression: "x", alt: "limit", linear_text: "limit" }]), /direction/);
});

test("resolves only supplied public variables and rejects unknown variables", () => {
  const candidate = [{ type: "notation", text: "{symbol} → {endpoint}", alt: "Parameterized endpoint", linear_text: "symbol tends to endpoint" }];
  assert.equal(resolveMathBlocks(candidate, { symbol: "x", endpoint: 0 })[0].text, "x → 0");
  assert.throws(() => resolveMathBlocks(candidate, { symbol: "x" }), /unknown variable.*endpoint/);
  assert.equal(resolveMathBlocks([{ ...base, text: "{1, 2} and { x | x > 0 }" }], {})[0].text, "{1, 2} and { x | x > 0 }");
});

test("enforces bounded collections", () => {
  assert.throws(() => normalizeMathBlocks(Array.from({ length: 25 }, () => base)), /at most 24/);
  assert.throws(() => normalizeMathBlocks([{ type: "derivation", steps: Array.from({ length: 17 }, () => "step"), alt: "steps", linear_text: "steps" }]), /steps/);
  assert.throws(() => normalizeMathBlocks([{ type: "piecewise", rows: [], alt: "rows", linear_text: "rows" }]), /rows/);
});
