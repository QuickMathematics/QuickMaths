import test from "node:test";
import assert from "node:assert/strict";
import { buildBoundFormalJob, formalProblemBinding, sha256Hex } from "./formal-binding.js";

test("browser SHA-256 matches standard vectors", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("browser formal binding matches the Python bridge canonical digest", () => {
  const problem = {
    template_id: "Q_FORMAL", skill_id: "S_FORMAL", seed: 7, values: {}, prompt: "Prove x + 0 = x.",
    proof_spec: {
      version: "0.1", statement: { declarations: ["x:real"], assumptions: [], goal: "x + 0 = x" },
      parameter_contract: { required_public: [] }, allowed_rules: ["ring_identity"], assessment_policy: {}, reference_proof: {},
      environment: { backend: "lean4", toolchain: "leanprover/lean4:v4.34.0-rc2", library: "mathlib", library_revision: "42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c" },
    },
  };
  assert.equal(formalProblemBinding(problem), "7f9adcb683b2f475cf651af14072acf609273199b8ad230e6d611c429ccc5e96");
  const job = buildBoundFormalJob(problem);
  assert.equal(job.problem_binding_sha256, formalProblemBinding(problem));
  assert.equal(job.rpc.request_id, `quickmaths:${job.problem_binding_sha256}`);
});
