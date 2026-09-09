import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLimitSpec, validateLimitWork, renderLimitWork, collectLimitWork } from "./limit-work.js";

const spec = { variable: "x", approach: "factor and cancel", direction: "both", original_expression: "(x² - 1)/(x - 1)", restrictions: ["x ≠ 1"] };
const data = { ...spec, steps: ["(x² - 1) / (x - 1)", "(x - 1)(x + 1)/(x - 1)", "x + 1"], result_kind: "finite", result_value: "2" };

test("captures complete work for tutor review only", () => assert.equal(validateLimitWork(spec, data), null));
test("rejects missing restrictions and swapped f(a)-style setup", () => {
  assert.match(validateLimitWork(spec, { ...data, restrictions: [] }), /restriction/i);
  assert.match(validateLimitWork(spec, { ...data, steps: ["(x - 1)/(x² - 1)"] }), /first work step/i);
});
test("keeps signed infinity distinct and escapes review text", () => {
  assert.equal(validateLimitWork(spec, { ...data, result_kind: "positive_infinity", result_value: "+∞" }), null);
  assert.equal(validateLimitWork(spec, { ...data, result_kind: "negative_infinity", result_value: "-∞" }), null);
  assert.match(renderLimitWork(spec, { ...data, result_value: "<script>" }), /&lt;script&gt;/);
  assert.throws(() => normalizeLimitSpec({ ...spec, direction: "infinity" }), /direction/);
});
test("renders an empty editable form without exposing authored restrictions", () => {
  const html = renderLimitWork(spec);
  assert.match(html, /data-limit-work-field="steps"/);
  assert.match(html, /data-limit-work-field="original_expression"/);
  assert.doesNotMatch(html, /x ≠ 1/);
  assert.match(html, /pending tutor review/i);
});
test("renders incomplete non-finite and blank drafts safely", () => {
  assert.match(renderLimitWork(spec, { ...spec, approach: "", steps: ["f(x)"], result_kind: "no_common_limit", result_value: "" }), /data-limit-work-field="result_value"/);
  assert.match(renderLimitWork(spec, { variable: "x", approach: "", result_value: "" }), /data-limit-work-field="approach"/);
});

test("collects plain learner data under the limit key supplied by the caller", () => {
  const fields = { variable: "x", approach: "factor", direction: "both", original_expression: "f(x)", restrictions: "x ≠ 1", steps: "f(x)\n1", result_kind: "finite", result_value: "2" };
  const card = { querySelector: selector => ({ value: fields[selector.match(/"([^"]+)"/)[1]] ?? "" }) };
  assert.deepEqual(collectLimitWork(card), { ...fields, restrictions: ["x ≠ 1"], steps: ["f(x)", "1"] });
});
