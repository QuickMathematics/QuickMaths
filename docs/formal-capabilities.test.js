import test from "node:test";
import assert from "node:assert/strict";
import { inferFormalCapabilities, normalizeFormalCapabilities } from "./formal-capabilities.js";
import { normalizeFormalProofSpec } from "./challenge-core.js";

const statement = {
  declarations: ["x:real", "sequence_a:nat->real"],
  assumptions: [],
  goal: "The derivative of sqrt(x) with respect to x at 1 is 1/2.",
};
const rules = ["derivative_rule", "series_intro", "limit_rule", "sqrt_rule"];

test("formal capability inference and explicit round-trip are bounded", () => {
  assert.deepEqual(inferFormalCapabilities(statement, rules), ["algebra", "derivatives", "limits", "sequences-series", "radicals"]);
  const spec = normalizeFormalProofSpec({
    version: "0.1",
    statement,
    allowed_rules: rules,
    capabilities: ["algebra", "derivatives", "limits", "sequences-series", "radicals"],
  });
  assert.deepEqual(spec.capabilities, ["algebra", "derivatives", "limits", "sequences-series", "radicals"]);
  assert.throws(() => normalizeFormalCapabilities(["algebra", "algebra"], { statement, allowedRules: rules }));
  assert.throws(() => normalizeFormalCapabilities(["algebra"], { statement, allowedRules: rules }));
  assert.throws(() => normalizeFormalCapabilities(["unknown"], { statement, allowedRules: rules }));
  assert.deepEqual(inferFormalCapabilities({ goal: "conjugate_limit" }, ["conjugate_limit"]), ["algebra", "limits", "radicals"]);
  assert.deepEqual(inferFormalCapabilities({ goal: "As n tends to infinity, a_n does not converge to a finite limit." }, ["series_ratio_limit_test"]), ["algebra", "sequences-series"]);
  assert.deepEqual(inferFormalCapabilities({ goal: "The series from n = 0 to infinity of r^n sums to 1/(1-r)." }, []), ["algebra", "sequences-series"]);
  assert.deepEqual(inferFormalCapabilities({ goal: "As x approaches 3 from both sides, f(x) approaches 2." }, []), ["algebra", "limits"]);
});

test("legacy proof specs omit capability metadata byte-for-byte", () => {
  const normalized = normalizeFormalProofSpec({
    version: "0.1",
    statement: { declarations: ["x:real"], assumptions: [], goal: "x = x" },
    allowed_rules: ["eq_refl"],
  });
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "capabilities"), false);
  assert.deepEqual(normalized, {
    version: "0.1",
    statement: { declarations: ["x:real"], assumptions: [], goal: "x = x" },
    parameter_contract: { required_public: [] },
    allowed_rules: ["eq_refl"],
    assessment_policy: {},
    reference_proof: {},
    environment: {},
  });
});
