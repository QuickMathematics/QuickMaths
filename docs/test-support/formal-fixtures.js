// Test data for client protocol checks only. This helper does NOT run Lean.
import { FORMAL_ENVIRONMENT, formalRequestHash } from "../formal-proof-trust.js";
import { sha256Hex } from "../formal-binding.js";
export function requestFixture() {
  const x = { kind: "var", id: "x" };
  const claim = { kind: "proposition", proposition: { kind: "eq", left: x, right: x } };
  return {
    version: "0.1", request_id: `quickmaths:${"a".repeat(64)}`,
    variables: [{ id: "x", type: "real" }], assumptions: [], scopes: [{ id: "root", parent: null, binders: [] }],
    steps: [{ id: "user_step_1", scope: "root", claim, rule: "eq_refl", premises: [], parameters: {} }], goal: claim,
    policy: { allowed_rules: ["eq_refl"], accepted_axioms: ["propext", "Classical.choice", "Quot.sound"], max_seconds: 10 },
  };
}
export function mockVerification(request = requestFixture(), mode = "submitted") {
  const source = "-- TEST FIXTURE ONLY; not evidence of running Lean\nimport Mathlib\nexample (x : Real) : x = x := by rfl\n";
  const cert = {
    certificate_version: "0.2", verifier_version: "test-fixture", verified_at: "2026-09-12T12:00:00+00:00",
    request_hash: formalRequestHash(request), statement_hash: formalRequestHash(request.goal),
    submission_hash: formalRequestHash({ assumptions: request.assumptions, steps: request.steps }),
    lean_source_hash: sha256Hex(source), proof_artifact: source, proof_mode: mode,
    axioms: [], environment: { ...FORMAL_ENVIRONMENT }, elapsed_ms: 1,
  };
  cert.certificate_digest = formalRequestHash(cert);
  return { status: "verified", proof_mode: mode, request_hash: cert.request_hash, statement_hash: cert.statement_hash, certificate: cert };
}
export function mockProgress(request = requestFixture()) {
  const prefix = { ...structuredClone(request), policy: { ...request.policy, max_seconds: 9 } };
  prefix.goal = prefix.steps.at(-1).claim;
  const result = mockVerification(prefix, "progress");
  return { request_hash: formalRequestHash(request), proof_state: { request_hash: formalRequestHash(request), steps: request.steps.map((row) => ({ step_id: row.id, scope: row.scope, claim: "x = x", rule: row.rule, status: "candidate_ready" })) }, status: "prefixes_verified", assessment_eligible: false,
    verified_step_ids: [request.steps[0].id], blocked_step_id: null,
    checked_prefixes: [{ ...result, step_id: request.steps[0].id, request: prefix, obligations: [] }],
  };
}
