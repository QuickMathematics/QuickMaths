import test from "node:test";
import assert from "node:assert/strict";
import { buildFormalEvidenceRecord, formalEvidenceReceipt, normalizeFormalEvidenceRecord } from "./formal-evidence.js";

const hex = (c) => c.repeat(64);
const binding = hex("a");
const request = { request_id: `quickmaths:${binding}`, variables: [], assumptions: [], steps: [], goal: { kind: "truth" } };
const certificate = {
  certificate_version: "0.2",
  verifier_version: "0.4.0",
  verified_at: "2026-09-09T18:00:00+00:00",
  request_hash: hex("b"),
  statement_hash: hex("c"),
  submission_hash: hex("d"),
  lean_source_hash: hex("e"),
  proof_artifact: "import Mathlib\nexample : True := by trivial\n",
  proof_mode: "submitted",
  axioms: ["propext", "Classical.choice", "Quot.sound"],
  environment: { lean_toolchain: "leanprover/lean4:v4.34.0-rc2", mathlib_revision: hex("f") },
  elapsed_ms: 12,
  certificate_digest: hex("1"),
};
const verification = { status: "verified", request_hash: hex("b"), statement_hash: hex("c"), certificate };

test("verified formal evidence preserves exact request and certificate bindings", () => {
  const record = buildFormalEvidenceRecord({ profileId: "profile-1", skillId: "MATH_TEST", questionId: "q1", problemBindingSha256: binding, request, verification, recordedAt: "2026-09-09T18:01:00Z" });
  const restored = normalizeFormalEvidenceRecord(JSON.parse(JSON.stringify(record)));
  assert.equal(restored.evidenceId, `formal:${hex("1")}`);
  assert.equal(restored.request.request_id, `quickmaths:${binding}`);
  assert.equal(restored.certificate.proof_artifact.includes("example : True"), true);
  assert.deepEqual(formalEvidenceReceipt(restored), {
    evidence_id: restored.evidenceId,
    problem_binding_sha256: binding,
    request_hash: hex("b"),
    statement_hash: hex("c"),
    submission_hash: hex("d"),
    certificate_digest: hex("1"),
    verified_at: certificate.verified_at,
  });
});

test("unverified results and cross-bound requests cannot enter the evidence archive", () => {
  assert.throws(() => buildFormalEvidenceRecord({ profileId: "p", skillId: "s", questionId: "q", problemBindingSha256: binding, request, verification: { ...verification, status: "verification_unavailable" } }), /Only kernel-verified/);
  assert.throws(() => buildFormalEvidenceRecord({ profileId: "p", skillId: "s", questionId: "q", problemBindingSha256: hex("2"), request, verification }), /displayed problem binding/);
});

test("imported evidence rejects changed certificate or binding metadata", () => {
  const record = buildFormalEvidenceRecord({ profileId: "p", skillId: "s", questionId: "q", problemBindingSha256: binding, request, verification, recordedAt: "2026-09-09T18:01:00Z" });
  assert.throws(() => normalizeFormalEvidenceRecord({ ...record, certificateDigest: hex("2") }), /does not match/);
  assert.throws(() => normalizeFormalEvidenceRecord({ ...record, requestHash: hex("2") }), /hashes do not match/);
});
