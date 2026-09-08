import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chi_square_cdf, chi_square_sf, f_sf, inverse_normal_cdf, normal_cdf, t_cdf } from "./distributions.js";
import { normalizeLessonPack } from "./challenge-core.js";

test("native distribution acceptance vectors", () => {
  const vectors = [
    [normal_cdf, [-8], 6.22096057427174e-16],
    [normal_cdf, [-1.96], 0.024997895148220435],
    [normal_cdf, [1.96], 0.9750021048517795],
    [inverse_normal_cdf, [1e-6], -4.753424308822899],
    [inverse_normal_cdf, [0.999999], 4.753424308817087],
    [t_cdf, [-2.228, 10], 0.02500588590855566],
    [chi_square_cdf, [10, 5], 0.9247647538534878],
    [chi_square_sf, [50, 20], 0.0002214766382487835],
    [f_sf, [4, 3, 20], 0.022076999662362404],
    [f_sf, [12, 6, 50], 2.664857085283752e-8],
  ];
  for (const [functionValue, args, expected] of vectors) {
    assert.ok(Math.abs(functionValue(...args) - expected) <= Math.max(3e-13 * Math.abs(expected), 3e-15), `${functionValue.name}(${args})`);
  }
});

test("all archived distribution vectors", async () => {
  const fixtureSpecs = [
    ["BATCH16_DISTRIBUTION_FUNCTION_TEST_VECTORS.json", "functions"],
    ["BATCH17_CHI_SQUARE_FUNCTION_TEST_VECTORS.json", "functions"],
    ["BATCH18_F_DISTRIBUTION_TEST_VECTORS.json", "vectors"],
  ];
  let checked = 0;
  for (const [filename, section] of fixtureSpecs) {
    const payload = JSON.parse(await fs.readFile(new URL(`../tests/fixtures/${filename}`, import.meta.url), "utf8"));
    const entries = section === "functions" ? Object.entries(payload[section]) : [[payload.function, payload.vectors]];
    for (const [name, vectors] of entries) for (const vector of vectors) {
      const actual = ({ normal_cdf, inverse_normal_cdf, t_cdf, chi_square_cdf, chi_square_sf, f_sf })[name](...vector.args);
      assert.ok(Math.abs(actual - vector.expected) <= Math.max(3e-13 * Math.abs(vector.expected), 3e-15), `${filename}:${name}:${vector.args}`);
      checked += 1;
    }
  }
  assert.equal(checked, 89);
});

test("native distribution domains are strict", () => {
  for (const [functionValue, args] of [
    [normal_cdf, [NaN]], [inverse_normal_cdf, [0]], [inverse_normal_cdf, [1]],
    [t_cdf, [1, 0]], [chi_square_cdf, [-1, 2]], [chi_square_sf, [1, -2]],
    [f_sf, [-1, 1, 1]], [f_sf, [1, 0, 1]],
  ]) assert.throws(() => functionValue(...args), /finite|zero|non-negative|between/);
});

test("native distribution symmetry and complement", () => {
  assert.ok(Math.abs(normal_cdf(-2) + normal_cdf(2) - 1) <= 2e-15);
  assert.ok(Math.abs(t_cdf(-1.75, 7.5) + t_cdf(1.75, 7.5) - 1) <= 2e-14);
  assert.ok(Math.abs(chi_square_cdf(15, 7.5) + chi_square_sf(15, 7.5) - 1) <= 2e-14);
});

test("uploaded lesson data cannot add native generation templates", () => {
  const pack = normalizeLessonPack({
    format: "quickmaths.lesson-set",
    schema_version: "2.1",
    mode: "add",
    id: "PACK_DISTRIBUTION_SECURITY",
    name: "Distribution security probe",
    description: "A fixed-data upload security probe.",
    subject: { id: "SUBJECT_MATH", name: "Mathematics" },
    skills: [{
      id: "CUSTOM_DISTRIBUTION_SECURITY",
      name: "Distribution security probe",
      domain: "Math",
      subdomain: "Probability",
      description: "A fixed-data upload security probe.",
      theory: "This is sufficiently long fixed lesson theory for validation.",
      prerequisites: [],
      unlocks: [],
      examples: [{ prompt: "One", solution: "1", explanation: "One is one." }],
      problems: [{ template_id: "DISTRIBUTION_PROBE", prompt: "What is 1?", expected_answer: "1", grading_method: "exact_numeric", solution_steps: ["1"] }],
      native_templates: [{ id: "INJECTED", derived: { x: "normal_cdf(0)" } }],
    }],
  });
  assert.equal(Object.hasOwn(pack.skills[0], "native_templates"), false);
});

test("unsupported gamma ranges fail deterministically", () => {
  assert.throws(() => chi_square_cdf(1, 1e308), /stable range/);
});
