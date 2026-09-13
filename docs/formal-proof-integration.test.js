import { requestFixture, mockVerification } from "./test-support/formal-fixtures.js";
import { FORMAL_ENVIRONMENT } from "./formal-proof-trust.js";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFormalJob, normalizeFormalProofSpec } from "./challenge-core.js";

const proofSpecInput = {
  version: "0.1",
  statement: { declarations: ["x:real"], assumptions: ["x != 3"], goal: "x + 3 = 3 + x" },
  parameter_contract: { required_public: ["x"] },
  allowed_rules: ["ring"],
  assessment_policy: { required_method: "direct" },
  reference_proof: { mode: "steps", steps: [{ claim: "x + 3 = 3 + x", rule: "ring_identity", premises: [], parameters: {}, scope: "root" }] },
  environment: { backend: "lean4", library: "mathlib" },
};
const binding = "b".repeat(64);
const jobInput = {
  version: "0.1",
  problem_binding_sha256: binding,
  environment_requirements: { backend: "lean4", library: "mathlib" },
  rpc: {
    protocol_version: "0.1",
    op: "new_text_request",
    request_id: `quickmaths:${binding}`,
    declarations: ["x:real"],
    assumptions: ["x != 3"],
    goal: "x + 3 = 3 + x",
    allowed_rules: ["ring"],
    max_seconds: 10,
  },
};

test("formal lesson metadata and bound job normalize together", () => {
  const spec = normalizeFormalProofSpec(proofSpecInput, "Q1");
  const job = normalizeFormalJob(jobInput, spec, "Q1");
  assert.equal(spec.statement.goal, "x + 3 = 3 + x");
  assert.deepEqual(spec.parameter_contract.required_public, ["x"]);
  assert.equal(spec.assessment_policy.required_method, "direct");
  assert.equal(spec.reference_proof.steps[0].rule, "ring_identity");
  assert.equal(job.rpc.request_id, `quickmaths:${binding}`);
});

test("browser ingestion rejects executable fields in declarative reference proofs", () => {
  assert.throws(() => normalizeFormalProofSpec({ ...proofSpecInput, reference_proof: { mode: "steps", steps: [{ claim: "x=x", rule: "eq_refl", lean_code: "by rfl" }] } }, "Q1"), /unsupported field lean_code/);
});

test("browser ingestion rejects a bound job that proves a different theorem", () => {
  const spec = normalizeFormalProofSpec(proofSpecInput, "Q1");
  assert.throws(() => normalizeFormalJob({ ...jobInput, rpc: { ...jobInput.rpc, goal: "x = 0" } }, spec, "Q1"), /does not match proof_spec/);
});

test("browser ingestion rejects environment drift between displayed spec and job", () => {
  const spec = normalizeFormalProofSpec(proofSpecInput, "Q1");
  assert.throws(() => normalizeFormalJob({ ...jobInput, environment_requirements: { backend: "lean4", library: "other" } }, spec, "Q1"), /environment does not match/);
});

import { readFileSync } from "node:fs";
import { createQuickMathsStore, STORAGE_KEY } from "./challenge-core.js";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), value: (key) => values.get(key) };
}

const certHex = (character) => character.repeat(64);

test("kernel certificate is archived separately and survives state reload", () => {
  const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));
  const skill = curriculum.skills.find((item) => item.id === "MATH_ARITH_001");
  const problem = structuredClone(skill.problems[0]);
  const revision = FORMAL_ENVIRONMENT.mathlib_revision;
  const localBinding = certHex("a");
  problem.proof_spec = {
    version: "0.1",
    statement: { declarations: [], assumptions: [], goal: "true" },
    allowed_rules: ["truth_intro"],
    environment: { backend: "lean4", library: "mathlib", toolchain: "leanprover/lean4:v4.34.0-rc2", library_revision: revision },
  };
  problem.formal_job = {
    version: "0.1",
    problem_binding_sha256: localBinding,
    environment_requirements: structuredClone(problem.proof_spec.environment),
    rpc: { protocol_version: "0.1", op: "new_text_request", request_id: `quickmaths:${localBinding}`, declarations: [], assumptions: [], goal: "true", allowed_rules: ["truth_intro"], max_seconds: 10 },
  };
  skill.problems = [problem];
  skill.native_templates = [];
  skill.question_count = 1;
  const storage = memoryStorage();
  const store = createQuickMathsStore({ curriculum, storage });
  const profile = store.createProfile("Formal learner");
  const draft = store.startTest(skill.id);
  const question = draft.problems[0];
  const request = { request_id: `quickmaths:${localBinding}`, variables: [], assumptions: [], steps: [], goal: { kind: "truth" } };
  const verification = mockVerification(request);
  const certificate = verification.certificate;
  const receipt = store.recordFormalEvidence(question.template_id, localBinding, request, verification);
  assert.equal(receipt.evidence_id, `formal:${certificate.certificate_digest}`);
  assert.equal(store.getFormalEvidence(receipt.evidence_id)?.certificateDigest, certificate.certificate_digest);
  // An archive alone is never fresh assessment authority.
  assert.equal(store.submitTest().ok, false);
  const reloaded = createQuickMathsStore({ curriculum, storage });
  reloaded.selectProfile(profile.id);
  const restored = reloaded.getFormalEvidence(receipt.evidence_id);
  assert.equal(restored.certificateDigest, certificate.certificate_digest);
  assert.equal(restored.request.request_id, `quickmaths:${localBinding}`);
  assert.ok(storage.value(STORAGE_KEY));
});
